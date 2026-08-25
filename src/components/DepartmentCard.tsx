import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, ChevronRight, User, Users, Building2 } from 'lucide-react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { Department, Employee } from '../types';
import { useLevelConfigs, getLevelColor } from '../utils/levels';
import { useSearchHighlight } from './SearchContext';
import { employeeLevelGap } from '../utils/analytics';
import { useDisplaySettings } from '../utils/displaySettings';

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
}

function DraggableEmployee({ 
  employee,
  selected,
  onSelect
}: { 
  employee: Employee;
  selected?: boolean;
  onSelect?: (empId: string, additive: boolean) => void;
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
      {(showTitle || showLevel) && (employee.title || employee.level) && (
        <div className="flex items-center gap-1 pl-1">
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
  onSetTargetLevel,
  onCreateVirtual,
  onMoveMultiple,
  departments,
  currentDeptId
}: { 
  employees: Employee[];
  onDelete: (empId: string) => void;
  canDelete: boolean;
  selectedEmpIds?: Set<string>;
  onSelect?: (empId: string, additive: boolean) => void;
  onSetTargetLevel?: (empId: string, target: string) => void;
  onCreateVirtual?: (empId: string) => void;
  onMoveMultiple?: (empIds: string[], toDeptId: string) => void;
  departments: Department[];
  currentDeptId?: string;
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
          <DraggableEmployee employee={emp} selected={selectedEmpIds?.has(emp.id)} onSelect={onSelect} />
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
                    const t = window.prompt('输入目标职级（如 L2.1，留空清除）', emp.targetLevel ?? '');
                    if (t === null) return;
                    onSetTargetLevel?.(emp.id, t);
                    setContextMenu(null);
                  }}
                >
                  设置目标职级
                </button>
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
      
      {/* 员工列表 */}
      <div className="px-3 py-2">
        <div className="flex items-center gap-1 text-xs text-gray-500 mb-2">
          <Users className="w-3 h-3" />
          <span>成员 ({department.employees.length})</span>
        </div>
        <div className="space-y-1 max-h-40 overflow-y-auto">
          {department.employees.length > 0 ? (
            <EmployeeList
              employees={department.employees}
              onDelete={(empId) => onDeleteEmployee(department.id, empId)}
              canDelete={true}
              selectedEmpIds={selectedEmpIds}
              onSelect={onToggleSelectEmp}
              onSetTargetLevel={onSetTargetLevel}
              onCreateVirtual={(empId) => onCreateVirtualFromEmployee(department.id, empId)}
              onMoveMultiple={onMoveMultiple}
              departments={allDepartments}
              currentDeptId={department.id}
            />
          ) : (
            <div className="text-xs text-gray-400 text-center py-2">
              拖拽员工到这里
            </div>
          )}
        </div>
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
    </div>
  );
}
