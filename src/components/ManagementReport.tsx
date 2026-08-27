import { useMemo, useRef, useState } from 'react';
import { ArrowLeft, Printer, Image as ImageIcon, FileSpreadsheet } from 'lucide-react';
import { Scenario } from '../types';
import {
  computeScenarioDiff,
  computeScenarioTotals,
  DeptDiff,
  PersonnelChange,
  ScenarioDiffResult,
} from '../utils/scenarioDiff';
import { HEALTH_STATUS_LABEL, HealthStatus, METRIC_CALIBER_NOTES } from '../utils/analytics';
import { STATUS_STYLE, fmt, fmtCost } from '../utils/statusUI';
import { APP_VERSION } from '../version';

interface ManagementReportProps {
  open: boolean;
  onClose: () => void;
  baseline: Scenario;
  target: Scenario;
  projectName: string;
  onLocateDept: (deptId: string) => void;
  onLocateEmployee: (employeeId: string) => void;
  onToast: (msg: string) => void;
}

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function fmtTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('zh-CN', { dateStyle: 'short', timeStyle: 'short' });
}

const CHANGE_LABEL: Record<DeptDiff['changeType'], string> = {
  added: '新增',
  removed: '删除',
  reparented: '改汇报线',
  moved: '改层级',
  'leader-changed': '改负责人',
  'config-changed': '编制/成本变化',
  unchanged: '无变化',
};

const PERSON_LABEL: Record<PersonnelChange['type'], string> = {
  'moved-dept': '换部门',
  'moved-reporting': '换汇报线',
  added: '新增',
  removed: '移除',
};

const STATUS_RANK: Record<HealthStatus, number> = { healthy: 0, warn: 1, danger: 2 };

/** 3~5 条「关键变化」自动摘录（按差异幅度/结构变化/灯号变化排序；只陈述事实，不评判优劣） */
function buildHighlights(diff: ScenarioDiffResult): string[] {
  const out: string[] = [];
  if (diff.overall.baseline && diff.overall.target && diff.overall.baseline !== diff.overall.target) {
    out.push(
      `整体健康度由「${HEALTH_STATUS_LABEL[diff.overall.baseline]}」变为「${HEALTH_STATUS_LABEL[diff.overall.target]}」`,
    );
  }
  const byAbs = diff.metrics
    .filter((m) => m.comparable)
    .sort((a, b) => Math.abs(b.delta ?? 0) - Math.abs(a.delta ?? 0));
  for (const m of byAbs.slice(0, 2)) {
    if (m.delta !== null && m.delta !== 0) {
      out.push(`指标「${m.label}」由 ${fmt(m.baseline, m.unit)} → ${fmt(m.target, m.unit)}（Δ ${m.delta > 0 ? '+' : ''}${m.delta}${m.unit}）`);
    }
  }
  const structural = diff.departmentDiffs.filter(
    (d) => d.changeType !== 'unchanged' && d.changeType !== 'config-changed',
  );
  for (const d of structural.slice(0, 2)) {
    out.push(`部门「${d.name}」${CHANGE_LABEL[d.changeType]}`);
  }
  const incomparable = diff.metrics.filter((m) => !m.comparable);
  if (incomparable.length > 0) {
    out.push(`指标「${incomparable.map((m) => m.label).join('、')}」场景数据不一致，按无数据/不可比呈现`);
  }
  const pc = diff.personnelChanges;
  if (pc.length > 0) {
    out.push(
      `人员调动 ${pc.length} 项（换部门 ${pc.filter((p) => p.type === 'moved-dept').length} / 换汇报线 ${pc.filter((p) => p.type === 'moved-reporting').length} / 新增 ${pc.filter((p) => p.type === 'added').length} / 移除 ${pc.filter((p) => p.type === 'removed').length}）`,
    );
  }
  return out.slice(0, 5);
}

