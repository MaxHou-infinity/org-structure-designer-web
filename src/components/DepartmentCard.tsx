import { useState, useRef, useEffect } from 'react';
import { ChevronDown, ChevronRight, User, Users, Building2 } from 'lucide-react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { Department, Employee, LEVEL_COLORS } from '../types';

interface DepartmentCardProps {
  department: Department;
  onToggleExpand: (id: string) => void;
  onUpdateDepartment: (id: string, name: string) => void;
  onUpdateLeader: (deptId: string, employee: Employee | null) => void;
  onDeleteEmployee: (deptId: string, empId: string) => void;
  onCreateVirtualEmployee: (deptId: string) => void;
  onChangeDepartmentLevel: (deptId: string, newLevel: number, newParentId: string | null) => void;
  allEmployees: Employee[];
}

function DraggableEmployee({ 
  employee
}: { 
  employee: Employee;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: employee.id,
    data: employee,
  });
  
  const levelColor = LEVEL_COLORS[employee.level] || '#CCCCCC';
  
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`flex items-center gap-1 px-2 py-1 rounded text-xs cursor-move hover:shadow-sm transition-shadow ${
        isDragging ? 'opacity-50' : ''
      }`}
      style={{ backgroundColor: levelColor + '40' }}
    >
      <User className="w-3 h-3" style={{ color: levelColor }} />
      <span className="truncate flex-1">{employee.name}</span>
      <span className="text-[10px]" style={{ color: levelColor }}>{employee.level}</span>
      {employee.isVirtual && (
        <span className="text-[10px] text-blue-500 font-medium">(兼)</span>
      )}
    </div>
  );
}

function EmployeeList({ 
  employees, 
  onDelete,
  canDelete
}: { 
  employees: Employee[];
  onDelete: (empId: string) => void;
  canDelete: boolean;
}) {
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; empId: string } | null>(null);
  
  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, []);
  
  const handleContextMenu = (e: React.MouseEvent, empId: string) => {
    e.preventDefault();
    if (canDelete) {
      setContextMenu({ x: e.clientX, y: e.clientY, empId });
    }
  };
  
  return (
    <div className="relative">
      {employees.map(emp => (
        <div
          key={emp.id}
          onContextMenu={(e) => handleContextMenu(e, emp.id)}
        >
          <DraggableEmployee employee={emp} />
          {contextMenu?.empId === emp.id && (
            <div
              className="fixed bg-white border border-gray-200 rounded shadow-lg py-1 z-50"
              style={{ left: contextMenu.x, top: contextMenu.y }}
            >
              <button
                className="w-full px-4 py-1 text-left text-sm hover:bg-gray-100 text-red-500"
                onClick={() => {
                  onDelete(emp.id);
                  setContextMenu(null);
                }}
              >
                删除员工
              </button>
            </div>
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
  onCreateVirtualEmployee,
  onChangeDepartmentLevel,
  allEmployees,
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
      className={`flex flex-col department-card rounded-xl shadow-soft border-0 cursor-move ${
        levelBg[department.level] || 'level-bg-1'
      } ${isOver ? 'ring-2 ring-indigo-400 bg-indigo-50/50' : ''} ${isDeptDragging ? 'opacity-50 scale-95' : ''}`}
      style={{ 
        minWidth: 220,
        fontSize: '14px',
        zIndex: isDeptDragging ? 1000 : 1,
        position: 'relative'
      }}
      onContextMenu={handleContextMenu}
    >
      {/* 部门头部 */}
      <div className={`flex items-center justify-between px-4 py-3 ${levelHeaderBg[department.level] || 'bg-gray-50'} rounded-t-xl`}>
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
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">负责人:</span>
          <button
            onClick={handleLeaderClick}
            className="text-sm text-blue-600 hover:underline flex items-center gap-1"
          >
            <User className="w-3 h-3" />
            {department.leaderName || '点击选择'}
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
                    style={{ backgroundColor: LEVEL_COLORS[emp.level] || '#CCCCCC' }}
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
            />
          ) : (
            <div className="text-xs text-gray-400 text-center py-2">
              拖拽员工到这里
            </div>
          )}
        </div>
      </div>
      
      {/* 右键菜单 - 使用 fixed 确保不受父元素限制 */}
      {showContextMenu && (
        <div
          className="fixed bg-white border border-gray-200 rounded-lg shadow-xl py-1 min-w-[180px]"
          style={{ zIndex: 99999, left: contextMenuPos.x, top: contextMenuPos.y }}
          ref={cardRef}
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
          
          <div className="border-t border-gray-100" />
          <button
            className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 flex items-center gap-2"
            onClick={(e) => {
              e.stopPropagation();
              onCreateVirtualEmployee(department.id);
              setShowContextMenu(false);
            }}
          >
            <User className="w-4 h-4 text-green-500" />
            创建虚拟员工
          </button>
        </div>
      )}
    </div>
  );
}
