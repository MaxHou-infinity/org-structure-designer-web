import { useMemo } from 'react';
import { X, Users, ArrowRight, AlertTriangle } from 'lucide-react';
import { Department, Employee } from '../types';
import { employeeLevelGap } from '../utils/analytics';

interface UnassignedEmployeesDrawerProps {
  open: boolean;
  onClose: () => void;
  unassignedEmployees: Employee[];
  departments: Department[];
  onPlaceEmployee: (empId: string, deptId: string) => void;
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

export function UnassignedEmployeesDrawer({
  open,
  onClose,
  unassignedEmployees,
  departments,
  onPlaceEmployee,
  onToast,
}: UnassignedEmployeesDrawerProps) {
  const deptOptions = useMemo(() => flattenDepts(departments), [departments]);

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
            <h2 className="text-base font-bold text-slate-900">未入架构员工</h2>
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600 font-medium">
              {unassignedEmployees.length}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors"
            aria-label="关闭"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-3">
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
              {unassignedEmployees.map((emp) => {
                const gap = employeeLevelGap(emp);
                const gapStyle =
                  gap?.status === 'healthy'
                    ? 'text-emerald-600 bg-emerald-50'
                    : gap?.status === 'warn'
                      ? 'text-amber-600 bg-amber-50'
                      : 'text-red-600 bg-red-50';
                return (
                  <div key={emp.id} className="rounded-xl border border-slate-100 bg-white shadow-soft p-3">
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
                          id={`place-target-${emp.id}`}
                          className="flex-1 min-w-0 px-2 py-1.5 rounded-lg border border-slate-200 text-sm text-slate-700 focus:ring-2 focus:ring-indigo-300 focus:border-indigo-300 outline-none"
                          defaultValue=""
                          onChange={(e) => {
                            const target = e.target.value;
                            if (target) {
                              onPlaceEmployee(emp.id, target);
                              onToast?.((`已将 ${emp.name} 排入目标部门`));
                            }
                          }}
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
                        <ArrowRight className="w-4 h-4 text-slate-300 shrink-0" />
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          )}
        </div>

        <div className="px-5 py-3 border-t border-slate-100 text-xs text-slate-400">
          下拉选择部门即可一键排入；排入后该员工会出现在对应部门卡片中。
        </div>
      </div>
    </div>
  );
}
