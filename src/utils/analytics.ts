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
  /** 编制缺口合计（正=空岗，负=超编）；当无任何部门配置编制时置为 null（未配置，不伪装成“超编/空岗”） */
  totalGap: number | null;
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

/**
 * 健康度阈值配置（v2.0.3 可配置化）。
 * 各指标阈值从硬编码抽离，可经设置面板调整并持久化到 localStorage。
 * 所有 compute* 函数接受可选阈值参数，缺省读取当前配置（默认值即 v2.0.2 历史口径）。
 */
export interface HealthThresholds {
  /** 管理幅度：健康区间 [spanHealthyMin, spanHealthyMax]；[spanWarnLow, spanHealthyMin) 与 (spanHealthyMax, spanWarnMax] 为关注；其余预警 */
  spanHealthyMin: number;
  spanHealthyMax: number;
  spanWarnLow: number;
  spanWarnMax: number;
  /** 层级深度：<= depthHealthyMax 健康；<= depthWarnMax 关注；其余预警 */
  depthHealthyMax: number;
  depthWarnMax: number;
  /** 管理者比（%）：<= managerHealthyMax 健康；<= managerWarnMax 关注；其余预警 */
  managerHealthyMax: number;
  managerWarnMax: number;
  /** 空岗率（%）：<= vacancyHealthyMax 健康；<= vacancyWarnMax 关注；其余预警 */
  vacancyHealthyMax: number;
  vacancyWarnMax: number;
  /** 超编梯度：超编占比 <= overWarnRatio 关注；其余预警 */
  overWarnRatio: number;
}

/** 默认阈值（v2.0.2 历史口径，作为迁移默认值） */
export const DEFAULT_HEALTH_THRESHOLDS: HealthThresholds = {
  spanHealthyMin: 3,
  spanHealthyMax: 8,
  spanWarnLow: 1,
  spanWarnMax: 12,
  depthHealthyMax: 4,
  depthWarnMax: 6,
  managerHealthyMax: 15,
  managerWarnMax: 25,
  vacancyHealthyMax: 10,
  vacancyWarnMax: 20,
  overWarnRatio: 0.2,
};

const HEALTH_THRESHOLDS_KEY = 'org-designer.health-thresholds';

/** 读取当前阈值配置；未配置/非法时回退默认值。 */
export function getHealthThresholds(): HealthThresholds {
  if (typeof localStorage === 'undefined') return { ...DEFAULT_HEALTH_THRESHOLDS };
  try {
    const raw = localStorage.getItem(HEALTH_THRESHOLDS_KEY);
    if (!raw) return { ...DEFAULT_HEALTH_THRESHOLDS };
    const parsed = JSON.parse(raw) as Partial<HealthThresholds>;
    return { ...DEFAULT_HEALTH_THRESHOLDS, ...parsed };
  } catch {
    return { ...DEFAULT_HEALTH_THRESHOLDS };
  }
}

/** 持久化阈值配置。 */
export function setHealthThresholds(t: HealthThresholds): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(HEALTH_THRESHOLDS_KEY, JSON.stringify(t));
  }
}

/** 恢复默认阈值并清除自定义配置。 */
export function resetHealthThresholds(): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(HEALTH_THRESHOLDS_KEY);
  }
}

/** —— —— v2.0.8：企业阶段情景基准预设（只做“阶段”，不做“行业”） —— —— */

/** 企业阶段 */
export type OrganizationStage = 'startup' | 'growth' | 'mature';

/** 阶段预设：含标签、描述与对应阈值 */
export interface StagePreset {
  id: OrganizationStage;
  label: string;
  description: string;
  thresholds: HealthThresholds;
}

/**
 * 三档阶段基准（值来自 HR 审计档位值）。
 * 注意：growth 即当前默认口径（= DEFAULT_HEALTH_THRESHOLDS）。
 * 每一档 description 均注明「基准仅供参考，需结合本企业业务阶段校准」。
 */
