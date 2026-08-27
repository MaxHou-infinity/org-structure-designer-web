import { useMemo, useState } from 'react';
import { X, RefreshCw, Activity, Download, Building2, Lightbulb, SlidersHorizontal, GitCompare } from 'lucide-react';
import { Department, LevelConfig, Scenario } from '../types';
import {
  computeHealthReport,
  HEALTH_STATUS_LABEL,
  HealthStatus,
  HealthThresholds,
  HealthSuggestion,
  L2Metric,
  SuggestionSeverity,
  collectAllSuggestions,
  getHealthThresholds,
  setHealthThresholds,
  resetHealthThresholds,
  DEFAULT_HEALTH_THRESHOLDS,
  isHeadcountUnset,
  OrganizationStage,
  STAGE_PRESETS,
  getStagePresetThresholds,
  setStagePreset,
  DEFAULT_STAGE,
  metricCaliberNote,
} from '../utils/analytics';
import { STATUS_STYLE, fmt, fmtCost } from '../utils/statusUI';
import { useLevelConfigs, getLevelColor } from '../utils/levels';

interface HealthDrawerProps {
  open: boolean;
  onClose: () => void;
  departments: Department[];
  focusDeptId?: string;
  onClearFocus: () => void;
  onFocusDept: (deptId: string) => void;
  onUpdateHeadcount: (deptId: string, value: number) => void;
  onExportReport: () => void;
  currentScenarioName: string;
  /** 场景列表（用于「场景对比」入口可用性判断：≥2 场景才可点） */
  scenarios: Scenario[];
  onOpenScenarioDiff: () => void;
}

/** 建议严重级 → 视觉类 */
const SEVERITY_STYLE: Record<SuggestionSeverity, { dot: string; text: string; badge: string }> = {
  critical: { dot: 'bg-red-500', text: 'text-red-600', badge: 'bg-red-50 text-red-600' },
  major: { dot: 'bg-amber-500', text: 'text-amber-600', badge: 'bg-amber-50 text-amber-600' },
  minor: { dot: 'bg-emerald-500', text: 'text-emerald-600', badge: 'bg-emerald-50 text-emerald-600' },
  info: { dot: 'bg-slate-400', text: 'text-slate-500', badge: 'bg-slate-100 text-slate-500' },
};

const SEVERITY_LABEL: Record<SuggestionSeverity, string> = {
  critical: '重点',
  major: '建议',
  minor: '提示',
  info: '信息',
};

function StatusDot({ status, label }: { status: HealthStatus; label?: string }) {
  const s = STATUS_STYLE[status];
  return (
    <span className={`inline-flex items-center gap-1 ${s.text}`}>
      <span className={`w-2 h-2 rounded-full ${s.dot}`} />
      <span className="text-xs">{label ?? HEALTH_STATUS_LABEL[status]}</span>
    </span>
  );
}

/**
 * 部门健康状态点：未配置编制 → 中性灰「无数据」+ 原因（不把缺失伪装成健康/异常结论），
 * 否则按健康状态渲染。超编 / 空岗各自保留独立信号，不合并成中性。
 */
function DeptStatusDot({ status, headcount }: { status: HealthStatus; headcount: number | null }) {
  if (isHeadcountUnset(headcount)) {
    return (
      <span
        className="inline-flex items-center gap-1 text-slate-400"
        title="未配置编制，无法判断空岗/超编"
      >
        <span className="w-2 h-2 rounded-full bg-slate-300" />
        <span className="text-xs">无数据</span>
      </span>
    );
  }
  return <StatusDot status={status} />;
}

/** 指标口径「?」说明：点击展开口径文案（怎么算的、含/不含哪些、不等于什么）。 */
function CaliberNote({ note }: { note: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex items-center">
      <button
        type="button"
        aria-label="指标口径说明"
        onClick={() => setOpen((o) => !o)}
        className="w-4 h-4 rounded-full bg-slate-200 hover:bg-slate-300 text-slate-500 grid place-items-center text-[10px] font-bold leading-none"
      >
        ?
      </button>
      {open && (
        <span className="absolute right-0 top-5 z-20 w-64 rounded-lg bg-white/95 backdrop-blur border border-slate-200 shadow-lg p-2.5 text-[11px] text-slate-600 leading-snug">
          {note}
        </span>
      )}
    </span>
  );
}

