import { useState } from 'react';
import { AppModal } from './AppModal';
import { Employee, MatchStatus, Position } from '../types';
import {
  CompetencySummary,
  LeadershipDossier,
  levelRequirement,
  listAssessmentHistory,
  positionBandRequirement,
} from '../utils/competency';
import { parseLevelNumber } from '../utils/analytics';
import { COMPETENCY_STYLE, COMPETENCY_LABEL, fmt } from '../utils/statusUI';
import { CompetencyCapsule, CompetencyRing } from './CompetencyDrawer';
import { Info, History, UserCheck, CalendarClock } from 'lucide-react';

/**
 * —— v2.2.0 胜任度详情弹窗（design §9 = ux §2.2 = od §1.3）——
 *
 * 分维度分值 + Gap + 基准（可点开口径）+ 评分人 + 时间 + 历史轨迹。
 * 干部时附「定管理职级依据」只读块，显式标注「本工具只呈现依据，不自动定级/晋升」（红线）。
 * 数据全部由 props 传入（App 层用 computeCompetencySummary / buildLeadershipDossier /
 * listAssessmentHistory 派生好再传）。
 */

const MATCH_DOT_LABEL: Record<MatchStatus, string> = {
  placed: '已套岗',
  unassigned: '未套岗',
  overstaffed: '超编',
  not_competent: '不胜任（已确认）',
};

function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

interface CompetencyDetailModalProps {
  open: boolean;
  onClose: () => void;
  employee: Employee | null;
  /** 员工当前岗位（基准口径展示用） */
  position: Position | null;
  /** computeCompetencySummary 输出（未评员工 = null） */
  summary: CompetencySummary | null;
  /** buildLeadershipDossier 输出（非干部/无领导力评估 = null） */
  dossier: LeadershipDossier | null;
  /** listAssessmentHistory 输出（历史轨迹，含软删/orphan 维度） */
  history: ReturnType<typeof listAssessmentHistory>;
  /** 人岗匹配状态（标题行展示） */
  matchStatus?: MatchStatus;
  /** employeeId → 姓名（评分人可追溯展示） */
  resolveName: (id: string) => string;
}

/** 基准口径「?」说明：Gap 相对什么基准（可点开，不黑盒） */
function BenchmarkNote({
  requirement,
  position,
  employee,
}: {
  requirement: number;
  position: Position | null;
  employee: Employee;
}) {
  const [open, setOpen] = useState(false);
  const b2 = positionBandRequirement(position ?? undefined);
  const b1 = levelRequirement(parseLevelNumber(employee.level));
  return (
    <span className="relative inline-flex items-center">
      <span className="inline-flex items-center gap-1 text-xs tabular-nums text-slate-700">
        {requirement}
        <button
          type="button"
          aria-label="基准口径说明"
          onClick={() => setOpen((o) => !o)}
          className="w-3.5 h-3.5 rounded-full bg-slate-200 hover:bg-slate-300 text-slate-500 grid place-items-center text-[9px] font-bold leading-none"
        >
          ?
        </button>
      </span>
      {open && (
        <span className="absolute right-0 top-5 z-20 w-72 rounded-lg bg-white/95 backdrop-blur border border-slate-200 shadow-lg p-2.5 text-[11px] text-slate-600 leading-snug">
          <div className="font-semibold text-slate-700 mb-1">基准（要求分）口径</div>
          <div>评估时快照要求分：<b>{requirement}</b>（冻结时点标准，改岗位带宽不影响历史灯号）</div>
          <div className="mt-1">
            · 岗位带宽（B2）：{position ? `${position.name} ${position.levelBandMin ?? '未设'} → ${b2 ?? '—'}` : '未套岗 → —'}
          </div>
          <div>· 职级（B1）：{employee.level} → {b1}</div>
          <div>· 缺省：3（无 B2/B1 时）</div>
          <div className="mt-1 text-slate-500">Gap = 要求分 − 原始分（正 = 不足）；灯号 = 最差维度 Gap。</div>
        </span>
      )}
    </span>
  );
}

