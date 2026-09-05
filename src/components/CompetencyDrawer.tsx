import { useDialogFocus } from '../utils/useDialogFocus';
import { useMemo, useState } from 'react';
import {
  X,
  Target,
  Briefcase,
  ChevronDown,
  ChevronRight,
  Building2,
  ClipboardList,
  SlidersHorizontal,
} from 'lucide-react';
import { Department, Employee, MatchStatus, Position } from '../types';
import { MatchResult } from '../utils/match';
import { CompetencySummary } from '../utils/competency';
import { employeeLevelGap } from '../utils/analytics';
import { COMPETENCY_STYLE, COMPETENCY_LABEL, CompetencyStatus, fmt } from '../utils/statusUI';

/**
 * —— v2.2.0 胜任度看板抽屉（design §9 = ux §3 = visual §4）——
 *
 * 独立右侧抽屉（不塞进 HealthDrawer：数量 vs 质量两类任务）。
 * 三层穿透 IA：L1 部门卡（胜任度分布条 + 未评率）→ L2 岗位行（在岗分布 + 空缺标记）
 * → L3 员工明细（姓名/匹配点/职级差距/胜任度环/总分）。
 * 读图顺序（od §3.4）：组织层分布 → 岗位层缺口 → 个体档案。
 *
 * 数据全部由 props 传入（本组件不碰 workspace）：competencySummaries / matchStates /
 * departments / allEmployees / allPositions。任一层点击 → onFocusDept 定位画布、
 * onOpenDetail 开详情。红线：未评 = 中性灰；只呈现派生值不落库。
 */

/** 胜任度小环（看板/明细共用）：环形 + 图标 + title 带分值/阈值（可解释，visual §3.2） */
export function CompetencyRing({
  status,
  score,
  threshold,
}: {
  status: CompetencyStatus;
  score?: number | null;
  threshold?: number | null;
}) {
  const s = COMPETENCY_STYLE[status];
  return (
    <span
      className={`inline-flex items-center justify-center w-3.5 h-3.5 rounded-full border-2 text-[9px] font-bold leading-none shrink-0 ${s.ring} ${s.text}`}
      title={`胜任度 · ${COMPETENCY_LABEL[status]} · 综合 ${score == null ? '—' : fmt(score)} · 阈值 ${threshold == null ? '—' : fmt(threshold)}`}
      aria-label={`胜任度：${COMPETENCY_LABEL[status]}`}
    >
      {s.glyph}
    </span>
  );
}