/** 管理幅度卡补充行（v2.0.9 口径：中位数主值 + 极值 + 部门级直管分布，可展开定位） */
function SpanCardExtra({
  m,
  thresholds,
  onFocusDept,
}: {
  m: L2Metric;
  thresholds: HealthThresholds;
  onFocusDept: (deptId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const b = m.spanBreakdown;
  if (!b || b.count === 0) return null;
  const widest = b.distribution[0];
  const exceeded = b.max !== null && b.max > thresholds.spanWarnMax;
  return (
    <div className="mt-2">
      <div className="text-[11px] text-slate-400 leading-snug">
        极值 {fmt(b.min)}–{fmt(b.max)} 人 · {b.count} 个有负责人部门
        {widest && (
          <span className={exceeded ? 'text-red-500 font-medium' : 'text-slate-500'}>
            {' '}
            · 最宽 {widest.deptName} {widest.directReports} 人{exceeded ? '（超出关注上限）' : ''}
          </span>
        )}
      </div>
      {b.distribution.length > 1 && (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="mt-1 text-[10px] text-indigo-500 hover:underline font-medium"
        >
          {open ? '收起直管分布 ▲' : '展开直管分布 ▼'}
        </button>
      )}
      {open && (
        <div className="mt-1.5 max-h-44 overflow-y-auto rounded-xl border border-slate-100 bg-white/60">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-slate-400 border-b border-slate-100 text-left">
                <th className="px-2.5 py-1.5 font-medium">部门</th>
                <th className="px-2 py-1.5 font-medium text-right">直管</th>
                <th className="px-2.5 py-1.5 font-medium text-right">判读</th>
              </tr>
            </thead>
            <tbody>
              {b.distribution.map((row) => {
                const label =
                  row.directReports === 0
                    ? '无人直管'
                    : row.directReports < thresholds.spanHealthyMin
                      ? '偏窄'
                      : row.directReports > thresholds.spanWarnMax
                        ? '过宽'
                        : row.directReports > thresholds.spanHealthyMax
                          ? '偏宽'
                          : '适中';
                return (
                  <tr
                    key={row.deptId}
                    onClick={() => onFocusDept(row.deptId)}
                    className="border-b border-slate-50 last:border-0 cursor-pointer hover:bg-indigo-50/60"
                    title="点击定位到画布"
                  >
                    <td className="px-2.5 py-1.5 text-slate-600">{row.deptName}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-slate-700">{row.directReports}</td>
                    <td
                      className={`px-2.5 py-1.5 text-right font-medium ${
                        label === '过宽' || label === '无人直管'
                          ? 'text-red-500'
                          : label === '偏窄' || label === '偏宽'
                            ? 'text-amber-500'
                            : 'text-emerald-500'
                      }`}
                    >
                      {label}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** 层级深度卡补充行（v2.0.9 口径：P90 主值 + P50/最深 + 最深链定位） */
function DepthCardExtra({ m, onFocusDept }: { m: L2Metric; onFocusDept: (deptId: string) => void }) {
  const b = m.depthBreakdown;
  if (!b || b.deptCount === 0) return null;
  return (
    <div className="mt-2 text-[11px] text-slate-400 leading-snug">
      <div>
        P50={b.p50} 层 · P90={b.p90} 层 · 最深 {b.max} 层 · {b.deptCount} 个部门
      </div>
      {b.deepestDeptId && (
        <button
          type="button"
          onClick={() => onFocusDept(b.deepestDeptId)}
          className="mt-1 block text-left text-indigo-500 hover:underline"
          title="点击定位到画布"
        >
          最深链：{b.deepestPath.join(' → ')}
        </button>
      )}
    </div>
  );
}

/** 管理者比卡补充行（v2.0.9 口径：内部÷全员 + 非管理者辅助口径 + 外部/兼岗留痕） */
function ManagerCardExtra({ m }: { m: L2Metric }) {
  const b = m.managerBreakdown;
  if (!b) return null;
  const per =
    b.nonManagerEmployees > 0 && b.internalManagers > 0
      ? Math.round(b.nonManagerEmployees / b.internalManagers)
      : null;
  const perRatio =
    b.nonManagerEmployees > 0 && b.internalManagers > 0
      ? Math.round((b.internalManagers / b.nonManagerEmployees) * 100)
      : null;
  return (
    <div className="mt-2 text-[11px] text-slate-400 leading-snug space-y-0.5">
      <div>
        内部 {b.internalManagers} ÷ {b.totalEmployees} 人（含管理者）= {fmt(m.value, '%')}
      </div>
      {per !== null && perRatio !== null && (
        <div>
          ≈ 每 {per} 名非管理员工配 1 名管理者（非管理者口径 {perRatio}%）
        </div>
      )}
      {(b.externalManagers > 0 || b.multiDeptManagers > 0) && (
        <div>
          外部负责人 {b.externalManagers} 已剔除 · 兼岗 {b.multiDeptManagers} 已去重
        </div>
      )}
    </div>
  );
}

function LevelDistributionBar({
  distribution,
  configs,
}: {
  distribution: Record<string, number>;
  configs: LevelConfig[];
}) {
  const entries = Object.entries(distribution).filter(([, n]) => n > 0);
  if (entries.length === 0) {
    return <div className="h-2 rounded-full bg-slate-100" />;
  }
  const total = entries.reduce((s, [, n]) => s + n, 0);
  return (
    <div className="flex h-2 w-full rounded-full overflow-hidden">
      {entries.map(([code, n]) => {
        const color = getLevelColor(configs, code);
        const pct = (n / total) * 100;
        return (
          <div
            key={code}
            className="h-full border-r border-white last:border-0"
            style={{ width: `${pct}%`, backgroundColor: color }}
            title={`${code} × ${n}`}
          />
        );
      })}
    </div>
  );
}

function ThresholdInput({ label, value, onChange, suffix = '' }: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  suffix?: string;
}) {
  return (
    <label className="flex items-center justify-between gap-3">
      <span className="text-xs text-slate-500">{label}</span>
      <span className="flex items-center gap-1">
        <input
          type="number"
          min="0"
          value={value}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (Number.isFinite(v)) onChange(v);
          }}
          className="w-16 px-2 py-1 rounded-md border border-slate-200 text-right text-sm focus-ring"
        />
        {suffix && <span className="text-xs text-slate-400">{suffix}</span>}
      </span>
    </label>
  );
}

function SuggestionItem({ s }: { s: HealthSuggestion }) {
  const st = SEVERITY_STYLE[s.severity];
  return (
    <div className="flex items-start gap-3 rounded-2xl bg-white/70 backdrop-blur-xl border border-white/50 shadow-card p-3.5">
      <span className={`w-6 h-6 rounded-full grid place-items-center text-[10px] font-bold shrink-0 mt-0.5 ${st.badge}`}>
        {SEVERITY_LABEL[s.severity]}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
          {s.deptName && <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />}
          {s.title}
        </div>
        <div className="text-xs text-slate-500 mt-1 leading-snug">{s.detail}</div>
      </div>
    </div>
  );
}

export function HealthDrawer({
  open,
  onClose,
  departments,
  focusDeptId,
  onClearFocus,
  onFocusDept,
  onUpdateHeadcount,
  onExportReport,
  currentScenarioName,
  scenarios,
  onOpenScenarioDiff,
}: HealthDrawerProps) {
  const configs = useLevelConfigs();
  const [thresholds, setThresholds] = useState<HealthThresholds>(() => getHealthThresholds());
  const [thresholdsOpen, setThresholdsOpen] = useState(false);
  const [stage, setStage] = useState<OrganizationStage>(DEFAULT_STAGE);
  const report = useMemo(
    () => computeHealthReport(departments, configs, focusDeptId, thresholds),
    [departments, configs, focusDeptId, thresholds],
  );
  const suggestions = useMemo(
    () => collectAllSuggestions(report, departments, thresholds),
    [report, departments, thresholds],
  );

  if (!open) return null;

  const updateThresholds = (patch: Partial<HealthThresholds>) => {
    setThresholds((prev) => {
      const next = { ...prev, ...patch };
      setHealthThresholds(next);
      return next;
    });
  };

  const resetThresholds = () => {
    const defs = { ...DEFAULT_HEALTH_THRESHOLDS };
    setThresholds(defs);
    resetHealthThresholds();
    setStage(DEFAULT_STAGE);
    setStagePreset(DEFAULT_STAGE);
  };

  /** 切换企业阶段：应用该阶段阈值预设并持久化；仍可在下方阈值面板二次微调。 */
  const handleSetStage = (s: OrganizationStage) => {
    setStage(s);
    setStagePreset(s);
    const preset = getStagePresetThresholds(s);
    setThresholds({ ...preset });
    setHealthThresholds({ ...preset });
  };

  const focusedName = focusDeptId
    ? report.l1[0]?.name ?? '部门'
    : null;

  return (
    <div className="fixed inset-0 z-[80]">
      {/* 轻遮罩 */}
      <div className="absolute inset-0 bg-slate-900/10 backdrop-blur-[2px]" onClick={onClose} />
      {/* 抽屉 */}
      <aside className="absolute inset-y-0 right-0 w-[640px] max-w-[92vw] glass border-l border-white/40 shadow-2xl flex flex-col animate-slideInRight">
        {/* 头部 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Activity className="w-4 h-4 text-indigo-500" />
              {focusedName ? `${focusedName} · 组织健康度` : '组织健康度'}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              数据快照 · 基于当前场景「{currentScenarioName}」
              {scenarios.length < 2 && ' · 单场景：先复制一个场景再对比'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onOpenScenarioDiff}
              disabled={scenarios.length < 2}
              title={scenarios.length >= 2 ? '基线 vs 目标场景 差异比较' : '先复制一个场景再对比'}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium border transition-all ${
                scenarios.length >= 2
                  ? 'text-indigo-600 border-indigo-200 bg-indigo-50 hover:bg-indigo-100'
                  : 'text-slate-300 border-slate-200 bg-slate-50 cursor-not-allowed'
              }`}
            >
              <GitCompare className="w-4 h-4" />
              场景对比
            </button>
            <button
              onClick={onExportReport}
              disabled={departments.length === 0}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium text-white bg-gradient-to-r from-indigo-500 to-violet-500 shadow-md hover:shadow-lg transition-all"
            >
              <Download className="w-4 h-4" />
              导出诊断报告
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
              aria-label="关闭"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
          {/* 全局条 */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <RefreshCw className="w-3.5 h-3.5 text-slate-400" />
              指标随数据实时计算
            </div>
            {focusedName && (
              <button
                onClick={onClearFocus}
                className="flex items-center gap-1 text-xs text-indigo-600 hover:underline"
              >
                <Building2 className="w-3.5 h-3.5" />
                查看全公司
              </button>
            )}
          </div>

          {/* 企业阶段基准预设 */}
          <section>
            <div className="rounded-2xl bg-white/70 backdrop-blur-xl border border-white/50 shadow-card p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-600">企业阶段基准</span>
                <span className="text-[10px] text-slate-400">仅供校准，非行业规范</span>
              </div>
              <div className="flex gap-1.5">
                {(Object.keys(STAGE_PRESETS) as OrganizationStage[]).map((s) => {
                  const p = STAGE_PRESETS[s];
                  const active = s === stage;
                  return (
                    <button
                      key={s}
                      onClick={() => handleSetStage(s)}
                      aria-pressed={active}
                      className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                        active
                          ? 'bg-indigo-500 text-white border-indigo-500'
                          : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'
                      }`}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] text-slate-400 mt-2 leading-snug">
                {STAGE_PRESETS[stage].description} · 基准仅供参考，需结合本企业业务阶段校准。
              </p>
            </div>
          </section>

          {/* L1 部门概览 */}
          <section>
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
              L1 部门概览
            </h3>
            <div className="flex gap-3 overflow-x-auto pb-1">
              {report.l1.map((d) => (
                <button
                  key={d.deptId}
                  onClick={() => onFocusDept(d.deptId)}
                  className={`shrink-0 min-w-[190px] rounded-2xl bg-white/70 backdrop-blur-xl border border-white/50 shadow-card p-4 text-left transition-all hover:shadow-md ${
                    focusDeptId === d.deptId ? 'ring-2 ring-indigo-400' : ''
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-bold text-slate-800">{d.name}</span>
                    <DeptStatusDot status={d.status} headcount={d.headcount} />
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold text-slate-900">{d.actual}</span>
                    <span className="text-xs text-slate-500">人</span>
                    <span className="text-xs text-slate-500 ml-auto">
                      编制 {isHeadcountUnset(d.headcount) ? '未配置' : d.headcount}
                    </span>
                  </div>
                  <div className="mt-3">
                    <LevelDistributionBar distribution={d.levelDistribution} configs={configs} />
                    <div className="mt-1 text-[10px] text-slate-400">
                      {Object.keys(d.levelDistribution).length} 个职级
                    </div>
                  </div>
                </button>
              ))}
              {report.l1.length === 0 && (
                <div className="text-sm text-slate-400 py-6 text-center w-full">暂无一~级部门</div>
              )}
            </div>
          </section>

          {/* L2 健康度指标 */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                L2 健康度指标
              </h3>
              <button
                onClick={() => setThresholdsOpen((v) => !v)}
                className={`flex items-center gap-1 text-[10px] font-medium transition-colors ${
                  thresholdsOpen ? 'text-indigo-600' : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                <SlidersHorizontal className="w-3 h-3" />
                阈值设置
                <span className="ml-0.5">{thresholdsOpen ? '▲' : '▼'}</span>
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {report.l2.map((m) => (
                <div
                  key={m.key}
                  className={`rounded-2xl bg-white/70 backdrop-blur-xl border border-white/50 shadow-card p-4`}
                >
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <span className="text-xs text-slate-500">{m.label}</span>
                      <CaliberNote note={metricCaliberNote(m.key)} />
                    </span>
                    <StatusDot status={m.status} />
                  </div>
                  <div className={`mt-1 text-3xl font-bold ${STATUS_STYLE[m.status].text}`}>
                    {fmt(m.value, m.unit)}
                  </div>
                  {m.key === 'span' && (
                    <SpanCardExtra m={m} thresholds={thresholds} onFocusDept={onFocusDept} />
                  )}
                  {m.key === 'depth' && <DepthCardExtra m={m} onFocusDept={onFocusDept} />}
                  {m.key === 'managerRatio' && <ManagerCardExtra m={m} />}
                  <div className="text-xs text-slate-400 mt-1.5 leading-snug">{m.verdict}</div>
                </div>
              ))}
            </div>

            {thresholdsOpen && (
              <div className="mt-3 rounded-2xl bg-white/70 backdrop-blur-xl border border-white/50 shadow-card p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-600">阈值配置（存 localStorage）</span>
                  <button
                    onClick={resetThresholds}
                    className="text-[10px] text-slate-400 hover:text-red-500 transition-colors font-medium"
                  >
                    恢复默认
                  </button>
                </div>
                <ThresholdInput label="管理幅度健康下限" value={thresholds.spanHealthyMin} onChange={(v) => updateThresholds({ spanHealthyMin: v })} />
                <ThresholdInput label="管理幅度健康上限" value={thresholds.spanHealthyMax} onChange={(v) => updateThresholds({ spanHealthyMax: v })} />
                <ThresholdInput label="管理幅度关注上限" value={thresholds.spanWarnMax} onChange={(v) => updateThresholds({ spanWarnMax: v })} />
                <ThresholdInput label="层级深度健康上限（层）" value={thresholds.depthHealthyMax} onChange={(v) => updateThresholds({ depthHealthyMax: v })} />
                <ThresholdInput label="层级深度关注上限（层）" value={thresholds.depthWarnMax} onChange={(v) => updateThresholds({ depthWarnMax: v })} />
                <ThresholdInput label="管理者比健康上限（%）" value={thresholds.managerHealthyMax} onChange={(v) => updateThresholds({ managerHealthyMax: v })} />
                <ThresholdInput label="管理者比关注上限（%）" value={thresholds.managerWarnMax} onChange={(v) => updateThresholds({ managerWarnMax: v })} />
                <ThresholdInput label="空岗率健康上限（%）" value={thresholds.vacancyHealthyMax} onChange={(v) => updateThresholds({ vacancyHealthyMax: v })} />
                <ThresholdInput label="空岗率关注上限（%）" value={thresholds.vacancyWarnMax} onChange={(v) => updateThresholds({ vacancyWarnMax: v })} />
                <ThresholdInput label="超编预警占比" value={Math.round(thresholds.overWarnRatio * 100)} suffix="%" onChange={(v) => updateThresholds({ overWarnRatio: v / 100 })} />
              </div>
            )}

            {/* 判读汇总 */}
            <div className="mt-3 rounded-2xl bg-white/70 backdrop-blur-xl border border-white/50 shadow-card p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 text-xs">
                  <StatusDot status="danger" label={`红 ${report.summary.red}`} />
                  <StatusDot status="warn" label={`黄 ${report.summary.yellow}`} />
                  <StatusDot status="healthy" label={`绿 ${report.summary.green}`} />
                </div>
                <span className={`text-xs font-medium ${STATUS_STYLE[report.summary.overall].text}`}>
                  整体{HEALTH_STATUS_LABEL[report.summary.overall]}
                </span>
              </div>
              <p className="text-sm text-slate-700 mt-2">{report.summary.diagnosis}</p>
            </div>
          </section>

          {/* 组织优化建议 */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
                <Lightbulb className="w-3.5 h-3.5 text-amber-500" />
                组织优化建议
              </h3>
              <span className="text-[10px] text-slate-400">基于健康度自动生成 · {suggestions.length} 条</span>
            </div>
            {suggestions.length === 0 ? (
              <div className="rounded-2xl bg-white/70 backdrop-blur-xl border border-white/50 shadow-card p-4 text-sm text-slate-400 text-center">
                暂无优化建议，组织结构较为健康。
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[42vh] overflow-y-auto pr-1">
                {suggestions.slice(0, 30).map((s) => (
                  <SuggestionItem key={s.id} s={s} />
                ))}
              </div>
            )}
          </section>

          {/* L3 编制 vs 实际 vs 缺口 */}
          <section>
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
              L3 编制 vs 实际 vs 缺口（含成本）
            </h3>

            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] text-slate-400">
                编制人数可在下表直接编辑；成本按职级月成本映射核算（单位 w）
              </span>
            </div>

            <div className="overflow-x-auto rounded-2xl bg-white/70 backdrop-blur-xl border border-white/50 shadow-card">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-slate-400 uppercase tracking-wide border-b border-slate-100">
                    <th className="text-left px-4 py-2.5 font-medium">部门</th>
                    <th className="text-right px-2 py-2.5 font-medium">编制</th>
                    <th className="text-right px-2 py-2.5 font-medium">实际</th>
                    <th className="text-right px-2 py-2.5 font-medium">缺口</th>
                    <th className="text-right px-2 py-2.5 font-medium">平均成本</th>
                    <th className="text-right px-2 py-2.5 font-medium">实际成本</th>
                    <th className="text-right px-2 py-2.5 font-medium">缺口成本</th>
                  </tr>
                </thead>
                <tbody>
                  {report.l3.map((r) => (
                    <tr key={r.deptId} className="border-b border-slate-50 hover:bg-slate-50/60">
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <span className="text-slate-600">
                            {'　'.repeat(Math.min(r.level - 1, 3))}
                            {r.level > 1 && '└ '}
                            {r.name}
                          </span>
                          <DeptStatusDot status={r.status} headcount={r.headcount} />
                        </div>
                      </td>
                      <td className="px-2 py-2.5 text-right">
                        <input
                          type="number"
                          min="0"
                          value={r.headcount ?? ''}
                          placeholder="—"
                          onChange={(e) => {
                            const val = e.target.value === '' ? 0 : Number(e.target.value);
                            onUpdateHeadcount(r.deptId, Number.isFinite(val) ? val : 0);
                          }}
                          className="w-14 px-1.5 py-1 rounded-md border border-slate-200 text-right text-sm focus-ring"
                        />
                      </td>
                      <td className="px-2 py-2.5 text-right text-slate-700">{r.actual}</td>
                      <td className="px-2 py-2.5 text-right">
                        {isHeadcountUnset(r.headcount) ? (
                          <span className="text-slate-400" title="未配置编制，无法判断空岗/超编">
                            未配置
                          </span>
                        ) : r.gap === null ? (
                          <span className="text-slate-400">—</span>
                        ) : (
                          <span className={r.gap > 0 ? 'text-amber-600' : r.gap < 0 ? 'text-red-600' : 'text-emerald-600'}>
                            {r.gap > 0 ? `+${r.gap} 空岗` : r.gap < 0 ? `${r.gap} 超编` : '满编'}
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-2.5 text-right text-slate-600">{fmtCost(r.avgCost)}</td>
                      <td className="px-2 py-2.5 text-right text-slate-600">{fmtCost(r.actualCost)}</td>
                      <td className="px-2 py-2.5 text-right">
                        <span className={r.gapCost > 0 ? 'text-amber-600' : r.gapCost < 0 ? 'text-red-600' : 'text-slate-500'}>
                          {fmtCost(r.gapCost)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-50/60">
                    <td className="px-4 py-2.5 font-semibold text-slate-700">合计</td>
                    <td className="px-2 py-2.5 text-right font-semibold text-slate-700">
                      {report.totals.totalGap === null ? '未配置' : fmt(report.totals.totalDepartments > 0 ? report.totals.totalEmployees + report.totals.totalGap : null)}
                    </td>
                    <td className="px-2 py-2.5 text-right font-semibold text-slate-700">{report.totals.totalEmployees}</td>
                    <td className="px-2 py-2.5 text-right font-semibold text-slate-700">
                      {report.totals.totalGap === null ? '未配置' : report.totals.totalGap > 0 ? `+${report.totals.totalGap}` : report.totals.totalGap}
                    </td>
                    <td className="px-2 py-2.5 text-right text-slate-500">—</td>
                    <td className="px-2 py-2.5 text-right font-semibold text-slate-700">{fmtCost(report.totals.totalCost)}</td>
                    <td className="px-2 py-2.5 text-right text-slate-500">—</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* 编制/实际 双条对比 */}
            <div className="mt-3 rounded-2xl bg-white/70 backdrop-blur-xl border border-white/50 shadow-card p-4 space-y-2">
              {report.l3
                .filter((r) => r.level === 1)
                .slice(0, 8)
                .map((r) => {
                  const max = Math.max(r.headcount ?? 0, r.actual, 1);
                  return (
                    <div key={r.deptId}>
                      <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                        <span>{r.name}</span>
                        <span>
                          编制 {isHeadcountUnset(r.headcount) ? '未配置' : r.headcount} · 实际 {r.actual}
                        </span>
                      </div>
                      <div className="flex h-2 rounded-full overflow-hidden gap-0.5 bg-slate-100">
                        <div
                          className="h-full bg-slate-300"
                          style={{ width: `${((r.headcount ?? 0) / max) * 100}%` }}
                        />
                        <div
                          className={`h-full ${isHeadcountUnset(r.headcount) ? 'bg-slate-300' : STATUS_STYLE[r.status].dot}`}
                          style={{ width: `${(r.actual / max) * 100}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
            </div>
          </section>
        </div>
      </aside>
    </div>
  );
}
