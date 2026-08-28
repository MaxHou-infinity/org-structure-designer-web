import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, ChevronRight, ChevronUp, User, Users, Building2, Plus, Briefcase } from 'lucide-react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { Department, Employee, MatchStatus } from '../types';
import { useLevelConfigs, getLevelColor } from '../utils/levels';
import { useSearchHighlight } from './SearchContext';
import { employeeLevelGap } from '../utils/analytics';
import { PositionSummary } from '../utils/analytics';
import { MatchResult } from '../utils/match';
import { useDisplaySettings } from '../utils/displaySettings';
import { TargetLevelModal } from './TargetLevelModal';
import { PositionModal, type PositionCreateFields } from './PositionModal';

interface DepartmentCardProps {
  department: Department;
  onToggleExpand: (id: string) => void;
  onUpdateDepartment: (id: string, name: string) => void;
  onUpdateLeader: (deptId: string, employee: Employee | null) => void;
  onDeleteEmployee: (deptId: string, empId: string) => void;
  onCreateVirtualFromEmployee: (deptId: string, empId: string) => void;
  onChangeDepartmentLevel: (deptId: string, newLevel: number, newParentId: string | null) => void;
  allEmployees: Employee[];
  /** 当前选中的员工 id（批量操作用） */
  selectedEmpIds?: Set<string>;
  /** 点击员工切换选中（additive=Shift 加成选） */
  onToggleSelectEmp?: (empId: string, additive: boolean) => void;
  onSetTargetLevel: (empId: string, target: string) => void;
  onMoveMultiple: (empIds: string[], toDeptId: string) => void;
  allDepartments: Department[];
  /** v2.0.11：成员列表是否「展开全部」；缺省 false = 收起（紧凑卡，不滚动） */
  membersExpanded?: boolean;
  /** v2.0.11：切换成员列表展开/收起 */
  onToggleMembers?: (deptId: string) => void;
  // —— v2.1.1 岗位化 ——
  positionSummaries?: PositionSummary[];
  matchStates?: MatchResult[];
  onCreatePosition?: (deptId: string, fields: PositionCreateFields) => void;
  onSetPositionHeadcount?: (deptId: string, positionId: string, headcount: number) => void;
  onAssignEmployeeToPosition?: (empId: string, positionId: string) => void;
  onRemoveAssignment?: (empId: string) => void;
  onCreateVirtualForPosition?: (deptId: string, positionId: string, empId: string) => void;
}

/** 套岗状态点（placed/unassigned/overstaffed；not_competent 仅预留不产出）。 */
const MATCH_DOT: Record<MatchStatus, { dot: string; text: string; label: string; title: string }> = {
  placed: { dot: 'bg-emerald-500', text: 'text-emerald-600', label: '已套岗', title: '已套岗位' },
  unassigned: { dot: 'bg-amber-500', text: 'text-amber-600', label: '未套岗', title: '未套岗位' },
  overstaffed: { dot: 'bg-red-500', text: 'text-red-600', label: '超编', title: '岗位超编' },
  not_competent: { dot: 'bg-slate-400', text: 'text-slate-500', label: '不胜任', title: '不胜任（预留）' },
};

