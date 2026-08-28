import { useMemo, useState } from 'react';
import { X, Users, ArrowRight, AlertTriangle, UserPlus } from 'lucide-react';
import { Department, Employee } from '../types';
import { employeeLevelGap } from '../utils/analytics';
import { PositionSummary } from '../utils/analytics';
import { MatchResult } from '../utils/match';

interface UnassignedEmployeesDrawerProps {
  open: boolean;
  onClose: () => void;
  unassignedEmployees: Employee[];
  departments: Department[];
  /** v2.1.1：全量员工（含未入架构 + 已在树内未套岗者） */
  allEmployees: Employee[];
  /** v2.1.1：岗位级汇总（供「部门 + 岗位」套岗选择器用） */
  positionSummaries: PositionSummary[];
  /** v2.1.1：人岗匹配状态（供第二段「未进图（未套岗）」判定） */
  matchStates: MatchResult[];
  onPlaceEmployee: (empId: string, deptId: string) => void;
  /** v2.1.1：排入「部门 + 岗位」 */
  onPlaceEmployeeToPosition: (empId: string, deptId: string, positionId: string) => void;
  /** v2.1.1：仅套岗（不移动部门） */
  onAssignEmployeeToPosition: (empId: string, positionId: string) => void;
  onToast?: (msg: string) => void;
}

interface DeptOption {
  id: string;
  label: string;
}

function flattenDepts(depts: Department[]): DeptOption[] {
  const out: DeptOption[] = [];
  const walk = (list: Department[]) => {
    for (const d of list) {
      out.push({ id: d.id, label: '　'.repeat(Math.min(d.level - 1, 3)) + (d.level > 1 ? '└ ' : '') + d.name });
      walk(d.children);
    }
  };
  walk(depts);
  return out;
}

/** 未进图（挂了部门但未套岗位）+ 未入架构 的分段标签 */
type Segment = 'unplaced' | 'unassigned';

export function UnassignedEmployeesDrawer({
  open,
  onClose,
  unassignedEmployees,
  departments,
  allEmployees,
  positionSummaries,
  matchStates,
  onPlaceEmployeeToPosition,
  onToast,
}: UnassignedEmployeesDrawerProps) {
  const deptOptions = useMemo(() => flattenDepts(departments), [departments]);
  const [segment, setSegment] = useState<Segment>('unplaced');
  // 每行「部门 + 岗位」选择（empId → {deptId, positionId}）
  const [sel, setSel] = useState<Record<string, { deptId: string; positionId: string }>>({});

  const positionsByDept = useMemo(() => {
    const m = new Map<string, PositionSummary[]>();
    for (const p of positionSummaries) {
      const list = m.get(p.departmentId) ?? [];
      list.push(p);
      m.set(p.departmentId, list);
    }
    return m;
  }, [positionSummaries]);

  const matchById = useMemo(
    () => new Map<string, MatchResult>(matchStates.map((r) => [r.employeeId, r])),
    [matchStates],
  );

  // 第二段「未进图（未套岗）」= 已在组织树内部但未套岗（matchStates 中 unassigned，且不在「未入架构」段）
  const seg1Ids = useMemo(() => new Set(unassignedEmployees.map((e) => e.id)), [unassignedEmployees]);
  const unplaced = useMemo(
    () =>
      allEmployees.filter(
        (e) => !e.isVirtual && matchById.get(e.id)?.status === 'unassigned' && !seg1Ids.has(e.id),
      ),
    [allEmployees, matchById, seg1Ids],
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[85] flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm" />
      <div
        className="relative w-[420px] max-w-full h-full bg-white/95 backdrop-blur-xl border-l border-slate-100 shadow-2xl flex flex-col animate-fadeInUp"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-indigo-500" />
            <h2 className="text-base font-bold text-slate-900">待排位员工</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors"
            aria-label="关闭"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 两段式切换 */}
        <div className="px-5 pt-4 grid grid-cols-2 gap-1.5">
          <button
            onClick={() => setSegment('unplaced')}
            className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium border transition-colors ${
              segment === 'unplaced'
                ? 'text-indigo-600 border-indigo-200 bg-indigo-50'
                : 'text-slate-500 border-slate-200 bg-white hover:border-indigo-200'
            }`}
          >
            <UserPlus className="w-4 h-4" />
            未进图（未套岗）
            <span className="text-xs px-1.5 rounded-full bg-white/70 text-indigo-600">{unplaced.length}</span>
          </button>
          <button
            onClick={() => setSegment('unassigned')}
            className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium border transition-colors ${
              segment === 'unassigned'
                ? 'text-amber-600 border-amber-200 bg-amber-50'
                : 'text-slate-500 border-slate-200 bg-white hover:border-amber-200'
            }`}
          >
            <AlertTriangle className="w-4 h-4" />
            未入架构
            <span className="text-xs px-1.5 rounded-full bg-white/70 text-amber-600">{unassignedEmployees.length}</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {segment === 'unassigned' && (
            <>
              {unassignedEmployees.length === 0 ? (
                <div className="text-center py-16">
                  <div className="mx-auto w-14 h-14 rounded-2xl bg-emerald-50 grid place-items-center text-emerald-500 mb-4">
                    <Users className="w-7 h-7" />
                  </div>
                  <p className="text-sm font-semibold text-slate-700">所有员工都已进入架构</p>
                  <p className="text-xs text-slate-400 mt-1">没有需要排入的员工</p>
                </div>
              ) : (
                <>
                  {deptOptions.length === 0 && (
                    <div className="flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-200/70 p-3 text-xs text-amber-700">
                      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>当前没有可排入的部门。请先创建/导入组织架构，再回来排入这些员工。</span>
                    </div>
                  )}
                  {unassignedEmployees.map((emp) => (
                    <PlaceRow
                      key={emp.id}
                      emp={emp}
                      deptOptions={deptOptions}
                      positionsByDept={positionsByDept}
                      sel={sel[emp.id] ?? { deptId: '', positionId: '' }}
                      onSelChange={(next) => setSel((prev) => ({ ...prev, [emp.id]: next }))}
                      onPlace={(deptId, positionId) => {
                        if (deptId && positionId) {
                          onPlaceEmployeeToPosition(emp.id, deptId, positionId);
                          onToast?.(`已将 ${emp.name} 排入岗位`);
                        }
                      }}
                    />
                  ))}
                </>
              )}
            </>
          )}

          {segment === 'unplaced' && (
            <>
              {unplaced.length === 0 ? (
                <div className="text-center py-16">
                  <div className="mx-auto w-14 h-14 rounded-2xl bg-emerald-50 grid place-items-center text-emerald-500 mb-4">
                    <UserPlus className="w-7 h-7" />
                  </div>
                  <p className="text-sm font-semibold text-slate-700">没有未套岗的员工</p>
                  <p className="text-xs text-slate-400 mt-1">所有的员工都已套岗位</p>
                </div>
              ) : (
                <>
                  {deptOptions.length === 0 && (
                    <div className="flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-200/70 p-3 text-xs text-amber-700">
                      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>当前没有可用的岗位。请先在部门卡「岗位」区新建岗位。</span>
                    </div>
                  )}
                  {unplaced.map((emp) => {
                    return (
                      <PlaceRow
                        key={emp.id}
                        emp={emp}
                        deptOptions={deptOptions}
                        positionsByDept={positionsByDept}
                        sel={sel[emp.id] ?? { deptId: '', positionId: '' }}
                        onSelChange={(next) => setSel((prev) => ({ ...prev, [emp.id]: next }))}
                        onPlace={(deptId, positionId) => {
                          if (deptId && positionId) {
                            onPlaceEmployeeToPosition(emp.id, deptId, positionId);
                            onToast?.(`已将 ${emp.name} 排入岗位`);
                          }
                        }}
                      />
                    );
                  })}
                </>
              )}
            </>
          )}
        </div>

        <div className="px-5 py-3 border-t border-slate-100 text-xs text-slate-400">
          选择「部门 + 岗位」即可一键排入；未进图员工仅需补齐岗位（默认留在当前部门）。
        </div>
      </div>
    </div>
  );
}

