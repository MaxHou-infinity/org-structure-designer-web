import { Department, Employee, LevelConfig } from '../types';
import { fullCode } from './level';

/**
 * 组织健康度分析（纯函数，可单测）。
 *
 * 从 `departments` 树自动计算分层健康度指标：
 * - L1：部门人数 / 编制 / 职级分布（一级部门概览卡）
 * - L2：管理幅度 / 层级深度 / 管理者比 / 空岗率（红黄绿阈值 + 一句话判读）
 * - L3：编制 vs 实际 vs 缺口（含成本）
 *
 * 与本应用的状态 store 解耦：只吃 `departments` + `levelConfigs`，输出纯数据，
 * 供「健康度抽屉」「诊断报告」「单测」复用。
 */

/** 红黄绿状态 */
export type HealthStatus = 'healthy' | 'warn' | 'danger';

/** 状态中文语义（用于 UI 与报告展示） */
export const HEALTH_STATUS_LABEL: Record<HealthStatus, string> = {
  healthy: '健康',
  warn: '关注',
  danger: '预警',
};

/** L1 部门概览卡 */
export interface L1DeptSummary {
  deptId: string;
  name: string;
  level: number;
  /** 编制人数（子树合计；未配置为 null） */
  headcount: number | null;
  /** 实际人数（子树合计，不含虚拟兼岗） */
  actual: number;
  /** 职级分布：fullCode -> 人数（子树合计） */
  levelDistribution: Record<string, number>;
  /** 该部门整体健康状态（优先看空岗率；未配置则默认关注） */
  status: HealthStatus;
}

/** L2 单项指标 */
export interface L2Metric {
  key: 'span' | 'depth' | 'managerRatio' | 'vacancy';
  label: string;
  /** 指标值；不可计算时为 null（如无负责人、无编制、无员工） */
  value: number | null;
  unit: string;
  status: HealthStatus;
  /** 一句话判读 */
  verdict: string;
}

/** L3 单行（编制 vs 实际 vs 缺口，含成本） */
export interface L3DeptRow {
  deptId: string;
  name: string;
  level: number;
  /** 编制（子树合计；未配置为 null） */
  headcount: number | null;
  /** 实际人数（子树合计） */
  actual: number;
  /** 缺口 = 编制 - 实际；正=空岗待补，负=超编 */
  gap: number | null;
  /** 平均月成本 */
  avgCost: number;
  /** 实际成本 */
  actualCost: number;
  /** 缺口成本 = 缺口 × 平均成本 */
  gapCost: number;
  status: HealthStatus;
}

/** 报告汇总 */
export interface HealthSummary {
  red: number;
  yellow: number;
  green: number;
  /** 整体诊断一句话 */
  diagnosis: string;
  /** 整体健康状态（取 L2 最差状态） */
  overall: HealthStatus;
}

/** 报告最高层指标 */
export interface ReportTotals {
  /** 总人数（不含虚拟兼岗） */
  totalEmployees: number;
  /** 部门总数 */
  totalDepartments: number;
  /** 编制缺口合计（正=空岗，负=超编） */
  totalGap: number;
  /** 月人力成本（实际成本合计） */
  totalCost: number;
  /** 有编制配置的一级部门数 */
  configuredHeadcount: number;
}

/** 完整健康报告 */
export interface HealthReport {
  scopeDeptId?: string;
  l1: L1DeptSummary[];
  l2: L2Metric[];
  summary: HealthSummary;
  l3: L3DeptRow[];
  totals: ReportTotals;
}

/** —— 树遍历辅助 —— */

function countEmployees(dept: Department, includeVirtual: boolean): number {
  let count = dept.employees.filter((e) => (includeVirtual ? true : !e.isVirtual)).length;
  for (const child of dept.children) count += countEmployees(child, includeVirtual);
  return count;
}

function collectEmployees(dept: Department, includeVirtual: boolean, out: Employee[] = []): Employee[] {
  for (const e of dept.employees) {
    if (includeVirtual || !e.isVirtual) out.push(e);
  }
  for (const child of dept.children) collectEmployees(child, includeVirtual, out);
  return out;
}

/** 扁平化所有部门 */
export function flattenDepartments(depts: Department[]): Department[] {
  const out: Department[] = [];
  const walk = (list: Department[]) => {
    for (const d of list) {
      out.push(d);
      walk(d.children);
    }
  };
  walk(depts);
  return out;
}

