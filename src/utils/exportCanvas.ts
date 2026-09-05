/** html2canvas 1.x predates Tailwind 4's OKLCH / color-mix output. Convert only
 * the cloned document, so exporting never changes the live workspace. */
export async function exportCanvas(element: HTMLElement, backgroundColor = '#ffffff') {
  const { default: html2canvas } = await import('html2canvas');
  // FontMetrics inserts a hidden 1px image into the original document. Tailwind's
  // display:block reset otherwise shifts its baseline and clips exported text.
  const metricsStyle = element.ownerDocument.createElement('style');
  metricsStyle.textContent = 'body > div[style*="visibility: hidden"] > img[width="1"][height="1"] { display: inline-block !important; }';
  element.ownerDocument.head.appendChild(metricsStyle);
  try {
    return await html2canvas(element, {
      backgroundColor, scale: 2, logging: false, useCORS: true,
      onclone(document, clonedElement) {
        const context = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
        if (!context) throw new Error('无法创建图片导出画布');
        const cache = new Map<string, string>();
        const rgb = (color: string) => {
          if (cache.has(color)) return cache.get(color)!;
          context.clearRect(0, 0, 1, 1);
          context.fillStyle = color;
          context.fillRect(0, 0, 1, 1);
          const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data;
          const value = `rgba(${r}, ${g}, ${b}, ${a / 255})`;
          cache.set(color, value);
          return value;
        };
        const normalize = (value: string): string => {
          // Gradients default to sRGB in html2canvas; remove the newer interpolation hint.
          let result = value.replace(/\s+in\s+(?:oklab|oklch|lab|lch|srgb(?:-linear)?|display-p3)(?:\s+(?:shorter|longer|increasing|decreasing)\s+hue)?/g, '');
          const modernColor = /(?:oklch|oklab|lab|lch|color-mix|color)\(/g;
          let match: RegExpExecArray | null;
          while ((match = modernColor.exec(result))) {
            let depth = 1;
            let end = modernColor.lastIndex;
            while (end < result.length && depth) {
              if (result[end] === '(') depth++;
              if (result[end] === ')') depth--;
              end++;
            }
            const replacement = rgb(result.slice(match.index, end));
            result = result.slice(0, match.index) + replacement + result.slice(end);
            modernColor.lastIndex = match.index + replacement.length;
          }
          return result;
        };
        const properties = [
          'color', 'background-color', 'background-image', 'border-top-color',
          'border-right-color', 'border-bottom-color', 'border-left-color',
          '-webkit-text-stroke-color', 'outline-color', 'text-decoration-color', 'box-shadow', 'text-shadow', 'fill', 'stroke',
        ];
        const elements = [document.documentElement, document.body, clonedElement,
          ...clonedElement.querySelectorAll<HTMLElement | SVGElement>('*')];
        for (const node of elements) {
          const computed = document.defaultView!.getComputedStyle(node);
          for (const property of properties) {
            const value = computed.getPropertyValue(property);
            if (/(?:oklch|oklab|lab|lch|color-mix|color)\(|\sin\s/.test(value)) {
              node.style.setProperty(property, normalize(value), 'important');
            }
          }
          node.style.setProperty('animation', 'none', 'important');
          node.style.setProperty('transition', 'none', 'important');
        }
        // Export the whole chart at its natural size regardless of the viewing zoom.
        clonedElement.style.transform = 'none';
      },
    });
  } finally {
    metricsStyle.remove();
  }
}
