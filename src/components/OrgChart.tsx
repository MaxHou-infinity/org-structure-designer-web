import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, useSensor, useSensors, PointerSensor } from '@dnd-kit/core';
import { DepartmentCard } from './DepartmentCard';
import { Department, Employee } from '../types';
import { accumZoomWheel, applyZoomSteps } from '../utils/zoom';
import { employeeDeptMap } from '../utils/search';
import { SearchHighlight, SearchHighlightContext } from './SearchContext';

interface OrgChartProps {
  departments: Department[];
  onToggleExpand: (id: string) => void;
  onUpdateDepartment: (id: string, name: string) => void;
  onUpdateLeader: (deptId: string, employee: Employee | null) => void;
  onMoveEmployee: (empId: string, fromDeptId: string, toDeptId: string) => void;
  onMoveMultiple: (empIds: string[], toDeptId: string) => void;
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
  /** 载入内置行业模板（空状态吸引点，可选） */
  onLoadIndustryTemplate?: () => void;
  /** 搜索命中高亮（可选） */
  searchHighlight?: SearchHighlight;
}

interface TreeNode {
  department: Department;
  x: number;
  y: number;
  width: number;
  children: TreeNode[];
}

/** 无高亮时的空上下文默认值 */
const EMPTY_HIGHLIGHT: SearchHighlight = { deptIds: new Set(), empIds: new Set() };