/** 子树编制合计（只累加 headcount > 0 的部门；headcount<=0/未配置视为无有效编制 → 返回 null） */
function sumHeadcountSubtree(dept: Department): number | null {
  let sum = 0;
  let found = false;
  const walk = (d: Department) => {
    if (typeof d.headcount === 'number' && Number.isFinite(d.headcount) && d.headcount > 0) {
      sum += d.headcount;
      found = true;
    }
    for (const c of d.children) walk(c);
  };
  walk(dept);
  return found ? sum : null;
}

/** 获取某职级配置的月成本；未知职级返回 0 */
function costForLevel(configs: LevelConfig[], code: string): number {
  const match = configs.find((c) => fullCode(c) === code);
  return typeof match?.cost === 'number' && Number.isFinite(match.cost) ? match.cost : 0;
}

/** 员工月成本：优先用员工个人成本 emp.cost，缺省降级按职级成本映射。 */
function employeeCost(emp: Employee, configs: LevelConfig[]): number {
  if (typeof emp.cost === 'number' && Number.isFinite(emp.cost)) return emp.cost;
  return costForLevel(configs, emp.level);
}

/** 子树实际成本合计 = Σ(非虚拟员工月成本)，与 countEmployees(real) 口径一致，避免双计 */
function sumCostSubtree(dept: Department, configs: LevelConfig[]): number {
  let sum = 0;
  for (const e of dept.employees) {
    if (!e.isVirtual) sum += employeeCost(e, configs);
  }
  for (const c of dept.children) sum += sumCostSubtree(c, configs);
  return sum;
}

/** 子树平均成本 = 实际成本 / 实际人数（无人则 0） */
function avgCostSubtree(dept: Department, configs: LevelConfig[]): number {
  const actual = countEmployees(dept, false);
  if (actual === 0) return 0;
  const realCost = sumCostSubtree(dept, configs);
  return round1(realCost / actual);
}

