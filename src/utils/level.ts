import { LevelConfig } from '../types';

/**
 * 职级校验与配色纯函数（UI 表单与单元测试共用）。
 * 与 levels.ts（职级配置 store）解耦：这里只做纯计算，不含任何持久化状态。
 */

/** 职级序列代码：1-2 位大写英文字母（如 L / E / MD） */
export const LEVEL_CODE_RE = /^[A-Z]{1,2}$/;
/** 职级编号：整数或一位小数（如 1 / 1.1 / 2.5） */
export const LEVEL_NUMBER_RE = /^\d+(\.\d)?$/;

// v2.0.12：配色改为语义化自动分配（序列色系 + 级别深浅），原 12 色固定调色板 LEVEL_PALETTE 已移除，见 autoColor。

/** 校验职级序列代码是否为 1-2 位大写英文字母。自动忽略大小写（内部转大写后比对）。 */
export function validateLevelCode(code: string): boolean {
  return LEVEL_CODE_RE.test(code.toUpperCase());
}

/** 校验职级编号是否为整数或一位小数（如 1 / 1.1 / 2.5）。 */
export function validateLevelNumber(num: string): boolean {
  return LEVEL_NUMBER_RE.test(num.trim());
}

/** 规范化职级编号：去除前导 0、尾随 .0、尾随点（如 01→1、1.0→1、1.→1）。 */
export function normalizeLevelNumber(num: string): string {
  const t = num.trim().replace(/^0+(?=\d)/, '');
  return t.replace(/\.0+$/, '').replace(/\.$/, '');
}

/** 派生完整职级码 = code + number（如 "L1.1"）。 */
export function fullCode(config: Pick<LevelConfig, 'code' | 'number'>): string {
  return `${config.code.toUpperCase()}${config.number}`;
}

/** 稳定哈希（基于 fullCode），用于自动配色不随增删/重排漂移。 */
function hashFullCode(code: string): number {
  let hash = 0;
  for (let i = 0; i < code.length; i++) {
    hash = (hash * 31 + code.charCodeAt(i)) >>> 0;
  }
  return hash;
}

/** 序列 → 色系主色相（HSL）：L=indigo（241）、E=emerald（158）；其余序列由稳定哈希从备选色系分配 */
const SEQUENCE_HUES: Record<string, number> = {
  L: 241,
  E: 158,
};
/** 备选色系（蓝/橙/粉/黄/紫/青/红/深紫）——给自定义序列使用 */
const FALLBACK_HUES = [210, 25, 325, 40, 283, 183, 5, 262];

/** HSL → HEX（大写），自动配色输出用。 */
function hslToHex(h: number, s: number, l: number): string {
  const sN = s / 100;
  const lN = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sN * Math.min(lN, 1 - lN);
  const f = (n: number) => lN - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const toHex = (x: number) => Math.round(x * 255).toString(16).padStart(2, '0');
  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`.toUpperCase();
}

/**
 * 语义化自动配色（v2.0.12，替代旧 12 色随机哈希）：
 * - 序列 → 色系：L=indigo、E=emerald、其余序列按稳定哈希分配独有色系；
 * - 级别编号 → 同一色系内随编号递进深浅（编号越大越深，如 L1.1 浅 → L3.2 深）。
 * 用途：员工卡底色 / 职级分布色带 / 颜色图例 —— 一眼分清「序列」与「级别」，
 * 不再出现同序列两级颜色毫无关联、跨序列颜色却相近的问题。
 * 仍基于 fullCode 稳定哈希：不随增删/重排漂移；同样输入恒得同样输出。
 */
export function autoColor(code: string): string {
  const m = /^([A-Za-z]+)(\d+(?:\.\d+)?)$/.exec(code);
  const seq = m ? m[1].toUpperCase() : '';
  const num = m ? Math.max(0, parseFloat(m[2])) : 0;
  const hue = SEQUENCE_HUES[seq] ?? FALLBACK_HUES[hashFullCode(seq) % FALLBACK_HUES.length];
  const lightness = Math.max(42, Math.min(90, 90 - num * 10));
  return hslToHex(hue, 64, lightness);
}
