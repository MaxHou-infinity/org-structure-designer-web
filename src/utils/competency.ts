import type {
  Assessment,
  CompetencyGroup,
  CompetencyModel,
  Department,
  Employee,
  Position,
} from '../types';
import { HealthStatus, parseLevelNumber } from './analytics';

/**
 * —— v2.2.0 胜任度引擎：派生纯函数（design doc §5）——
 *
 * 全部为纯函数、可单测、无 UI/IO 副作用。派生值（gap / worstGap / 灯号 / totalScore /
 * not_competent 候选）一律运行时计算，**不落库**；落库只有 Assessment 原始事实
 * （score/requirement/scale/assessorRole/assessorId/assessedAt/source/note）与
 * PositionAssignment 确认事实（status/confirmedBy/confirmedAt）。
 *
 * 红线：不替用户下结论、不自动定级；未评估 = 中性灰（不伪装绿/红）；
 * 灯号只由最差维度 Gap 决定（木桶原则），权重只影响总分排序。
 */

/** —— §5.2 基准（要求分）与维度 key 生成 —— */

/** 职级数字 → 要求分：n<3→3；n≥3→4；NA(null)→3。不设 5（5 留高潜识别）。 */
export function levelRequirement(n: number | null): number {
  return n == null ? 3 : n >= 3 ? 4 : 3;
}

/** B2 岗位带宽（levelBandMin）→ 要求分：parseLevelNumber(levelBandMin) → levelRequirement；
 *  无 levelBandMin 或无法解析 → null。 */
export function positionBandRequirement(position: Position | undefined): number | null {
  if (!position || !position.levelBandMin) return null;
  const n = parseLevelNumber(position.levelBandMin);
  return n == null ? null : levelRequirement(n);
}

/** 基准档位解析：返回单一 b∈{1..5}，套用到该员工所有维度作 requirement。
 *  优先级 B3 显式 > B2 岗位带宽(levelBandMin) > B1 职级(level) > 缺省 3。 */
export function benchmarkFor(employee: Employee, position?: Position, explicit?: number): number {
  if (explicit != null && explicit >= 1 && explicit <= 5) return explicit; // B3 显式
  const b2 = positionBandRequirement(position); // B2 岗位带宽 → 要求分
  if (b2 != null && b2 >= 1 && b2 <= 5) return b2;
  return levelRequirement(parseLevelNumber(employee.level)); // B1 职级 → 要求分（缺省 3 兜底）
}

/** 生成用户自定义维度 key：`custom_<slug>_<rand6>`，严格匹配 /^[a-z][a-z0-9_]*$/。
 *  中文/不可 slug 化 label 回退 'dim'；随机后缀保证唯一。 */