/** 差异表 → Excel 字节（管理层报告 E2；复用现有 XLSX 导出模式） */
async function buildDiffExcelBytes(
  projectName: string,
  baseline: Scenario,
  target: Scenario,
  diff: ScenarioDiffResult,
): Promise<Uint8Array> {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();

  const metricRows = diff.metrics.map((m) => ({
    指标: m.label,
    单位: m.unit,
    基线值: m.baseline ?? '',
    目标值: m.target ?? '',
    变化Δ: m.delta ?? '',
    基线灯号: m.baselineStatus ? HEALTH_STATUS_LABEL[m.baselineStatus] : '无数据',
    目标灯号: m.targetStatus ? HEALTH_STATUS_LABEL[m.targetStatus] : '无数据',
    可比性: m.comparable ? '可比' : '无数据/不可比',
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(metricRows), '指标对比');

  const deptRows = diff.departmentDiffs.map((d) => ({
    部门: d.name,
    变化类型: CHANGE_LABEL[d.changeType],
    基线负责人: d.baseline?.leaderName ?? '',
    目标负责人: d.target?.leaderName ?? '',
    基线编制: d.baseline?.headcount ?? '',
    目标编制: d.target?.headcount ?? '',
    编制Δ: d.delta.headcount ?? '',
    实际Δ: d.delta.actual ?? '',
    缺口Δ: d.delta.gap ?? '',
    缺口成本Δ: d.delta.gapCost ?? '',
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(deptRows), '部门差异');

  const personRows = diff.personnelChanges.map((p) => ({
    姓名: p.name,
    工号: p.employeeId,
    类型: PERSON_LABEL[p.type],
    原部门: p.fromDeptName ?? '',
    新部门: p.toDeptName ?? '',
    原负责人: p.fromLeaderName ?? '',
    新负责人: p.toLeaderName ?? '',
    兼岗: p.isVirtual ? '是' : '否',
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(personRows), '人员调动');

  const bT = computeScenarioTotals(baseline);
  const tT = computeScenarioTotals(target);
  const summaryRows = [
    { 项目: projectName, 基线场景: baseline.name, 目标场景: target.name, 口径: '差异 = 目标 − 基线；无数据/不可比按缺失呈现，不做 0 计算' },
    { 项: '总编制', 基线: bT.totalHeadcount ?? '未配置', 目标: tT.totalHeadcount ?? '未配置', Δ: diff.totals.headcountDelta ?? '无数据/不可比' },
    { 项: '总人数', 基线: bT.totalEmployees, 目标: tT.totalEmployees, Δ: tT.totalEmployees - bT.totalEmployees },
    { 项: '总缺口', 基线: bT.totalGap ?? '未配置', 目标: tT.totalGap ?? '未配置', Δ: diff.totals.gapDelta ?? '无数据/不可比' },
    { 项: '月人力成本(w)', 基线: bT.totalCost, 目标: tT.totalCost, Δ: diff.totals.costDelta },
    { 项: '缺口成本(w)', 基线: bT.totalGapCost, 目标: tT.totalGapCost, Δ: diff.totals.gapCostDelta ?? '无数据/不可比' },
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), '缺口与成本汇总');

  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  return new Uint8Array(out as ArrayBuffer);
}

export function ManagementReport({
  open,
  onClose,
  baseline,
  target,
  projectName,
  onLocateDept,
  onLocateEmployee,
  onToast,
}: ManagementReportProps) {
  const reportRef = useRef<HTMLDivElement>(null);
  const [notes, setNotes] = useState('');
  const [calibersOpen, setCalibersOpen] = useState(false);

  const diff: ScenarioDiffResult = useMemo(() => computeScenarioDiff(baseline, target), [baseline, target]);

  const generatedAt = useMemo(
    () => new Date().toLocaleString('zh-CN', { dateStyle: 'long', timeStyle: 'short' }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [open],
  );

  if (!open) return null;

  const highlights = buildHighlights(diff);
  const bT = computeScenarioTotals(baseline);
  const tT = computeScenarioTotals(target);

  const handlePrint = () => {
    window.print();
  };

  const handleExportPng = async () => {
    if (!reportRef.current) return;
    try {
      const { default: html2canvas } = await import('html2canvas');
      const canvas = await html2canvas(reportRef.current, {
        backgroundColor: '#FFFFFF',
        scale: 2,
        logging: false,
        useCORS: true,
      });
      const dataUrl = canvas.toDataURL('image/png');
      const base64 = dataUrl.split(',')[1];
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const { saveFile } = await import('../utils/tauri');
      const ok = await saveFile(`管理层报告-${baseline.name}-vs-${target.name}.png`, bytes, 'image/png');
      onToast(ok ? 'PNG 已导出' : '已取消导出');
    } catch (error) {
      console.error('导出管理层报告PNG失败:', error);
      onToast('导出管理层报告PNG失败');
    }
  };

  const handleExportExcel = async () => {
    try {
      const bytes = await buildDiffExcelBytes(projectName, baseline, target, diff);
      const { saveFile } = await import('../utils/tauri');
      const ok = await saveFile(
        `管理层报告-${baseline.name}-vs-${target.name}.xlsx`,
        bytes,
        XLSX_MIME,
      );
      onToast(ok ? '差异表 Excel 已导出' : '已取消导出');
    } catch (error) {
      console.error('导出差异表Excel失败:', error);
      onToast('导出差异表Excel失败');
    }
  };

  return (
    <div className="fixed inset-0 z-[95] bg-white/95 backdrop-blur-lg overflow-y-auto">
      {/* 顶部工具条（打印时隐藏） */}
      <div className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b border-slate-100 px-6 py-3 flex items-center justify-between no-print">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            返回编辑
          </button>
          <span className="text-sm font-semibold text-slate-800">管理层报告</span>
          <span className="text-xs text-slate-400">
            {baseline.name} vs {target.name}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportExcel}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors"
          >
            <FileSpreadsheet className="w-4 h-4" />
            导出差异表Excel
          </button>
          <button
            onClick={handleExportPng}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors"
          >
            <ImageIcon className="w-4 h-4" />
            导出PNG
          </button>
          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium text-white bg-gradient-to-r from-indigo-500 to-violet-500 shadow-md hover:shadow-lg transition-all"
          >
            <Printer className="w-4 h-4" />
            打印/导出PDF
          </button>
        </div>
      </div>

      {/* 报告正文 */}
      <div ref={reportRef} className="max-w-5xl mx-auto px-6 py-8 space-y-8 bg-white">
        {/* ① 报告头（含场景 updatedAt 快照时间戳） */}
        <header className="border-b-2 border-slate-900 pb-4">
          <h1 className="text-2xl font-bold text-slate-900">组织调整管理层报告 · 场景差异</h1>
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-slate-500">
            <span>项目：{projectName}</span>
            <span>
              基线：{baseline.name}（快照 {fmtTime(baseline.updatedAt)}）
            </span>
            <span>
              目标：{target.name}（快照 {fmtTime(target.updatedAt)}）
            </span>
            <span>生成时间：{generatedAt}</span>
            <span>版本 v{APP_VERSION}</span>
          </div>
        </header>

        {/* ② 一页结论 + 建议动作（留白可编辑，工具不自动写评语） */}
        <section className="report-section">
          <h2 className="text-base font-bold text-slate-900 mb-3">一页结论</h2>
          <div className="rounded-2xl border border-slate-100 shadow-soft p-5">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <div className={`rounded-xl border ${diff.overall.baseline ? STATUS_STYLE[diff.overall.baseline].border : 'border-slate-200'} p-3`}>
                <div className="text-xs text-slate-500">基线整体健康度</div>
                <div className={`text-xl font-bold ${diff.overall.baseline ? STATUS_STYLE[diff.overall.baseline].text : 'text-slate-400'}`}>
                  {diff.overall.baseline ? HEALTH_STATUS_LABEL[diff.overall.baseline] : '无数据'}
                </div>
              </div>
              <div className={`rounded-xl border ${diff.overall.target ? STATUS_STYLE[diff.overall.target].border : 'border-slate-200'} p-3`}>
                <div className="text-xs text-slate-500">目标整体健康度</div>
                <div className={`text-xl font-bold ${diff.overall.target ? STATUS_STYLE[diff.overall.target].text : 'text-slate-400'}`}>
                  {diff.overall.target ? HEALTH_STATUS_LABEL[diff.overall.target] : '无数据'}
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 p-3">
                <div className="text-xs text-slate-500">指标灯号变化</div>
                <div className="text-xl font-bold text-slate-800">
                  {
                    diff.metrics.filter(
                      (m) => m.comparable && m.baselineStatus && m.targetStatus && STATUS_RANK[m.targetStatus] < STATUS_RANK[m.baselineStatus],
                    ).length
                  }改善
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 p-3">
                <div className="text-xs text-slate-500">人员调动</div>
                <div className="text-xl font-bold text-slate-800">{diff.personnelChanges.length} 项</div>
              </div>
            </div>
            <div className="text-sm text-slate-700">
              <div className="text-xs font-semibold text-slate-500 mb-1.5">关键变化（自动摘录，只陈述事实）</div>
              {highlights.length === 0 ? (
                <p className="text-sm text-slate-400">两个场景未发现可摘录的差异。</p>
              ) : (
                <ul className="space-y-1.5 list-disc list-inside text-sm leading-relaxed">
                  {highlights.map((h, i) => (
                    <li key={i}>{h}</li>
                  ))}
                </ul>
              )}
            </div>
            <div className="mt-4">
              <div className="text-xs font-semibold text-slate-500 mb-1.5">
                建议动作（留白：由 HRBP / 业务负责人填写，工具不自动生成结论）
              </div>
              <textarea
                aria-label="建议动作"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={4}
                placeholder="（在此填写建议动作，如：建议对新增的 XX 部门补充负责人任命 / 缺口部门优先补齐关键岗位…）"
                className="w-full rounded-xl border border-slate-200 p-3 text-sm focus-ring resize-y"
              />
            </div>
          </div>
        </section>

        {/* ③ 四项指标并排对比 + 口径折叠块 */}
        <section className="report-section">
          <h2 className="text-base font-bold text-slate-900 mb-3">四项指标并排对比</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {diff.metrics.map((m) => (
              <div key={m.key} className="rounded-2xl border border-slate-100 shadow-soft p-4">
                <div className="text-xs text-slate-500">{m.label}</div>
                <div className="mt-1 flex items-baseline justify-between">
                  <span className={`text-xl font-bold tabular-nums ${m.baselineStatus ? STATUS_STYLE[m.baselineStatus].text : 'text-slate-400'}`}>
                    {fmt(m.baseline, m.unit)}
                  </span>
                  <span className="text-slate-300 text-xs">→</span>
                  <span className={`text-xl font-bold tabular-nums text-right ${m.targetStatus ? STATUS_STYLE[m.targetStatus].text : 'text-slate-400'}`}>
                    {fmt(m.target, m.unit)}
                  </span>
                </div>
                <div className="mt-1 text-xs">
                  {m.comparable ? (
                    m.delta === null ? (
                      <span className="text-slate-400">Δ —</span>
                    ) : (
                      <span className={`font-medium ${m.delta > 0 ? 'text-sky-600' : m.delta < 0 ? 'text-slate-500' : 'text-slate-400'}`}>
                        Δ {m.delta > 0 ? '↑' : m.delta < 0 ? '↓' : '—'} {fmt(Math.abs(m.delta), m.unit)}
                      </span>
                    )
                  ) : (
                    <span className="text-slate-400">无数据/不可比</span>
                  )}
                </div>
                <div className="mt-1 flex items-center gap-2 text-[10px]">
                  <span className={m.baselineStatus ? STATUS_STYLE[m.baselineStatus].text : 'text-slate-400'}>
                    ● {m.baselineStatus ? HEALTH_STATUS_LABEL[m.baselineStatus] : '无数据'}
                  </span>
                  <span className="text-slate-300">→</span>
                  <span className={m.targetStatus ? STATUS_STYLE[m.targetStatus].text : 'text-slate-400'}>
                    ● {m.targetStatus ? HEALTH_STATUS_LABEL[m.targetStatus] : '无数据'}
                  </span>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3">
            <button
              type="button"
              onClick={() => setCalibersOpen((v) => !v)}
              className="text-xs font-medium text-indigo-600 hover:underline"
            >
              {calibersOpen ? '收起口径与边界 ▲' : '指标口径（折叠）▼'}
            </button>
            {calibersOpen && (
              <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-3 rounded-2xl border border-slate-100 shadow-soft p-4">
                {diff.metrics.map((m) => (
                  <div key={m.key}>
                    <div className="text-xs font-semibold text-slate-600 mb-1">{m.label}</div>
                    <div className="text-xs leading-snug text-slate-500">{METRIC_CALIBER_NOTES[m.key]}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* ④ 部门结构差异 */}
        <section className="report-section">
          <h2 className="text-base font-bold text-slate-900 mb-3">部门结构差异</h2>
          {diff.departmentDiffs.filter((d) => d.changeType !== 'unchanged').length === 0 ? (
            <p className="text-sm text-slate-400">无部门差异。</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-slate-500 uppercase tracking-wide border-b border-slate-200">
                  <th className="text-left py-2 font-medium">部门</th>
                  <th className="text-left py-2 font-medium">变化</th>
                  <th className="text-left py-2 font-medium">负责人</th>
                  <th className="text-right py-2 font-medium">编制</th>
                  <th className="text-right py-2 font-medium">实际</th>
                  <th className="text-right py-2 font-medium">缺口</th>
                  <th className="text-right py-2 font-medium">缺口成本</th>
                </tr>
              </thead>
              <tbody>
                {diff.departmentDiffs
                  .filter((d) => d.changeType !== 'unchanged')
                  .map((d) => (
                    <tr
                      key={d.deptId}
                      onClick={() => onLocateDept(d.deptId)}
                      className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer"
                    >
                      <td className="py-2 text-slate-700">{d.name}</td>
                      <td className="py-2 text-slate-600">{CHANGE_LABEL[d.changeType]}</td>
                      <td className="py-2 text-slate-600">
                        {d.baseline?.leaderName ?? '—'} → {d.target?.leaderName ?? '—'}
                      </td>
                      <td className="py-2 text-right tabular-nums text-slate-700">
                        {fmt(d.baseline?.headcount ?? null)} → {fmt(d.target?.headcount ?? null)}
                        {d.delta.headcount !== null && (
                          <span className="block text-[10px] text-slate-400">
                            Δ {d.delta.headcount > 0 ? '+' : ''}
                            {d.delta.headcount}
                          </span>
                        )}
                      </td>
                      <td className="py-2 text-right tabular-nums text-slate-700">
                        {d.baseline?.actual ?? 0} → {d.target?.actual ?? 0}
                        {d.delta.actual !== null && (
                          <span className="block text-[10px] text-slate-400">
                            Δ {d.delta.actual > 0 ? '+' : ''}
                            {d.delta.actual}
                          </span>
                        )}
                      </td>
                      <td className="py-2 text-right tabular-nums text-slate-700">
                        {fmt(d.baseline?.gap ?? null)} → {fmt(d.target?.gap ?? null)}
                        {d.delta.gap === null ? (
                          <span className="block text-[10px] text-slate-400">无数据/不可比</span>
                        ) : (
                          <span className="block text-[10px] text-slate-400">
                            Δ {d.delta.gap > 0 ? '+' : ''}
                            {d.delta.gap}
                          </span>
                        )}
                      </td>
                      <td className="py-2 text-right tabular-nums text-slate-700">
                        {fmtCost(d.baseline?.gapCost ?? null)} → {fmtCost(d.target?.gapCost ?? null)}
                        {d.delta.gapCost === null ? (
                          <span className="block text-[10px] text-slate-400">无数据/不可比</span>
                        ) : (
                          <span className="block text-[10px] text-slate-400">
                            Δ {d.delta.gapCost > 0 ? '+' : ''}
                            {d.delta.gapCost}w
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
        </section>

        {/* ⑤ 人员调动清单 */}
        <section className="report-section">
          <h2 className="text-base font-bold text-slate-900 mb-3">人员调动清单</h2>
          {diff.personnelChanges.length === 0 ? (
            <p className="text-sm text-slate-400">无人员调动。</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-slate-500 uppercase tracking-wide border-b border-slate-200">
                  <th className="text-left py-2 font-medium">类型</th>
                  <th className="text-left py-2 font-medium">姓名</th>
                  <th className="text-left py-2 font-medium">工号</th>
                  <th className="text-left py-2 font-medium">原部门/汇报</th>
                  <th className="text-left py-2 font-medium">新部门/汇报</th>
                  <th className="text-left py-2 font-medium">备注</th>
                </tr>
              </thead>
              <tbody>
                {diff.personnelChanges.map((p, i) => (
                  <tr
                    key={`${p.employeeId}-${p.type}-${i}`}
                    onClick={() => onLocateEmployee(p.employeeId)}
                    className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer"
                  >
                    <td className="py-2 text-slate-600">{PERSON_LABEL[p.type]}</td>
                    <td className="py-2 text-slate-700">{p.name}</td>
                    <td className="py-2 text-slate-500">{p.employeeId}</td>
                    <td className="py-2 text-slate-600">
                      {p.type === 'moved-dept' || p.type === 'removed' ? (p.fromDeptName ?? '未入架构') : '—'}
                      {p.type === 'moved-reporting' ? (p.fromLeaderName ?? '—') : ''}
                    </td>
                    <td className="py-2 text-slate-600">
                      {p.type === 'moved-dept' || p.type === 'added' ? (p.toDeptName ?? '未入架构') : '—'}
                      {p.type === 'moved-reporting' ? (p.toLeaderName ?? '—') : ''}
                    </td>
                    <td className="py-2 text-slate-400 text-xs">
                      {p.isVirtual ? '兼岗' : ''}
                      {p.type === 'added' && !p.toDeptName ? '未入架构' : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {/* ⑥ 缺口与成本汇总 */}
        <section className="report-section">
          <h2 className="text-base font-bold text-slate-900 mb-3">缺口与成本汇总</h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="rounded-2xl border border-slate-100 shadow-soft p-4">
              <div className="text-xs text-slate-500">总编制</div>
              <div className="text-xl font-bold tabular-nums text-slate-800">
                {fmt(bT.totalHeadcount)} → {fmt(tT.totalHeadcount)}
              </div>
              <div className="text-[11px] text-slate-400">
                {diff.totals.headcountDelta === null ? '无数据/不可比' : diff.totals.headcountDelta > 0 ? `+${diff.totals.headcountDelta} 人` : `${diff.totals.headcountDelta} 人`}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-100 shadow-soft p-4">
              <div className="text-xs text-slate-500">总人数</div>
              <div className="text-xl font-bold tabular-nums text-slate-800">
                {bT.totalEmployees} → {tT.totalEmployees}
              </div>
              <div className="text-[11px] text-slate-400">
                {tT.totalEmployees - bT.totalEmployees > 0
                  ? `+${tT.totalEmployees - bT.totalEmployees} 人`
                  : `${tT.totalEmployees - bT.totalEmployees} 人`}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-100 shadow-soft p-4">
              <div className="text-xs text-slate-500">总缺口</div>
              <div className="text-xl font-bold tabular-nums text-slate-800">
                {fmt(bT.totalGap)} → {fmt(tT.totalGap)}
              </div>
              <div className="text-[11px] text-slate-400">
                {diff.totals.gapDelta === null ? '无数据/不可比' : diff.totals.gapDelta > 0 ? `+${diff.totals.gapDelta} 人` : `${diff.totals.gapDelta} 人`}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-100 shadow-soft p-4">
              <div className="text-xs text-slate-500">月人力成本</div>
              <div className="text-xl font-bold tabular-nums text-slate-800">
                {fmtCost(bT.totalCost)} → {fmtCost(tT.totalCost)}
              </div>
              <div className="text-[11px] text-slate-400">
                {diff.totals.costDelta === null
                  ? '无数据/不可比'
                  : `Δ ${diff.totals.costDelta > 0 ? '+' : ''}${diff.totals.costDelta}w`}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-100 shadow-soft p-4">
              <div className="text-xs text-slate-500">缺口成本</div>
              <div className="text-xl font-bold tabular-nums text-slate-800">
                {fmtCost(bT.totalGapCost)} → {fmtCost(tT.totalGapCost)}
              </div>
              <div className="text-[11px] text-slate-400">
                {diff.totals.gapCostDelta === null ? '无数据/不可比' : `Δ ${diff.totals.gapCostDelta > 0 ? '+' : ''}${diff.totals.gapCostDelta}w`}
              </div>
            </div>
          </div>
        </section>

        {/* ⑦ 口径与边界 */}
        <section className="report-section">
          <h2 className="text-base font-bold text-slate-900 mb-3">口径与边界</h2>
          <div className="rounded-2xl border border-slate-100 shadow-soft p-5 space-y-3">
            <p className="text-sm text-slate-700 leading-relaxed">
              本报告为多场景推演决策底稿：差异 = <b>目标场景 − 基线场景</b>，只陈述发生了什么变化，<b>不评判方案优劣、不自动推荐方案</b>；建议动作由 HRBP / 业务负责人结合业务背景填写。
            </p>
            <p className="text-sm text-slate-700 leading-relaxed">
              指标口径自本版本起：管理幅度 = 有负责人部门「直管人数」的<b>中位数</b>（+ 极值兜底）；层级深度 = 部门深度分布的 <b>P90</b>（+ max 硬上限与最深链定位）；管理者比 = <b>内部</b>负责人 ÷ 含管理者全员（外部负责人已剔除、兼岗已去重）。
            </p>
            <p className="text-sm text-slate-700 leading-relaxed">
              场景数据不一致（如一侧未配置编制）时，差异按 <b>无数据/不可比</b> 呈现，不把缺失当 0 计算。
            </p>
            <p className="text-sm text-slate-700 leading-relaxed">
              数据全程本地处理，差异为运行时派生，不新增持久化字段；导出图片与表格请在受控设备上妥善管理。
            </p>
          </div>
        </section>

        {/* ⑧ 页脚 */}
        <footer className="text-xs text-slate-400 text-center pt-4 border-t border-slate-100">
          由组织罗盘 OrgCompass v{APP_VERSION} 生成 · {projectName} · {baseline.name} vs {target.name} · {generatedAt}
        </footer>
      </div>
    </div>
  );
}