export function CompetencyDetailModal({
  open,
  onClose,
  employee,
  position,
  summary,
  dossier,
  history,
  matchStatus,
  resolveName,
}: CompetencyDetailModalProps) {
  const status = summary?.overall?.status ?? 'unrated';
  const score = summary?.overall?.score ?? null;
  const threshold = summary?.overall != null ? summary.overall.score + summary.overall.gap : null;

  return (
    <AppModal
      open={open}
      onClose={onClose}
      title={employee ? `胜任度详情 · ${employee.name}` : '胜任度详情'}
      subtitle={
        employee
          ? `${employee.employeeId}${position ? ` · ${position.name}` : ''}${matchStatus ? ` · ${MATCH_DOT_LABEL[matchStatus]}` : ''}`
          : undefined
      }
      maxWidth="max-w-2xl"
    >
      {!employee ? (
        <div className="py-8 text-center text-sm text-slate-500">未找到员工</div>
      ) : (
        <div className="space-y-4">
          {/* 当前灯 + 评分人 + 时间 */}
          <div className="rounded-2xl bg-white/70 backdrop-blur-xl border border-white/50 shadow-card p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-700">当前灯</span>
              <CompetencyCapsule status={status} score={score} />
            </div>
            <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-xs text-slate-500">
              <span className="inline-flex items-center gap-1.5">
                <UserCheck className="w-3.5 h-3.5 text-slate-500" />
                评分人：{summary && summary.assessedBy.length > 0 ? summary.assessedBy.map(resolveName).join(' / ') : '—'}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <CalendarClock className="w-3.5 h-3.5 text-slate-500" />
                最近评分：{formatDateTime(summary?.latestAssessedAt ?? null)}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5 text-slate-500" />
                综合阈值：{threshold == null ? '—' : fmt(threshold)}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5 text-slate-500" />
                未评维度不计入灯号（灰 = 未评分）
              </span>
            </div>
          </div>

          {/* 分维度表 */}
          <div className="rounded-2xl bg-white/70 backdrop-blur-xl border border-white/50 shadow-card overflow-hidden">
            <div className="px-4 py-2.5 border-b border-slate-100 text-sm font-semibold text-slate-700">
              分维度分值 / Gap / 基准
            </div>
            {!summary || summary.dimensions.length === 0 ? (
              <div className="px-4 py-6 text-sm text-slate-500 text-center">
                暂无评估记录 —— 未评 = 中性灰，不伪装绿/红
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-slate-500 uppercase tracking-wide border-b border-slate-100">
                    <th className="text-left px-4 py-2 font-medium">维度</th>
                    <th className="text-right px-2 py-2 font-medium">分值</th>
                    <th className="text-center px-2 py-2 font-medium">基准</th>
                    <th className="text-right px-2 py-2 font-medium">Gap</th>
                    <th className="text-center px-2 py-2 font-medium">灯</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.dimensions.map((d) => (
                    <tr key={d.dimension} className="border-b border-slate-50 last:border-0">
                      <td className="px-4 py-2">
                        <div className="text-xs font-medium text-slate-700">{d.label}</div>
                        <div className="text-[10px] text-slate-500 max-w-[260px] leading-snug" title={d.definition}>
                          {d.definition}
                        </div>
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums text-slate-700">{d.score}</td>
                      <td className="px-2 py-2 text-center">
                        <BenchmarkNote requirement={d.requirement} position={position} employee={employee} />
                      </td>
                      <td className={`px-2 py-2 text-right tabular-nums font-medium ${COMPETENCY_STYLE[d.status].text}`}>
                        {d.gap > 0 ? `+${d.gap}` : d.gap}
                      </td>
                      <td className="px-2 py-2 text-center">
                        <CompetencyRing status={d.status} score={d.score} threshold={d.requirement} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* 干部「定管理职级依据」只读块 */}
          {dossier && dossier.dimensions.length > 0 && (
            <div className="rounded-2xl border border-indigo-100 bg-indigo-50/40 p-4">
              <div className="flex items-center gap-1.5 text-sm font-semibold text-indigo-700 mb-2">
                <Info className="w-4 h-4" />
                定管理职级依据（仅供参考，本工具不自动定级/晋升）
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-xs text-slate-600">
                <span>
                  当前领导力总分：<b className="tabular-nums">{fmt(dossier.overall?.score ?? null)}</b>
                </span>
                <span>
                  灯号：
                  <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-[10px] font-semibold ${COMPETENCY_STYLE[dossier.overall?.status ?? 'unrated'].ring} ${COMPETENCY_STYLE[dossier.overall?.status ?? 'unrated'].text}`}>
                    {COMPETENCY_STYLE[dossier.overall?.status ?? 'unrated'].glyph}{' '}
                    {COMPETENCY_LABEL[dossier.overall?.status ?? 'unrated']}
                  </span>
                </span>
                <span>
                  目标管理职级：<b>{dossier.targetLevel ?? '—'}</b>
                </span>
                <span>
                  评分人：
                  {summary && summary.assessedBy.length > 0 ? summary.assessedBy.map(resolveName).join(' / ') : '—'}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {dossier.dimensions.map((d) => (
                  <span
                    key={d.dimension}
                    className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-[10px] font-semibold ${COMPETENCY_STYLE[d.status].ring} ${COMPETENCY_STYLE[d.status].text}`}
                    title={`${d.label}：${d.score} 分 / 要求 ${d.requirement} · Gap ${d.gap > 0 ? `+${d.gap}` : d.gap}`}
                  >
                    {d.label} {d.score}/{d.requirement}
                  </span>
                ))}
              </div>
              <p className="mt-2 text-[10px] text-indigo-400 leading-snug">
                此区块仅呈现「分值 / Gap / 灯号 / 来源」作为讨论依据；晋升 / 定级由 HR 与业务人工决策，系统不下结论。
              </p>
            </div>
          )}

          {/* 历史轨迹 */}
          <div className="rounded-2xl bg-white/70 backdrop-blur-xl border border-white/50 shadow-card overflow-hidden">
            <div className="px-4 py-2.5 border-b border-slate-100 text-sm font-semibold text-slate-700 flex items-center gap-1.5">
              <History className="w-4 h-4 text-slate-500" />
              历史轨迹（含软删/已删除维度）
            </div>
            {history.length === 0 ? (
              <div className="px-4 py-5 text-sm text-slate-500 text-center">暂无历史评估</div>
            ) : (
              <div className="max-h-64 overflow-y-auto divide-y divide-slate-50">
                {history.map((g) => (
                  <div key={g.dimension} className="px-4 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-medium text-slate-700">{g.label}</span>
                      {g.orphan && (
                        <span className="text-[10px] px-1 rounded bg-slate-100 text-slate-500">维度已删除</span>
                      )}
                      {!g.orphan && !g.enabled && (
                        <span className="text-[10px] px-1 rounded bg-slate-100 text-slate-500">已停用（不计当前灯号）</span>
                      )}
                      <span className="text-[10px] text-slate-500">{g.group === 'leadership' ? '领导力' : '员工'}</span>
                    </div>
                    <div className="mt-1 space-y-0.5">
                      {g.records.map((r) => (
                        <div key={r.id} className="flex items-center gap-2 text-[11px] text-slate-500">
                          <span className="tabular-nums">{formatDateTime(r.assessedAt)}</span>
                          <span className={`px-1 rounded ${r.assessorRole === 'hrbp' ? 'bg-violet-50 text-violet-600' : 'bg-slate-100 text-slate-600'}`}>
                            {r.assessorRole === 'hrbp' ? 'HRBP校准' : '上级原始分'}
                          </span>
                          <span className="tabular-nums font-medium text-slate-700">{r.score}</span>
                          <span className="text-slate-500">/ 要求 {r.requirement}</span>
                          {r.assessorId && <span>· {resolveName(r.assessorId)}</span>}
                          {r.note && <span className="text-slate-500 truncate max-w-[140px]" title={r.note}>· {r.note}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <p className="text-[10px] text-slate-500 leading-snug">
            说明：分数与 Gap 由系统按固定档位（≤0 绿 / =1 黄 / ≥2 红）计算；评分人 / 时间 / 备注可追溯，本工具不自动下结论。
          </p>
        </div>
      )}
    </AppModal>
  );
}
