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
  onCreateVirtualFromEmployee: (deptId: string, empId: string) => void;
  onSetTargetLevel: (empId: string, target: string) => void;
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
/**
 * 计算一个部门的"叶子数"（用于分配子树宽度带）：
 * - 无子部门 或 未展开（折叠）→ 1（它自身仍渲染为一张卡片）
 * - 否则 → 递归累加每个子部门的叶子数。
 * 注意：折叠的子部门要计为 1（它仍占一个卡位的宽度），不能用 filter(expanded) 排除，
 * 否则那部分宽度会丢失、与相邻部门重叠。
 */
export function countLeaves(dept: Department): number {
  if (dept.children.length === 0 || !dept.expanded) return 1;
  return dept.children.reduce((sum, c) => sum + (c.expanded ? countLeaves(c) : 1), 0);
}

/**
 * 方案 A：真正使用坐标做绝对定位的树布局。
 *
 * 每个部门占据一个「子树宽度带」= countLeaves(dept) * 卡宽 + (叶子数-1) * 水平间距。
 * 节点自身卡片居中放在其子树带中点，子部门在同一带内从左到右依次排布。
 * 这样保证：父部门水平居中于其子部门上方（经典组织树），层级间距一致。
 *
 * 关键：水平间距必须全局统一（父带宽与子部门排布用同一间距），否则父卡无法正好
 * 居中在子部门块上、且各层左右间距不一致 → 视觉杂乱。垂直步进也固定。
 *
 * 坐标以 100% 缩放基准计算（卡宽=220、层级步进=240），实际缩放由外层 transform:scale 完成。
 */
export function calculateTreeLayout(
  departments: Department[],
  parentX: number,
  parentY: number,
  zoom: number,
): TreeNode[] {
  if (departments.length === 0) return [];

  const cardWidth = 220 * (zoom / 100);
  const horizontalGap = 80 * (zoom / 100); // 全局统一水平间距（跨层级一致）
  const verticalGap = 40 * (zoom / 100);
  const levelStep = 200 * (zoom / 100) + verticalGap; // 固定垂直步进（200 卡高 + 40 间距）

  // 一个部门子树占用的水平宽度带（像素）
  const bandWidth = (dept: Department): number => {
    const leaves = countLeaves(dept);
    return leaves * cardWidth + (leaves - 1) * horizontalGap;
  };

  // 在同一 Y 上从左到右摆放一组兄弟部门；返回节点数组（含已递归摆好的子部门）。
  const layoutRow = (depts: Department[], leftX: number, y: number): TreeNode[] => {
    const nodes: TreeNode[] = [];
    let cursor = leftX;
    for (const dept of depts) {
      const band = bandWidth(dept);
      const isExpandedParent = dept.children.length > 0 && dept.expanded;

      let children: TreeNode[] = [];
      if (isExpandedParent) {
        // 子部门占用父部门的整个宽度带，从带的左缘开始排布 → 父卡片中心恰好落在子部门块中点
        children = layoutRow(dept.children, cursor, y + levelStep);
      }

      const cardCenterX = cursor + band / 2;
      const nodeX = cardCenterX - cardWidth / 2;

      nodes.push({
        department: dept,
        x: nodeX,
        y,
        width: band,
        children,
      });

      cursor += band + horizontalGap; // 兄弟间留固定间距
    }
    return nodes;
  };

  return layoutRow(departments, parentX, parentY);
}

/**
 * 生成父→子连接线（引导线）的 SVG 路径。
 * 经典组织树走线：父卡底部中点 → 垂直降到水平总线 → 水平延伸到每个子卡中点 → 垂直降到子卡顶部。
 * 坐标为 100% 缩放基准（与卡片坐标一致），实际缩放由外层 transform:scale 完成。
 */