/** 岗位卡「岗位」区（可折叠，v2.1.1）：展示本部门直属岗位 + 编制/在岗/缺口 + 套岗入口。 */
function PositionSection({
  dept,
  summaryById,
  allEmployees,
  onOpenPositionModal,
  onSetPositionHeadcount,
  onAssign,
  onCreateVirtual,
}: {
  dept: Department;
  summaryById: Map<string, PositionSummary>;
  allEmployees: Employee[];
  onOpenPositionModal?: () => void;
  onSetPositionHeadcount?: (deptId: string, positionId: string, headcount: number) => void;
  onAssign?: (empId: string, positionId: string) => void;
  onCreateVirtual?: (deptId: string, positionId: string, empId: string) => void;
}) {
  const [openAssignPos, setOpenAssignPos] = useState<string | null>(null);
  const [openVirtualPos, setOpenVirtualPos] = useState<string | null>(null);

  const positions = dept.positions ?? [];
  const total = positions.length;

  return (
    <div className="px-3 pb-2 border-b border-slate-100">
      <div className="flex items-center justify-between mb-1.5">
        <span className="flex items-center gap-1 text-xs text-gray-500">
          <Briefcase className="w-3 h-3 shrink-0" />
          岗位 ({total})
        </span>
        <button
          onClick={() => onOpenPositionModal?.()}
          className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[11px] font-medium text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
          title="新建岗位"
        >
          <Plus className="w-3 h-3" />
          新建
        </button>
      </div>

      {positions.length === 0 ? (
        <div className="text-[11px] text-slate-400 text-center py-1.5">暂无岗位，点「新建」添加</div>
      ) : (
        <div className="space-y-1">
          {positions.map((pos) => {
            const s = summaryById.get(pos.id);
            const frozen = pos.status === 'frozen';
            const assignedCount = s?.assignedCount ?? 0;
            const gap = s?.gap ?? null;
            const candidates = allEmployees.filter((e) => !e.isVirtual && e.positionId !== pos.id);
            return (
              <div key={pos.id} className="rounded-lg border border-slate-100 bg-white/60 p-1.5">
                <div className="flex items-center gap-1">
                  <Briefcase className="w-3 h-3 shrink-0 text-slate-400" />
                  <span className="text-xs font-medium text-slate-700 truncate">{pos.name}</span>
                  {frozen && (
                    <span className="text-[10px] px-1 rounded bg-slate-100 text-slate-500" title="编制已冻结，不计缺口">
                      冻结
                    </span>
                  )}
                  <span className="ml-auto flex items-center gap-1">
                    <input
                      type="number"
                      min="0"
                      value={pos.headcount}
                      onChange={(e) => {
                        const v = e.target.value === '' ? 0 : Number(e.target.value);
                        onSetPositionHeadcount?.(dept.id, pos.id, Number.isFinite(v) ? v : 0);
                      }}
                      title="岗位编制"
                      className="w-11 px-1 py-0.5 rounded border border-slate-200 text-right text-xs focus-ring"
                    />
                    <span className="text-[10px] text-slate-400">/ 在岗 {assignedCount}</span>
                    <span className={`text-[10px] font-medium ${gap === null ? 'text-slate-400' : gap > 0 ? 'text-amber-600' : gap < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                      {gap === null ? (frozen ? '冻结' : '—') : gap > 0 ? `缺 ${gap}` : gap < 0 ? `超 ${Math.abs(gap)}` : '满编'}
                    </span>
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-1">
                  <button
                    onClick={() => setOpenAssignPos(openAssignPos === pos.id ? null : pos.id)}
                    className="flex-1 text-left px-2 py-1 rounded-md text-[11px] text-indigo-600 bg-indigo-50 hover:bg-indigo-100 transition-colors"
                  >
                    套岗（选员工）
                  </button>
                  <button
                    onClick={() => setOpenVirtualPos(openVirtualPos === pos.id ? null : pos.id)}
                    className="flex-1 text-left px-2 py-1 rounded-md text-[11px] text-blue-600 bg-blue-50 hover:bg-blue-100 transition-colors"
                  >
                    建虚拟兼岗
                  </button>
                </div>
                {openAssignPos === pos.id && (
                  <div className="mt-1 max-h-32 overflow-y-auto rounded-lg border border-indigo-100 bg-white py-0.5">
                    {candidates.length === 0 && <div className="px-2 py-1 text-[11px] text-slate-400">无可套岗员工</div>}
                    {candidates.map((e) => (
                      <button
                        key={e.id}
                        onClick={() => {
                          onAssign?.(e.id, pos.id);
                          setOpenAssignPos(null);
                        }}
                        className="w-full text-left px-2 py-1 text-[11px] text-slate-700 hover:bg-indigo-50 truncate"
                      >
                        {e.name}（{e.employeeId}）
                      </button>
                    ))}
                  </div>
                )}
                {openVirtualPos === pos.id && (
                  <div className="mt-1 max-h-32 overflow-y-auto rounded-lg border border-blue-100 bg-white py-0.5">
                    <div className="px-2 py-1 text-[10px] text-slate-400">从以下员工创建兼岗（跨部门第二角色）</div>
                    {candidates.length === 0 && <div className="px-2 py-1 text-[11px] text-slate-400">无可兼岗员工</div>}
                    {candidates.map((e) => (
                      <button
                        key={e.id}
                        onClick={() => {
                          onCreateVirtual?.(dept.id, pos.id, e.id);
                          setOpenVirtualPos(null);
                        }}
                        className="w-full text-left px-2 py-1 text-[11px] text-slate-700 hover:bg-blue-50 truncate"
                      >
                        {e.name}（{e.employeeId}）
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function DraggableEmployee({ 
  employee,
  selected,
  onSelect,
  matchStatus,
  getEmpName,
}: { 
  employee: Employee;
  selected?: boolean;
  onSelect?: (empId: string, additive: boolean) => void;
  matchStatus?: MatchStatus;
  getEmpName?: (id: string) => string;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: employee.id,
    data: employee,
  });

  const levelConfigs = useLevelConfigs();
  const levelColor = getLevelColor(levelConfigs, employee.level);
  const highlight = useSearchHighlight();
  const isSearchHit = highlight.empIds.has(employee.id);
  const { showLevel, showTitle } = useDisplaySettings();
  const match = matchStatus ? MATCH_DOT[matchStatus] : null;
  const primaryName = employee.isVirtual && employee.primaryEmployeeId ? getEmpName?.(employee.primaryEmployeeId) : null;
  
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      data-emp-id={employee.id}
      onClick={(e) => {
        // 阻止拖拽/点击冒泡到卡片的空白选中
        e.stopPropagation();
        onSelect?.(employee.id, e.shiftKey);
      }}
      className={`employee-tag flex flex-col gap-0.5 px-2 py-1 rounded-lg text-xs cursor-move hover:shadow-sm transition-shadow ${
        isDragging ? 'opacity-50' : ''
      } ${selected ? 'ring-2 ring-indigo-400 bg-indigo-50/80' : ''} ${
        isSearchHit ? 'ring-2 ring-amber-400 bg-amber-50/70' : ''
      }`}
      style={{ backgroundColor: levelColor + '40' }}
    >
      <div className="flex items-center gap-1">
        <User className="w-3 h-3" style={{ color: levelColor }} />
        {match && (
          <span
            className={`w-2 h-2 rounded-full shrink-0 ${match.dot}`}
            title={`${match.label} · ${match.title}`}
          />
        )}
        <span className="truncate">{employee.name}</span>
        {(() => {
          const gap = employeeLevelGap(employee);
          if (!gap) return null;
          const cls =
            gap.status === 'healthy'
              ? 'bg-emerald-100 text-emerald-600'
              : gap.status === 'warn'
                ? 'bg-amber-100 text-amber-600'
                : 'bg-red-100 text-red-600';
          return (
            <span
              className={`text-[10px] px-1 rounded font-medium ${cls}`}
              title={`目标 ${employee.targetLevel} · ${gap.label}`}
            >
              {gap.gap > 0 ? `+${gap.gap}` : gap.gap}
            </span>
          );
        })()}
        {employee.isVirtual && (
          <span className="text-[10px] text-blue-500 font-medium">(兼)</span>
        )}
      </div>
      {(primaryName || showLevel || (showTitle && employee.title)) && (
        <div className="flex items-center gap-1 pl-1">
          {primaryName && (
            <span className="text-[10px] text-blue-500 truncate" title={`兼岗归属：${primaryName}`}>
              {primaryName}
            </span>
          )}
          {showTitle && employee.title ? (
            <span className="text-[10px] text-slate-500 truncate">{employee.title}</span>
          ) : null}
          {showLevel && employee.level ? (
            <span className="text-[10px] shrink-0 px-1 rounded bg-white/70 border border-slate-200 text-slate-600">{employee.level}</span>
          ) : null}
        </div>
      )}
    </div>
  );
}

function flattenDeptOptions(depts: Department[]): { id: string; name: string; level: number }[] {
  const out: { id: string; name: string; level: number }[] = [];
  const walk = (list: Department[]) => {
    for (const d of list) {
      out.push({ id: d.id, name: d.name, level: d.level });
      walk(d.children);
    }
  };
  walk(depts);
  return out;
}

function EmployeeList({ 
  employees, 
  onDelete,
  canDelete,
  selectedEmpIds,
  onSelect,
  onCreateVirtual,
  onMoveMultiple,
  departments,
  currentDeptId,
  matchStateById,
  getEmpName,
  onRemoveAssignment,
  onOpenTargetLevel,
}: { 
  employees: Employee[];
  onDelete: (empId: string) => void;
  canDelete: boolean;
  selectedEmpIds?: Set<string>;
  onSelect?: (empId: string, additive: boolean) => void;
  onCreateVirtual?: (empId: string) => void;
  onMoveMultiple?: (empIds: string[], toDeptId: string) => void;
  departments: Department[];
  currentDeptId?: string;
  matchStateById?: Map<string, MatchResult>;
  getEmpName?: (id: string) => string;
  onRemoveAssignment?: (empId: string) => void;
  onOpenTargetLevel?: (emp: Employee) => void;
}) {
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; empId: string } | null>(null);
  const [showMove, setShowMove] = useState(false);
  const deptOptions = flattenDeptOptions(departments).filter((d) => d.id !== currentDeptId);
  
  useEffect(() => {
    const handleClick = () => { setContextMenu(null); setShowMove(false); };
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, []);
  
  const handleContextMenu = (e: React.MouseEvent, empId: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (canDelete) {
      setContextMenu({ x: e.clientX, y: e.clientY, empId });
      setShowMove(false);
    }
  };
  
  return (
    <div className="relative">
      {employees.map(emp => (
        <div
          key={emp.id}
          onContextMenu={(e) => handleContextMenu(e, emp.id)}
        >
          <DraggableEmployee employee={emp} selected={selectedEmpIds?.has(emp.id)} onSelect={onSelect} matchStatus={matchStateById?.get(emp.id)?.status} getEmpName={getEmpName} />
          {contextMenu?.empId === emp.id && (
            createPortal(
              <div
                className="fixed bg-white border border-gray-200 rounded-lg shadow-xl py-1 z-50 min-w-[200px] max-w-[280px]"
                style={{ left: contextMenu.x, top: contextMenu.y }}
                onClick={(e) => e.stopPropagation()}
              >
                {selectedEmpIds?.has(emp.id) && (
                  <button
                    className="w-full px-4 py-1.5 text-left text-sm hover:bg-gray-100 text-slate-700 truncate whitespace-nowrap"
                    onClick={() => {
                      onCreateVirtual?.(emp.id);
                      setContextMenu(null);
                    }}
                  >
                    创建虚拟员工（兼岗）
                  </button>
                )}
                {selectedEmpIds?.has(emp.id) && (
                  <button
                    className="w-full px-4 py-1.5 text-left text-sm hover:bg-gray-100 text-slate-700 truncate whitespace-nowrap flex items-center justify-between"
                    onClick={() => setShowMove((v) => !v)}
                  >
                    移动其他部门
                    <span className="text-gray-400">{showMove ? '▲' : '▼'}</span>
                  </button>
                )}
                {showMove && contextMenu?.empId === emp.id && deptOptions.length > 0 && (
                  <div className="max-h-40 overflow-y-auto border-t border-gray-100 py-1">
                    {deptOptions.map((d) => (
                      <button
                        key={d.id}
                        className="w-full px-4 py-1 text-left text-sm hover:bg-gray-100 text-slate-700 truncate whitespace-nowrap"
                        onClick={() => {
                          const moveIds = selectedEmpIds && selectedEmpIds.has(emp.id) ? Array.from(selectedEmpIds) : [emp.id];
                          onMoveMultiple?.(moveIds, d.id);
                          setContextMenu(null);
                          setShowMove(false);
                        }}
                      >
                        {'　'.repeat(Math.min(d.level - 1, 3))}{d.name}
                      </button>
                    ))}
                  </div>
                )}
                <button
                  className="w-full px-4 py-1.5 text-left text-sm hover:bg-gray-100 text-slate-700 truncate whitespace-nowrap"
                  onClick={() => {
                    onOpenTargetLevel?.(emp);
                    setContextMenu(null);
                  }}
                >
                  设置目标职级
                </button>
                {emp.positionId && (
                  <button
                    className="w-full px-4 py-1.5 text-left text-sm hover:bg-gray-100 text-slate-700 truncate whitespace-nowrap"
                    onClick={() => {
                      onRemoveAssignment?.(emp.id);
                      setContextMenu(null);
                    }}
                  >
                    取消套岗
                  </button>
                )}
                <button
                  className="w-full px-4 py-1.5 text-left text-sm hover:bg-gray-100 text-red-500 truncate whitespace-nowrap"
                  onClick={() => {
                    onDelete(emp.id);
                    setContextMenu(null);
                  }}
                >
                  删除员工
                </button>
              </div>,
              document.body,
            )
          )}
        </div>
      ))}
    </div>
  );
}

export function DepartmentCard({
  department,
  onToggleExpand,
  onUpdateDepartment,
  onUpdateLeader,
  onDeleteEmployee,
  onCreateVirtualFromEmployee,
  onChangeDepartmentLevel,
  onSetTargetLevel,
  onMoveMultiple,
  allDepartments,
  allEmployees,
  selectedEmpIds,
  onToggleSelectEmp,
  membersExpanded = false,
  onToggleMembers,
  positionSummaries = [],
  matchStates = [],
  onCreatePosition,
  onSetPositionHeadcount,
  onAssignEmployeeToPosition,
  onRemoveAssignment,
  onCreateVirtualForPosition,
}: DepartmentCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(department.name);
  const [showLeaderSearch, setShowLeaderSearch] = useState(false);
  const [leaderSearch, setLeaderSearch] = useState('');
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [contextMenuPos, setContextMenuPos] = useState({ x: 0, y: 0 });
  const [showLevelMenu, setShowLevelMenu] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const levelConfigs = useLevelConfigs();
  const highlight = useSearchHighlight();
  const isSearchHit = highlight.deptIds.has(department.id);
  const { showLevel, showTitle } = useDisplaySettings();
  const leader = allEmployees.find((e) => e.employeeId === department.leaderId && !e.isVirtual);

  // —— v2.1.1 岗位化：把扁平汇总/匹配状态镜像为 id→数据 查表（部门卡岗位区 / 员工状态点用） ——
  const summaryById = useMemo(
    () => new Map<string, PositionSummary>(positionSummaries.map((p) => [p.positionId, p])),
    [positionSummaries],
  );
  const matchById = useMemo(
    () => new Map<string, MatchResult>(matchStates.map((r) => [r.employeeId, r])),
    [matchStates],
  );
  const getEmpName = useCallback((id: string) => allEmployees.find((e) => e.id === id)?.name ?? '', [allEmployees]);

  // —— v2.1.1 应用内弹窗（替代原生 window.prompt）：目标职级 / 新建岗位 ——
  const [targetLevelEmp, setTargetLevelEmp] = useState<Employee | null>(null);
  const [positionModalOpen, setPositionModalOpen] = useState(false);
  
  // 部门拖拽
  const { attributes: deptAttributes, listeners: deptListeners, setNodeRef: setDeptRef, isDragging: isDeptDragging } = useDraggable({
    id: `dept-drag-${department.id}`,
    data: { type: 'department', department },
  });
  
  const { setNodeRef, isOver } = useDroppable({
    id: `dept-${department.id}`,
    data: { type: 'department', department },
  });
  
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);
  
  const handleDoubleClick = () => {
    setIsEditing(true);
    setEditName(department.name);
  };
  
  const handleNameSubmit = () => {
    if (editName.trim() && editName !== department.name) {
      onUpdateDepartment(department.id, editName.trim());
    }
    setIsEditing(false);
  };
  
  const handleLeaderClick = () => {
    setShowLeaderSearch(!showLeaderSearch);
  };
  
  const filteredEmployees = allEmployees.filter(emp =>
    emp.name.toLowerCase().includes(leaderSearch.toLowerCase()) ||
    emp.employeeId.toLowerCase().includes(leaderSearch.toLowerCase())
  );
  
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenuPos({ x: e.clientX, y: e.clientY });
    setShowContextMenu(true);
  };
  
  useEffect(() => {
    const handleClick = () => setShowContextMenu(false);
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, []);
  
  const levelBg: Record<number, string> = {
    1: 'bg-indigo-50/80',
    2: 'bg-emerald-50/80',
    3: 'bg-amber-50/80',
  };
  
  const levelHeaderBg: Record<number, string> = {
    1: 'bg-gradient-to-r from-indigo-500/10 to-transparent',
    2: 'bg-gradient-to-r from-emerald-500/10 to-transparent',
    3: 'bg-gradient-to-r from-amber-500/10 to-transparent',
  };
  
  return (
    <div
      ref={(node) => {
        setNodeRef(node);
        setDeptRef(node);
      }}
      {...deptAttributes}
      {...deptListeners}
      data-dept-id={department.id}
      className={`flex flex-col department-card rounded-2xl shadow-soft border-0 cursor-move ${
        levelBg[department.level] || 'level-bg-1'
      } ${isOver ? 'ring-2 ring-indigo-400 bg-indigo-50/50' : ''} ${
        isSearchHit ? 'ring-2 ring-amber-400' : ''
      } ${isDeptDragging ? 'opacity-50 scale-95' : ''}`}
      style={{ 
        minWidth: 220,
        fontSize: '14px',
        // 拖拽/负责人搜索下拉打开时抬高本卡层级，避免被扁平的子部门卡（DOM 顺序在后）遮住。
        // 负责人搜索下拉是卡内流式元素，若不抬高父卡层级，后代生成的子部门卡会绘制在其上方。
        zIndex: isDeptDragging ? 1000 : (showLeaderSearch ? 30 : 1),
        position: 'relative'
      }}
    >
      {/* 部门头部 */}
      <div
        onContextMenu={handleContextMenu}
        className={`flex items-center justify-between px-4 py-3 ${levelHeaderBg[department.level] || 'bg-gray-50'} rounded-t-2xl`}
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {department.children.length > 0 ? (
            <button
              onClick={() => onToggleExpand(department.id)}
              className="p-1 hover:bg-white/50 rounded-lg transition-colors"
            >
              {department.expanded ? (
                <ChevronDown className="w-4 h-4 text-gray-600" />
              ) : (
                <ChevronRight className="w-4 h-4 text-gray-600" />
              )}
            </button>
          ) : (
            <div className="w-6" />
          )}
          
          {isEditing ? (
            <input
              ref={inputRef}
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onBlur={handleNameSubmit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleNameSubmit();
                if (e.key === 'Escape') setIsEditing(false);
              }}
              className="flex-1 px-2 py-1 border border-indigo-300 rounded-lg text-sm focus-ring"
            />
          ) : (
            <span 
              className="font-bold text-gray-800 truncate cursor-pointer hover:text-indigo-600 transition-colors"
              onDoubleClick={handleDoubleClick}
              title="双击编辑部门名称"
            >
              {department.name}
            </span>
          )}
        </div>
        
        <span className="text-xs text-gray-400 ml-2">L{department.level}</span>
      </div>
      
      {/* 负责人 */}
      <div className="px-3 py-2 border-b border-gray-100">
        <div className="flex items-center gap-2 whitespace-nowrap">
          <span className="text-xs text-gray-500 shrink-0">负责人:</span>
          <button
            onClick={handleLeaderClick}
            title={`${department.leaderName || ''}${leader && (showTitle || showLevel) ? ' · ' + [(showTitle && leader.title) ? leader.title : null, (showLevel && leader.level) ? leader.level : null].filter(Boolean).join(' · ') : ''}`}
            className="text-sm text-blue-600 hover:underline flex items-center gap-1 min-w-0 overflow-hidden"
          >
            <User className="w-3 h-3 shrink-0" />
            <span className="truncate">
              {department.leaderName || '点击选择'}
              {leader && (showTitle || showLevel) ? ` · ${[(showTitle && leader.title) ? leader.title : null, (showLevel && leader.level) ? leader.level : null].filter(Boolean).join(' · ')}` : ''}
            </span>
          </button>
        </div>
        
        {showLeaderSearch && (
          <div className="mt-2 p-2 bg-gray-50 rounded">
            <input
              type="text"
              placeholder="搜索员工..."
              value={leaderSearch}
              onChange={(e) => setLeaderSearch(e.target.value)}
              className="w-full px-2 py-1 border border-gray-300 rounded text-sm mb-2"
            />
            <div className="max-h-32 overflow-y-auto space-y-1">
              <button
                onClick={() => {
                  onUpdateLeader(department.id, null);
                  setShowLeaderSearch(false);
                  setLeaderSearch('');
                }}
                className="w-full text-left px-2 py-1 text-sm text-gray-500 hover:bg-gray-100 rounded"
              >
                清除负责人
              </button>
              {filteredEmployees.slice(0, 10).map(emp => (
                <button
                  key={emp.id}
                  onClick={() => {
                    onUpdateLeader(department.id, emp);
                    setShowLeaderSearch(false);
                    setLeaderSearch('');
                  }}
                  className="w-full text-left px-2 py-1 text-sm hover:bg-gray-100 rounded flex items-center gap-2"
                >
                  <div
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: getLevelColor(levelConfigs, emp.level) }}
                  />
                  {emp.name} ({emp.employeeId})
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      
      {/* v2.1.1 岗位区（可折叠，沿组织树向下钻：每部门展示其直属岗位） */}
      {(department.positions?.length ?? 0) > 0 || onCreatePosition ? (
        <PositionSection
          dept={department}
          summaryById={summaryById}
          allEmployees={allEmployees}
          onOpenPositionModal={() => setPositionModalOpen(true)}
          onSetPositionHeadcount={onSetPositionHeadcount}
          onAssign={(empId, positionId) => onAssignEmployeeToPosition?.(empId, positionId)}
          onCreateVirtual={(deptId, positionId, empId) => onCreateVirtualForPosition?.(deptId, positionId, empId)}
        />
      ) : null}

      {/* 员工列表（v2.0.11：收起/展开全部，替代 max-h-40 滚动；成员多时卡高由布局动态估算） */}
      <div className="px-3 py-2">
        <div className="flex items-center justify-between gap-1 text-xs text-gray-500 mb-2">
          <div className="flex items-center gap-1 min-w-0">
            <Users className="w-3 h-3 shrink-0" />
            <span className="truncate">成员 ({department.employees.length})</span>
          </div>
          {department.employees.length > 0 && onToggleMembers && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleMembers(department.id);
              }}
              className={`shrink-0 flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[11px] font-medium hover:bg-indigo-50 ${
                membersExpanded ? 'text-indigo-600' : 'text-slate-400 hover:text-indigo-600'
              }`}
              title={membersExpanded ? '收起成员列表' : '展开全部成员'}
            >
              {membersExpanded ? '收起' : '展开全部'}
              {membersExpanded ? (
                <ChevronUp className="w-3 h-3" />
              ) : (
                <ChevronDown className="w-3 h-3" />
              )}
            </button>
          )}
        </div>
        {department.employees.length === 0 ? (
          <div className="text-xs text-gray-400 text-center py-2">拖拽员工到这里</div>
        ) : membersExpanded ? (
          <div className="space-y-1">
            <EmployeeList
              employees={department.employees}
              onDelete={(empId) => onDeleteEmployee(department.id, empId)}
              canDelete={true}
              selectedEmpIds={selectedEmpIds}
              onSelect={onToggleSelectEmp}
              onCreateVirtual={(empId) => onCreateVirtualFromEmployee(department.id, empId)}
              onMoveMultiple={onMoveMultiple}
              departments={allDepartments}
              currentDeptId={department.id}
              matchStateById={matchById}
              getEmpName={getEmpName}
              onRemoveAssignment={(empId) => onRemoveAssignment?.(empId)}
              onOpenTargetLevel={(emp) => setTargetLevelEmp(emp)}
            />
          </div>
        ) : (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleMembers?.(department.id);
            }}
            className="w-full text-xs text-slate-400 hover:text-indigo-600 text-center py-1.5 rounded-md hover:bg-indigo-50/60 transition-colors"
            title="展开全部成员"
          >
            已收起 · 共 {department.employees.length} 人，点此展开查看全部
          </button>
        )}
      </div>
      
      {/* 右键菜单 - portal 到 document.body，避免被画布 transform:scale 的坐标系污染。
          position:fixed 在 transform 祖先内会以其为参照系而非视口，导致坐标错乱（菜单跑到画布右侧）。
          用 createPortal 渲染到 body，clientX/clientY 才按视口正确生效。 */}
      {showContextMenu &&
        createPortal(
          <div
            className="fixed bg-white border border-gray-200 rounded-lg shadow-xl py-1 min-w-[180px]"
            style={{ zIndex: 99999, left: contextMenuPos.x, top: contextMenuPos.y }}
            ref={cardRef}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 flex items-center gap-2"
              onClick={(e) => {
                e.stopPropagation();
                setShowLevelMenu(!showLevelMenu);
              }}
            >
              <Building2 className="w-4 h-4 text-indigo-500" />
              调整层级归属
              <span className="ml-auto text-gray-400">{showLevelMenu ? '▲' : '▼'}</span>
            </button>

            {showLevelMenu && (
              <div className="border-t border-gray-100 py-1">
                <button
                  className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100"
                  onClick={(e) => {
                    e.stopPropagation();
                    onChangeDepartmentLevel(department.id, 1, null);
                    setShowContextMenu(false);
                    setShowLevelMenu(false);
                  }}
                >
                  设为 L1 (一级部门)
                </button>
                <button
                  className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100"
                  onClick={(e) => {
                    e.stopPropagation();
                    onChangeDepartmentLevel(department.id, 2, null);
                    setShowContextMenu(false);
                    setShowLevelMenu(false);
                  }}
                >
                  设为 L2 (二级部门)
                </button>
                <button
                  className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100"
                  onClick={(e) => {
                    e.stopPropagation();
                    onChangeDepartmentLevel(department.id, 3, null);
                    setShowContextMenu(false);
                    setShowLevelMenu(false);
                  }}
                >
                  设为 L3 (三级部门)
                </button>
              </div>
            )}

          </div>,
          document.body,
        )}

        {/* v2.1.1 应用内弹窗：目标职级 / 新建岗位（替代原生 window.prompt） */}
        <TargetLevelModal
          open={!!targetLevelEmp}
          employee={targetLevelEmp}
          levelConfigs={levelConfigs}
          onConfirm={(empId, target) => onSetTargetLevel(empId, target ?? '')}
          onClose={() => setTargetLevelEmp(null)}
        />
        <PositionModal
          open={positionModalOpen}
          onClose={() => setPositionModalOpen(false)}
          dept={department}
          levelConfigs={levelConfigs}
          onCreate={(deptId, fields) => onCreatePosition?.(deptId, fields)}
        />
    </div>
  );
}
