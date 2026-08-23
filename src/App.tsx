import { useRef, useCallback, useEffect, useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { OrgChart } from './components/OrgChart';
import { TopBar } from './components/TopBar';
import { LevelManagerModal } from './components/LevelManagerModal';
import { HealthDrawer } from './components/HealthDrawer';
import { ProjectModal } from './components/ProjectModal';
import { DiagnosticReport } from './components/DiagnosticReport';
import { SearchModal } from './components/SearchModal';
import { OnboardingOverlay } from './components/OnboardingOverlay';
import { SearchHighlight } from './components/SearchContext';
import { Employee, Department, OrgTemplate } from './types';
import { expandDepartments, SearchMatch } from './utils/search';
import { findIndustryTemplate, loadIndustryTemplate } from './utils/industryTemplates';
import {
  parseEmployeeExcel,
  parseOrgTemplateExcel,
  buildDepartmentTree,
  exportToExcel,
  generateSampleEmployeeTemplate,
  generateSampleOrgTemplate,
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
  const [toast, setToast] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchHighlight, setSearchHighlight] = useState<SearchHighlight>(EMPTY_HIGHLIGHT);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLDivElement>(null);

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
      setBoth(() => ({
        departments: buildDepartmentTree(parsedEmployees, []),
        allEmployeesFlat: parsedEmployees,
      }));
    } catch (error) {
      console.error('解析员工文件失败:', error);
      alert('解析员工文件失败，请检查文件格式');
    }
  }, [setBoth]);

  const handleOrgTemplateUpload = useCallback(async (file: File) => {
    try {
      const templates = await parseOrgTemplateExcel(file);
      setDepartments(() => buildDepartmentTree(allEmployeesFlat, templates));
    } catch (error) {
      console.error('解析组织架构文件失败:', error);
      alert('解析组织架构文件失败，请检查文件格式');
    }
  }, [allEmployeesFlat, setDepartments]);

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
    setDepartments((prev) => {
      const empSet = new Set(empIds);
      const collected: Employee[] = [];
      const removeFromAll = (depts: Department[]): Department[] => {
        return depts.map((dept) => {
          const kept: Employee[] = [];
          for (const e of dept.employees) {
            if (empSet.has(e.id)) collected.push(e);
            else kept.push(e);
          }
          const children = dept.children.length > 0 ? removeFromAll(dept.children) : dept.children;
          return { ...dept, employees: kept, children };
        });
      };
      let newDepts = removeFromAll(prev);
      const addAll = (depts: Department[]): Department[] => {
        return depts.map((dept) => {
          if (dept.id === toDeptId) return { ...dept, employees: [...dept.employees, ...collected] };
          if (dept.children.length > 0) return { ...dept, children: addAll(dept.children) };
          return dept;
        });
      };
      newDepts = addAll(newDepts);
      return newDepts;
    });
  }, [setDepartments]);

  /** 搜索结果跳转：展开命中祖先链 + 滚动定位到实体 */
  const handleSearchJump = useCallback((match: SearchMatch) => {
    setDepartments((prev) => expandDepartments(prev, new Set(match.ancestry)));
    const attr = match.type === 'department' ? 'data-dept-id' : 'data-emp-id';
    window.setTimeout(() => {
      const el = document.querySelector<HTMLElement>(`[${attr}="${match.id}"]`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
    }, 80);
  }, [setDepartments]);

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
    setDepartments((prev) => {
      const remove = (depts: Department[]): Department[] => {
        return depts.map((dept) => {
          if (dept.id === deptId) return { ...dept, employees: dept.employees.filter((e) => e.id !== empId) };
          if (dept.children.length > 0) return { ...dept, children: remove(dept.children) };
          return dept;
        });
      };
      return remove(prev);
    });
  }, [setDepartments]);

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

  const handleCreateVirtualEmployee = useCallback((deptId: string) => {
    const newEmployee: Employee = {
      id: `virtual-${Date.now()}`,
      name: '新员工',
      employeeId: `V${Date.now().toString().slice(-4)}`,
      level: 'L1.1',
      isVirtual: true,
    };
    setBoth((prev) => {
      const add = (depts: Department[]): Department[] => {
        return depts.map((dept) => {
          if (dept.id === deptId) return { ...dept, employees: [...dept.employees, newEmployee] };
          if (dept.children.length > 0) return { ...dept, children: add(dept.children) };
          return dept;
        });
      };
      return { departments: add(prev.departments), allEmployeesFlat: [...prev.allEmployeesFlat, newEmployee] };
    });
  }, [setBoth]);

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

  // 缩放：按钮 + 画布滚轮共用同一增量逻辑（50-200 边界钳制）
  const clampZoom = useCallback((z: number) => Math.min(Math.max(z, 50), 200), []);
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
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          onReset={handleReset}
          onLoadTestData={handleLoadTestData}
          onCreateDepartment={handleCreateDepartment}
          onOpenHealth={handleOpenHealth}
          onOpenReport={handleOpenReport}
          onExportProject={handleExportProject}
          departments={departments}
          zoom={zoom}
          hasData={departments.length > 0}
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
            onCreateVirtualEmployee={handleCreateVirtualEmployee}
            allEmployees={allEmployeesFlat}
            zoom={zoom}
            canvasRef={canvasRef}
            zoomContainerRef={mainRef}
            onZoomChange={handleZoomChange}
            onDownloadTemplate={handleDownloadEmployeeTemplate}
            onLoadTestData={handleLoadTestData}
            onLoadIndustryTemplate={() => handleLoadIndustryTemplate('internet')}
            searchHighlight={searchHighlight}
          />
        </main>
      </div>

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
        onExportReport={handleOpenReport}
        currentScenarioName={currentScenario?.name ?? "场景"}
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
        projectName={project.name}
        scenarioName={currentScenario?.name ?? "场景"}
        onToast={showToast}
      />

      <SearchModal
        open={searchOpen}
        onClose={() => {
          setSearchOpen(false);
          setSearchHighlight(EMPTY_HIGHLIGHT);
        }}
        departments={departments}
        onHighlight={setSearchHighlight}
        onClearHighlight={() => setSearchHighlight(EMPTY_HIGHLIGHT)}
        onJump={handleSearchJump}
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