function computeConnectors(
  nodes: TreeNode[],
  cardWidth: number,
  cardHeight: number,
): string[] {
  const paths: string[] = [];
  const walk = (list: TreeNode[]) => {
    for (const n of list) {
      if (n.children.length > 0) {
        const parentCx = n.x + cardWidth / 2;
        const parentBottom = n.y + cardHeight;
        const firstChild = n.children[0];
        const lastChild = n.children[n.children.length - 1];
        const busY = parentBottom + (firstChild.y - parentBottom) / 2; // 父底与子顶的中点

        const firstCx = firstChild.x + cardWidth / 2;
        const lastCx = lastChild.x + cardWidth / 2;

        // 主干：父底 → 总线高度（垂直）
        paths.push(`M ${parentCx} ${parentBottom} L ${parentCx} ${busY}`);
        // 总线：从第一个子卡中线到最后一个子卡中线（水平）
        paths.push(`M ${firstCx} ${busY} L ${lastCx} ${busY}`);
        // 每个子卡：总线高度 → 子卡顶（垂直）
        for (const c of n.children) {
          const cx = c.x + cardWidth / 2;
          paths.push(`M ${cx} ${busY} L ${cx} ${c.y}`);
        }
      }
      walk(n.children);
    }
  };
  walk(nodes);
  return paths;
}

/** 卡片基础尺寸（与 calculateTreeLayout 的 200px 层级步进一致） */
const CARD_WIDTH = 220;
const CARD_HEIGHT = 200;

/**
 * 绝对定位渲染组织树（方案 A）：所有部门卡片平铺在 canvasRef 直接子级，
 * 用 calculateTreeLayout 算出的全局 x/y 坐标定位。
 * 注意：不能把子部门嵌套在父部门 div 内（position:absolute 会相对父部门而非 canvasRef）。
 */
function flattenTreeNodes(nodes: TreeNode[]): TreeNode[] {
  const out: TreeNode[] = [];
  const walk = (list: TreeNode[]) => {
    for (const n of list) {
      out.push(n);
      walk(n.children);
    }
  };
  walk(nodes);
  return out;
}

const renderTreeRecursive = (
  nodes: TreeNode[],
  onToggleExpand: (id: string) => void,
  onUpdateDepartment: (id: string, name: string) => void,
  onUpdateLeader: (deptId: string, employee: Employee | null) => void,
  onDeleteEmployee: (deptId: string, empId: string) => void,
  onCreateVirtualFromEmployee: (deptId: string, empId: string) => void,
  onChangeDepartmentLevel: (deptId: string, newLevel: number, newParentId: string | null) => void,
  onSetTargetLevel: (empId: string, target: string) => void,
  onMoveMultiple: (empIds: string[], toDeptId: string) => void,
  allDepartments: Department[],
  allEmployees: Employee[],
  selectedEmpIds: Set<string>,
  onToggleSelectEmp: (empId: string, additive: boolean) => void,
): React.ReactNode => {
  // 扁平化所有节点，全部相对 canvasRef 绝对定位（全局坐标）
  const flat = flattenTreeNodes(nodes);
  if (flat.length === 0) return null;

  return (
    <>
      {flat.map((node) => (
        <div
          key={node.department.id}
          className="absolute"
          style={{ left: node.x, top: node.y, width: CARD_WIDTH }}
        >
          <DepartmentCard
            department={node.department}
            onToggleExpand={onToggleExpand}
            onUpdateDepartment={onUpdateDepartment}
            onUpdateLeader={onUpdateLeader}
            onDeleteEmployee={onDeleteEmployee}
            onCreateVirtualFromEmployee={onCreateVirtualFromEmployee}
            onChangeDepartmentLevel={onChangeDepartmentLevel}
            onSetTargetLevel={onSetTargetLevel}
            onMoveMultiple={onMoveMultiple}
            allDepartments={allDepartments}
            allEmployees={allEmployees}
            selectedEmpIds={selectedEmpIds}
            onToggleSelectEmp={onToggleSelectEmp}
          />
        </div>
      ))}
    </>
  );
};

