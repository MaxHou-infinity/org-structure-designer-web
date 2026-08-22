import { useState, useEffect } from 'react';
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, useSensor, useSensors, PointerSensor } from '@dnd-kit/core';
import { DepartmentCard } from './DepartmentCard';
import { Department, Employee } from '../types';

interface OrgChartProps {
  departments: Department[];
  onToggleExpand: (id: string) => void;
  onUpdateDepartment: (id: string, name: string) => void;
  onUpdateLeader: (deptId: string, employee: Employee | null) => void;
  onMoveEmployee: (empId: string, fromDeptId: string, toDeptId: string) => void;
  onMoveDepartment: (deptId: string, targetDeptId: string | null) => void;
  onChangeDepartmentLevel: (deptId: string, newLevel: number, newParentId: string | null) => void;
  onDeleteEmployee: (deptId: string, empId: string) => void;
  onCreateVirtualEmployee: (deptId: string) => void;
  allEmployees: Employee[];
  zoom: number;
  canvasRef: React.RefObject<HTMLDivElement>;
}

interface TreeNode {
  department: Department;
  x: number;
  y: number;
  width: number;
  children: TreeNode[];
}

function calculateTreeLayout(
  departments: Department[],
  parentX: number,
  parentY: number,
  zoom: number,
  _level: number = 0
): TreeNode[] {
  if (departments.length === 0) return [];
  
  const cardWidth = 220 * (zoom / 100);
  // 根级别部门间距更大
  const horizontalGap = _level === 0 ? 120 * (zoom / 100) : 60 * (zoom / 100);
  const verticalGap = 40 * (zoom / 100);
  
  // 计算每个子树的宽度
  const calculateSubtreeWidth = (depts: Department[]): number => {
    if (depts.length === 0) return 0;
    let totalWidth = 0;
    const leafCounts: number[] = [];
    
    depts.forEach(dept => {
      if (dept.children.length === 0 || !dept.expanded) {
        leafCounts.push(1);
      } else {
        leafCounts.push(calculateSubtreeWidth(dept.children.filter(d => d.expanded)));
      }
    });
    
    leafCounts.forEach((count) => {
      totalWidth += count * cardWidth + (count - 1) * horizontalGap;
    });
    
    return totalWidth;
  };
  
  const results: TreeNode[] = [];
  let currentX = parentX;
  
  departments.forEach((dept) => {
    let subtreeWidth: number;
    let children: TreeNode[] = [];
    
    if (dept.children.length > 0 && dept.expanded) {
      const visibleChildren = dept.children;
      subtreeWidth = calculateSubtreeWidth(visibleChildren);
      children = calculateTreeLayout(visibleChildren, currentX + subtreeWidth / 2 - cardWidth / 2, parentY + 200 * (zoom / 100) + verticalGap, zoom, _level + 1);
    } else {
      subtreeWidth = cardWidth;
    }
    
    results.push({
      department: dept,
      x: currentX,
      y: parentY,
      width: subtreeWidth,
      children,
    });
    
    currentX += subtreeWidth + horizontalGap;
  });
  
  return results;
}

