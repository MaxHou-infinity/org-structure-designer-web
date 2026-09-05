import { useEffect, useId, useState } from 'react';
import { useDialogFocus } from '../utils/useDialogFocus';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

/**
 * 通用应用内 Modal 基础组件（v2.1.1）：
 * 遮罩 + 玻璃面板 + 头部（标题/关闭）+ 正文 + 可选底部操作区，Esc / 遮罩点击关闭。
 * 供「目标职级」「新建岗位」等弹窗复用，替换原生 window.prompt。
 *
 * 关键：用 createPortal 渲染到 document.body —— 本组件可能被渲染在画布卡片内，
 * 而画布是 transform:scale 坐标系；若不用 portal，position:fixed 会以 transform 祖先为参照
 * （而非视口），导致弹窗偏移/被卡片遮盖/闪屏。portal 到 body 后 fixed 相对视口、z-110 置顶。
 */
export function AppModal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  maxWidth = 'max-w-lg',
  dirty = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: string;
  dirty?: boolean;
}) {
  const titleId = useId();
  const [confirmClose, setConfirmClose] = useState(false);
  useEffect(() => { if (!open) setConfirmClose(false); }, [open]);
  const requestClose = () => { if (dirty) setConfirmClose(true); else onClose(); };
  const dialogRef = useDialogFocus(open, requestClose);
  useEffect(() => {
    if (!confirmClose) return;
    const warning = dialogRef.current?.querySelector<HTMLElement>('[role="alert"]');
    warning?.scrollIntoView?.({ block: 'nearest' });
    warning?.querySelector('button')?.focus();
  }, [confirmClose, dialogRef]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4" onPointerDown={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
      <div
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm animate-fadeIn"
        onClick={requestClose}
        onPointerDown={(e) => e.stopPropagation()}
      />
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-labelledby={titleId}
        aria-modal="true"
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        className={`relative w-full ${maxWidth} max-h-[85vh] flex flex-col rounded-2xl bg-white border border-slate-200 shadow-2xl overflow-hidden animate-fadeInUp`}
      >
        <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 id={titleId} className="text-lg font-bold text-slate-900">{title}</h2>
          <button
            onClick={requestClose}
            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
            aria-label="关闭"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        {subtitle && <div className="shrink-0 px-6 pt-3 -mt-1 text-xs text-slate-600">{subtitle}</div>}
        <div className="flex-1 px-6 py-4 overflow-y-auto min-h-0">
          {confirmClose && <div role="alert" className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-slate-800">
            <p>有尚未保存的修改。关闭后，这些修改将丢失。</p>
            <div className="mt-3 flex gap-2">
              <button onClick={() => setConfirmClose(false)} className="rounded-lg bg-white border border-slate-300 px-3 py-2">继续编辑</button>
              <button onClick={onClose} className="rounded-lg bg-amber-100 px-3 py-2">放弃修改并关闭</button>
            </div>
          </div>}
          {children}
        </div>
        {footer && (
          <div className="shrink-0 px-6 py-3 border-t border-slate-200 flex flex-wrap items-center justify-end gap-2">{footer}</div>
        )}
      </div>
    </div>,
    document.body,
  );
}