export const STAGE_PRESETS: Record<OrganizationStage, StagePreset> = {
  startup: {
    id: 'startup',
    label: '初创期',
    description: '组织快速搭建、管理上线，基准仅供参考，需结合本企业业务阶段校准。',
    thresholds: {
      spanHealthyMin: 2,
      spanHealthyMax: 7,
      spanWarnLow: 1,
      spanWarnMax: 10,
      depthHealthyMax: 3,
      depthWarnMax: 4,
      managerHealthyMax: 20,
      managerWarnMax: 30,
      vacancyHealthyMax: 15,
      vacancyWarnMax: 25,
      overWarnRatio: 0.25,
    },
  },
  growth: {
    id: 'growth',
    label: '成长期',
    description: '快速扩张、层级与汇报线逐渐成形，基准仅供参考，需结合本企业业务阶段校准。',
    thresholds: { ...DEFAULT_HEALTH_THRESHOLDS },
  },
  mature: {
    id: 'mature',
    label: '成熟期',
    description: '组织稳定、流程固化，基准仅供参考，需结合本企业业务阶段校准。',
    thresholds: {
      spanHealthyMin: 5,
      spanHealthyMax: 9,
      spanWarnLow: 1,
      spanWarnMax: 14,
      depthHealthyMax: 5,
      depthWarnMax: 7,
      managerHealthyMax: 18,
      managerWarnMax: 25,
      vacancyHealthyMax: 8,
      vacancyWarnMax: 15,
      overWarnRatio: 0.15,
    },
  },
};

/** 默认阶段 = 成长期（= 当前默认阈值） */
export const DEFAULT_STAGE: OrganizationStage = 'growth';

/** 取某阶段阈值（返回副本，避免调用方误改原始预设）。 */
export function getStagePresetThresholds(stage: OrganizationStage): HealthThresholds {
  return { ...STAGE_PRESETS[stage].thresholds };
}

/** 应用某阶段阈值并持久化到 localStorage（复用现有 setHealthThresholds）。 */
export function setStagePreset(stage: OrganizationStage): void {
  setHealthThresholds(getStagePresetThresholds(stage));
}

