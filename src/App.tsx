import { useRef, useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Sidebar } from './components/Sidebar';
import { OrgChart } from './components/OrgChart';
import { TopBar } from './components/TopBar';
import { LevelManagerModal } from './components/LevelManagerModal';
import { HealthDrawer } from './components/HealthDrawer';
import { ProjectModal } from './components/ProjectModal';
import { DiagnosticReport } from './components/DiagnosticReport';
import { ScenarioDiffView } from './components/ScenarioDiffView';
import { ManagementReport } from './components/ManagementReport';
import { SearchModal } from './components/SearchModal';
import { OnboardingOverlay } from './components/OnboardingOverlay';
import { UnassignedEmployeesDrawer } from './components/UnassignedEmployeesDrawer';
import { computeUnassignedEmployees } from './utils/analytics';
import { SearchHighlight } from './components/SearchContext';
import { Employee, Department, OrgTemplate, Position } from './types';
import { expandDepartments, SearchMatch } from './utils/search';
import { computePositionSummary } from './utils/analytics';
import { computeMatchStates } from './utils/match';
import { flattenAllPositions } from './components/positionUtils';
import { uid } from './utils/project';
import { moveEmployeesBetween } from './utils/departments';
import { findIndustryTemplate, loadIndustryTemplate } from './utils/industryTemplates';
import {
  parseEmployeeExcel,
  parseOrgTemplateExcel,
  buildDepartmentTree,
  exportToExcel,
  generateSampleEmployeeTemplate,
  generateSampleOrgTemplate,
  getImportErrorMessage,
} from './utils/excel';
import { saveTextFile, saveFile } from './utils/tauri';
import { useOrgWorkspace } from './utils/useOrgWorkspace';

const EMPTY_HIGHLIGHT: SearchHighlight = { deptIds: new Set(), empIds: new Set() };

// 测试数据
const TEST_EMPLOYEES = [
  { name: '张三', employeeId: 'E001', level: 'L1.1', dept1: '技术部', dept2: '研发组', dept3: '后端', dept4: '', dept5: '', dept6: '' },
  { name: '李四', employeeId: 'E002', level: 'L2.1', dept1: '技术部', dept2: '研发组', dept3: '后端', dept4: '', dept5: '', dept6: '' },
  { name: '王五', employeeId: 'E003', level: 'L3.1', dept1: '技术部', dept2: '研发组', dept3: '前端', dept4: '', dept5: '', dept6: '' },
  { name: '赵六', employeeId: 'E004', level: 'L1.2', dept1: '技术部', dept2: '测试组', dept3: '功能测试', dept4: '', dept5: '', dept6: '' },
  { name: '钱七', employeeId: 'E005', level: 'L2.2', dept1: '技术部', dept2: '测试组', dept3: '自动化测试', dept4: '', dept5: '', dept6: '' },
  { name: '孙八', employeeId: 'E006', level: 'L3.2', dept1: '技术部', dept2: '运维组', dept3: '运维', dept4: '', dept5: '', dept6: '' },
  { name: '周九', employeeId: 'E007', level: 'E3.1', dept1: '销售部', dept2: '华东区', dept3: '', dept4: '', dept5: '', dept6: '' },
  { name: '吴十', employeeId: 'E008', level: 'E3.2', dept1: '销售部', dept2: '华北区', dept3: '', dept4: '', dept5: '', dept6: '' },
  { name: '郑十一', employeeId: 'E009', level: 'L4.1', dept1: '销售部', dept2: '华南区', dept3: '', dept4: '', dept5: '', dept6: '' },
  { name: '陈十二', employeeId: 'E010', level: 'L5', dept1: '人力资源部', dept2: '招聘组', dept3: '', dept4: '', dept5: '', dept6: '' },
];

const TEST_ORG: OrgTemplate[] = [
  { dept1: '技术部', dept2: '研发组', dept3: '后端', dept4: '', dept5: '', dept6: '', deptLevel: '1', leaderId: 'E001', leaderName: '张三' },
  { dept1: '技术部', dept2: '研发组', dept3: '前端', dept4: '', dept5: '', dept6: '', deptLevel: '2', leaderId: 'E003', leaderName: '王五' },
  { dept1: '技术部', dept2: '测试组', dept3: '功能测试', dept4: '', dept5: '', dept6: '', deptLevel: '2', leaderId: 'E004', leaderName: '赵六' },
  { dept1: '技术部', dept2: '测试组', dept3: '自动化测试', dept4: '', dept5: '', dept6: '', deptLevel: '2', leaderId: 'E005', leaderName: '钱七' },
  { dept1: '技术部', dept2: '运维组', dept3: '运维', dept4: '', dept5: '', dept6: '', deptLevel: '2', leaderId: 'E006', leaderName: '孙八' },
  { dept1: '销售部', dept2: '华东区', dept3: '', dept4: '', dept5: '', dept6: '', deptLevel: '2', leaderId: 'E007', leaderName: '周九' },
  { dept1: '销售部', dept2: '华北区', dept3: '', dept4: '', dept5: '', dept6: '', deptLevel: '2', leaderId: 'E008', leaderName: '吴十' },
  { dept1: '销售部', dept2: '华南区', dept3: '', dept4: '', dept5: '', dept6: '', deptLevel: '2', leaderId: 'E009', leaderName: '郑十一' },
  { dept1: '人力资源部', dept2: '招聘组', dept3: '', dept4: '', dept5: '', dept6: '', deptLevel: '1', leaderId: 'E010', leaderName: '陈十二' },
];

// 查找部门辅助函数（模块级纯函数，不依赖组件状态）
function findDept(depts: Department[], id: string): Department | null {
  for (const dept of depts) {
    if (dept.id === id) return dept;
    const found = findDept(dept.children, id);
    if (found) return found;
  }
  return null;
}

