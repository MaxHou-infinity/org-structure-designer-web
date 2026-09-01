import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, RotateCcw, Layers } from 'lucide-react';
import { AppModal } from './AppModal';
import {
  Assessment,
  CompetencyDimensionDef,
  CompetencyGroup,
  CompetencyModel,
  DEFAULT_COMPETENCY_MODEL,
} from '../types';
import { genDimensionKey } from '../utils/competency';

/**
 * —— v2.2.0 胜任度维度配置面板（design §9 = roadmap §2）——
 *
 * 维度 = 配置实体（key 稳定不可改，改显示名只改 label；definition 兼作 AI 语义）。
 * 软删：enabled:false 停用（保留历史评估关联）；builtin 预设不可物理删除（仅可停用）；
 * 用户自定义维度仅「无任何评估引用」时可物理删除。
 * 「恢复默认预设」= 当前场景级动作（二次确认；评估数据保留，被重置掉的 key 走 orphan 降级）。
 * 保存走 props.onSave(model)（App 层调 ws.setCompetencyModel）。
 */

interface CompetencyModelModalProps {
  open: boolean;
  onClose: () => void;
  /** 当前场景模型（打开时深拷贝为草稿，保存才回写） */
  model: CompetencyModel;
  /** 现有评估（判断用户维度是否被引用） */
  assessments: Assessment[];
  /** 保存模型 */
  onSave: (model: CompetencyModel) => void;
}

const GROUP_LABEL: Record<CompetencyGroup, string> = {
  leadership: '领导力（干部）',
  staff: '员工胜任度',
};

