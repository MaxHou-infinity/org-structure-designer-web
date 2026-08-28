import { Employee, Position, MatchStatus } from '../types';

/**
 * 人岗匹配状态机（v2.1.1，纯函数、运行时派生、不进持久化）。
 *
 * 两个正交维度（HR 语义）：
 * - 员工视角「进图/未进图」= 是否有 positionId（是否套岗）——无套岗 = unassigned；
 * - 岗位视角「空岗/满编/超编」= Position 的派生状态（assignedCount vs headcount），超编人员带 overstaffed 标记。
 *
 * 说明：兼岗虚拟副本（isVirtual）不产生独立匹配状态（跟随主岗），避免双计；
 * not_competent 仅类型预留，v2.1.1 不产出（胜任度判定推迟 v2.2.0）。
 */
export interface MatchResult {
  employeeId: string;
  status: MatchStatus;
  positionId?: string;
  /** 未进图归因：no_position = 未套岗（其余为预留） */
  reason?: 'no_position' | 'overstaffed' | 'unknown';
}

export function computeMatchStates(
  allEmployees: Employee[],
  positions: Position[],
): MatchResult[] {
  const byId = new Map<string, Position>(positions.map((p) => [p.id, p]));

  // 1) 统计每个 active 岗位的实际占用人数 + 套岗顺序（用 allEmployees 数组序近似「套岗时间序」）
  const assignedCount = new Map<string, number>();
  const assignedOrder: string[] = [];
  for (const e of allEmployees) {
    if (e.isVirtual) continue; // 兼岗虚拟副本不计「名额占用」主体
    const pid = e.positionId;
    if (!pid) continue;
    const p = byId.get(pid);
    if (!p || p.status === 'archived') continue; // archived=软删除，不计占用
    assignedCount.set(pid, (assignedCount.get(pid) ?? 0) + 1);
    assignedOrder.push(e.id);
  }

  // 2) 逐员工判定
  const results: MatchResult[] = [];
  for (const e of allEmployees) {
    if (e.isVirtual) continue; // 兼岗虚拟副本：跟随主岗，不单独产出

    const pid = e.positionId;
    if (!pid) {
      results.push({ employeeId: e.id, status: 'unassigned', reason: 'no_position' });
      continue;
    }
    const p = byId.get(pid);
    if (!p || p.status === 'archived') {
      results.push({ employeeId: e.id, status: 'unassigned', reason: 'no_position' });
      continue;
    }

    const count = assignedCount.get(pid) ?? 0;
    // 只有 active 且 headcount>0 的有效编制岗位才按「人数 > 编制」判超编；
    // frozen（冻结编制）/ headcount=0（未配置）→ 视为无预算（员工仍 placed，缺口由 analytics 另行呈现）。
    const hasBudget = p.status === 'active' && p.headcount > 0;
    const overflow = hasBudget && count > p.headcount;
    // 超编 = 岗位超出名额；超出部分按「套岗顺序后进者」标记
    const isLate = overflow && assignedOrder.indexOf(e.id) >= p.headcount;
    results.push({
      employeeId: e.id,
      status: isLate ? 'overstaffed' : 'placed',
      positionId: pid,
      reason: isLate ? 'overstaffed' : undefined,
    });
  }
  return results;
}