const renderTreeRecursive = (
  nodes: TreeNode[],
  onToggleExpand: (id: string) => void,
  onUpdateDepartment: (id: string, name: string) => void,
  onUpdateLeader: (deptId: string, employee: Employee | null) => void,
  onDeleteEmployee: (deptId: string, empId: string) => void,
  onCreateVirtualEmployee: (deptId: string) => void,
  onChangeDepartmentLevel: (deptId: string, newLevel: number, newParentId: string | null) => void,
  allEmployees: Employee[],
  level: number = 0
): React.ReactNode => {
  if (nodes.length === 0) return null;
  
  return (
    <div className="flex items-start gap-0">
      {nodes.map((node) => (
        <div key={node.department.id} className="flex flex-col items-center">
          <DepartmentCard
            department={node.department}
            onToggleExpand={onToggleExpand}
            onUpdateDepartment={onUpdateDepartment}
            onUpdateLeader={onUpdateLeader}
            onDeleteEmployee={onDeleteEmployee}
            onCreateVirtualEmployee={onCreateVirtualEmployee}
            onChangeDepartmentLevel={onChangeDepartmentLevel}
            allEmployees={allEmployees}
          />
          {node.department.expanded && node.children.length > 0 && (
            <div className="mt-4 pl-8 border-l-2 border-indigo-200 ml-4">
              {renderTreeRecursive(
                node.children,
                onToggleExpand,
                onUpdateDepartment,
                onUpdateLeader,
                onDeleteEmployee,
                onCreateVirtualEmployee,
                onChangeDepartmentLevel,
                allEmployees,
                level + 1
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

export function OrgChart({
  departments,
  onToggleExpand,
  onUpdateDepartment,
  onUpdateLeader,
  onMoveEmployee,
  onMoveDepartment,
  onChangeDepartmentLevel,
  onDeleteEmployee,
  onCreateVirtualEmployee,
  allEmployees,
  zoom,
  canvasRef,
}: OrgChartProps) {
  const [containerWidth, setContainerWidth] = useState(0);
  const [contentHeight, setContentHeight] = useState(0);
  const [dragData, setDragData] = useState<{ type: 'employee' | 'department'; data: Employee | Department } | null>(null);
  
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );
  
  // 测量未缩放内容的实际宽高（transform scale 不影响 scrollWidth/scrollHeight）
  useEffect(() => {
    const updateSize = () => {
      if (canvasRef.current) {
        setContainerWidth(canvasRef.current.scrollWidth);
        setContentHeight(canvasRef.current.scrollHeight);
      }
    };
    
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, [departments, zoom, canvasRef]);
  
  const handleDragStart = (event: DragStartEvent) => {
    const data = event.active.data.current;
    if (data?.type === 'department') {
      setDragData({ type: 'department', data: data.department });
    } else if (data?.type === 'employee' || data?.id) {
      setDragData({ type: 'employee', data: data as Employee });
    }
  };
  
  const handleDragEnd = (event: DragEndEvent) => {
    const prevDragData = dragData;
    setDragData(null);
    
    const { over } = event;
    if (!over) return;
    
    const dropData = over.data.current as { type: string; department: Department } | undefined;
    
    // 处理部门拖拽
    if (prevDragData?.type === 'department') {
      const sourceDept = prevDragData.data as Department;
      
      // 如果拖到空白区域或者是根级别放置
      if (!dropData || dropData.type !== 'department') {
        // 移动到根级别（平级）
        onMoveDepartment(sourceDept.id, null);
        return;
      }
      
      // 拖到目标部门
      if (dropData.type === 'department') {
        const targetDept = dropData.department;
        
        // 不能把部门拖拽到自己或自己的子部门
        if (sourceDept.id !== targetDept.id && !isDescendant(sourceDept, targetDept)) {
          onMoveDepartment(sourceDept.id, targetDept.id);
        }
      }
      return;
    }
    
    // 处理员工拖拽
    if (prevDragData?.type === 'employee') {
      const employee = prevDragData.data as Employee;
      if (!dropData || dropData.type !== 'department') return;
      
      // 查找员工当前所在的部门
      let fromDeptId: string | null = null;
      const findEmployeeDept = (depts: Department[]): string | null => {
        for (const dept of depts) {
          if (dept.employees.some(emp => emp.id === employee.id)) {
            return dept.id;
          }
          const found = findEmployeeDept(dept.children);
          if (found) return found;
        }
        return null;
      };
      
      fromDeptId = findEmployeeDept(departments);
      
      if (fromDeptId && fromDeptId !== dropData.department.id) {
        onMoveEmployee(employee.id, fromDeptId, dropData.department.id);
      }
    }
  };
  
  // 检查targetDept是否是sourceDept的子部门
  const isDescendant = (source: Department, target: Department): boolean => {
    const check = (dept: Department): boolean => {
      if (dept.id === source.id) return true;
      for (const child of dept.children) {
        if (check(child)) return true;
      }
      return false;
    };
    return check(target);
  };
  
  // 布局按 100% 基准计算，缩放由外层 transform: scale 完成
  const scale = zoom / 100;
  const treeNodes = calculateTreeLayout(departments, 0, 0, 100);
  
  const totalWidth = Math.max(
    containerWidth,
    treeNodes.reduce((sum, node) => sum + node.width, 0) + (treeNodes.length - 1) * 40
  );
  
  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      {/* 外层 wrapper：占位缩放后的滚动区域尺寸 */}
      <div
        className="min-h-full"
        style={{ width: totalWidth * scale, minHeight: contentHeight * scale }}
      >
        <div
          ref={canvasRef}
          className="min-h-full p-8"
          style={{ 
            minWidth: totalWidth,
            transform: `scale(${scale})`,
            transformOrigin: 'top left'
          }}
        >
          {departments.length > 0 ? (
            <div className="flex flex-col items-center">
              {renderTreeRecursive(
                treeNodes,
                onToggleExpand,
                onUpdateDepartment,
                onUpdateLeader,
                onDeleteEmployee,
                onCreateVirtualEmployee,
                onChangeDepartmentLevel,
                allEmployees
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center h-64 text-gray-400">
              <div className="text-center">
                <p className="text-lg mb-2">暂无组织架构数据</p>
                <p className="text-sm">请上传员工信息或组织架构模板</p>
              </div>
            </div>
          )}
        </div>
      </div>
      
      <DragOverlay>
        {dragData && dragData.type === 'employee' && (
          <div
            className="px-3 py-2 bg-white rounded-lg shadow-lg border border-indigo-300"
            style={{ 
              backgroundColor: ((dragData.data as Employee).level ? '#' + ((dragData.data as Employee).level.startsWith('L') ? 'FF' : '99') + 'FF' : '#FFFFFF') + '80'
            }}
          >
            <span className="text-sm">{(dragData.data as Employee).name}</span>
          </div>
        )}
        {dragData && dragData.type === 'department' && (
          <div
            className="px-4 py-3 bg-white rounded-xl shadow-xl border-2 border-indigo-400"
          >
            <span className="text-sm font-bold">{(dragData.data as Department).name}</span>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