/** 递归对部门树内所有同 id 员工应用补丁（岗位套岗/取消套岗等跨部门一致更新用）。 */
function mapEmployeesInDepts(
  depts: Department[],
  empId: string,
  patch: (e: Employee) => Employee,
): Department[] {
  return depts.map((d) => ({
    ...d,
    employees: d.employees.map((e) => (e.id === empId ? patch(e) : e)),
    children: mapEmployeesInDepts(d.children, empId, patch),
  }));
}

/** 部门 id → 祖先链（含自身，根在前）；不存在返回 null（供画布定位展开祖先）。 */
function findDeptChain(depts: Department[], id: string): string[] | null {
  const walk = (list: Department[], path: string[]): string[] | null => {
    for (const d of list) {
      const next = [...path, d.id];
      if (d.id === id) return next;
      const child = walk(d.children, next);
      if (child) return child;
    }
    return null;
  };
  return walk(depts, []);
}

export default function App() {
  const ws = useOrgWorkspace();
  const {
    departments,
    allEmployeesFlat,
    zoom,
    setZoom,
    levelConfigs,
    setDepartments,
    setBoth,
    undo,
    redo,
    canUndo,
    canRedo,
    switchScenario,
    createNewScenario,
    duplicateScenario,
    renameScenario,
    deleteScenario,
    renameProject,
    exportProjectJson,
    importProjectJson,
    resetWorkspace,
    project,
    currentScenario,
    saveState,
    lastSavedAt,
    flushCurrent,
  } = ws;

  const [levelManagerOpen, setLevelManagerOpen] = useState(false);
  const [healthOpen, setHealthOpen] = useState(false);
  const [healthFocusDeptId, setHealthFocusDeptId] = useState<string | undefined>();
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  // v2.0.9：场景差异比较 + 管理层报告（运行时派生，不新增持久化字段）
  const [scenarioDiffOpen, setScenarioDiffOpen] = useState(false);
  const [diffBaselineId, setDiffBaselineId] = useState<string>('');
  const [diffTargetId, setDiffTargetId] = useState<string>('');
  const [mgmtReportOpen, setMgmtReportOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchHighlight, setSearchHighlight] = useState<SearchHighlight>(EMPTY_HIGHLIGHT);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [unassignedOpen, setUnassignedOpen] = useState(false);
  // v2.0.3 修复：保存"当前组织架构模板"，员工上传时用它重建以保留模板负责人/层级结构
  const [orgTemplates, setOrgTemplates] = useState<OrgTemplate[]>([]);
  const canvasRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLDivElement>(null);
  // v2.0.5 修复：用 ref 读取最新 allEmployeesFlat / orgTemplates，避免导入 handler 闭包捕获旧值（模板载入后导入不快/不刷新的根因）
  const allEmployeesRef = useRef(allEmployeesFlat);
  useEffect(() => { allEmployeesRef.current = allEmployeesFlat; }, [allEmployeesFlat]);
  const orgTemplatesRef = useRef(orgTemplates);
  useEffect(() => { orgTemplatesRef.current = orgTemplates; }, [orgTemplates]);

  // 首次进入引导：localStorage 标记，默认未看过则展示（v2.0.3 P2-6）
  useEffect(() => {
    try {
      if (typeof localStorage === 'undefined') return;
      const seen = localStorage.getItem('org-designer.onboarded');
      if (!seen) {
        setOnboardingOpen(true);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const dismissOnboarding = useCallback(() => {
    try {
      if (typeof localStorage !== 'undefined') localStorage.setItem('org-designer.onboarded', '1');
    } catch {
      /* ignore */
    }
    setOnboardingOpen(false);
  }, []);


  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2200);
  }, []);

  // v2.0.7 首次进入引导：画布默认显示岗位/职级，提示可在左侧「画布显示」开关
  useEffect(() => {
    try {
      if (typeof localStorage === 'undefined') return;
      if (!localStorage.getItem('org-designer.display-hint')) {
        localStorage.setItem('org-designer.display-hint', '1');
        const t = window.setTimeout(() => showToast('画布已默认显示 岗位/职级；可在左侧「画布显示」开关'), 700);
        return () => window.clearTimeout(t);
      }
    } catch {
      /* ignore */
    }
  }, [showToast]);

  // 撤销/重做键盘：Ctrl/Cmd+Z 撤销，Ctrl/Cmd+Shift+Z（或 Ctrl+Y）重做
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      // Ctrl/Cmd+F → 应用级搜索
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setSearchOpen(true);
        return;
      }
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)) return;
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        undo();
      } else if (((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'z') || ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'y')) {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [undo, redo]);

  /** —— 文件操作 —— */
  const handleEmployeeFileUpload = useCallback(async (file: File) => {
    try {
      const parsedEmployees = await parseEmployeeExcel(file);
      // 用已保存的组织模板（若有）重建，保留模板的部门层级与负责人结构
      const tree = buildDepartmentTree(parsedEmployees, orgTemplatesRef.current);
      setBoth(() => ({ departments: tree, allEmployeesFlat: parsedEmployees }));
      if (parsedEmployees.length > 0) {
        showToast(`已导入 ${parsedEmployees.length} 名员工`);
      } else {
        showToast('员工文件无有效数据，请检查格式');
      }
    } catch (error) {
      console.error('解析员工文件失败:', error);
      showToast(getImportErrorMessage(error));
    }
  }, [setBoth, showToast]);

  const handleOrgTemplateUpload = useCallback(async (file: File) => {
    try {
      const templates = await parseOrgTemplateExcel(file);
      // 保存模板，供后续员工上传时重建结构
      setOrgTemplates(templates);
      const tree = buildDepartmentTree(allEmployeesRef.current, templates);
      setDepartments(() => tree);
      showToast(`已导入组织架构（${templates.length} 个部门）`);
    } catch (error) {
      console.error('解析组织架构文件失败:', error);
      showToast(getImportErrorMessage(error));
    }
  }, [setDepartments, setOrgTemplates, showToast]);

  /** —— 部门/员工操作（历史感知） —— */
  const handleToggleExpand = useCallback((id: string) => {
    setDepartments((prev) => {
      const toggle = (depts: Department[]): Department[] => {
        return depts.map((dept) => {
          if (dept.id === id) return { ...dept, expanded: !dept.expanded };
          if (dept.children.length > 0) return { ...dept, children: toggle(dept.children) };
          return dept;
        });
      };
      return toggle(prev);
    });
  }, [setDepartments]);

  const handleUpdateDepartment = useCallback((id: string, name: string) => {
    setDepartments((prev) => {
      const update = (depts: Department[]): Department[] => {
        return depts.map((dept) => {
          if (dept.id === id) return { ...dept, name };
          if (dept.children.length > 0) return { ...dept, children: update(dept.children) };
          return dept;
        });
      };
      return update(prev);
    });
  }, [setDepartments]);

  const handleUpdateLeader = useCallback((deptId: string, employee: Employee | null) => {
    setDepartments((prev) => {
      const update = (depts: Department[]): Department[] => {
        return depts.map((dept) => {
          if (dept.id === deptId) {
            return {
              ...dept,
              leaderId: employee?.employeeId || undefined,
              leaderName: employee?.name || undefined,
            };
          }
          if (dept.children.length > 0) return { ...dept, children: update(dept.children) };
          return dept;
        });
      };
      return update(prev);
    });
  }, [setDepartments]);

  const handleMoveEmployee = useCallback((empId: string, fromDeptId: string, toDeptId: string) => {
    setDepartments((prev) => {
      let movedEmployee: Employee | null = null;
      const removeEmployee = (depts: Department[]): Department[] => {
        return depts.map((dept) => {
          if (dept.id === fromDeptId) {
            const emp = dept.employees.find((e) => e.id === empId);
            if (emp) movedEmployee = emp;
            return { ...dept, employees: dept.employees.filter((e) => e.id !== empId) };
          }
          if (dept.children.length > 0) return { ...dept, children: removeEmployee(dept.children) };
          return dept;
        });
      };
      let newDepts = removeEmployee(prev);
      if (movedEmployee) {
        const addEmployee = (depts: Department[]): Department[] => {
          return depts.map((dept) => {
            if (dept.id === toDeptId) return { ...dept, employees: [...dept.employees, movedEmployee!] };
            if (dept.children.length > 0) return { ...dept, children: addEmployee(dept.children) };
            return dept;
          });
        };
        newDepts = addEmployee(newDepts);
      }
      return newDepts;
    });
  }, [setDepartments]);

  /** 批量移动员工：从各自所在部门移除，一次性加入目标部门（历史感知，与单移动口径一致） */
  const handleMoveMultiple = useCallback((empIds: string[], toDeptId: string) => {
    setDepartments((prev) => moveEmployeesBetween(prev, empIds, toDeptId));
  }, [setDepartments]);

  /** 未入架构员工（v2.0.5）：全量员工 vs 树内已挂载员工的差值 */
  const unassignedEmployees = useMemo(
    () => computeUnassignedEmployees(allEmployeesFlat, departments),
    [allEmployeesFlat, departments],
  );

  // —— v2.1.1 岗位化：部门树为唯一真值，拍平岗位供 analytics 岗位级汇总/状态机消费 ——
  const allPositions = useMemo(() => flattenAllPositions(departments), [departments]);
  const positionSummaries = useMemo(
    () => computePositionSummary(allPositions, allEmployeesFlat, levelConfigs),
    [allPositions, allEmployeesFlat, levelConfigs],
  );
  const matchStates = useMemo(
    () => computeMatchStates(allEmployeesFlat, allPositions),
    [allEmployeesFlat, allPositions],
  );

  /** 将未入架构员工排入指定部门（历史感知） */
  const handlePlaceEmployee = useCallback(
    (empId: string, deptId: string) => {
      const emp = allEmployeesFlat.find((e) => e.id === empId);
      if (!emp) return;
      setDepartments((prev) => {
        const add = (depts: Department[]): Department[] => {
          return depts.map((dept) => {
            if (dept.id === deptId) return { ...dept, employees: [...dept.employees, emp] };
            if (dept.children.length > 0) return { ...dept, children: add(dept.children) };
            return dept;
          });
        };
        return add(prev);
      });
    },
    [allEmployeesFlat, setDepartments],
  );

  /** 设置/清除员工目标职级（v2.0.5：员工层职级差距红黄绿） */
  const handleSetTargetLevel = useCallback(
    (empId: string, target: string) => {
      const t = target.trim();
      setBoth((prev) => {
        const updateEmp = (e: Employee) => (e.id === empId ? { ...e, targetLevel: t ? t : undefined } : e);
        const updateDepts = (depts: Department[]): Department[] =>
          depts.map((d) => ({
            ...d,
            employees: d.employees.map(updateEmp),
            children: updateDepts(d.children),
          }));
        return {
          departments: updateDepts(prev.departments),
          allEmployeesFlat: prev.allEmployeesFlat.map(updateEmp),
        };
      });
      showToast(t ? `已设置目标职级 ${t}` : '已清除目标职级');
    },
    [setBoth, showToast],
  );

  /** —— v2.1.1 岗位 CRUD / 套岗 —— */

  /** 新建岗位（挂在某部门直属岗位列表）。v2.1.1 起接受富字段（名称/序列/职级带宽/编制数）。 */
  const handleCreatePosition = useCallback(
    (deptId: string, fields: { name: string; jobFamily?: string; levelBandMin?: string; levelBandMax?: string; headcount?: number }) => {
      const trimmed = fields.name.trim();
      if (!trimmed) return;
      const now = new Date().toISOString();
      const pos: Position = {
        id: uid('pos'),
        departmentId: deptId,
        name: trimmed,
        jobFamily: fields.jobFamily,
        levelBandMin: fields.levelBandMin,
        levelBandMax: fields.levelBandMax,
        headcount: typeof fields.headcount === 'number' && Number.isFinite(fields.headcount) ? fields.headcount : 0,
        status: 'active',
        createdAt: now,
        updatedAt: now,
      };
      setDepartments((prev) => {
        const add = (depts: Department[]): Department[] =>
          depts.map((d) => {
            if (d.id === deptId) return { ...d, positions: [...(d.positions ?? []), pos] };
            if (d.children.length > 0) return { ...d, children: add(d.children) };
            return d;
          });
        return add(prev);
      });
      showToast(`已创建岗位「${trimmed}」`);
    },
    [setDepartments, showToast],
  );

  /** 设置岗位编制（headcount<=0 → 视为无编制）。 */
  const handleSetPositionHeadcount = useCallback(
    (deptId: string, positionId: string, headcount: number) => {
      const v = Math.max(0, Math.round(Number.isFinite(headcount) ? headcount : 0));
      setDepartments((prev) => {
        const update = (depts: Department[]): Department[] =>
          depts.map((d) => {
            if (d.id === deptId) {
              return {
                ...d,
                positions: (d.positions ?? []).map((p) =>
                  p.id === positionId ? { ...p, headcount: v, updatedAt: new Date().toISOString() } : p,
                ),
              };
            }
            if (d.children.length > 0) return { ...d, children: update(d.children) };
            return d;
          });
        return update(prev);
      });
    },
    [setDepartments],
  );

  /** 员工套岗到指定岗位（主岗）。同步更新 allEmployeesFlat 与所有部门员工列表（跨部门一致）。 */
  const handleAssignEmployeeToPosition = useCallback(
    (empId: string, positionId: string) => {
      const emp = allEmployeesRef.current.find((e) => e.id === empId);
      if (!emp || !positionId) return;
      const patch = (e: Employee) => (e.id === empId ? { ...e, positionId, assignmentType: 'primary' as const } : e);
      setBoth((prev) => ({
        departments: mapEmployeesInDepts(prev.departments, empId, patch),
        allEmployeesFlat: prev.allEmployeesFlat.map(patch),
      }));
      showToast(`已为 ${emp.name} 套岗`);
    },
    [setBoth, showToast],
  );

  /** 取消员工套岗（清空 positionId）。 */
  const handleRemoveAssignment = useCallback(
    (empId: string) => {
      const patch = (e: Employee) => (e.id === empId ? { ...e, positionId: undefined } : e);
      setBoth((prev) => ({
        departments: mapEmployeesInDepts(prev.departments, empId, patch),
        allEmployeesFlat: prev.allEmployeesFlat.map(patch),
      }));
      showToast('已取消套岗');
    },
    [setBoth, showToast],
  );

  /** 为某岗位创建「兼岗」虚拟副本（回指真人员工 primaryEmployeeId）。 */
  const handleCreateVirtualForPosition = useCallback(
    (deptId: string, positionId: string, empId: string) => {
      const source = allEmployeesRef.current.find((e) => e.id === empId && !e.isVirtual);
      if (!source) return;
      const virtual: Employee = {
        ...source,
        id: `virtual-${Date.now()}`,
        isVirtual: true,
        positionId,
        assignmentType: 'secondary',
        primaryEmployeeId: source.id,
      };
      setBoth((prev) => {
        const add = (depts: Department[]): Department[] =>
          depts.map((d) => {
            if (d.id === deptId) return { ...d, employees: [...d.employees, virtual] };
            if (d.children.length > 0) return { ...d, children: add(d.children) };
            return d;
          });
        return { departments: add(prev.departments), allEmployeesFlat: [...prev.allEmployeesFlat, virtual] };
      });
      showToast(`已为 ${source.name} 创建兼岗`);
    },
    [setBoth, showToast],
  );

  /** 抽屉/套岗：把员工排入「某部门 + 某岗位」（移动式：先从旧部门移出，再挂入目标部门并套岗）。 */
  const handlePlaceEmployeeToPosition = useCallback(
    (empId: string, deptId: string, positionId: string) => {
      const emp = allEmployeesRef.current.find((e) => e.id === empId);
      if (!emp || !positionId) return;
      setBoth((prev) => {
        const assign = (e: Employee) => ({ ...e, positionId, assignmentType: 'primary' as const });
        const remove = (list: Department[]): Department[] =>
          list.map((d) => ({ ...d, employees: d.employees.filter((e) => e.id !== empId), children: remove(d.children) }));
        const removed = remove(prev.departments);
        const add = (list: Department[]): Department[] =>
          list.map((d) => {
            if (d.id === deptId) return { ...d, employees: [...d.employees, assign({ ...emp })] };
            if (d.children.length > 0) return { ...d, children: add(d.children) };
            return d;
          });
        return {
          departments: add(removed),
          allEmployeesFlat: prev.allEmployeesFlat.map((e) => (e.id === empId ? assign(e) : e)),
        };
      });
      showToast(`已为 ${emp.name} 排入岗位`);
    },
    [setBoth, showToast],
  );

  /** 手动刷新画布：按当前 员工 + 组织模板 重新生成部门树（修复导入后画布不刷新） */
  const handleRefreshCanvas = useCallback(() => {
    const tree = buildDepartmentTree(allEmployeesRef.current, orgTemplatesRef.current);
    setDepartments(() => tree);
    showToast('画布已刷新');
  }, [setDepartments, showToast]);

  /** 搜索结果跳转：展开命中祖先链 + 滚动定位到实体 */
  const handleSearchJump = useCallback((match: SearchMatch) => {
    setDepartments((prev) => expandDepartments(prev, new Set(match.ancestry)));
    const attr = match.type === 'department' ? 'data-dept-id' : 'data-emp-id';
    window.setTimeout(() => {
      const el = document.querySelector<HTMLElement>(`[${attr}="${match.id}"]`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
    }, 80);
  }, [setDepartments]);

  // 搜索弹窗关闭 / 清空高亮：用稳定回调（useCallback），避免引用变化导致 SearchModal
  // 的 effect 反复重置 query，从而清空用户已输入的中文关键词。
  const handleSearchClose = useCallback(() => {
    setSearchOpen(false);
    setSearchHighlight(EMPTY_HIGHLIGHT);
  }, []);

  // Enter 定位后关闭弹窗但保留命中高亮（用于显示“定位选中态”）
  const handleSearchCloseKeepHighlight = useCallback(() => {
    setSearchOpen(false);
  }, []);

  const handleSearchClearHighlight = useCallback(() => {
    setSearchHighlight(EMPTY_HIGHLIGHT);
  }, []);

  /** 载入内置行业模板（v2.0.3 P1-4） */
  const handleLoadIndustryTemplate = useCallback(
    (id: string) => {
      const tpl = findIndustryTemplate(id);
      if (!tpl) return;
      const built = loadIndustryTemplate(tpl);
      setBoth(() => ({ departments: built.departments, allEmployeesFlat: built.allEmployeesFlat }));
      showToast(`已载入「${tpl.name}」模板`);
    },
    [setBoth, showToast],
  );

  const handleDeleteEmployee = useCallback((deptId: string, empId: string) => {
    setBoth((prev) => {
      const wasVirtual = prev.allEmployeesFlat.find((e) => e.id === empId)?.isVirtual;
      const remove = (depts: Department[]): Department[] => {
        return depts.map((dept) => {
          if (dept.id === deptId) return { ...dept, employees: dept.employees.filter((e) => e.id !== empId) };
          if (dept.children.length > 0) return { ...dept, children: remove(dept.children) };
          return dept;
        });
      };
      return {
        departments: remove(prev.departments),
        allEmployeesFlat: wasVirtual ? prev.allEmployeesFlat.filter((e) => e.id !== empId) : prev.allEmployeesFlat,
      };
    });
  }, [setBoth]);

  // 移动部门（调整层级结构）- 支持拖到根级别
  const handleMoveDepartment = useCallback((deptId: string, targetDeptId: string | null) => {
    setDepartments((prev) => {
      let movedDept: Department | undefined;
      const removeDept = (depts: Department[]): Department[] => {
        return depts
          .map((dept) => {
            if (dept.id === deptId) {
              movedDept = dept;
              return null;
            }
            if (dept.children.length > 0) return { ...dept, children: removeDept(dept.children) };
            return dept;
          })
          .filter((d): d is Department => d !== null);
      };
      let newDepts = removeDept(prev);
      if (movedDept === undefined) return prev;

      if (!targetDeptId || targetDeptId === 'root') {
        const updatedDept: Department = { ...movedDept, level: 1, parentId: undefined };
        const updateChildLevels = (depts: Department[], baseLevel: number): Department[] => {
          return depts.map((dept) => {
            if (dept.id === updatedDept.id) return { ...dept, level: baseLevel };
            if (dept.children.length > 0) return { ...dept, children: updateChildLevels(dept.children, baseLevel + 1) };
            return dept;
          });
        };
        return [...newDepts, updateChildLevels([updatedDept], 1)[0]];
      }

      const targetDept = findDept(newDepts, targetDeptId);
      if (!targetDept) return prev;
      const newLevel = targetDept.level + 1;
      const updatedDept: Department = { ...movedDept, level: newLevel, parentId: targetDept.id };
      const addToTarget = (depts: Department[]): Department[] => {
        return depts.map((dept) => {
          if (dept.id === targetDeptId) return { ...dept, children: [...dept.children, updatedDept] };
          if (dept.children.length > 0) return { ...dept, children: addToTarget(dept.children) };
          return dept;
        });
      };
      newDepts = addToTarget(newDepts);
      const updateChildLevels = (depts: Department[]): Department[] => {
        return depts.map((dept) => {
          if (dept.id === updatedDept.id) return { ...dept, level: newLevel };
          if (dept.children.length > 0) return { ...dept, children: updateChildLevels(dept.children) };
          return dept;
        });
      };
      return updateChildLevels(newDepts);
    });
  }, [setDepartments]);

  const handleCreateVirtualFromEmployee = useCallback((deptId: string, empId: string) => {
    const source = allEmployeesFlat.find((e) => e.id === empId && !e.isVirtual);
    if (!source) return;
    const virtual: Employee = { ...source, id: `virtual-${Date.now()}`, isVirtual: true };
    setBoth((prev) => {
      const add = (depts: Department[]): Department[] => {
        return depts.map((dept) => {
          if (dept.id === deptId) return { ...dept, employees: [...dept.employees, virtual] };
          if (dept.children.length > 0) return { ...dept, children: add(dept.children) };
          return dept;
        });
      };
      return { departments: add(prev.departments), allEmployeesFlat: [...prev.allEmployeesFlat, virtual] };
    });
    showToast(`已创建 ${source.name} 的兼岗`);
  }, [allEmployeesFlat, setBoth, showToast]);

  const handleExportPng = useCallback(async () => {
    if (!canvasRef.current) return;
    try {
      const { default: html2canvas } = await import('html2canvas');
      const canvas = await html2canvas(canvasRef.current, { backgroundColor: '#F9FAFB', scale: 2, logging: false, useCORS: true });
      const dataUrl = canvas.toDataURL('image/png');
      const base64 = dataUrl.split(',')[1];
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const ok = await saveFile('组织架构图.png', bytes, 'image/png');
      if (ok) showToast('PNG 已导出');
      else showToast('已取消导出');
    } catch (error) {
      console.error('导出PNG失败:', error);
      alert('导出PNG失败');
    }
  }, [showToast]);

  const handleExportExcel = useCallback(async () => {
    try {
      await exportToExcel(departments);
      showToast('Excel 已导出');
    } catch (error) {
      console.error('导出Excel失败:', error);
      alert('导出Excel失败');
    }
  }, [departments, showToast]);

  // 缩放：按钮 + 画布滚轮共用同一增量逻辑（50-200 边界钳制，取整避免浮点误差如 99.9999%）
  const clampZoom = useCallback((z: number) => Math.min(Math.max(Math.round(z), 50), 200), []);
  const handleZoomChange = useCallback((next: number) => setZoom(clampZoom(next)), [clampZoom, setZoom]);
  const handleZoomIn = useCallback(() => setZoom((z) => clampZoom(z + 10)), [clampZoom, setZoom]);
  const handleZoomOut = useCallback(() => setZoom((z) => clampZoom(z - 10)), [clampZoom, setZoom]);

  const handleDownloadEmployeeTemplate = useCallback(async () => {
    try {
      await generateSampleEmployeeTemplate();
    } catch (error) {
      console.error('下载员工信息模板失败:', error);
      alert('下载员工信息模板失败');
    }
  }, []);

  const handleDownloadOrgTemplate = useCallback(async () => {
    try {
      await generateSampleOrgTemplate();
    } catch (error) {
      console.error('下载组织架构模板失败:', error);
      alert('下载组织架构模板失败');
    }
  }, []);

  // 创建新部门
  const handleCreateDepartment = useCallback((name: string, level: number, parentId: string | null, leaderId?: string, leaderName?: string) => {
    const newDept: Department = {
      id: `dept-${Date.now()}`,
      name,
      level,
      parentId: parentId || undefined,
      children: [],
      employees: [],
      expanded: true,
      leaderId,
      leaderName,
    };
    setDepartments((prev) => {
      if (!parentId || parentId === 'root') return [...prev, newDept];
      const addToParent = (depts: Department[]): Department[] => {
        return depts.map((dept) => {
          if (dept.id === parentId) return { ...dept, children: [...dept.children, newDept] };
          if (dept.children.length > 0) return { ...dept, children: addToParent(dept.children) };
          return dept;
        });
      };
      return addToParent(prev);
    });
  }, [setDepartments]);

  // 调整部门层级归属
  const handleChangeDepartmentLevel = useCallback((deptId: string, newLevel: number, newParentId: string | null) => {
    setDepartments((prev) => {
      let targetDept: Department | undefined;
      const findAndRemove = (depts: Department[]): Department[] => {
        for (let i = 0; i < depts.length; i++) {
          if (depts[i].id === deptId) {
            targetDept = depts[i];
            return [...depts.slice(0, i), ...depts.slice(i + 1)];
          }
          if (depts[i].children.length > 0) {
            const newChildren = findAndRemove(depts[i].children);
            if (targetDept) return [...depts.slice(0, i), { ...depts[i], children: newChildren }, ...depts.slice(i + 1)];
          }
        }
        return depts;
      };
      const newDepts = findAndRemove(prev);
      if (!targetDept) return prev;
      const updatedDept: Department = { ...targetDept, level: newLevel, parentId: newParentId || undefined };
      const updateChildLevels = (depts: Department[], baseLevel: number): Department[] => {
        return depts.map((dept) => ({ ...dept, level: baseLevel, children: updateChildLevels(dept.children, baseLevel + 1) }));
      };
      if (!newParentId) return [...newDepts, ...updateChildLevels([updatedDept], newLevel)];
      const addToParent = (depts: Department[]): Department[] => {
        return depts.map((dept) => {
          if (dept.id === newParentId) return { ...dept, children: [...dept.children, ...updateChildLevels([updatedDept], dept.level + 1)] };
          if (dept.children.length > 0) return { ...dept, children: addToParent(dept.children) };
          return dept;
        });
      };
      return addToParent(newDepts);
    });
  }, [setDepartments]);

  /** 编制人数（健康度 L3 可编辑）；headcount<=0 → 视为未配置（undefined） */
  const handleUpdateHeadcount = useCallback((deptId: string, value: number) => {
    setDepartments((prev) => {
      const update = (depts: Department[]): Department[] => {
        return depts.map((dept) => {
          if (dept.id === deptId) {
            const v = Math.round(value);
            return { ...dept, headcount: v > 0 ? v : undefined };
          }
          if (dept.children.length > 0) return { ...dept, children: update(dept.children) };
          return dept;
        });
      };
      return update(prev);
    });
  }, [setDepartments]);

  const handleReset = useCallback(() => {
    if (confirm('确定要清空所有组织数据吗？（职级配置保留）')) {
      resetWorkspace();
      showToast('工作区已清空');
    }
  }, [resetWorkspace, showToast]);

  const handleLoadTestData = useCallback(() => {
    const employees: Employee[] = TEST_EMPLOYEES.map((e) => ({
      id: e.employeeId,
      name: e.name,
      employeeId: e.employeeId,
      level: e.level,
      dept1: e.dept1,
      dept2: e.dept2,
      dept3: e.dept3,
      dept4: e.dept4,
      dept5: e.dept5,
      dept6: e.dept6,
    }));
    setBoth(() => ({ departments: buildDepartmentTree(employees, TEST_ORG), allEmployeesFlat: employees }));
    showToast('已加载示例数据');
  }, [setBoth, showToast]);

  // 数据备份（导出 .orgproj）
  const handleExportProject = useCallback(async () => {
    try {
      const json = exportProjectJson();
      const ok = await saveTextFile('组织架构项目.orgproj', json, 'application/json');
      showToast(ok ? '已导出 .orgproj 项目文件' : '已取消导出');
    } catch (error) {
      console.error('导出项目文件失败:', error);
      showToast('导出项目文件失败');
    }
  }, [exportProjectJson, showToast]);

  // 导入 .orgproj
  const handleImportProject = useCallback((json: string) => {
    const ok = importProjectJson(json);
    if (ok) showToast('已导入项目文件');
    else showToast('导入失败：文件格式无效');
  }, [importProjectJson, showToast]);

  const handleOpenReport = useCallback(() => {
    flushCurrent();
    setReportOpen(true);
  }, [flushCurrent]);

  const handleOpenHealth = useCallback(() => {
    setHealthFocusDeptId(undefined);
    setHealthOpen(true);
  }, []);

  // —— v2.0.9 场景差异比较 ——

  /** 打开差异视图：flushCurrent 确保快照已落盘（S2 实时性）；基线 = 第一个场景，目标 = 当前场景。 */
  const handleOpenScenarioDiff = useCallback(() => {
    flushCurrent();
    const first = project.scenarios[0];
    const baselineId = first?.id ?? '';
    const cur = project.currentScenarioId;
    const targetId =
      cur && cur !== baselineId
        ? cur
        : (project.scenarios.find((s) => s.id !== baselineId)?.id ?? '');
    setDiffBaselineId(baselineId);
    setDiffTargetId(targetId);
    setScenarioDiffOpen(true);
  }, [flushCurrent, project]);

  const handleSelectDiffBaseline = useCallback(
    (id: string) => {
      setDiffBaselineId(id);
      setDiffTargetId((prev) =>
        prev === id ? (project.scenarios.find((s) => s.id !== id)?.id ?? prev) : prev,
      );
    },
    [project],
  );

  const handleSelectDiffTarget = useCallback(
    (id: string) => {
      setDiffTargetId(id);
      setDiffBaselineId((prev) =>
        prev === id ? (project.scenarios.find((s) => s.id !== id)?.id ?? prev) : prev,
      );
    },
    [project],
  );

  /** 基线/目标场景对象（选择器状态兜底：id 失效时回退第一个场景） */
  const baselineScenario = useMemo(
    () => project.scenarios.find((s) => s.id === diffBaselineId) ?? project.scenarios[0],
    [project, diffBaselineId],
  );
  const targetScenario = useMemo(
    () => project.scenarios.find((s) => s.id === diffTargetId) ?? currentScenario ?? project.scenarios[0],
    [project, diffTargetId, currentScenario],
  );

  /** 差异点回画布定位（部门）：展开祖先链 + 滚动到节点；不在当前场景 → toast 提示。 */
  const handleLocateDept = useCallback(
    (deptId: string) => {
      const chain = findDeptChain(departments, deptId);
      if (!chain) {
        showToast('该部门不在当前场景组织中，无法定位');
        return;
      }
      setDepartments((prev) => expandDepartments(prev, new Set(chain)));
      window.setTimeout(() => {
        document
          .querySelector<HTMLElement>(`[data-dept-id="${deptId}"]`)
          ?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
      }, 80);
    },
    [departments, setDepartments, showToast],
  );

  /** 差异点回画布定位（员工）：按工号/记录 id 找到当前所属部门并定位；未入架构 → toast 提示。 */
  const handleLocateEmployee = useCallback(
    (employeeId: string) => {
      const findIn = (depts: Department[]): { emp: Employee; deptId: string } | null => {
        for (const d of depts) {
          const emp = d.employees.find((e) => e.id === employeeId || e.employeeId === employeeId);
          if (emp) return { emp, deptId: d.id };
          const childHit = findIn(d.children);
          if (childHit) return childHit;
        }
        return null;
      };
      const found = findIn(departments);
      if (!found) {
        showToast('该员工未在当前场景架构中，无法定位');
        return;
      }
      const chain = findDeptChain(departments, found.deptId);
      setDepartments((prev) => expandDepartments(prev, new Set(chain)));
      const recordId = found.emp.id;
      window.setTimeout(() => {
        document
          .querySelector<HTMLElement>(`[data-emp-id="${recordId}"]`)
          ?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
      }, 80);
    },
    [departments, setDepartments, showToast],
  );

  const handleUndo = useCallback(() => {
    undo();
    showToast('已撤销');
  }, [undo, showToast]);

  const handleRedo = useCallback(() => {
    redo();
    showToast('已重做');
  }, [redo, showToast]);

  return (
    <div className="flex flex-col h-screen">
      <TopBar
        projectName={project.name}
        scenarios={project.scenarios}
        currentScenarioId={project.currentScenarioId}
        onSwitchScenario={switchScenario}
        onCreateScenario={createNewScenario}
        onRenameScenario={renameScenario}
        onDeleteScenario={deleteScenario}
        onDuplicateScenario={duplicateScenario}
        onManageScenarios={() => setProjectModalOpen(true)}
        saveState={saveState}
        lastSavedAt={lastSavedAt}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onOpenHealth={handleOpenHealth}
        onOpenScenarioDiff={handleOpenScenarioDiff}
        canCompare={project.scenarios.length >= 2}
        hasData={departments.length > 0}
        onDownloadEmployeeTemplate={handleDownloadEmployeeTemplate}
        onDownloadOrgTemplate={handleDownloadOrgTemplate}
        onManageLevels={() => setLevelManagerOpen(true)}
        zoom={zoom}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onOpenSearch={() => setSearchOpen(true)}
        onLoadIndustryTemplate={handleLoadIndustryTemplate}
      />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          onEmployeeFileUpload={handleEmployeeFileUpload}
          onOrgTemplateUpload={handleOrgTemplateUpload}
          onExportPng={handleExportPng}
          onExportExcel={handleExportExcel}
          onReset={handleReset}
          onLoadTestData={handleLoadTestData}
          onCreateDepartment={handleCreateDepartment}
          onOpenHealth={handleOpenHealth}
          onOpenReport={handleOpenReport}
          onExportProject={handleExportProject}
          departments={departments}
          hasData={departments.length > 0}
          hasEmployees={allEmployeesFlat.length > 0}
          hasOrgTemplate={orgTemplates.length > 0}
          onRefreshCanvas={handleRefreshCanvas}
        />

        <main
          ref={mainRef}
          className="flex-1 overflow-auto p-6"
          style={{ background: 'radial-gradient(1200px 600px at 20% 0%, rgba(99,102,241,0.06) 0%, rgba(139,92,246,0.05) 45%, transparent 100%), radial-gradient(1000px 500px at 80% 100%, rgba(139,92,246,0.04) 0%, transparent 55%), linear-gradient(135deg, #f8fafc 0%, #eef1f6 100%)' }}
        >
          <OrgChart
            departments={departments}
            onToggleExpand={handleToggleExpand}
            onUpdateDepartment={handleUpdateDepartment}
            onUpdateLeader={handleUpdateLeader}
            onMoveEmployee={handleMoveEmployee}
            onMoveMultiple={handleMoveMultiple}
            onMoveDepartment={handleMoveDepartment}
            onChangeDepartmentLevel={handleChangeDepartmentLevel}
            onDeleteEmployee={handleDeleteEmployee}
            onCreateVirtualFromEmployee={handleCreateVirtualFromEmployee}
            allEmployees={allEmployeesFlat}
            zoom={zoom}
            canvasRef={canvasRef}
            zoomContainerRef={mainRef}
            onZoomChange={handleZoomChange}
            onDownloadTemplate={handleDownloadEmployeeTemplate}
            onLoadTestData={handleLoadTestData}
            onLoadIndustryTemplate={() => handleLoadIndustryTemplate('internet')}
            searchHighlight={searchHighlight}
            onSetTargetLevel={handleSetTargetLevel}
            positionSummaries={positionSummaries}
            matchStates={matchStates}
            onCreatePosition={handleCreatePosition}
            onSetPositionHeadcount={handleSetPositionHeadcount}
            onAssignEmployeeToPosition={handleAssignEmployeeToPosition}
            onRemoveAssignment={handleRemoveAssignment}
            onCreateVirtualForPosition={handleCreateVirtualForPosition}
          />
        </main>
      </div>

      {unassignedEmployees.length > 0 && departments.length > 0 && (
        <button
          onClick={() => setUnassignedOpen(true)}
          className="fixed top-16 left-1/2 -translate-x-1/2 z-[80] flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-50/95 backdrop-blur border border-amber-300/70 text-amber-800 shadow-lg text-sm font-medium hover:bg-amber-100 transition-colors animate-fadeInUp"
        >
          <AlertTriangle className="w-4 h-4" />
          {unassignedEmployees.length} 名员工未进入架构
          <span className="text-xs text-amber-600 underline underline-offset-2">查看并排入</span>
        </button>
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[120] px-4 py-2.5 rounded-xl bg-slate-900/90 text-white text-sm font-medium shadow-xl animate-fadeInUp">
          {toast}
        </div>
      )}

      <LevelManagerModal open={levelManagerOpen} onClose={() => setLevelManagerOpen(false)} />

      <HealthDrawer
        open={healthOpen}
        onClose={() => setHealthOpen(false)}
        departments={departments}
        focusDeptId={healthFocusDeptId}
        onClearFocus={() => setHealthFocusDeptId(undefined)}
        onFocusDept={(id) => setHealthFocusDeptId(id)}
        onUpdateHeadcount={handleUpdateHeadcount}
        onSetPositionHeadcount={handleSetPositionHeadcount}
        positionSummaries={positionSummaries}
        onExportReport={handleOpenReport}
        currentScenarioName={currentScenario?.name ?? "场景"}
        scenarios={project.scenarios}
        onOpenScenarioDiff={handleOpenScenarioDiff}
      />

      <ProjectModal
        open={projectModalOpen}
        onClose={() => setProjectModalOpen(false)}
        project={project}
        currentScenarioId={project.currentScenarioId}
        onRenameProject={renameProject}
        onCreateScenario={createNewScenario}
        onRenameScenario={renameScenario}
        onDeleteScenario={deleteScenario}
        onDuplicateScenario={duplicateScenario}
        onSwitchScenario={switchScenario}
        onImport={handleImportProject}
        onExport={handleExportProject}
      />

      <DiagnosticReport
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        departments={departments}
        levelConfigs={levelConfigs}
        positionSummaries={positionSummaries}
        projectName={project.name}
        scenarioName={currentScenario?.name ?? "场景"}
        onToast={showToast}
      />

      {scenarioDiffOpen && baselineScenario && targetScenario && (
        <ScenarioDiffView
          open={scenarioDiffOpen}
          onClose={() => setScenarioDiffOpen(false)}
          baseline={baselineScenario}
          target={targetScenario}
          scenarios={project.scenarios}
          onSelectBaseline={handleSelectDiffBaseline}
          onSelectTarget={handleSelectDiffTarget}
          onLocateDept={handleLocateDept}
          onLocateEmployee={handleLocateEmployee}
          onExportReport={() => setMgmtReportOpen(true)}
        />
      )}

      {mgmtReportOpen && baselineScenario && targetScenario && (
        <ManagementReport
          open={mgmtReportOpen}
          onClose={() => setMgmtReportOpen(false)}
          baseline={baselineScenario}
          target={targetScenario}
          projectName={project.name}
          levelConfigs={levelConfigs}
          onLocateDept={handleLocateDept}
          onLocateEmployee={handleLocateEmployee}
          onToast={showToast}
        />
      )}

      <SearchModal
        open={searchOpen}
        onClose={handleSearchClose}
        departments={departments}
        onHighlight={setSearchHighlight}
        onClearHighlight={handleSearchClearHighlight}
        onJump={handleSearchJump}
        onCloseKeepHighlight={handleSearchCloseKeepHighlight}
      />

      <UnassignedEmployeesDrawer
        open={unassignedOpen}
        onClose={() => setUnassignedOpen(false)}
        unassignedEmployees={unassignedEmployees}
        departments={departments}
        allEmployees={allEmployeesFlat}
        positionSummaries={positionSummaries}
        matchStates={matchStates}
        onPlaceEmployee={handlePlaceEmployee}
        onPlaceEmployeeToPosition={handlePlaceEmployeeToPosition}
        onAssignEmployeeToPosition={handleAssignEmployeeToPosition}
        onToast={showToast}
      />

      <OnboardingOverlay
        open={onboardingOpen}
        onClose={dismissOnboarding}
        onDownloadTemplate={handleDownloadEmployeeTemplate}
        onLoadTemplate={handleLoadIndustryTemplate}
      />
    </div>
  );
}
