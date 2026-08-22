import { LevelConfig } from '../types';

/**
 * 职级校验与配色纯函数（UI 表单与单元测试共用）。
 * 与 levels.ts（职级配置 store）解耦：这里只做纯计算，不含任何持久化状态。
 */

/** 职级序列代码：1-2 位大写英文字母（如 L / E / MD） */
export const LEVEL_CODE_RE = /^[A-Z]{1,2}$/;
/** 职级编号：整数或一位小数（如 1 / 1.1 / 2.5） */
export const LEVEL_NUMBER_RE = /^\d+(\.\d)?$/;

/** 12 色 2026 自适应调色板（饱和但柔和，兼顾深色文本可读性） */
export const LEVEL_PALETTE = [
  '#FF9999',
  '#FFCC99',
  '#FFFF99',
  '#CCFF99',
  '#99FF99',
  '#99FFCC',
  '#99CCFF',
  '#9999FF',
  '#CC99FF',
  '#FF99CC',
  '#FF99FF',
  '#99CCCC',
] as const;

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

/** 根据完整职级码从 12 色调色板稳定分配颜色。 */
export function autoColor(code: string): string {
  return LEVEL_PALETTE[hashFullCode(code) % LEVEL_PALETTE.length];
}
