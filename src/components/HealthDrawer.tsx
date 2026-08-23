import { useMemo } from 'react';
import { X, RefreshCw, Activity, Download, Building2 } from 'lucide-react';
import { Department, LevelConfig } from '../types';
import {
  computeHealthReport,
  HEALTH_STATUS_LABEL,
  HealthStatus,
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
}

function StatusDot({ status, label }: { status: HealthStatus; label?: string }) {
  const s = STATUS_STYLE[status];
  return (
    <span className={`inline-flex items-center gap-1 ${s.text}`}>
      <span className={`w-2 h-2 rounded-full ${s.dot}`} />
      <span className="text-xs">{label ?? HEALTH_STATUS_LABEL[status]}</span>
    </span>
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
}: HealthDrawerProps) {
  const configs = useLevelConfigs();
  const report = useMemo(
    () => computeHealthReport(departments, configs, focusDeptId),
    [departments, configs, focusDeptId],
  );

  if (!open) return null;

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
            </p>
          </div>
          <div className="flex items-center gap-2">
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
                    <StatusDot status={d.status} />
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold text-slate-900">{d.actual}</span>
                    <span className="text-xs text-slate-500">人</span>
                    <span className="text-xs text-slate-500 ml-auto">
                      编制 {d.headcount === null ? '—' : d.headcount}
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
              <span className="text-[10px] text-slate-400">默认阈值，可在后续版本调优</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {report.l2.map((m) => (
                <div
                  key={m.key}
                  className={`rounded-2xl bg-white/70 backdrop-blur-xl border border-white/50 shadow-card p-4`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500">{m.label}</span>
                    <StatusDot status={m.status} />
                  </div>
                  <div className={`mt-1 text-3xl font-bold ${STATUS_STYLE[m.status].text}`}>
                    {fmt(m.value, m.unit)}
                  </div>
                  <div className="text-xs text-slate-400 mt-1.5 leading-snug">{m.verdict}</div>
                </div>
              ))}
            </div>

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
                          <StatusDot status={r.status} />
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
                        {r.gap === null ? (
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
                      {fmt(report.totals.totalDepartments > 0 ? report.totals.totalEmployees + report.totals.totalGap : null)}
                    </td>
                    <td className="px-2 py-2.5 text-right font-semibold text-slate-700">{report.totals.totalEmployees}</td>
                    <td className="px-2 py-2.5 text-right font-semibold text-slate-700">
                      {report.totals.totalGap > 0 ? `+${report.totals.totalGap}` : report.totals.totalGap}
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
                          编制 {r.headcount ?? '—'} · 实际 {r.actual}
                        </span>
                      </div>
                      <div className="flex h-2 rounded-full overflow-hidden gap-0.5 bg-slate-100">
                        <div
                          className="h-full bg-slate-300"
                          style={{ width: `${((r.headcount ?? 0) / max) * 100}%` }}
                        />
                        <div
                          className={`h-full ${STATUS_STYLE[r.status].dot}`}
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
