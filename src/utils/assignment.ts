import type { AssignmentType, Employee, Position, PositionAssignment } from '../types';

/**
 * —— v2.2.0 人岗时态关系表（design doc §7）——
 *
 * 双轨兼容过渡（Captain #1）：
 * - 投影（`Employee.positionId` + 虚拟副本）= **active 状态源**，画布/状态机零改动；
 * - `positionAssignments` = **追加式历史 + 确认表**，只承载「前向新增事实」：
 *   时态（startDate/endDate）、primary/secondary、`not_competent` 人工确认。
 *
 * 纪律：迁移不回填（不伪造 startDate）；`project.ts` 不 import 本文件（无循环依赖）；
 * 同步只做「前向 diff/upsert」，绝不自动 end/删除已有记录（保留 ended 历史与确认态）。
 */

/** 本地生成 assignment id（不 import project.ts，避免任何循环依赖风险；样式对齐 uid('asg')）。 */
function genAsgId(): string {
  return `asg-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** 前向同步（diff/upsert）：把「当前 active 投影」diff 进 assignment 表。
 *  按 (employeeId, positionId, type) 去重：已有记录（active/ended/not_competent）一律保留、不重复追加；
 *  新 active 记录 startDate 缺省「操作当日」（= now 入参），可编辑。
 *  虚拟副本（isVirtual，primaryEmployeeId 指向真人）不产生独立主体——其岗位归属到真人员工（type='secondary'）。
 *  幂等：重复调用不产生重复 active 记录。 */
export function projectionToAssignments(
  employees: Employee[],
  _positions: Position[], // 契约保留参数（岗位校验/归档过滤留待 P2 写入层）
  assignments: PositionAssignment[],
  now: string,
): PositionAssignment[] {
  const wanted: Array<{ employeeId: string; positionId: string; type: AssignmentType }> = [];
  for (const e of employees) {
    if (e.isVirtual) continue;
    if (e.positionId) wanted.push({ employeeId: e.id, positionId: e.positionId, type: 'primary' });
  }
  for (const v of employees) {
    if (!v.isVirtual) continue;
    if (!v.primaryEmployeeId || !v.positionId) continue; // 无法归属的虚拟副本跳过
    wanted.push({ employeeId: v.primaryEmployeeId, positionId: v.positionId, type: 'secondary' });
  }

  const out = [...assignments];
  for (const w of wanted) {
    const exists = assignments.some(
      (a) => a.employeeId === w.employeeId && a.positionId === w.positionId && a.type === w.type,
    );
    if (exists) continue; // 幂等 + 保留历史/确认态：已有任何状态记录都不重复追加
    out.push({
      id: genAsgId(),
      employeeId: w.employeeId,
      positionId: w.positionId,
      type: w.type,
      startDate: now,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    });
  }
  return out;
}

/** 恢复路径（有损，仅应急）：从 assignment 表重建 active 主岗/兼岗投影。
 *  ended 历史与 not_competent 确认态不进入投影（投影是 active 快照）；仅当投影被清空/损坏时使用。
 *  无 active 记录的员工保持原样（表是前向事实，旧数据无记录——不能反向清空投影）。
 *  `now`：契约保留参数（Employee 投影上无时态字段落点；P2 写入层恢复流程可用）。 */
export function assignmentsToProjection(
  employees: Employee[],
  assignments: PositionAssignment[],
  now: string,
): Employee[] {
  void now; // 契约保留参数：恢复路径当前不落时态字段
  const primaryByEmp = new Map<string, string>(); // employeeId → positionId
  const secondaryByEmp = new Map<string, string[]>(); // employeeId → positionId[]
  for (const a of assignments) {
    if (a.status !== 'active') continue; // ended / not_competent 不进投影
    if (a.type === 'primary') {
      if (!primaryByEmp.has(a.employeeId)) primaryByEmp.set(a.employeeId, a.positionId);
    } else {
      const list = secondaryByEmp.get(a.employeeId) ?? [];
      if (!list.includes(a.positionId)) list.push(a.positionId);
      secondaryByEmp.set(a.employeeId, list);
    }
  }

  const out = employees.map((e) => {
    if (e.isVirtual) return e;
    const pid = primaryByEmp.get(e.id);
    return pid ? { ...e, positionId: pid } : e;
  });

  const realById = new Map(
    employees.filter((e) => !e.isVirtual).map((e) => [e.id, e]),
  );
  const extra: Employee[] = [];
  for (const [empId, pids] of secondaryByEmp) {
    const real = realById.get(empId);
    if (!real) continue;
    for (const pid of pids) {
      const hasCopy = out.some(
        (x) => x.isVirtual && x.primaryEmployeeId === empId && x.positionId === pid,
      );
      if (hasCopy) continue; // 已有虚拟副本 → 保留原样
      extra.push({
        id: genAsgId(),
        name: real.name,
        employeeId: real.employeeId,
        level: real.level,
        isVirtual: true,
        primaryEmployeeId: empId,
        positionId: pid,
        assignmentType: 'secondary',
      });
    }
  }
  return [...out, ...extra];
}

/** helper：已人工确认不胜任的 employeeId 集合（供 computeMatchStates 入参，B6 简化口径——
 *  确认粒度是「人-岗」，此处按「人」聚合；一人多岗仅某岗确认时按人整体标 not_competent，MVP 接受）。 */
export function confirmedNotCompetentSet(assignments: PositionAssignment[]): Set<string> {
  const out = new Set<string>();
  for (const a of assignments) {
    if (a.status === 'not_competent') out.add(a.employeeId);
  }
  return out;
}