/** 计算布局总高度：所有节点的最大 y + 卡片高度（缩放前基准） */
function computeLayoutHeight(nodes: TreeNode[]): number {
  let maxY = 0;
  const walk = (list: TreeNode[]) => {
    for (const n of list) {
      maxY = Math.max(maxY, n.y);
      walk(n.children);
    }
  };
  walk(nodes);
  return maxY + CARD_HEIGHT;
}

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
  onCreateVirtualFromEmployee,
  onSetTargetLevel,
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

  // —— 空白区拖拽平移画布（按住向上下左右拖改变视口位置）——
  const dragPanRef = useRef<{ startX: number; startY: number; scrollLeft: number; scrollTop: number } | null>(null);
  const [isPanning, setIsPanning] = useState(false);

  // 画布区滚轮/触控板：
  //   触控板「双指捏合放大/缩小」在浏览器中会触发 ctrlKey=true 的 wheel 事件（或 metaKey，mac Cmd），
  //   因此只有 ctrl/meta + wheel 才做缩放。
  //   触控板「双指上下左右滑动」= 普通 wheel（ctrlKey=false），默认行为就是平移视口（滚动容器），
  //   这里直接放行、不 preventDefault，让浏览器原生滚动完成上下/左右平移（对应 bug 2）。
  //   缩放做「增量累积 + 阈值」衰减，避免轻微一滚就跳几十个百分点。
  const wheelAccumRef = useRef(0);
  useEffect(() => {
    const el = zoomContainerRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      // 拖拽中抑制缩放，避免误触
      if (isDraggingRef.current) return;

      // 只有「捏合/Ctrl+滚轮」才是缩放；其余（双指滑动、普通滚轮）= 平移，放行给浏览器原生滚动
      if (!(e.ctrlKey || e.metaKey)) return;

      // 到浏览器缩放边界（如系统级 100%）时放行默认，避免卡死
      const { accumulated, steps } = accumZoomWheel(wheelAccumRef.current, e.deltaY);
      wheelAccumRef.current = accumulated;
      if (steps === 0) return;

      const newZoom = applyZoomSteps(zoom, steps);
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

  // —— 框选：Shift+空白区拖拽出选择框（与 @dnd-kit 单拖拽隔离）。
  //    普通空白区拖拽 → 平移画布（见 dragPanRef 相关 handler）——
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

  // —— 空白区拖拽平移画布 ——
  const handlePanPointerMove = useCallback((e: PointerEvent) => {
    const pan = dragPanRef.current;
    const el = zoomContainerRef.current;
    if (!pan || !el) return;
    const dx = e.clientX - pan.startX;
    const dy = e.clientY - pan.startY;
    el.scrollLeft = pan.scrollLeft - dx;
    el.scrollTop = pan.scrollTop - dy;
  }, [zoomContainerRef]);

  const handlePanPointerEnd = useCallback(() => {
    window.removeEventListener('pointermove', handlePanPointerMove);
    window.removeEventListener('pointerup', handlePanPointerEnd);
    dragPanRef.current = null;
    setIsPanning(false);
  }, [handlePanPointerMove]);

  const handleFramePointerDown = (e: React.PointerEvent) => {
    if (departments.length === 0) return;
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    // 点/拖到卡片或员工上 → 交给 dnd / 点击选中，不启动框选或画布平移
    if (target.closest('[data-dept-id]') || target.closest('[data-emp-id]')) return;
    const el = zoomContainerRef.current;

    // Shift + 空白拖拽 → 框选（多选员工）；否则 → 平移画布（bug 3）
    if (e.shiftKey) {
      frameStart.current = { x: e.clientX, y: e.clientY };
      setFrameRect({ x: e.clientX, y: e.clientY, w: 0, h: 0 });
      window.addEventListener('pointermove', handleFramePointerMove);
      window.addEventListener('pointerup', handleFramePointerUp);
    } else if (el) {
      dragPanRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        scrollLeft: el.scrollLeft,
        scrollTop: el.scrollTop,
      };
      setIsPanning(true);
      window.addEventListener('pointermove', handlePanPointerMove);
      window.addEventListener('pointerup', handlePanPointerEnd);
    }
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
      window.removeEventListener('pointermove', handlePanPointerMove);
      window.removeEventListener('pointerup', handlePanPointerEnd);
    };
  }, [handleFramePointerMove, handleFramePointerUp, handlePanPointerMove, handlePanPointerEnd]);
  
  // 测量未缩放内容宽度（供 totalWidth 兜底；高度由 calculateTreeLayout 计算，不再依赖 scrollHeight）
  useEffect(() => {
    const updateWidth = () => {
      if (canvasRef.current) {
        setContainerWidth(canvasRef.current.scrollWidth);
      }
    };
    
    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, [departments, zoom, canvasRef]);
  
  // 首次加载数据后，滚动到树中心，让组织架构显示在视觉中央（而非左上角）
  const hadDataRef = useRef(false);
  useEffect(() => {
    if (departments.length === 0) { hadDataRef.current = false; return; }
    const firstLoad = !hadDataRef.current;
    hadDataRef.current = true;
    if (firstLoad) {
      // 等布局渲染后滚动到中心（树中心 = canvas 宽度一半 * scale - 视口一半）
      requestAnimationFrame(() => {
        const el = zoomContainerRef.current;
        const canvas = canvasRef.current;
        if (el && canvas) {
          const scale = zoom / 100;
          const targetLeft = (canvas.offsetWidth * scale - el.clientWidth) / 2;
          const targetTop = (canvas.offsetHeight * scale - el.clientHeight) / 2;
          el.scrollLeft = Math.max(0, targetLeft);
          el.scrollTop = Math.max(0, targetTop);
        }
      });
    }
  }, [departments, zoom, zoomContainerRef, canvasRef]);
  
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
  // 方案 A：布局宽度/高度都由坐标树计算（与绝对定位坐标一致，而非累加根 width）
  const layoutHeight = computeLayoutHeight(treeNodes);
  // 遍历所有节点取 max(x + width)，确保 wrapper 包住最右的部门（含子部门）
  const layoutWidth = (() => {
    let maxRight = 0;
    const walk = (list: TreeNode[]) => {
      for (const n of list) {
        maxRight = Math.max(maxRight, n.x + n.width);
        walk(n.children);
      }
    };
    walk(treeNodes);
    return maxRight;
  })();
  const totalWidth = Math.max(containerWidth, layoutWidth);
  const canvasWidth = Math.max(totalWidth + 64, 100); // +padding p-8 (32*2)
  
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
          width: departments.length > 0 ? canvasWidth * scale : '100%',
          minHeight: departments.length > 0 ? (layoutHeight + 64) * scale : '100%',
          cursor: isPanning ? 'grabbing' : 'default',
        }}
        title="捏合/Ctrl+滚轮缩放 · 双指滑动或拖拽空白区平移"
      >
        <SearchHighlightContext.Provider value={searchHighlight ?? EMPTY_HIGHLIGHT}>
        {departments.length > 0 ? (
          <div
            ref={canvasRef}
            className="p-8 relative"
            style={{
              width: canvasWidth,
              height: layoutHeight + 64,
              transform: `scale(${scale})`,
              transformOrigin: 'top left',
            }}
          >
            {/* 引导线层：父→子连接线，绝对定位铺满画布，位于卡片下方（先渲染） */}
            {(() => {
              const connectorPaths = computeConnectors(treeNodes, CARD_WIDTH, CARD_HEIGHT);
              if (connectorPaths.length === 0) return null;
              return (
                <svg
                  className="absolute inset-0 pointer-events-none"
                  style={{ left: 0, top: 0 }}
                  width={layoutWidth}
                  height={layoutHeight}
                  viewBox={`0 0 ${layoutWidth} ${layoutHeight}`}
                >
                  {connectorPaths.map((d, i) => (
                    <path
                      key={i}
                      d={d}
                      fill="none"
                      stroke="#CBD5E1"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  ))}
                </svg>
              );
            })()}
            {renderTreeRecursive(
              treeNodes,
              onToggleExpand,
              onUpdateDepartment,
              onUpdateLeader,
              onDeleteEmployee,
              onCreateVirtualFromEmployee,
              onChangeDepartmentLevel,
              onSetTargetLevel,
              onMoveMultiple,
              departments,
              allEmployees,
              selectedSet,
              handleToggleSelectEmp
            )}
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