/** 单行：员工信息 + 「部门 + 岗位」两步选择（部门变更时重置岗位）。 */
function PlaceRow({
  emp,
  deptOptions,
  positionsByDept,
  sel,
  onSelChange,
  onPlace,
}: {
  emp: Employee;
  deptOptions: DeptOption[];
  positionsByDept: Map<string, PositionSummary[]>;
  sel: { deptId: string; positionId: string };
  onSelChange: (next: { deptId: string; positionId: string }) => void;
  onPlace: (deptId: string, positionId: string) => void;
}) {
  const gap = employeeLevelGap(emp);
  const gapStyle =
    gap?.status === 'healthy'
      ? 'text-emerald-600 bg-emerald-50'
      : gap?.status === 'warn'
        ? 'text-amber-600 bg-amber-50'
        : 'text-red-600 bg-red-50';
  const positionOptions = positionsByDept.get(sel.deptId) ?? [];

  return (
    <div className="rounded-xl border border-slate-100 bg-white shadow-soft p-3">
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-slate-800">{emp.name}</span>
        <span className="text-xs text-slate-400">{emp.employeeId}</span>
        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500">{emp.level}</span>
        {gap && (
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${gapStyle}`}>
            {gap.label}
          </span>
        )}
      </div>
      {deptOptions.length > 0 && (
        <div className="mt-2 flex items-center gap-2">
          <select
            aria-label={`选择目标部门 - ${emp.name}`}
            value={sel.deptId}
            onChange={(e) => onSelChange({ deptId: e.target.value, positionId: '' })}
            className="flex-1 min-w-0 px-2 py-1.5 rounded-lg border border-slate-200 text-sm text-slate-700 focus:ring-2 focus:ring-indigo-300 focus:border-indigo-300 outline-none"
          >
            <option value="" disabled>
              选择目标部门…
            </option>
            {deptOptions.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}
              </option>
            ))}
          </select>
        </div>
      )}
      {sel.deptId && (
        <div className="mt-2 flex items-center gap-2">
          <select
            aria-label={`选择目标岗位 - ${emp.name}`}
            id={`place-pos-${emp.id}`}
            value={sel.positionId}
            onChange={(e) => {
              const posId = e.target.value;
              onSelChange({ deptId: sel.deptId, positionId: posId });
              if (posId) onPlace(sel.deptId, posId);
            }}
            className="flex-1 min-w-0 px-2 py-1.5 rounded-lg border border-slate-200 text-sm text-slate-700 focus:ring-2 focus:ring-indigo-300 focus:border-indigo-300 outline-none"
          >
            <option value="" disabled>
              选择目标岗位…
            </option>
            {positionOptions.map((p) => (
              <option key={p.positionId} value={p.positionId}>
                {p.name}（编制 {p.headcount} / 在岗 {p.assignedCount}）
              </option>
            ))}
          </select>
          <ArrowRight className="w-4 h-4 text-slate-300 shrink-0" />
        </div>
      )}
    </div>
  );
}
