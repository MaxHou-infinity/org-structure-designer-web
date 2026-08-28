import { useState, useEffect } from 'react';
import { AppModal } from './AppModal';
import { fullCode } from '../utils/level';
import { employeeLevelGap } from '../utils/analytics';
import type { Employee, LevelConfig } from '../types';

/**
 * 「设置目标职级」应用内弹窗（v2.1.1，替换 DepartmentCard 的 window.prompt）。
 * - 职级下拉用受控词表（LevelConfig 全集：fullCode + 中文标签），杜绝自由文本；
 * - 选职级后实时显示「当前 → 目标」的职级差距（红黄绿灯）；
 * - 支持「清除目标职级」（相当于原 prompt 留空）。
 */
export function TargetLevelModal({
  open,
  employee,
  levelConfigs,
  onConfirm,
  onClose,
}: {
  open: boolean;
  employee: Employee | null;
  levelConfigs: LevelConfig[];
  onConfirm: (empId: string, target: string | null) => void;
  onClose: () => void;
}) {
  const [target, setTarget] = useState('');

  useEffect(() => {
    if (open && employee) setTarget(employee.targetLevel ?? '');
  }, [open, employee]);

  if (!open || !employee) return null;

  const preview = target ? employeeLevelGap({ ...employee, targetLevel: target }) : null;
  const options = levelConfigs.map((c) => ({ value: fullCode(c), label: `${fullCode(c)} · ${c.label}` }));
  const hasTarget = Boolean(employee.targetLevel);

  const confirm = (value: string | null) => {
    onConfirm(employee.id, value && value.trim() ? value.trim() : null);
    onClose();
  };

  return (
    <AppModal
      open={open}
      onClose={onClose}
      title={`设置目标职级 · ${employee.name}`}
      subtitle={`当前职级：${employee.level || '—'}（来自职级配置表）`}
      footer={
        <>
          {hasTarget && (
            <button
              onClick={() => confirm(null)}
              className="px-3 py-1.5 rounded-lg text-sm text-red-600 border border-red-200 hover:bg-red-50"
            >
              清除目标职级
            </button>
          )}
          <button
            onClick={() => confirm(target)}
            className="px-4 py-1.5 rounded-lg text-sm text-white bg-indigo-500 hover:bg-indigo-600"
          >
            确定
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <label className="block">
          <span className="text-xs text-slate-500">目标职级</span>
          <select
            autoFocus
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-700 focus-ring"
          >
            <option value="">（未设置）</option>
            {options.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>

        {preview && (
          <div
            className={`rounded-xl px-3 py-2 text-sm ${
              preview.status === 'danger'
                ? 'bg-red-50 text-red-600'
                : preview.status === 'warn'
                  ? 'bg-amber-50 text-amber-600'
                  : 'bg-emerald-50 text-emerald-600'
            }`}
          >
            目标到职级差距：<span className="font-bold">{preview.gap > 0 ? `+${preview.gap}` : preview.gap}</span> · {preview.label}
          </div>
        )}
        {!preview && target && (
          <div className="rounded-xl px-3 py-2 text-sm bg-slate-50 text-slate-400">
            暂无法判断职级差距（目标职级无法解析）。
          </div>
        )}
      </div>
    </AppModal>
  );
}
