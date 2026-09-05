import { useEffect, useRef } from 'react';

// 最上层对话框独占键盘；嵌套关闭时返回发起操作的位置。
const dialogStack: HTMLElement[] = [];
export function useDialogFocus(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  useEffect(() => {
    const dialog = ref.current;
    if (!open || !dialog) return;
    const previous = document.activeElement as HTMLElement | null;
    dialogStack.push(dialog);
    const isTop = () => dialogStack.at(-1) === dialog;
    const controls = () => Array.from(dialog.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled):not([type="hidden"]), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]',
    )).filter((el) => !el.closest('[hidden]') && getComputedStyle(el).display !== 'none');
    if (!dialog.contains(document.activeElement)) (controls()[0] ?? dialog).focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (!isTop()) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        closeRef.current();
      }
      if (event.key === 'Tab') {
        const items = controls();
        const first = items[0] ?? dialog;
        const last = items.at(-1) ?? dialog;
        if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
          event.preventDefault(); last.focus();
        } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
          event.preventDefault(); first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      const wasTop = isTop();
      dialogStack.splice(dialogStack.indexOf(dialog), 1);
      if (wasTop && previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [open]);
  return ref;
}