/** 子树职级分布 */
function levelDistributionSubtree(dept: Department): Record<string, number> {
  const dist: Record<string, number> = {};
  for (const e of collectEmployees(dept, true)) {
    dist[e.level] = (dist[e.level] || 0) + 1;
  }
  return dist;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** 查找部门（返回子树根） */
function findDept(depts: Department[], id: string): Department | null {
  for (const d of depts) {
    if (d.id === id) return d;
    const found = findDept(d.children, id);
    if (found) return found;
  }
  return null;
}

/** —— 阈值分级 —— */

function spanStatus(span: number): HealthStatus {
  // 默认阈值（沿用 UX 设计规格，可后续调）：3-8 健康；1-3 或 8-12 关注；<1 或 >12 预警
  if (span >= 3 && span <= 8) return 'healthy';
  if (span >= 1 && span < 3) return 'warn';
  if (span > 8 && span <= 12) return 'warn';
  return 'danger';
}

function depthStatus(depth: number): HealthStatus {
  if (depth <= 4) return 'healthy';
  if (depth <= 6) return 'warn';
  return 'danger';
}

function managerRatioStatus(ratio: number): HealthStatus {
  if (ratio <= 15) return 'healthy';
  if (ratio <= 25) return 'warn';
  return 'danger';
}

function vacancyStatus(rate: number): HealthStatus {
  if (rate <= 10) return 'healthy';
  if (rate <= 20) return 'warn';
  return 'danger';
}

/** 超编梯度（默认阈值，可后续调）：超编占比 = |缺口| ÷ 实际人数；>20% 预警，否则关注 */
function overStatus(ratio: number): HealthStatus {
  return ratio > 0.2 ? 'danger' : 'warn';
}

/**
 * 部门编制状态（L1 / L3 共用的统一口径，保证一致）。
 * - headcount 为 null/undefined → 未配置编制 → 关注（不做缺口分析）。
 * - 空岗（缺口>0）→ 按空岗率分级（≤10 健康 / ≤20 关注 / >20 预警）。
 * - 超编（缺口<0）→ 按超编梯度分级（|缺口|/实际 >20% 预警，否则关注）。
 * - 恰好满编 → 健康。
 */
function deptStatus(headcount: number | null, actual: number): HealthStatus {
  if (headcount === null) return 'warn';
  const gap = headcount - actual;
  if (gap > 0) return vacancyStatus((gap / headcount) * 100); // 空岗，headcount>0
  if (gap < 0) return overStatus(Math.abs(gap) / Math.max(actual, 1)); // 超编梯度
  return 'healthy';
}

/** —— L1 —— */

export function computeL1(depts: Department[]): L1DeptSummary[] {
  return depts.map((d) => {
    const actual = countEmployees(d, false);
    const headcount = sumHeadcountSubtree(d);
    const status = deptStatus(headcount, actual);
    return {
      deptId: d.id,
      name: d.name,
      level: d.level,
      headcount,
      actual,
      levelDistribution: levelDistributionSubtree(d),
      status,
    };
  });
}

/** —— L2 —— */

/**
 * 计算 L2 四项指标。
 * 口径（队长决策 v2.0.2）：
 * - 管理幅度 = 直属下属数 = 有负责人部门下属总数 ÷ 有负责人部门数（非整棵子树）
 * - 层级深度 = 树最大 depth（根 L1=1）
 * - 管理者比 = 管理人数 ÷ 总人数（headcount 口径）
 * - 空岗率 = 空缺职位数 ÷ 编制总数（编制需用户填，未填则跳过 → null）
 * 所有阈值为「默认阈值」，可在分析面板标注"可后续调"。
 * @param roots 作用域根部门列表（聚焦单个 L1 时传入 [该部门]）
 */
export function computeL2(roots: Department[]): L2Metric[] {
  const allDepts = flattenDepartments(roots);
  // 用包裹根构造一个临时对象收集全量员工（不含虚拟兼岗）
  const allEmployees = collectEmployees(
    { id: '', name: '', level: 0, expanded: true, children: roots, employees: [] } as Department,
    false,
  );

  // 管理者 = 有 leaderId/leaderName 的部门负责人去重
  const managerKeys = new Set<string>();
  for (const d of allDepts) {
    if (d.leaderId) managerKeys.add(`id:${d.leaderId}`);
    else if (d.leaderName) managerKeys.add(`name:${d.leaderName}`);
  }
  const managerCount = managerKeys.size;
  const totalEmployees = allEmployees.length;

  // 管理幅度 = 直属下属数（leader 下直接管理的人数 = 部门自身 employees.length，非整棵子树）
  // 聚合口径：有负责人部门的下属总数 ÷ 有负责人的部门数（即"每经理平均直管人数"）。
  let spanLeaders = 0;
  let spanReports = 0;
  for (const d of allDepts) {
    if (d.leaderId || d.leaderName) {
      spanLeaders += 1;
      spanReports += d.employees.filter((e) => !e.isVirtual).length; // 不计虚拟兼岗
    }
  }
  let span: number | null = null;
  let spanStatusVal: HealthStatus = 'warn';
  let spanVerdict = '无法计算管理幅度（未设置部门负责人）';
  if (spanLeaders > 0) {
    span = round1(spanReports / spanLeaders);
    spanStatusVal = spanStatus(span);
    spanVerdict =
      spanStatusVal === 'healthy'
        ? '管理幅度适中，层级健康'
        : spanStatusVal === 'warn'
          ? '管理幅度偏窄/偏宽，建议优化汇报线'
          : '管理幅度失衡，存在失控或冗余风险';
  }

  // 层级深度
  const depth = computeTreeDepth(roots);
  const depthStatusVal = depthStatus(depth);
  const depthVerdict =
    depthStatusVal === 'healthy'
      ? '层级精简，决策链短'
      : depthStatusVal === 'warn'
        ? '层级偏深，可考虑扁平化'
        : '层级过深，决策效率低，建议压缩';

  // 管理者比
  let managerRatio: number | null = null;
  let managerRatioStatusVal: HealthStatus = 'warn';
  let managerRatioVerdict = '无法计算管理者比（无员工数据）';
  if (totalEmployees > 0) {
    managerRatio = round1((managerCount / totalEmployees) * 100);
    managerRatioStatusVal = managerRatioStatus(managerRatio);
    managerRatioVerdict =
      managerRatioStatusVal === 'healthy'
        ? '管理者占比合理'
        : managerRatioStatusVal === 'warn'
          ? '管理者占比偏高，注意成本/官僚倾向'
          : '管理者占比过高，存在头重脚轻';
  }

  // 空岗率（仅统计有效编制 headcount>0）
  let headcount = 0;
  let foundHeadcount = false;
  for (const d of allDepts) {
    if (typeof d.headcount === 'number' && Number.isFinite(d.headcount) && d.headcount > 0) {
      headcount += d.headcount;
      foundHeadcount = true;
    }
  }
  let vacancy: number | null = null;
  let vacancyStatusVal: HealthStatus = 'warn';
  let vacancyVerdict = '未配置编制数据，无法计算空岗率';
  if (foundHeadcount && headcount > 0) {
    vacancy = round1(((headcount - totalEmployees) / headcount) * 100);
    vacancyStatusVal = vacancyStatus(vacancy);
    vacancyVerdict =
      vacancyStatusVal === 'healthy'
        ? '编制基本满编'
        : vacancyStatusVal === 'warn'
          ? '空岗率偏高，关注招聘节奏'
          : '空岗严重，影响业务交付';
  }

  return [
    { key: 'span', label: '管理幅度', value: span, unit: '人', status: spanStatusVal, verdict: spanVerdict },
    { key: 'depth', label: '层级深度', value: depth, unit: '层', status: depthStatusVal, verdict: depthVerdict },
    { key: 'managerRatio', label: '管理者比', value: managerRatio, unit: '%', status: managerRatioStatusVal, verdict: managerRatioVerdict },
    { key: 'vacancy', label: '空岗率', value: vacancy, unit: '%', status: vacancyStatusVal, verdict: vacancyVerdict },
  ];
}

/** 计算树的层级深度（根为 1，逐层 +1） */
export function computeTreeDepth(roots: Department[]): number {
  if (roots.length === 0) return 0;
  const walk = (dept: Department): number => {
    if (dept.children.length === 0) return 1;
    return 1 + Math.max(...dept.children.map(walk));
  };
  return Math.max(...roots.map(walk));
}

/** 整体诊断一句话 */
function summarizeDiagnosis(metrics: L2Metric[]): { red: number; yellow: number; green: number; overall: HealthStatus; diagnosis: string } {
  let red = 0;
  let yellow = 0;
  let green = 0;
  for (const m of metrics) {
    if (m.status === 'danger') red++;
    else if (m.status === 'warn') yellow++;
    else green++;
  }
  let overall: HealthStatus = 'healthy';
  if (red > 0) overall = 'danger';
  else if (yellow > 0) overall = 'warn';

  let diagnosis: string;
  if (red > 0) {
    diagnosis = `存在明显异常（${red} 项预警），建议优先治理。`;
  } else if (yellow > 0) {
    diagnosis = '整体健康，部分指标需持续关注。';
  } else {
    diagnosis = '整体健康度良好，组织结构稳健。';
  }
  return { red, yellow, green, overall, diagnosis };
}

/** —— L3 —— */

export function computeL3(roots: Department[], configs: LevelConfig[]): L3DeptRow[] {
  return flattenDepartments(roots).map((d) => {
    const actual = countEmployees(d, false);
    const headcount = sumHeadcountSubtree(d);
    const avgCost = avgCostSubtree(d, configs);
    const actualCost = round1(sumCostSubtree(d, configs));
    const gap = headcount === null ? null : headcount - actual;
    const gapCost = gap === null || avgCost <= 0 ? 0 : round1(gap * avgCost);
    const status = deptStatus(headcount, actual);
    return {
      deptId: d.id,
      name: d.name,
      level: d.level,
      headcount,
      actual,
      gap,
      avgCost,
      actualCost,
      gapCost,
      status,
    };
  });
}

/** —— 主入口 —— */

export function computeHealthReport(
  depts: Department[],
  configs: LevelConfig[],
  focusDeptId?: string,
): HealthReport {
  let scope = depts;
  if (focusDeptId) {
    const target = findDept(depts, focusDeptId);
    if (target) scope = [target];
  }

  const l1 = computeL1(scope);
  const l2 = computeL2(scope);
  const summaryAgg = summarizeDiagnosis(l2);
  const l3 = computeL3(scope, configs);

  // 汇总（L1 树口径，避免子部门重复累计）
  let totalEmployees = 0;
  let configuredHeadcount = 0;
  let totalHeadcount = 0;
  for (const row of l1) {
    totalEmployees += row.actual;
    if (row.headcount !== null) {
      configuredHeadcount++;
      totalHeadcount += row.headcount;
    }
  }
  const totalGap = totalHeadcount - totalEmployees;
  const totalCost = round1(l3.reduce((s, r) => s + r.actualCost, 0));

  const totals: ReportTotals = {
    totalEmployees,
    totalDepartments: flattenDepartments(depts).length,
    totalGap,
    totalCost,
    configuredHeadcount,
  };

  return {
    scopeDeptId: focusDeptId,
    l1,
    l2,
    summary: { ...summaryAgg },
    l3,
    totals,
  };
}