/** 展开态/看板胶囊（带分值，visual §3.2） */
export function CompetencyCapsule({
  status,
  score,
}: {
  status: CompetencyStatus;
  score?: number | null;
}) {
  const s = COMPETENCY_STYLE[status];
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-xs font-semibold ${s.ring} ${s.text}`}
    >
      {s.glyph} {score == null ? COMPETENCY_LABEL[status] : fmt(score)}
    </span>
  );
}

/** 常驻图例（visual §4.5：形状谱系 + 灰=未评；防「四灯同色」混淆） */
function LegendBar() {
  const states: CompetencyStatus[] = ['healthy', 'warn', 'danger', 'unrated'];
  return (
    <div className="rounded-xl bg-slate-50 border border-slate-200 px-3 py-2">
      <div className="text-xs uppercase tracking-wider text-slate-500 mb-1.5">图例</div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {states.map((st) => (
          <span key={st} className={`inline-flex items-center gap-1 text-xs ${COMPETENCY_STYLE[st].text}`}>
            <span className={`inline-flex items-center justify-center w-3 h-3 rounded-full border-2 text-[8px] font-bold leading-none ${COMPETENCY_STYLE[st].ring} ${COMPETENCY_STYLE[st].text}`}>
              {COMPETENCY_STYLE[st].glyph}
            </span>
            {COMPETENCY_LABEL[st]}
          </span>
        ))}
        <span className="inline-flex items-center gap-1 text-xs text-slate-500">
          <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />匹配点
        </span>
        <span className="inline-flex items-center gap-1 text-xs text-slate-500">
          <span className="inline-flex items-center justify-center w-3 h-3 rounded-full border-2 border-red-400 text-[8px] font-bold text-red-700 bg-red-50">×</span>
          不胜任(已确认)
        </span>
        <span className="inline-flex items-center gap-1 text-xs text-slate-500">
          <span className="text-xs px-1 rounded bg-amber-100 text-amber-600 font-medium">+N</span>职级差距
        </span>
        <span className="inline-flex items-center gap-1 text-xs text-slate-500">
          <span className="text-xs px-1 rounded bg-slate-100 text-slate-500 font-medium">–</span>无数据/未评分
        </span>
      </div>
    </div>
  );
}

/** 员工胜任度状态（未评 → unrated 灰，绝不伪装绿/红） */
function summaryStatus(s: CompetencySummary | undefined): CompetencyStatus {
  return s?.overall ? s.overall.status : 'unrated';
}

/** 收集部门（含子树）内全部真人员工 */
function collectDeptEmployees(dept: Department, includeChildren: boolean): Employee[] {
  const out = [...dept.employees];
  if (includeChildren) {
    for (const c of dept.children) out.push(...collectDeptEmployees(c, true));
  }
  return out;
}

interface CompetencyDrawerProps {
  open: boolean;
  onClose: () => void;
  /** 胜任度汇总（computeCompetencyStates 输出，key = Employee.id） */
  competencySummaries: Map<string, CompetencySummary>;
  /** 人岗匹配状态（computeMatchStates 输出，供 L3 匹配点） */
  matchStates: MatchResult[];
  /** 部门树（唯一真值；L1/L2/L3 穿透数据源） */
  departments: Department[];
  /** 全量员工扁平列表（L2 岗位在岗反查用） */
  allEmployees: Employee[];
  /** 全量岗位扁平列表（空缺标记 / 岗位信息用） */
  allPositions: Position[];
  /** 点击部门卡 → 画布定位该部门 */
  onFocusDept: (deptId: string) => void;
  /** 点击员工行 → 打开胜任度详情 */
  onOpenDetail: (empId: string) => void;
  /** 发起批量评估（打开 BatchAssessmentModal） */
  onStartBatch: () => void;
  /** 打开维度配置（CompetencyModelModal） */
  onOpenModelConfig: () => void;
  /** 人工确认/撤销 not_competent（候选→已确认；缺省不渲染确认按钮） */
  onConfirmNotCompetent?: (empId: string, confirmed: boolean) => void;
  /** 已人工确认不胜任的 employeeId 集合 */
  confirmedNotCompetent?: ReadonlySet<string>;
}

export function CompetencyDrawer({
  open,
  onClose,
  competencySummaries,
  matchStates,
  departments,
  allEmployees,
  allPositions,
  onFocusDept,
  onOpenDetail,
  onStartBatch,
  onOpenModelConfig,
  onConfirmNotCompetent,
  confirmedNotCompetent,
}: CompetencyDrawerProps) {
  // 本地「聚焦部门」state（点击 L1 卡聚焦；同时调用 onFocusDept 定位画布）
  const [selectedDeptId, setSelectedDeptId] = useState<string | null>(null);
  // L2 岗位展开（已展开岗位 id 集合）
  const [expandedPosIds, setExpandedPosIds] = useState<Set<string>>(() => new Set());

  const dialogRef = useDialogFocus(open, onClose);
  const matchById = useMemo(
    () => new Map<string, MatchResult>(matchStates.map((r) => [r.employeeId, r])),
    [matchStates],
  );
  const positionById = useMemo(
    () => new Map<string, Position>(allPositions.map((p) => [p.id, p])),
    [allPositions],
  );

  // L1：一级部门（含各自子树员工）的胜任度分布 + 未评率
  const l1 = useMemo(
    () =>
      departments
        .filter((d) => d.level === 1)
        .map((dept) => {
          const emps = collectDeptEmployees(dept, true).filter((e) => !e.isVirtual);
          const counts = { healthy: 0, warn: 0, danger: 0, unrated: 0 };
          for (const e of emps) {
            const st = summaryStatus(competencySummaries.get(e.id));
            counts[st === 'unrated' ? 'unrated' : st] += 1;
          }
          const total = emps.length;
          const pct = (n: number) => (total === 0 ? 0 : Math.round((n / total) * 100));
          const unratedRatio = total === 0 ? 0 : counts.unrated / total;
          return { dept, emps, counts, total, pct, unratedRatio };
        }),
    [departments, competencySummaries],
  );

  const selectedDept = useMemo(
    () => (selectedDeptId ? departments.find((d) => d.id === selectedDeptId) ?? null : null),
    [selectedDeptId, departments],
  );

  // 明细必须覆盖汇总的同一子树，包括子部门岗位与未套岗人员。
  const selectedPositions = useMemo(() => {
    const collect = (dept: Department): Position[] => [
      ...(dept.positions ?? []).filter((p) => p.status !== 'archived'),
      ...dept.children.flatMap(collect),
    ];
    return selectedDept ? collect(selectedDept) : [];
  }, [selectedDept]);
  const employeeRows = useMemo(() => {
    if (!selectedDept) return [];
    const positionIds = new Set(selectedPositions.map((p) => p.id));
    return collectDeptEmployees(selectedDept, true).filter((e) =>
      !e.isVirtual && (!e.positionId || !positionIds.has(e.positionId)),
    );
  }, [selectedDept, selectedPositions]);

  if (!open) return null;

  const togglePosition = (pid: string) => {
    setExpandedPosIds((prev) => {
      const next = new Set(prev);
      if (next.has(pid)) next.delete(pid);
      else next.add(pid);
      return next;
    });
  };

  /** L3 员工行（通用）：匹配点 + 职级差距 + 胜任度环 + 总分 + 不胜任确认 */
  const renderEmployeeRow = (emp: Employee) => {
    const match = matchById.get(emp.id);
    const summary = competencySummaries.get(emp.id);
    const st = summaryStatus(summary);
    const score = summary?.overall?.score ?? null;
    const threshold =
      summary?.overall != null ? summary.overall.score + summary.overall.gap : null;
    const gap = employeeLevelGap(emp);
    const isConfirmed = confirmedNotCompetent?.has(emp.id) ?? false;
    const isCandidate = summary?.notCompetentCandidate === true;
    const matchDot: Record<MatchStatus, string> = {
      placed: 'bg-emerald-500',
      unassigned: 'bg-amber-500',
      overstaffed: 'bg-red-500',
      not_competent: 'bg-red-50 border border-red-400',
    };
    return (
      <div
        key={emp.id}
        className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-indigo-50/50 transition-colors cursor-pointer"
        onClick={() => onOpenDetail(emp.id)}
        role="button"
        tabIndex={0}
        aria-label={`查看 ${emp.name} 的胜任度详情`}
        onKeyDown={(e) => {
          if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            onOpenDetail(emp.id);
          }
        }}
        title="点击查看胜任度详情"
      >
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${match ? matchDot[match.status] : 'bg-slate-200'}`} />
        <span className="text-xs text-slate-700 truncate min-w-0 flex-1">{emp.name}</span>
        {emp.positionId && (
          <span className="text-xs text-slate-500 truncate max-w-[120px]">
            {positionById.get(emp.positionId)?.name ?? '—'}
          </span>
        )}
        {gap && (
          <span
            className={`text-xs px-1 rounded font-medium shrink-0 ${
              gap.status === 'healthy'
                ? 'bg-emerald-100 text-emerald-600'
                : gap.status === 'warn'
                  ? 'bg-amber-100 text-amber-600'
                  : 'bg-red-100 text-red-600'
            }`}
            title={`目标 ${emp.targetLevel ?? '—'} · ${gap.label}`}
          >
            {gap.gap > 0 ? `+${gap.gap}` : gap.gap}
          </span>
        )}
        <CompetencyRing status={st} score={score} threshold={threshold} />
        <span className="text-xs text-slate-500 w-8 text-right tabular-nums shrink-0">
          {score == null ? '—' : fmt(score)}
        </span>
        {onConfirmNotCompetent && emp.positionId && (isCandidate || isConfirmed) && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onConfirmNotCompetent(emp.id, !isConfirmed);
            }}
            className={`shrink-0 text-xs px-1.5 py-0.5 rounded-md border font-medium transition-colors ${
              isConfirmed
                ? 'border-red-200 bg-red-50 text-red-600 hover:bg-red-100'
                : 'border-slate-200 bg-white text-slate-500 hover:border-red-300 hover:text-red-600'
            }`}
            title={
              isConfirmed
                ? '已人工确认不胜任（撤销确认）'
                : '胜任度红灯候选（worstGap≥2）→ 人工确认不胜任（留痕）'
            }
          >
            {isConfirmed ? '已确认不胜任 ×' : '确认不胜任'}
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-[80]">
      {/* 轻遮罩 */}
      <div className="absolute inset-0 bg-slate-900/10 backdrop-blur-[2px]" onClick={onClose} />
      {/* 抽屉 */}
      <aside ref={dialogRef} role="dialog" aria-modal="true" aria-label="胜任度看板" tabIndex={-1} className="absolute inset-y-0 right-0 competency-drawer w-[760px] max-w-full bg-white border-l border-white/40 shadow-2xl flex flex-col animate-slideInRight">
        {/* 头部 */}
        <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4 border-b border-slate-200">
          <div>
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Target className="w-4 h-4 text-indigo-500" />
              {selectedDept ? `${selectedDept.name} · 胜任度` : '胜任度'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              选择部门查看岗位和人员，点击姓名复核评分依据
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onStartBatch}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 transition-all"
            >
              <ClipboardList className="w-4 h-4" />
              发起批量评估
            </button>
            <button
              onClick={onOpenModelConfig}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium text-slate-600 border border-slate-200 bg-white/70 hover:bg-slate-50 transition-colors"
              title="维度配置：新增/停用/权重/定义"
            >
              <SlidersHorizontal className="w-4 h-4" />
              维度配置
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-600 transition-colors"
              aria-label="关闭"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-5">
          {/* 常驻图例 */}
          <LegendBar />

          {/* L1 部门层 */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                部门胜任度分布
              </h3>
              {selectedDept && (
                <button
                  onClick={() => setSelectedDeptId(null)}
                  className="flex items-center gap-1 text-xs text-indigo-600 hover:underline"
                >
                  <Building2 className="w-3.5 h-3.5" />
                  查看全公司
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 min-[540px]:grid-cols-2 gap-3">
              {l1.map(({ dept, counts, total, pct, unratedRatio }) => (
                <button
                  key={dept.id}
                  onClick={() => {
                    setSelectedDeptId(dept.id);
                    onFocusDept(dept.id);
                  }}
                  className={`min-w-0 rounded-xl bg-white border border-slate-200 p-4 text-left transition-all hover:shadow-md ${
                    selectedDeptId === dept.id ? 'ring-2 ring-indigo-400' : ''
                  }`}
                  title="点击聚焦该部门（画布定位）"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-bold text-slate-800 truncate">{dept.name}</span>
                    <span className="text-xs text-slate-500">{total} 人</span>
                  </div>
                  {/* 胜任度分布条：绿/黄/红/未评 四段堆叠（visual §4.2） */}
                  <div className="flex h-2 rounded-full overflow-hidden bg-slate-100">
                    <div className="bg-emerald-500" style={{ width: `${pct(counts.healthy)}%` }} />
                    <div className="bg-amber-500" style={{ width: `${pct(counts.warn)}%` }} />
                    <div className="bg-red-500" style={{ width: `${pct(counts.danger)}%` }} />
                    <div className="bg-slate-300" style={{ width: `${pct(counts.unrated)}%` }} />
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                    <span className="text-emerald-600">绿 {counts.healthy}</span>
                    <span className="text-amber-600">黄 {counts.warn}</span>
                    <span className="text-red-600">红 {counts.danger}</span>
                    <span className="text-slate-500">未评 {counts.unrated}</span>
                    <span
                      className={`ml-auto font-medium tabular-nums ${
                        unratedRatio >= 0.3 ? 'text-slate-600' : 'text-slate-500'
                      }`}
                      title="未评率 = 未评估人数 ÷ 部门人数（数据完备度，未评不伪装成绿/红）"
                    >
                      未评率 {total === 0 ? '—' : `${Math.round(unratedRatio * 100)}%`}
                    </span>
                  </div>
                </button>
              ))}
              {l1.length === 0 && (
                <div className="text-sm text-slate-500 py-6 text-center w-full">暂无一~级部门</div>
              )}
            </div>
          </section>

          {/* L2 岗位层 + L3 员工层 */}
          {selectedDept && (
            <section>
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
                {selectedDept.name} · 岗位与人员（含下级部门）
              </h3>

              {selectedPositions.length > 0 && (
                <div className="space-y-2">
                  {selectedPositions
                    .slice()
                    .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '', 'zh-CN'))
                    .map((pos) => {
                      const inPos = allEmployees.filter(
                        (e) => !e.isVirtual && e.positionId === pos.id,
                      );
                      const assigned = inPos.length;
                      const hasBudget = pos.status === 'active' && pos.headcount > 0;
                      const gap = hasBudget ? pos.headcount - assigned : null;
                      const counts = { healthy: 0, warn: 0, danger: 0, unrated: 0 };
                      for (const e of inPos) {
                        const st = summaryStatus(competencySummaries.get(e.id));
                        counts[st === 'unrated' ? 'unrated' : st] += 1;
                      }
                      const total = assigned;
                      const pct = (n: number) => (total === 0 ? 0 : Math.round((n / total) * 100));
                      const noCompetent =
                        total > 0 && counts.danger === total;
                      const isExpanded = expandedPosIds.has(pos.id);
                      return (
                        <div
                          key={pos.id}
                          className="rounded-xl bg-slate-50 border border-slate-200 overflow-hidden"
                        >
                          <div className="flex items-center gap-1.5 px-3 py-2">
                            <button
                              onClick={() => togglePosition(pos.id)}
                              className="p-0.5 rounded text-slate-500 hover:text-indigo-600"
                              title={isExpanded ? '收起员工' : '展开员工'}
                            >
                              {isExpanded ? (
                                <ChevronDown className="w-3.5 h-3.5" />
                              ) : (
                                <ChevronRight className="w-3.5 h-3.5" />
                              )}
                            </button>
                            <Briefcase className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                            <span className="text-sm font-medium text-slate-700 truncate">
                              {pos.name}
                            </span>
                            {/* 空缺标记（对齐 DepartmentCard 岗位区口径） */}
                            <span
                              className={`ml-auto shrink-0 text-xs font-medium ${
                                gap === null
                                  ? 'text-slate-500'
                                  : gap > 0
                                    ? 'text-amber-600'
                                    : gap < 0
                                      ? 'text-red-600'
                                      : 'text-emerald-600'
                              }`}
                              title={
                                pos.status === 'frozen'
                                  ? '编制已冻结，不计缺口'
                                  : pos.headcount <= 0
                                    ? '未配置编制'
                                    : `编制 ${pos.headcount} · 在岗 ${assigned}`
                              }
                            >
                              {pos.status === 'frozen'
                                ? '冻结'
                                : pos.headcount <= 0
                                  ? '未配置'
                                  : gap === null
                                    ? '—'
                                    : gap > 0
                                      ? `缺 ${gap}`
                                      : gap < 0
                                        ? `超 ${-gap}`
                                        : '满编'}
                            </span>
                            {noCompetent && (
                              <span className="shrink-0 text-xs px-1.5 py-0.5 rounded-full bg-red-50 text-red-600 border border-red-200">
                                无胜任者
                              </span>
                            )}
                          </div>
                          {/* 在岗胜任度分布条 */}
                          <div className="px-3 pb-1">
                            <div className="flex h-1.5 rounded-full overflow-hidden bg-slate-100">
                              <div className="bg-emerald-500" style={{ width: `${pct(counts.healthy)}%` }} />
                              <div className="bg-amber-500" style={{ width: `${pct(counts.warn)}%` }} />
                              <div className="bg-red-500" style={{ width: `${pct(counts.danger)}%` }} />
                              <div className="bg-slate-300" style={{ width: `${pct(counts.unrated)}%` }} />
                            </div>
                            <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                              <span className="text-emerald-600">绿 {counts.healthy}</span>
                              <span className="text-amber-600">黄 {counts.warn}</span>
                              <span className="text-red-600">红 {counts.danger}</span>
                              <span>未评 {counts.unrated}</span>
                              <span className="ml-auto">在岗 {assigned} 人</span>
                            </div>
                          </div>
                          {isExpanded && (
                            <div className="px-2 pb-2 pt-1 border-t border-slate-100">
                              {inPos.length === 0 ? (
                                <div className="text-[11px] text-slate-500 text-center py-2">
                                  该岗位暂无在岗员工
                                </div>
                              ) : (
                                <div className="space-y-0.5">
                                  {inPos.map((emp) => renderEmployeeRow(emp))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>
              )}
              {(employeeRows.length > 0 || selectedPositions.length === 0) && (
                <div className="rounded-xl bg-slate-50 border border-slate-200 p-2">
                  {employeeRows.length === 0 ? (
                    <div className="text-[11px] text-slate-500 text-center py-2">
                      该部门暂无员工
                    </div>
                  ) : (
                    <div className="space-y-0.5">{employeeRows.map(renderEmployeeRow)}</div>
                  )}
                </div>
              )}
            </section>
          )}

          {/* 底部说明（红线：只呈现、不下结论） */}
          <p className="text-xs text-slate-500 leading-snug">
            胜任度灯 = 最差维度 Gap（木桶）：绿=达标 / 黄=待提升 / 红=不胜任候选（worstGap≥2，需人工确认）。
            未评 = 中性灰，不计入红黄绿。本工具只呈现可追溯依据，不自动定级 / 晋升 / 淘汰。
          </p>
        </div>
      </aside>
    </div>
  );
}
