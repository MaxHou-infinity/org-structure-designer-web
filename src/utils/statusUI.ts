import { HealthStatus } from './analytics';

/** 红黄绿状态 → 视觉类（供健康度抽屉 / 诊断报告共用） */
export interface StatusStyle {
  /** 状态点背景 */
  dot: string;
  /** 状态文字颜色 */
  text: string;
  /** 卡片/容器底色 */
  bg: string;
  /** 边框 */
  border: string;
}

export const STATUS_STYLE: Record<HealthStatus, StatusStyle> = {
  healthy: {
    dot: 'bg-emerald-500',
    text: 'text-emerald-600',
    bg: 'bg-emerald-50/70',
    border: 'border-emerald-300',
  },
  warn: {
    dot: 'bg-amber-500',
    text: 'text-amber-600',
    bg: 'bg-amber-50/70',
    border: 'border-amber-300',
  },
  danger: {
    dot: 'bg-red-500',
    text: 'text-red-600',
    bg: 'bg-red-50/70',
    border: 'border-red-300',
  },
};

/** 单值格式化：null → '—' */
export function fmt(value: number | null, unit = ''): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  const v = Number.isInteger(value) ? String(value) : value.toFixed(1);
  return `${v}${unit}`;
}

/** 金额格式化（单位 w）：保留 1 位小数 */
export function fmtCost(value: number | null): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  const v = Number.isInteger(value) ? String(value) : value.toFixed(1);
  return `${v}w`;
}
