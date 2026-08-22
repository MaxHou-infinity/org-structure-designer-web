/**
 * Tauri 桌面环境适配工具
 * 
 * 同一份前端代码同时支持：
 * - 浏览器（Web）：导出走 a.click() 下载
 * - Tauri 桌面：导出走原生"另存为"对话框 + fs 写入
 */

/** 检测当前是否运行在 Tauri 桌面环境 */
export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/**
 * 导出文件：优先用 Tauri 原生保存对话框，浏览器环境回退到下载。
 * @param defaultName 默认文件名（含扩展名）
 * @param data 文件内容（ArrayBuffer 或 Uint8Array）
 * @param mimeType 浏览器下载用的 MIME 类型
 */
export async function saveFile(
  defaultName: string,
  data: ArrayBuffer | Uint8Array,
  mimeType: string,
): Promise<boolean> {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);

  if (isTauri()) {
    try {
      const { save } = await import('@tauri-apps/plugin-dialog');
      const { writeFile } = await import('@tauri-apps/plugin-fs');
      const path = await save({ defaultPath: defaultName });
      if (!path) return false; // 用户取消
      await writeFile(path, bytes);
      return true;
    } catch (error) {
      console.error('Tauri 保存文件失败，回退浏览器下载:', error);
      // 回退到浏览器下载逻辑
    }
  }

  // 浏览器下载（Tauri 回退兜底）
  const blob = new Blob([bytes], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = defaultName;
  link.click();
  URL.revokeObjectURL(url);
  return true;
}
