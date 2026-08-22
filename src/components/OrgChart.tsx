import { useState, useEffect, useRef } from 'react';
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, useSensor, useSensors, PointerSensor } from '@dnd-kit/core';
import { DepartmentCard } from './DepartmentCard';
import { Department, Employee } from '../types';
import { accumZoomWheel, applyZoomSteps } from '../utils/zoom';

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
  zoomContainerRef: React.RefObject<HTMLDivElement>;
  onZoomChange: (nextZoom: number) => void;
  onDownloadTemplate: () => void;
  onLoadTestData: () => void;
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

/** 空状态 Hero（初次使用引导）：三步引导 + CTA */
function EmptyStateHero({ onDownloadTemplate, onLoadTestData }: {
  onDownloadTemplate: () => void;
  onLoadTestData: () => void;
}) {
  return (
    <div className="flex items-center justify-center min-h-full p-10">
      <div className="max-w-lg w-full rounded-3xl bg-white/70 backdrop-blur-xl border border-white/60 shadow-soft p-10 text-center animate-fadeInUp">
        <div className="mx-auto w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500/15 to-violet-500/15 grid place-items-center text-indigo-500 mb-6">
          <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <rect x="3" y="4" width="7" height="6" rx="1.5" />
            <rect x="14" y="4" width="7" height="6" rx="1.5" />
            <rect x="8.5" y="14" width="7" height="6" rx="1.5" />
            <path d="M6.5 10v2.5h4v1.5M17.5 10v2.5" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-slate-900 tracking-tight mb-2">开始设计您的组织架构</h2>
        <p className="text-sm text-slate-500 mb-8">三步即可在几分钟内生成专业组织架构图</p>

        <div className="space-y-4 text-left mb-8">
          {[
            { n: '①', title: '下载模板', desc: '去【工具模板】下载「员工信息」「组织架构」模板' },
            { n: '②', title: '填写数据', desc: '按模板列填写员工与部门信息' },
            { n: '③', title: '上传文件', desc: '在左侧「文件上传」上传 Excel' },
          ].map((step) => (
            <div key={step.n} className="flex items-start gap-3">
              <span className="w-7 h-7 rounded-full bg-indigo-500 text-white text-sm font-semibold grid place-items-center shrink-0">{step.n}</span>
              <div>
                <div className="text-sm font-semibold text-slate-800">{step.title}</div>
                <div className="text-xs text-slate-500">{step.desc}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-center gap-3">
          <button
            onClick={onDownloadTemplate}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 text-white font-medium shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all"
          >
            去下载模板
          </button>
          <button
            onClick={onLoadTestData}
            className="px-5 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-600 font-medium hover:bg-slate-50 hover:shadow-sm transition-all"
          >
            载入示例数据
          </button>
        </div>
      </div>
    </div>
  );
}

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
  zoomContainerRef,
  onZoomChange,
  onDownloadTemplate,
  onLoadTestData,
}: OrgChartProps) {
  const [containerWidth, setContainerWidth] = useState(0);
  const [contentHeight, setContentHeight] = useState(0);
  const [dragData, setDragData] = useState<{ type: 'employee' | 'department'; data: Employee | Department } | null>(null);
  const [zoomHint, setZoomHint] = useState<number | null>(null);
  const isDraggingRef = useRef(false);
  const zoomHintTimer = useRef<number | null>(null);

  // 画布区滚轮缩放：以光标为中心（Figma/白板画布直觉）。
  // 触控板/鼠标会产生高频小幅 delta，因此做「增量累积 + 阈值」衰减，
  // 避免轻微一滚就跳几十个百分点；累积超过阈值（±120px）才触发一次缩放。
  // 需 non-passive 监听并 preventDefault：Ctrl/Cmd+滚轮会触发浏览器页面缩放，必须拦截。
  const wheelAccumRef = useRef(0);
  useEffect(() => {
    const el = zoomContainerRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      // 拖拽中抑制缩放，避免误触
      if (isDraggingRef.current) return;

      // Shift + 滚轮 → 横向平移
      if (e.shiftKey) {
        e.preventDefault();
        el.scrollLeft += e.deltaY;
        return;
      }

      // 累积增量；阈值越大缩放越"钝"，触控板手感越稳。取 120px 约等于一次标准滚轮。
      const { accumulated, steps } = accumZoomWheel(wheelAccumRef.current, e.deltaY);
      wheelAccumRef.current = accumulated;
      if (steps === 0) return;

      const newZoom = applyZoomSteps(zoom, steps);
      // 已到边界（如 50/200）：放行默认滚动，避免手感卡死
      if (newZoom === zoom) return;

      const scaleOld = zoom / 100;
      const scaleNew = newZoom / 100;
      e.preventDefault();

      // 以光标为中心：offset = 光标相对画布容器左上角
      const rect = el.getBoundingClientRect();
      const offsetX = e.clientX - rect.left;
      const offsetY = e.clientY - rect.top;
      el.scrollLeft = (el.scrollLeft + offsetX) * (scaleNew / scaleOld) - offsetX;
      el.scrollTop = (el.scrollTop + offsetY) * (scaleNew / scaleOld) - offsetY;

      setZoomHint(newZoom);
      if (zoomHintTimer.current) window.clearTimeout(zoomHintTimer.current);
      zoomHintTimer.current = window.setTimeout(() => setZoomHint(null), 800);

      onZoomChange(newZoom);
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [zoom, onZoomChange, zoomContainerRef]);

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
    isDraggingRef.current = true;
    const data = event.active.data.current;
    if (data?.type === 'department') {
      setDragData({ type: 'department', data: data.department });
    } else if (data?.type === 'employee' || data?.id) {
      setDragData({ type: 'employee', data: data as Employee });
    }
  };
  
  const handleDragEnd = (event: DragEndEvent) => {
    isDraggingRef.current = false;
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
      {/* 外层 wrapper：有数据时占位缩放后的滚动区域尺寸；空状态铺满画布视口 */}
      <div
        className="min-h-full relative"
        style={{
          width: departments.length > 0 ? totalWidth * scale : '100%',
          minHeight: departments.length > 0 ? contentHeight * scale : '100%',
          cursor: 'default',
        }}
        title="滚轮缩放（50-200%）"
      >
        {departments.length > 0 ? (
          <div
            ref={canvasRef}
            className="min-h-full p-8"
            style={{ 
              minWidth: totalWidth,
              transform: `scale(${scale})`,
              transformOrigin: 'top left'
            }}
          >
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
          </div>
        ) : (
          /* 空状态：铺满画布视口（不套 transform:scale），始终固定居中，
             不受缩放影响，避免 Hero 偏移/溢出导致文案排版错乱 */
          <div
            ref={canvasRef}
            className="min-h-full w-full"
            style={{ minWidth: '100%' }}
          >
            <EmptyStateHero onDownloadTemplate={onDownloadTemplate} onLoadTestData={onLoadTestData} />
          </div>
        )}

        {/* 缩放反馈气泡（相对 wrapper 定位，始终可见） */}
        {zoomHint !== null && (
          <div className="absolute top-3 left-3 px-2.5 py-1 rounded-lg bg-slate-900/80 text-white text-xs font-semibold backdrop-blur-sm pointer-events-none animate-fadeIn">
            {zoomHint}%
          </div>
        )}
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