/** 判断编制是否未配置（headcount 为 null/undefined）—— 供 UI 呈现灰色“无数据”。 */
export function isHeadcountUnset(headcount: number | null | undefined): boolean {
  return headcount == null;
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

function spanStatus(span: number, t: HealthThresholds): HealthStatus {
  // 3-8 健康；[spanWarnLow, healthyMin) 或 (healthyMax, warnMax] 关注；其余预警
  if (span >= t.spanHealthyMin && span <= t.spanHealthyMax) return 'healthy';
  if (span >= t.spanWarnLow && span < t.spanHealthyMin) return 'warn';
  if (span > t.spanHealthyMax && span <= t.spanWarnMax) return 'warn';
  return 'danger';
}

function depthStatus(depth: number, t: HealthThresholds): HealthStatus {
  if (depth <= t.depthHealthyMax) return 'healthy';
  if (depth <= t.depthWarnMax) return 'warn';
  return 'danger';
}

function managerRatioStatus(ratio: number, t: HealthThresholds): HealthStatus {
  if (ratio <= t.managerHealthyMax) return 'healthy';
  if (ratio <= t.managerWarnMax) return 'warn';
  return 'danger';
}

function vacancyStatus(rate: number, t: HealthThresholds): HealthStatus {
  if (rate <= t.vacancyHealthyMax) return 'healthy';
  if (rate <= t.vacancyWarnMax) return 'warn';
  return 'danger';
}

/** 超编梯度：超编占比 = |缺口| ÷ 实际人数；> overWarnRatio 预警，否则关注 */
function overStatus(ratio: number, t: HealthThresholds): HealthStatus {
  return ratio > t.overWarnRatio ? 'danger' : 'warn';
}

/**
 * 部门编制状态（L1 / L3 共用的统一口径，保证一致）。
 * - headcount 为 null/undefined → 未配置编制 → 关注（不做缺口分析）。
 * - 空岗（缺口>0）→ 按空岗率分级（≤10 健康 / ≤20 关注 / >20 预警）。
 * - 超编（缺口<0）→ 按超编梯度分级（|缺口|/实际 >20% 预警，否则关注）。
 * - 恰好满编 → 健康。
 */
function deptStatus(headcount: number | null, actual: number, t: HealthThresholds): HealthStatus {
  if (headcount === null) return 'warn';
  const gap = headcount - actual;
  if (gap > 0) return vacancyStatus((gap / headcount) * 100, t); // 空岗，headcount>0
  if (gap < 0) return overStatus(Math.abs(gap) / Math.max(actual, 1), t); // 超编梯度
  return 'healthy';
}

/** —— L1 —— */

export function computeL1(depts: Department[], thresholds: HealthThresholds = getHealthThresholds()): L1DeptSummary[] {
  return depts.map((d) => {
    const actual = countEmployees(d, false);
    const headcount = sumHeadcountSubtree(d);
    const status = deptStatus(headcount, actual, thresholds);
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
export function computeL2(roots: Department[], thresholds: HealthThresholds = getHealthThresholds()): L2Metric[] {
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
    spanStatusVal = spanStatus(span, thresholds);
    spanVerdict =
      spanStatusVal === 'healthy'
        ? '管理幅度适中，层级健康'
        : spanStatusVal === 'warn'
          ? '管理幅度偏窄/偏宽，建议优化汇报线'
          : '管理幅度失衡，存在失控或冗余风险';
  }

  // 层级深度（空树 depth=0 不作「层级健康」判定，判中性/关注）
  const depth = computeTreeDepth(roots);
  const depthStatusVal = depth === 0 ? 'warn' : depthStatus(depth, thresholds);
  const depthVerdict =
    depth === 0
      ? '暂无部门数据，无法评估层级深度'
      : depthStatusVal === 'healthy'
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
    managerRatioStatusVal = managerRatioStatus(managerRatio, thresholds);
    managerRatioVerdict =
      managerRatioStatusVal === 'healthy'
        ? '管理者占比合理'
        : managerRatioStatusVal === 'warn'
          ? '管理者占比偏高，注意成本/官僚倾向'
          : '管理者占比过高，存在头重脚轻';
  }

  // 空岗率（口径对齐 v2.0.8）：分子 = 已配置编制(headcount>0)部门的编制合计；分母 = 同批已配置编制部门子树内的员工数（不含虚拟兼岗）。
  // 未配置编制的部门不进分子也不进分母，避免分母虚大压低空岗率。
  // 覆盖判定：某部门或其任一祖先已配置编制(headcount>0)，则其子树整体计入“已配置”分母（父子同配不重复计）。
  let headcount = 0;
  let foundHeadcount = false;
  for (const d of allDepts) {
    if (typeof d.headcount === 'number' && Number.isFinite(d.headcount) && d.headcount > 0) {
      headcount += d.headcount;
      foundHeadcount = true;
    }
  }
  let configuredActual = 0;
  const walkConfigured = (list: Department[], covered: boolean) => {
    for (const d of list) {
      const inCovered =
        covered || (typeof d.headcount === 'number' && Number.isFinite(d.headcount) && d.headcount > 0);
      if (inCovered) configuredActual += d.employees.filter((e) => !e.isVirtual).length;
      walkConfigured(d.children, inCovered);
    }
  };
  walkConfigured(roots, false);
  let vacancy: number | null = null;
  let vacancyStatusVal: HealthStatus = 'warn';
  let vacancyVerdict = '未配置编制数据，无法计算空岗率';
  if (foundHeadcount && headcount > 0) {
    vacancy = round1(((headcount - configuredActual) / headcount) * 100);
    vacancyStatusVal = vacancyStatus(vacancy, thresholds);
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

/** —— —— v2.0.8：诊断口径说明（来自 HR 审计） —— —— */

/** 诊断指标 key（复用 L2 指标 key） */
export type DiagnosticMetricKey = L2Metric['key'];

/**
 * 各诊断指标的口径说明：怎么算 / 含或不含哪些数据 / 不等于什么。
 * 供 UI 展开「口径说明」使用；文案来自 HR 审计。
 */
export const METRIC_CALIBER_NOTES: Record<DiagnosticMetricKey, string> = {
  span: '管理幅度 = 有负责人部门的平均直管人数（直属下属总数 ÷ 有负责人部门数）。它是平均值，不反映单点失衡——一个管理宽到失控的部门可能被其它窄部门抹平；只统计设有负责人的部门，未设负责人的部门不计入。',
  depth: '层级深度 = 组织树的最大层数（根 L1=1）。它只评估深度，不评估每层人数；深链结构（零售/医院/教育等行业）可能正是业务所需，别据此一律压层。',
  managerRatio: '管理者比 = 去重负责人数 ÷ 员工总数（含管理者本人）。未剔除兼岗/副职/外部负责人，比值可能被抬高；请结合实际情况解读。',
  vacancy: '空岗率 =（有效编制 − 实际）÷ 有效编制。只统计配置了编制的部门；对编制是否真实填写敏感——编制未填时提示“无数据”而非视为健康。',
};

/** 取某指标口径说明。 */
export function metricCaliberNote(key: DiagnosticMetricKey): string {
  return METRIC_CALIBER_NOTES[key];
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

export function computeL3(roots: Department[], configs: LevelConfig[], thresholds: HealthThresholds = getHealthThresholds()): L3DeptRow[] {
  return flattenDepartments(roots).map((d) => {
    const actual = countEmployees(d, false);
    const headcount = sumHeadcountSubtree(d);
    const avgCost = avgCostSubtree(d, configs);
    const actualCost = round1(sumCostSubtree(d, configs));
    const gap = headcount === null ? null : headcount - actual;
    const gapCost = gap === null || avgCost <= 0 ? 0 : round1(gap * avgCost);
    const status = deptStatus(headcount, actual, thresholds);
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
  thresholds: HealthThresholds = getHealthThresholds(),
): HealthReport {
  let scope = depts;
  if (focusDeptId) {
    const target = findDept(depts, focusDeptId);
    if (target) scope = [target];
  }

  const l1 = computeL1(scope, thresholds);
  const l2 = computeL2(scope, thresholds);
  const summaryAgg = summarizeDiagnosis(l2);
  const l3 = computeL3(scope, configs, thresholds);

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
  const totalGap = configuredHeadcount === 0 ? null : totalHeadcount - totalEmployees;
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

// —— 组织优化建议（v2.0.3 P1-3，纯函数可测） ——

export type SuggestionSeverity = 'critical' | 'major' | 'minor' | 'info';

export interface HealthSuggestion {
  id: string;
  severity: SuggestionSeverity;
  /** 关联指标 key（dept 级建议可能无） */
  metricKey?: L2Metric['key'] | 'headcount';
  /** 关联部门 id（可选；dept 级建议有值） */
  deptId?: string;
  /** 关联部门名 */
  deptName?: string;
  title: string;
  detail: string;
}

/** 按优先级排序建议（critical > major > minor > info） */
const SEVERITY_ORDER: Record<SuggestionSeverity, number> = {
  critical: 0,
  major: 1,
  minor: 2,
  info: 3,
};

/**
 * 基于 L2 指标生成「指标级」优化建议（纯函数，可测）。
 * 只对非健康（warn/danger）指标产出可执行建议，健康指标自动跳过。
 * @param metrics computeL2 的返回值
 */
export function generateSuggestions(metrics: L2Metric[]): HealthSuggestion[] {
  const out: HealthSuggestion[] = [];
  const push = (m: L2Metric, title: string, detail: string, severity: SuggestionSeverity) => {
    out.push({ id: `m-${m.key}`, severity, metricKey: m.key, title, detail });
  };

  for (const m of metrics) {
    if (m.status === 'healthy') continue;
    const sev: SuggestionSeverity = m.status === 'danger' ? 'critical' : 'major';
    switch (m.key) {
      case 'span':
        push(
          m,
          '优化管理幅度',
          m.value === null
            ? '当前未设置部门负责人，无法评估管理幅度。建议为关键部门配置负责人，明确汇报线。'
            : m.status === 'danger'
              ? `当前平均管理幅度 ${m.value} 人，明显失衡。建议拆分过宽部门或合并过窄小组，使每名经理直管 ${DEFAULT_HEALTH_THRESHOLDS.spanHealthyMin}-${DEFAULT_HEALTH_THRESHOLDS.spanHealthyMax} 人。`
              : `当前平均管理幅度 ${m.value} 人，偏离最佳区间。建议优化汇报线，适当调整管理层级。`,
          sev,
        );
        break;
      case 'depth':
        push(
          m,
          m.value === 0 ? '补充组织数据' : '推进组织扁平化',
          m.value === 0
            ? '当前没有部门数据，无法评估层级。请先导入或创建组织架构。'
            : m.status === 'danger'
              ? `层级深度达 ${m.value} 层，决策链路过长。建议压缩中间层级，缩短决策半径。`
              : `层级深度 ${m.value} 层，偏深。可考虑合并同层级小组或减少冗余汇报层。`,
          sev,
        );
        break;
      case 'managerRatio':
        push(
          m,
          '优化管理岗配置',
          m.value === null
            ? '当前无员工数据，无法评估管理者占比。'
            : m.status === 'danger'
              ? `管理者占比达 ${m.value}%，头重脚轻。建议精简管理岗或扩大基层。`
              : `管理者占比 ${m.value}%，偏高。注意控制成本与官僚化倾向。`,
          sev,
        );
        break;
      case 'vacancy':
        push(
          m,
          '关注招聘节奏',
          m.value === null
            ? '当前未配置编制，无法计算空岗率。建议为部门录入编制人数。'
            : m.status === 'danger'
              ? `空岗率达 ${m.value}%，严重缺编。建议优先补齐关键岗位。`
              : `空岗率 ${m.value}%，偏高。建议规划招聘节奏，及时补充人力。`,
          sev,
        );
        break;
    }
  }
  return out;
}

/**
 * 基于部门树生成「部门级」优化建议（纯函数，可测）。
 * 联动 computeL3 拿到编制/缺口/成本，并补充管理幅度（直管人数）失衡判断，
 * 可精确到部门名，给出可执行动作。
 * @param departments 组织树
 * @param thresholds 阈值配置（缺省用当前配置）
 */
export function generateDeptSuggestions(
  departments: Department[],
  thresholds: HealthThresholds = getHealthThresholds(),
): HealthSuggestion[] {
  const out: HealthSuggestion[] = [];
  const rows = computeL3(departments, [], thresholds);
  const deptMap = new Map(flattenDepartments(departments).map((d) => [d.id, d]));

  for (const row of rows) {
    const dept = deptMap.get(row.deptId);

    // 管理幅度：有负责人的部门，直管人数失衡才建议
    if (dept && (dept.leaderId || dept.leaderName)) {
      const direct = dept.employees.filter((e) => !e.isVirtual).length;
      if (direct === 0) {
        out.push({
          id: `d-${row.deptId}-span0`,
          severity: 'critical',
          metricKey: 'span',
          deptId: row.deptId,
          deptName: row.name,
          title: `${row.name} 负责人无人直管`,
          detail: '该部门设置了负责人但无直属员工，存在虚设管理岗或职责不明风险，建议明确下属或调整编制。',
        });
      } else if (direct < thresholds.spanHealthyMin) {
        out.push({
          id: `d-${row.deptId}-spannarrow`,
          severity: 'major',
          metricKey: 'span',
          deptId: row.deptId,
          deptName: row.name,
          title: `${row.name} 管理幅度偏窄（${direct} 人）`,
          detail: `负责人仅直接管理 ${direct} 名下属（建议 ${thresholds.spanHealthyMin}-${thresholds.spanHealthyMax} 人）。建议合并相邻小团队，使管理幅度回到健康区间。`,
        });
      } else if (direct > thresholds.spanWarnMax) {
        out.push({
          id: `d-${row.deptId}-spanwide`,
          severity: 'critical',
          metricKey: 'span',
          deptId: row.deptId,
          deptName: row.name,
          title: `${row.name} 管理幅度过宽（${direct} 人）`,
          detail: `负责人直管 ${direct} 名下属，超出有效管理区间。建议增设管理岗并拆分小组，降低单点管理负荷。`,
        });
      } else if (direct > thresholds.spanHealthyMax) {
        out.push({
          id: `d-${row.deptId}-spanwide`,
          severity: 'major',
          metricKey: 'span',
          deptId: row.deptId,
          deptName: row.name,
          title: `${row.name} 管理幅度偏宽（${direct} 人）`,
          detail: `负责人直管 ${direct} 名下属，略超最佳区间。建议拆分小组或增设中层，优化管理质量。`,
        });
      }
    }

    // 空岗 / 超编 / 未配置编制
    if (row.gap != null && row.gap > 0) {
      const rate = row.headcount ? (row.gap / row.headcount) * 100 : 0;
      const sev: SuggestionSeverity =
        rate > thresholds.vacancyWarnMax ? 'critical' : rate > thresholds.vacancyHealthyMax ? 'major' : 'minor';
      out.push({
        id: `d-${row.deptId}-vacancy`,
        severity: sev,
        metricKey: 'vacancy',
        deptId: row.deptId,
        deptName: row.name,
        title: `${row.name} 存在 ${row.gap} 个空岗`,
        detail: `编制 ${row.headcount}，实际 ${row.actual}，空岗率 ${rate.toFixed(1)}%。建议优先补齐，缺口成本约 ${row.gapCost}w。`,
      });
    } else if (row.gap != null && row.gap < 0) {
      const over = Math.abs(row.gap) / Math.max(row.actual, 1);
      const sev: SuggestionSeverity = over > thresholds.overWarnRatio ? 'critical' : 'major';
      out.push({
        id: `d-${row.deptId}-over`,
        severity: sev,
        metricKey: 'headcount',
        deptId: row.deptId,
        deptName: row.name,
        title: `${row.name} 超编 ${Math.abs(row.gap)} 人`,
        detail: `编制 ${row.headcount}，实际 ${row.actual}，超编占比 ${(over * 100).toFixed(1)}%。建议通过内部转岗或编制调整优化。`,
      });
    } else if (row.headcount == null) {
      out.push({
        id: `d-${row.deptId}-nohc`,
        severity: 'info',
        metricKey: 'headcount',
        deptId: row.deptId,
        deptName: row.name,
        title: `${row.name} 未配置编制`,
        detail: '未录入编制人数，空岗/超编分析被跳过。建议在健康度面板补充编制，以获得更完整判断。',
      });
    }
  }

  return out.sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.title.localeCompare(b.title, 'zh-CN'),
  );
}

/** 合并指标级 + 部门级建议，并按优先级排序（供 HealthDrawer 直接消费）。 */
export function collectAllSuggestions(
  report: HealthReport,
  departments: Department[],
  thresholds: HealthThresholds = getHealthThresholds(),
): HealthSuggestion[] {
  return [...generateSuggestions(report.l2), ...generateDeptSuggestions(departments, thresholds)].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.title.localeCompare(b.title, 'zh-CN'),
  );
}

/** —— v2.0.5：未入架构员工 & 员工职级差距 —— */

/** 解析职级码中的数字部分（如 'L1.1' → 1.1；'L5' → 5）。解析失败返回 null。 */
function parseLevelNumber(code: string): number | null {
  const num = code.replace(/^[A-Za-z]+/, '').trim();
  if (!num) return null;
  const n = Number.parseFloat(num);
  return Number.isFinite(n) ? n : null;
}

/** 员工职级差距灯（红黄绿）：targetLevel 相对当前 level 的差距。 */
export interface EmployeeLevelGap {
  comparable: boolean;
  current: number;
  target: number;
  /** target - current；正=当前低于目标（需提升） */
  gap: number;
  status: HealthStatus;
  label: string;
}

/**
 * 计算员工职级差距。仅当员工设置了 targetLevel 且可解析时返回非 null。
 * 跨度按数字部分计算（L1.1 vs L2.1 → gap 1）。status: 达到/超出(healthy) <1级(warn) ≥1级(danger)。
 */
export function employeeLevelGap(emp: Employee): EmployeeLevelGap | null {
  if (!emp.targetLevel) return null;
  const current = parseLevelNumber(emp.level);
  const target = parseLevelNumber(emp.targetLevel);
  if (current == null || target == null) return null;
  const gap = Math.round((target - current) * 10) / 10;
  const status: HealthStatus = gap <= 0 ? 'healthy' : gap <= 1 ? 'warn' : 'danger';
  const label = gap <= 0 ? '达到/超出目标' : gap <= 1 ? '接近目标' : '有明显差距';
  return { comparable: true, current, target, gap, status, label };
}

/** 计算未进入组织树（未挂载到任何部门员工列表）的员工。 */
export function computeUnassignedEmployees(allEmployees: Employee[], departments: Department[]): Employee[] {
  const placed = new Set<string>();
  const walk = (depts: Department[]) => {
    for (const d of depts) {
      for (const e of d.employees) placed.add(e.id);
      walk(d.children);
    }
  };
  walk(departments);
  return allEmployees.filter((e) => !e.isVirtual && !placed.has(e.id));
}