export function genDimensionKey(label: string): string {
  const slug =
    (label ?? '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 24) || 'dim';
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let rand = '';
  for (let i = 0; i < 6; i += 1) rand += chars[Math.floor(Math.random() * chars.length)];
  return `custom_${slug}_${rand}`;
}

/** —— §5.3 维度级 Gap / 灯号 —— */

/** 维度 Gap = requirement − score（整数档；正 = 不足） */
export function dimensionGap(score: number, requirement: number): number {
  return requirement - score;
}

/** 木桶灯号（固定档位，不可调）：worstGap ≤0 → healthy；==1 → warn；≥2 → danger。 */
export function gapStatusFromWorstGap(worstGap: number): HealthStatus {
  if (worstGap <= 0) return 'healthy';
  if (worstGap === 1) return 'warn';
  return 'danger';
}

/** —— §5.4 取数规则（未评估 ≠ 0） —— */

/** 某员工某维度当前有效评估：assessorRole==='supervisor' 且 assessedAt 最新。
 *  hrbp 校准分并列呈现、不参与 Gap/灯号；self/peer/subordinate 未实现、不参与。 */
export function latestSupervisorAssessment(
  assessments: Assessment[],
  employeeId: string,
  dimension: string,
): Assessment | null {
  let best: Assessment | null = null;
  for (const a of assessments) {
    if (a.employeeId !== employeeId || a.dimension !== dimension) continue;
    if (a.assessorRole !== 'supervisor') continue;
    if (best === null || a.assessedAt > best.assessedAt) best = a;
  }
  return best;
}

/** —— §5.5 权重归一化（只影响总分，不影响灯号） —— */

/** 在「已评估维度」间归一化权重（未评估维度不参与总分）。跨组统一归一（干部+员工都有评时合并算）。
 *  只计入 enabled 维度；assessedKeys 中不在 model / 已停用的 key 忽略。
 *  权重之和 ≤0 或全部为 0 → 等权（简单平均）。 */
export function normalizedWeights(
  model: CompetencyModel,
  assessedKeys: ReadonlySet<string>,
): Map<string, number> {
  const dims = model.dimensions.filter((d) => d.enabled !== false && assessedKeys.has(d.key));
  const out = new Map<string, number>();
  if (dims.length === 0) return out;
  const sum = dims.reduce((s, d) => s + (Number.isFinite(d.weight) ? d.weight : 0), 0);
  if (sum <= 0) {
    const w = 1 / dims.length;
    for (const d of dims) out.set(d.key, w);
    return out;
  }
  for (const d of dims) out.set(d.key, d.weight / sum);
  return out;
}

/** —— §5.6 汇总类型 + 入口 —— */

export interface CompetencyDimensionDerived {
  dimension: string; // key（FK）
  label: string; // 从 model 查（可改显示名）
  definition: string; // 从 model 查（AI 语义 + 详情展示）
  group: CompetencyGroup;
  score: number; // supervisor 原始分（1..5）
  requirement: number; // 快照要求分（1..5）
  gap: number; // requirement − score
  status: HealthStatus; // gap≤0 healthy / ==1 warn / ≥2 danger
}

export interface CompetencySummary {
  employeeId: string;
  /** 由已评维度的 group 派生（取首个已评维度 group；跨组取评估数多者）；无评估 → null。仅 UI 分组用，不影响 overall 计算。 */
  group: CompetencyGroup | null;
  dimensions: CompetencyDimensionDerived[];
  /** 缺全部有效维度 → null（整体未评估） */
  overall: {
    score: number; // totalScore = Σ(score×归一化权重)（仅排序/九宫格，不判灯）
    gap: number; // Σ(requirement×归一化权重) − score（仅展示，不判灯）
    worstGap: number; // max(已评估维度 dimensionGap) —— 唯一决定灯号
    status: HealthStatus; // gapStatusFromWorstGap(worstGap)
  } | null;
  notCompetentCandidate: boolean; // overall.status === 'danger'（worstGap ≥ 2）
  assessedBy: string[]; // 评分人去重
  latestAssessedAt: string | null;
}

/** 已评维度的 group 派生：取评估数多的 group；平局取首个已评维度 group（model 顺序）。 */
function deriveGroup(dimensions: CompetencyDimensionDerived[]): CompetencyGroup | null {
  const counts = new Map<CompetencyGroup, number>();
  for (const d of dimensions) counts.set(d.group, (counts.get(d.group) ?? 0) + 1);
  let best: CompetencyGroup | null = null;
  let max = -1;
  for (const [g, c] of counts) {
    if (c > max) {
      best = g;
      max = c;
    }
  }
  return best;
}

/** 纯函数入口：只算「enabled:true」维度的 supervisor 最新分；未评估维度不参与；无有效评估 → null。
 *  软删维度（enabled:false）的历史评估不进当前灯号/总分（由 listAssessmentHistory 呈现）。 */
export function computeCompetencySummary(
  assessments: Assessment[],
  employeeId: string,
  model: CompetencyModel,
): CompetencySummary | null {
  const derived: CompetencyDimensionDerived[] = [];
  const effective: Assessment[] = [];
  for (const dim of model.dimensions) {
    if (dim.enabled === false) continue; // B2：软删维度不进当前灯号/总分
    const a = latestSupervisorAssessment(assessments, employeeId, dim.key);
    if (!a) continue; // 未评估维度不参与（未评估 ≠ 0）
    const gap = dimensionGap(a.score, a.requirement);
    derived.push({
      dimension: dim.key,
      label: dim.label,
      definition: dim.definition,
      group: dim.group,
      score: a.score,
      requirement: a.requirement,
      gap,
      status: gapStatusFromWorstGap(gap),
    });
    effective.push(a);
  }
  if (derived.length === 0) return null; // 缺全部有效维度 → 整体未评估

  const weights = normalizedWeights(
    model,
    new Set(derived.map((d) => d.dimension)),
  );
  let scoreSum = 0;
  let reqSum = 0;
  let worstGap = Number.NEGATIVE_INFINITY;
  for (const d of derived) {
    const w = weights.get(d.dimension) ?? 0;
    scoreSum += d.score * w;
    reqSum += d.requirement * w;
    worstGap = Math.max(worstGap, d.gap);
  }
  const status = gapStatusFromWorstGap(worstGap);

  const assessedBy = Array.from(
    new Set(effective.map((a) => a.assessorId).filter((x): x is string => !!x)),
  );
  const latestAssessedAt = effective.reduce<string | null>(
    (max, a) => (max === null || a.assessedAt > max ? a.assessedAt : max),
    null,
  );

  return {
    employeeId,
    group: deriveGroup(derived),
    dimensions: derived,
    overall: { score: scoreSum, gap: reqSum - scoreSum, worstGap, status },
    notCompetentCandidate: status === 'danger',
    assessedBy,
    latestAssessedAt,
  };
}

/** 批量：全量员工 → CompetencySummary[]（**每个员工都返回一条**；
 *  无评估员工 → `group:null / dimensions:[] / overall:null / notCompetentCandidate:false`，UI 直接渲染「未评估」灰态，不伪装绿/红）。 */
export function computeCompetencyStates(
  assessments: Assessment[],
  employees: Employee[],
  model: CompetencyModel,
): CompetencySummary[] {
  return employees.map((e) => {
    const s = computeCompetencySummary(assessments, e.id, model);
    return (
      s ?? {
        employeeId: e.id,
        group: null,
        dimensions: [],
        overall: null,
        notCompetentCandidate: false,
        assessedBy: [],
        latestAssessedAt: null,
      }
    );
  });
}

/** —— §5.7 历史轨迹 + orphan 语义 —— */

/** 某员工全部评估历史（含软删维度、orphan 维度），按最近评估 assessedAt 降序分组。
 *  供 CompetencyDetailModal「历史轨迹」用——当前灯号只看 enabled 维度，历史要能看到被删维度的旧分。 */
export function listAssessmentHistory(
  assessments: Assessment[],
  employeeId: string,
  model: CompetencyModel,
): Array<{
  dimension: string;
  /** 维度显示名：model 查得到 → label；查不到（orphan）→ 回退用 key 本身，标注「维度已删除」 */
  label: string;
  definition: string; // orphan → '（维度已删除，定义不可用）'
  enabled: boolean; // 当前是否启用（软删维度 = false，历史可见、当前不计）
  orphan: boolean; // key 不在 model 中 → true（运行时降级，非落库字段）
  group: CompetencyGroup | null;
  records: Assessment[]; // 该维度历次评分（含 supervisor/hrbp），assessedAt 升序
}> {
  const byDim = new Map<string, Assessment[]>();
  for (const a of assessments) {
    if (a.employeeId !== employeeId) continue;
    const list = byDim.get(a.dimension) ?? [];
    list.push(a);
    byDim.set(a.dimension, list);
  }
  const groups = Array.from(byDim.entries());
  for (const [, list] of groups) {
    list.sort((x, y) => x.assessedAt.localeCompare(y.assessedAt)); // 组内升序
  }
  groups.sort((a, b) => {
    const la = a[1][a[1].length - 1].assessedAt;
    const lb = b[1][b[1].length - 1].assessedAt;
    return lb.localeCompare(la); // 组间按最近评估降序
  });
  return groups.map(([dim, records]) => {
    const def = model.dimensions.find((d) => d.key === dim);
    return {
      dimension: dim,
      label: def ? def.label : dim,
      definition: def ? def.definition : '（维度已删除，定义不可用）',
      enabled: def ? def.enabled !== false : false,
      orphan: !def,
      group: def ? def.group : null,
      records,
    };
  });
}

/** —— §5.8 干部「领导力档案」（纯呈现，不输出定级结论） —— */

export interface LeadershipDossier {
  employeeId: string;
  targetLevel?: string; // 复用 Employee.targetLevel（干部语义 = 目标管理职级）
  dimensions: CompetencyDimensionDerived[]; // 仅 group==='leadership' 且 enabled 的维度
  overall: { score: number; gap: number; worstGap: number; status: HealthStatus } | null;
  // ❌ 无「建议定级」输出（roadmap §7 #8：砍 suggestLeadershipGrade）
}

export function buildLeadershipDossier(
  assessments: Assessment[],
  employeeId: string,
  model: CompetencyModel,
  targetLevel?: string,
): LeadershipDossier | null {
  const derived: CompetencyDimensionDerived[] = [];
  for (const dim of model.dimensions) {
    if (dim.group !== 'leadership' || dim.enabled === false) continue;
    const a = latestSupervisorAssessment(assessments, employeeId, dim.key);
    if (!a) continue;
    const gap = dimensionGap(a.score, a.requirement);
    derived.push({
      dimension: dim.key,
      label: dim.label,
      definition: dim.definition,
      group: dim.group,
      score: a.score,
      requirement: a.requirement,
      gap,
      status: gapStatusFromWorstGap(gap),
    });
  }
  if (derived.length === 0) return null;

  const weights = normalizedWeights(model, new Set(derived.map((d) => d.dimension)));
  let scoreSum = 0;
  let reqSum = 0;
  let worstGap = Number.NEGATIVE_INFINITY;
  for (const d of derived) {
    const w = weights.get(d.dimension) ?? 0;
    scoreSum += d.score * w;
    reqSum += d.requirement * w;
    worstGap = Math.max(worstGap, d.gap);
  }
  const status = gapStatusFromWorstGap(worstGap);

  return {
    employeeId,
    ...(targetLevel !== undefined ? { targetLevel } : {}),
    dimensions: derived,
    overall: { score: scoreSum, gap: reqSum - scoreSum, worstGap, status },
  };
}

/** —— §2 D7：干部/员工识别规则（供 UI 选模型与展示分组） —— */

/** 干部（领导力模型）判定：是某部门负责人（递归整树），或有直管下属（reportsToEmployeeId 指向它）。
 *  归属模型最终以已评维度的 group 为准；isManager 只用于 UI 决定「默认铺哪些维度列 / 默认折叠哪组」。 */
export function isManager(
  employeeId: string,
  departments: Department[],
  allEmployees: Employee[],
): boolean {
  const isLeader = (depts: Department[]): boolean =>
    depts.some((d) => d.leaderId === employeeId || isLeader(d.children ?? []));
  const hasDirectReport = allEmployees.some(
    (e) => !e.isVirtual && e.reportsToEmployeeId === employeeId,
  );
  return isLeader(departments) || hasDirectReport;
}
