import { Department, Position } from '../types';

/**
 * v2.1.1 组件层岗位辅助（纯函数，UI 复用）。
 *
 * 岗位化后，岗位真值嵌套在每个 `Department.positions`（画布向下钻用），
 * 而 analytics 的 `computePositionSummary` / `computeMatchStates` 消费「全量岗位扁平列表」。
 * 本函数把部门树内的岗位镜像拍平，供 App 传入 analytics 及各组件消费，保证 UI 层始终以部门树为唯一真值。
 */
export function flattenAllPositions(depts: Department[]): Position[] {
  const out: Position[] = [];
  const walk = (list: Department[]) => {
    for (const d of list) {
      out.push(...(Array.isArray(d.positions) ? d.positions : []));
      walk(d.children);
    }
  };
  walk(depts);
  return out;
}