/** 展开所有部门（供批量移动"目标部门"选择器用） */
function flattenDepts(depts: Department[]): { id: string; name: string; level: number }[] {
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
  selectedEmpIds: Set<string>,
  onToggleSelectEmp: (empId: string, additive: boolean) => void,
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
            selectedEmpIds={selectedEmpIds}
            onToggleSelectEmp={onToggleSelectEmp}
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
                selectedEmpIds,
                onToggleSelectEmp,
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
function EmptyStateHero({ onDownloadTemplate, onLoadTestData, onLoadIndustryTemplate }: {
  onDownloadTemplate: () => void;
  onLoadTestData: () => void;
  onLoadIndustryTemplate?: () => void;
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
            { n: '①', title: '导入数据', desc: '上传员工 Excel，或载入内置行业模板一键成型' },
            { n: '②', title: '拖拽调整', desc: '拖拽 / 框选批量移动员工，滚轮缩放画布' },
            { n: '③', title: '导出分享', desc: '导出 PNG / Excel / 诊断报告，或保存 .orgproj' },
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
          {onLoadIndustryTemplate && (
            <button
              onClick={onLoadIndustryTemplate}
              className="px-5 py-2.5 rounded-xl bg-emerald-500 text-white font-medium shadow-md hover:bg-emerald-600 hover:shadow-lg transition-all"
            >
              载入示例模板
            </button>
          )}
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
  onMoveMultiple,
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
  onLoadIndustryTemplate,
  searchHighlight,
}: OrgChartProps) {
  const [containerWidth, setContainerWidth] = useState(0);
  const [contentHeight, setContentHeight] = useState(0);
  const [dragData, setDragData] = useState<{ type: 'employee' | 'department'; data: Employee | Department } | null>(null);
  const [zoomHint, setZoomHint] = useState<number | null>(null);
  const isDraggingRef = useRef(false);
  const zoomHintTimer = useRef<number | null>(null);

  // —— 批量选择状态（v2.0.3 P0-1）——
  const [selectedEmpIds, setSelectedEmpIds] = useState<string[]>([]);
  const [frameRect, setFrameRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const frameStart = useRef<{ x: number; y: number } | null>(null);
  const selectedIdsRef = useRef<string[]>([]);
  // 同步 selectedEmpIds 到 ref（供 dragEnd 读取）
  useEffect(() => {
    selectedIdsRef.current = selectedEmpIds;
  }, [selectedEmpIds]);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const selectedSet = useMemo(() => new Set(selectedEmpIds), [selectedEmpIds]);

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

  // —— 框选：空白区拖拽出选择框（与 @dnd-kit 单拖拽隔离）——
  const handleFramePointerMove = useCallback((e: PointerEvent) => {
    if (!frameStart.current) return;
    const sx = frameStart.current.x;
    const sy = frameStart.current.y;
    setFrameRect({
      x: Math.min(sx, e.clientX),
      y: Math.min(sy, e.clientY),
      w: Math.abs(e.clientX - sx),
      h: Math.abs(e.clientY - sy),
    });
  }, []);

  const handleFramePointerUp = useCallback((e: PointerEvent) => {
    window.removeEventListener('pointermove', handleFramePointerMove);
    window.removeEventListener('pointerup', handleFramePointerUp);
    const start = frameStart.current;
    frameStart.current = null;
    setFrameRect(null);
    if (!start) return;

    const sx = start.x;
    const sy = start.y;
    const finalRect = {
      x: Math.min(sx, e.clientX),
      y: Math.min(sy, e.clientY),
      w: Math.abs(e.clientX - sx),
      h: Math.abs(e.clientY - sy),
    };

    // 极小的拖拽视为空白单击 → 非 Shift 则清空选择
    if (finalRect.w < 4 && finalRect.h < 4) {
      if (!e.shiftKey) setSelectedEmpIds([]);
      return;
    }

    // 框选：收集矩形内可见员工（getBoundingClientRect 已含 transform:scale）
    const container = wrapperRef.current ?? canvasRef.current;
    const hits: string[] = [];
    if (container) {
      const els = container.querySelectorAll<HTMLElement>('[data-emp-id]');
      els.forEach((el) => {
        const r = el.getBoundingClientRect();
        const inter = !(
          r.right < finalRect.x ||
          r.left > finalRect.x + finalRect.w ||
          r.bottom < finalRect.y ||
          r.top > finalRect.y + finalRect.h
        );
        if (inter) hits.push(el.dataset.empId as string);
      });
    }
    setSelectedEmpIds(hits);
  }, [handleFramePointerMove, canvasRef]);

  const handleFramePointerDown = (e: React.PointerEvent) => {
    if (departments.length === 0) return;
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    // 点/拖到卡片或员工上 → 交给 dnd / 点击选中，不启动框选
    if (target.closest('[data-dept-id]') || target.closest('[data-emp-id]')) return;
    frameStart.current = { x: e.clientX, y: e.clientY };
    setFrameRect({ x: e.clientX, y: e.clientY, w: 0, h: 0 });
    window.addEventListener('pointermove', handleFramePointerMove);
    window.addEventListener('pointerup', handleFramePointerUp);
  };

  const handleToggleSelectEmp = useCallback((empId: string, additive: boolean) => {
    setSelectedEmpIds((prev) => {
      if (additive) {
        return prev.includes(empId) ? prev.filter((id) => id !== empId) : [...prev, empId];
      }
      // 非 Shift：单选该员工
      return prev.length === 1 && prev[0] === empId ? prev : [empId];
    });
  }, []);

  useEffect(() => {
    return () => {
      window.removeEventListener('pointermove', handleFramePointerMove);
      window.removeEventListener('pointerup', handleFramePointerUp);
    };
  }, [handleFramePointerMove, handleFramePointerUp]);
  
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
    
    // 处理员工拖拽（支持批量）
    if (prevDragData?.type === 'employee') {
      const employee = prevDragData.data as Employee;
      if (!dropData || dropData.type !== 'department') return;
      const toDeptId = dropData.department.id;

      // 若拖拽的员工在选中集且选中数>1 → 批量移动
      const selected = selectedIdsRef.current;
      const idsToMove = selected.length > 1 && selected.includes(employee.id) ? selected : [employee.id];

      // 定位员工(们)所在部门（不一致时逐个处理）
      const locMap = employeeDeptMap(departments, idsToMove);
      const locatable = idsToMove.filter((id) => locMap.get(id));

      if (locatable.length === 0) {
        // 无法定位（异常），回退单拖拽逻辑
        let fromDeptId: string | null = null;
        const findEmployeeDept = (depts: Department[]): string | null => {
          for (const dept of depts) {
            if (dept.employees.some((emp) => emp.id === employee.id)) return dept.id;
            const found = findEmployeeDept(dept.children);
            if (found) return found;
          }
          return null;
        };
        fromDeptId = findEmployeeDept(departments);
        if (fromDeptId && fromDeptId !== toDeptId) onMoveEmployee(employee.id, fromDeptId, toDeptId);
        return;
      }

      if (locatable.length > 1) {
        onMoveMultiple(locatable, toDeptId);
        setSelectedEmpIds([]);
      } else if (locatable.length === 1) {
        const only = locatable[0];
        const fromDeptId = locMap.get(only);
        if (fromDeptId && fromDeptId !== toDeptId) {
          onMoveEmployee(only, fromDeptId, toDeptId);
        }
        // 单拖一个已选员工时不切多选（保留选择）
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
        ref={wrapperRef}
        onPointerDown={handleFramePointerDown}
        className="min-h-full relative"
        style={{
          width: departments.length > 0 ? totalWidth * scale : '100%',
          minHeight: departments.length > 0 ? contentHeight * scale : '100%',
          cursor: 'default',
        }}
        title="滚轮缩放（50-200%）"
      >
        <SearchHighlightContext.Provider value={searchHighlight ?? EMPTY_HIGHLIGHT}>
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
                allEmployees,
                selectedSet,
                handleToggleSelectEmp
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
            <EmptyStateHero
              onDownloadTemplate={onDownloadTemplate}
              onLoadTestData={onLoadTestData}
              onLoadIndustryTemplate={onLoadIndustryTemplate}
            />
          </div>
        )}

        {/* 缩放反馈气泡（相对 wrapper 定位，始终可见） */}
        {zoomHint !== null && (
          <div className="absolute top-3 left-3 px-2.5 py-1 rounded-lg bg-slate-900/80 text-white text-xs font-semibold backdrop-blur-sm pointer-events-none animate-fadeIn">
            {zoomHint}%
          </div>
        )}

        {/* 框选选择框（viewport 坐标，fixed 定位） */}
        {frameRect && frameRect.w > 0 && (
          <div
            className="fixed pointer-events-none z-[60] rounded-md border-2 border-indigo-400 bg-indigo-400/10"
            style={{
              left: frameRect.x,
              top: frameRect.y,
              width: frameRect.w,
              height: frameRect.h,
            }}
          />
        )}

        {/* 批量选择浮动工具条（多选开启时显示） */}
        {selectedEmpIds.length > 0 && (
          <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[70] flex items-center gap-2.5 px-4 py-2 rounded-full bg-slate-900/85 text-white text-sm font-medium shadow-xl backdrop-blur-sm animate-fadeInUp">
            <span className="flex items-center gap-1.5">
              已选 <span className="text-indigo-300 font-bold">{selectedEmpIds.length}</span> 人
            </span>
            <select
              defaultValue="__none__"
              onChange={(e) => {
                const id = e.target.value;
                if (id && id !== '__none__') {
                  onMoveMultiple(selectedEmpIds, id);
                  setSelectedEmpIds([]);
                }
              }}
              title="批量移动到目标部门"
              className="px-2.5 py-1 rounded-full bg-white/15 hover:bg-white/25 text-xs text-white outline-none focus-ring [&>option]:text-slate-700"
            >
              <option value="__none__" disabled>移动到…</option>
              {flattenDepts(departments).map((d) => (
                <option key={d.id} value={d.id}>
                  {'　'.repeat(Math.min(d.level - 1, 3))}{d.name}
                </option>
              ))}
            </select>
            <span className="text-xs text-white/60 hidden sm:inline">或拖拽到目标部门</span>
            <button
              onClick={() => setSelectedEmpIds([])}
              className="ml-1 px-2.5 py-1 rounded-full bg-white/15 hover:bg-white/25 text-xs transition-colors"
            >
              清除选择
            </button>
          </div>
        )}
        </SearchHighlightContext.Provider>
      </div>
      
      <DragOverlay>
        {dragData && dragData.type === 'employee' && (
          (() => {
            const emp = dragData.data as Employee;
            const batchCount =
              selectedIdsRef.current.includes(emp.id) && selectedIdsRef.current.length > 1
                ? selectedIdsRef.current.length
                : 0;
            return batchCount > 1 ? (
              <div className="px-4 py-3 bg-white rounded-xl shadow-xl border-2 border-indigo-400 min-w-[170px]">
                <span className="text-sm font-bold text-indigo-600">移动 {batchCount} 名员工</span>
                <span className="block text-xs text-slate-400 mt-1">拖到目标部门批量移动</span>
              </div>
            ) : (
              <div
                className="px-3 py-2 bg-white rounded-lg shadow-lg border border-indigo-300"
                style={{
                  backgroundColor:
                    ((emp.level ? '#' + (emp.level.startsWith('L') ? 'FF' : '99') + 'FF' : '#FFFFFF') +
                      '80'),
                }}
              >
                <span className="text-sm">{emp.name}</span>
              </div>
            );
          })()
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