export function CompetencyModelModal({
  open,
  onClose,
  model,
  assessments,
  onSave,
}: CompetencyModelModalProps) {
  const [draft, setDraft] = useState<CompetencyModel>(() => structuredClone(model));
  // 新增维度表单
  const [newLabel, setNewLabel] = useState('');
  const [newDefinition, setNewDefinition] = useState('');
  const [newWeight, setNewWeight] = useState('0.5');
  const [newGroup, setNewGroup] = useState<CompetencyGroup>('leadership');

  useEffect(() => {
    if (open) setDraft(structuredClone(model));
  }, [open, model]);

  // 维度 key → 评估引用数
  const refCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of assessments) m.set(a.dimension, (m.get(a.dimension) ?? 0) + 1);
    return m;
  }, [assessments]);

  const patchDim = (key: string, patch: Partial<CompetencyDimensionDef>) => {
    setDraft((prev) => ({
      dimensions: prev.dimensions.map((d) => (d.key === key ? { ...d, ...patch } : d)),
    }));
  };

  const addDimension = () => {
    const label = newLabel.trim();
    if (!label) return;
    const weight = Number(newWeight);
    const maxOrder = draft.dimensions.reduce((m, d) => Math.max(m, d.order), 0);
    const dim: CompetencyDimensionDef = {
      key: genDimensionKey(label),
      label,
      definition: newDefinition.trim(),
      weight: Number.isFinite(weight) && weight >= 0 ? weight : 0.5,
      group: newGroup,
      order: maxOrder + 1,
      enabled: true,
    };
    setDraft((prev) => ({ dimensions: [...prev.dimensions, dim] }));
    setNewLabel('');
    setNewDefinition('');
    setNewWeight('0.5');
  };

  const removeDimension = (key: string) => {
    setDraft((prev) => ({ dimensions: prev.dimensions.filter((d) => d.key !== key) }));
  };

  const restoreDefault = () => {
    if (
      !window.confirm(
        '恢复默认预设将重置本场景维度模型为「干部4维+员工2维」；评估数据保留，被重置掉的已评维度按 orphan（维度已删除）降级呈现。继续？',
      )
    ) {
      return;
    }
    setDraft(structuredClone(DEFAULT_COMPETENCY_MODEL));
  };

  const invalid = draft.dimensions.some(
    (d) => !d.label.trim() || !Number.isFinite(d.weight) || d.weight < 0 || !Number.isInteger(d.order),
  );

  const footer = (
    <>
      <button
        onClick={onClose}
        className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors"
      >
        取消
      </button>
      <button
        onClick={() => onSave(draft)}
        disabled={invalid}
        className="px-5 py-2 rounded-xl text-sm font-medium text-white bg-gradient-to-r from-indigo-500 to-violet-500 shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        title={invalid ? '存在非法配置（label 为空 / 权重<0 / order 非整数）' : '保存维度模型（场景级）'}
      >
        保存维度配置
      </button>
    </>
  );

  const renderGroup = (group: CompetencyGroup) => {
    const dims = draft.dimensions
      .filter((d) => d.group === group)
      .sort((a, b) => a.order - b.order);
    if (dims.length === 0) return null;
    return (
      <div key={group}>
        <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 mt-4 first:mt-0">
          {GROUP_LABEL[group]}
        </h4>
        <div className="space-y-2">
          {dims.map((d) => {
            const refs = refCount.get(d.key) ?? 0;
            const canDelete = !d.builtin && refs === 0;
            return (
              <div
                key={d.key}
                className={`rounded-xl border p-2.5 space-y-1.5 ${
                  d.enabled === false ? 'border-slate-100 bg-slate-50/60 opacity-70' : 'border-slate-100 bg-white/70'
                }`}
              >
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1 text-[10px] text-slate-500 cursor-pointer" title={d.enabled === false ? '停用中（历史评估保留，不计当前灯号）' : '启用（参与当前灯号/总分）'}>
                    <input
                      type="checkbox"
                      checked={d.enabled !== false}
                      onChange={(e) => patchDim(d.key, { enabled: e.target.checked })}
                      className="accent-indigo-500"
                    />
                    {d.enabled === false ? '已停用' : '启用'}
                  </label>
                  <span className="text-[10px] text-slate-400 font-mono truncate" title="稳定 key（建后不可改，AI 语义/历史关联根基）">
                    {d.key}
                  </span>
                  {d.builtin && (
                    <span className="text-[10px] px-1 rounded bg-indigo-50 text-indigo-600 border border-indigo-100">预设</span>
                  )}
                  <span className="ml-auto flex items-center gap-1">
                    <input
                      type="number"
                      min={0}
                      step={0.05}
                      value={d.weight}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        if (Number.isFinite(v)) patchDim(d.key, { weight: v });
                      }}
                      className="w-16 px-1.5 py-0.5 rounded border border-slate-200 text-right text-xs tabular-nums focus-ring"
                      title="权重（只影响总分排序，不影响木桶灯号）"
                    />
                    <span className="text-[10px] text-slate-400">权重</span>
                    <input
                      type="number"
                      min={1}
                      value={d.order}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        if (Number.isFinite(v)) patchDim(d.key, { order: Math.round(v) });
                      }}
                      className="w-12 px-1.5 py-0.5 rounded border border-slate-200 text-right text-xs tabular-nums focus-ring"
                      title="展示顺序（组内升序）"
                    />
                    <span className="text-[10px] text-slate-400">序</span>
                    <button
                      type="button"
                      onClick={() => canDelete && removeDimension(d.key)}
                      disabled={!canDelete}
                      className={`p-1 rounded-md transition-colors ${
                        canDelete
                          ? 'text-slate-400 hover:bg-red-50 hover:text-red-600'
                          : 'text-slate-200 cursor-not-allowed'
                      }`}
                      title={
                        d.builtin
                          ? '预设维度不可物理删除（仅可停用）'
                          : refs > 0
                            ? `已被 ${refs} 条评估引用，不可物理删除（仅可停用）`
                            : '物理删除该自定义维度'
                      }
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </span>
                </div>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={d.label}
                    onChange={(e) => patchDim(d.key, { label: e.target.value })}
                    className="w-32 px-1.5 py-1 rounded border border-slate-200 text-xs font-medium focus-ring"
                    title="显示名（可改）"
                  />
                  <input
                    type="text"
                    value={d.definition}
                    onChange={(e) => patchDim(d.key, { definition: e.target.value })}
                    className="flex-1 min-w-0 px-1.5 py-1 rounded border border-slate-200 text-xs text-slate-500 focus-ring"
                    title="维度定义（用户理解 + 未来 AI 语义）"
                    placeholder="维度定义…"
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <AppModal
      open={open}
      onClose={onClose}
      title="胜任度维度配置"
      subtitle="维度 key 稳定不可改；改显示名只改 label；权重只影响总分排序、不影响木桶灯号。停用 = 软删（历史评估保留）。"
      maxWidth="max-w-2xl"
      footer={footer}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-slate-500 flex items-center gap-1.5">
          <Layers className="w-3.5 h-3.5 text-slate-400" />
          当前模型（场景级）
        </span>
        <button
          onClick={restoreDefault}
          className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-400 hover:text-red-500 transition-colors"
        >
          <RotateCcw className="w-3 h-3" />
          恢复默认预设
        </button>
      </div>

      {renderGroup('leadership')}
      {renderGroup('staff')}

      {/* 新增维度 */}
      <div className="mt-4 rounded-xl border border-indigo-100 bg-indigo-50/40 p-3">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-indigo-700 mb-2">
          <Plus className="w-3.5 h-3.5" />
          新增维度（key 由系统生成：custom_&lt;slug&gt;_&lt;rand6&gt;）
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="维度名称（必填）"
            className="w-36 px-2 py-1 rounded-lg border border-slate-200 text-sm focus-ring"
          />
          <input
            type="text"
            value={newDefinition}
            onChange={(e) => setNewDefinition(e.target.value)}
            placeholder="维度定义（可选）"
            className="flex-1 min-w-[160px] px-2 py-1 rounded-lg border border-slate-200 text-sm focus-ring"
          />
          <input
            type="number"
            min={0}
            step={0.05}
            value={newWeight}
            onChange={(e) => setNewWeight(e.target.value)}
            placeholder="权重"
            title="权重（只影响总分排序）"
            className="w-20 px-2 py-1 rounded-lg border border-slate-200 text-sm tabular-nums focus-ring"
          />
          <select
            value={newGroup}
            onChange={(e) => setNewGroup(e.target.value as CompetencyGroup)}
            className="px-2 py-1 rounded-lg border border-slate-200 text-sm bg-white focus-ring"
          >
            <option value="leadership">领导力（干部）</option>
            <option value="staff">员工胜任度</option>
          </select>
          <button
            onClick={addDimension}
            disabled={!newLabel.trim()}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-white bg-gradient-to-r from-indigo-500 to-violet-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            <Plus className="w-3 h-3" />
            添加
          </button>
        </div>
      </div>

      <p className="mt-3 text-[10px] text-slate-400 leading-snug">
        恢复默认预设 / 停用维度不会删除任何评估数据；被重置或停用的已评维度在「历史轨迹」中仍可见（orphan 降级呈现），
        只是不再计入当前灯号与总分。
      </p>
    </AppModal>
  );
}
