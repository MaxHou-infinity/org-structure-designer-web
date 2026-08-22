import { useState, useRef, useCallback } from 'react';
import html2canvas from 'html2canvas';
import { Sidebar } from './components/Sidebar';
import { OrgChart } from './components/OrgChart';
import { Employee, Department, OrgTemplate } from './types';
import { 
  parseEmployeeExcel, 
  parseOrgTemplateExcel, 
  buildDepartmentTree, 
  exportToExcel 
} from './utils/excel';

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
  const [departments, setDepartments] = useState<Department[]>([]);
  const [zoom, setZoom] = useState(100);
  const [allEmployeesFlat, setAllEmployeesFlat] = useState<Employee[]>([]);
  const canvasRef = useRef<HTMLDivElement>(null);
  
  const handleEmployeeFileUpload = useCallback(async (file: File) => {
    try {
      const parsedEmployees = await parseEmployeeExcel(file);
      setAllEmployeesFlat(parsedEmployees);
      
      // 重新构建部门树
      const newDepartments = buildDepartmentTree(parsedEmployees, []);
      setDepartments(newDepartments);
    } catch (error) {
      console.error('解析员工文件失败:', error);
      alert('解析员工文件失败，请检查文件格式');
    }
  }, []);
  
  const handleOrgTemplateUpload = useCallback(async (file: File) => {
    try {
      const templates = await parseOrgTemplateExcel(file);
      const newDepartments = buildDepartmentTree(allEmployeesFlat, templates);
      setDepartments(newDepartments);
    } catch (error) {
      console.error('解析组织架构文件失败:', error);
      alert('解析组织架构文件失败，请检查文件格式');
    }
  }, [allEmployeesFlat]);
  
  const handleToggleExpand = useCallback((id: string) => {
    setDepartments(prev => {
      const toggle = (depts: Department[]): Department[] => {
        return depts.map(dept => {
          if (dept.id === id) {
            return { ...dept, expanded: !dept.expanded };
          }
          if (dept.children.length > 0) {
            return { ...dept, children: toggle(dept.children) };
          }
          return dept;
        });
      };
      return toggle(prev);
    });
  }, []);
  
  const handleUpdateDepartment = useCallback((id: string, name: string) => {
    setDepartments(prev => {
      const update = (depts: Department[]): Department[] => {
        return depts.map(dept => {
          if (dept.id === id) {
            return { ...dept, name };
          }
          if (dept.children.length > 0) {
            return { ...dept, children: update(dept.children) };
          }
          return dept;
        });
      };
      return update(prev);
    });
  }, []);
  
  const handleUpdateLeader = useCallback((deptId: string, employee: Employee | null) => {
    setDepartments(prev => {
      const update = (depts: Department[]): Department[] => {
        return depts.map(dept => {
          if (dept.id === deptId) {
            return { 
              ...dept, 
              leaderId: employee?.employeeId || undefined,
              leaderName: employee?.name || undefined
            };
          }
          if (dept.children.length > 0) {
            return { ...dept, children: update(dept.children) };
          }
          return dept;
        });
      };
      return update(prev);
    });
  }, []);
  
  const handleMoveEmployee = useCallback((empId: string, fromDeptId: string, toDeptId: string) => {
    setDepartments(prev => {
      let movedEmployee: Employee | null = null;
      
      // 从源部门移除员工
      const removeEmployee = (depts: Department[]): Department[] => {
        return depts.map(dept => {
          if (dept.id === fromDeptId) {
            const emp = dept.employees.find(e => e.id === empId);
            if (emp) {
              movedEmployee = emp;
            }
            return { 
              ...dept, 
              employees: dept.employees.filter(e => e.id !== empId) 
            };
          }
          if (dept.children.length > 0) {
            return { ...dept, children: removeEmployee(dept.children) };
          }
          return dept;
        });
      };
      
      let newDepts = removeEmployee(prev);
      
      // 将员工添加到目标部门
      if (movedEmployee) {
        const addEmployee = (depts: Department[]): Department[] => {
          return depts.map(dept => {
            if (dept.id === toDeptId) {
              return {
                ...dept,
                employees: [...dept.employees, movedEmployee!]
              };
            }
            if (dept.children.length > 0) {
              return { ...dept, children: addEmployee(dept.children) };
            }
            return dept;
          });
        };
        
        newDepts = addEmployee(newDepts);
      }
      
      return newDepts;
    });
  }, []);
  
  const handleDeleteEmployee = useCallback((deptId: string, empId: string) => {
    setDepartments(prev => {
      const remove = (depts: Department[]): Department[] => {
        return depts.map(dept => {
          if (dept.id === deptId) {
            return { 
              ...dept, 
              employees: dept.employees.filter(e => e.id !== empId) 
            };
          }
          if (dept.children.length > 0) {
            return { ...dept, children: remove(dept.children) };
          }
          return dept;
        });
      };
      return remove(prev);
    });
  }, []);
  
  // 移动部门（调整层级结构）- 支持拖到根级别
  const handleMoveDepartment = useCallback((deptId: string, targetDeptId: string | null) => {
    setDepartments(prev => {
      let movedDept: Department | undefined = undefined;
      
      // 找到要移动的部门并从原位置移除
      const removeDept = (depts: Department[]): Department[] => {
        return depts
          .map(dept => {
            if (dept.id === deptId) {
              movedDept = dept;
              return null;
            }
            if (dept.children.length > 0) {
              return { ...dept, children: removeDept(dept.children) };
            }
            return dept;
          })
          .filter((d): d is Department => d !== null);
      };
      
      let newDepts = removeDept(prev);
      
      if (movedDept === undefined) return prev;
      
      // 如果 targetDeptId 为 null 或 'root'，则将部门移到根级别（平级）
      if (!targetDeptId || targetDeptId === 'root') {
        const updatedDept: Department = Object.assign({}, movedDept, {
          level: 1,
          parentId: undefined
        });
        
        // 更新子部门的层级
        const updateChildLevels = (depts: Department[], baseLevel: number): Department[] => {
          return depts.map(dept => {
            if (dept.id === updatedDept.id) {
              return { ...dept, level: baseLevel };
            }
            if (dept.children.length > 0) {
              return { ...dept, children: updateChildLevels(dept.children, baseLevel + 1) };
            }
            return dept;
          });
        };
        
        return [...newDepts, updateChildLevels([updatedDept], 1)[0]];
      }
      
      // 否则，将部门添加到目标部门的孩子中
      const targetDept = findDept(newDepts, targetDeptId);
      if (!targetDept) return prev;
      
      const newLevel = targetDept.level + 1;
      const newParentId = targetDept.id;
      
      const updatedDept: Department = Object.assign({}, movedDept, {
        level: newLevel,
        parentId: newParentId
      });
      
      // 将部门添加到目标部门的孩子中
      const addToTarget = (depts: Department[]): Department[] => {
        return depts.map(dept => {
          if (dept.id === targetDeptId) {
            return {
              ...dept,
              children: [...dept.children, updatedDept]
            };
          }
          if (dept.children.length > 0) {
            return { ...dept, children: addToTarget(dept.children) };
          }
          return dept;
        });
      };
      
      newDepts = addToTarget(newDepts);
      
      // 递归更新子部门的层级
      const updateChildLevels = (depts: Department[]): Department[] => {
        return depts.map(dept => {
          if (dept.id === updatedDept.id) {
            return { ...dept, level: newLevel };
          }
          if (dept.children.length > 0) {
            return { ...dept, children: updateChildLevels(dept.children) };
          }
          return dept;
        });
      };
      
      return updateChildLevels(newDepts);
    });
  }, []);
  
  const handleCreateVirtualEmployee = useCallback((deptId: string) => {
    const newEmployee: Employee = {
      id: `virtual-${Date.now()}`,
      name: '新员工',
      employeeId: `V${Date.now().toString().slice(-4)}`,
      level: 'L1.1',
      isVirtual: true,
    };
    
    setDepartments(prev => {
      const add = (depts: Department[]): Department[] => {
        return depts.map(dept => {
          if (dept.id === deptId) {
            return {
              ...dept,
              employees: [...dept.employees, newEmployee]
            };
          }
          if (dept.children.length > 0) {
            return { ...dept, children: add(dept.children) };
          }
          return dept;
        });
      };
      return add(prev);
    });
    
    setAllEmployeesFlat(prev => [...prev, newEmployee]);
  }, []);
  
  const handleExportPng = useCallback(async () => {
    if (!canvasRef.current) return;
    
    try {
      const canvas = await html2canvas(canvasRef.current, {
        backgroundColor: '#F9FAFB',
        scale: 2,
        logging: false,
        useCORS: true,
      });
      
      const link = document.createElement('a');
      link.download = '组织架构图.png';
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (error) {
      console.error('导出PNG失败:', error);
      alert('导出PNG失败');
    }
  }, []);
  
  const handleExportExcel = useCallback(() => {
    try {
      exportToExcel(allEmployeesFlat, departments);
    } catch (error) {
      console.error('导出Excel失败:', error);
      alert('导出Excel失败');
    }
  }, [allEmployeesFlat, departments]);
  
  // 查找部门辅助函数
  const handleZoomIn = useCallback(() => {
    setZoom(prev => Math.min(prev + 10, 150));
  }, []);
  
  const handleZoomOut = useCallback(() => {
    setZoom(prev => Math.max(prev - 10, 50));
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
      leaderName
    };
    
    setDepartments(prev => {
      if (!parentId || parentId === 'root') {
        // 添加到根级别，保持用户选择的 level
        return [...prev, newDept];
      }
      
      // 添加到指定部门的子部门
      const addToParent = (depts: Department[]): Department[] => {
        return depts.map(dept => {
          if (dept.id === parentId) {
            return {
              ...dept,
              children: [...dept.children, newDept]
            };
          }
          if (dept.children.length > 0) {
            return { ...dept, children: addToParent(dept.children) };
          }
          return dept;
        });
      };
      
      return addToParent(prev);
    });
  }, []);
  
  // 调整部门层级归属
  const handleChangeDepartmentLevel = useCallback((deptId: string, newLevel: number, newParentId: string | null) => {
    setDepartments(prev => {
      // 找到要调整的部门
      let targetDept: Department | undefined = undefined;
      
      const findAndRemove = (depts: Department[]): Department[] => {
        for (let i = 0; i < depts.length; i++) {
          if (depts[i].id === deptId) {
            targetDept = depts[i];
            return [...depts.slice(0, i), ...depts.slice(i + 1)];
          }
          if (depts[i].children.length > 0) {
            const newChildren = findAndRemove(depts[i].children);
            if (targetDept) {
              return [...depts.slice(0, i), { ...depts[i], children: newChildren }, ...depts.slice(i + 1)];
            }
          }
        }
        return depts;
      };
      
      const newDepts = findAndRemove(prev);
      
      if (!targetDept) return prev;
      
      // 更新部门信息 - 使用 Object.assign 避免 spread 问题
      const updatedDept: Department = Object.assign({}, targetDept, {
        level: newLevel,
        parentId: newParentId || undefined
      });
      
      // 递归更新子部门层级
      const updateChildLevels = (depts: Department[], baseLevel: number): Department[] => {
        return depts.map(dept => ({
          ...dept,
          level: baseLevel,
          children: updateChildLevels(dept.children, baseLevel + 1)
        }));
      };
      
      // 如果是根级别
      if (!newParentId) {
        return [...newDepts, ...updateChildLevels([updatedDept], newLevel)];
      }
      
      // 添加到目标父部门
      const addToParent = (depts: Department[]): Department[] => {
        return depts.map(dept => {
          if (dept.id === newParentId) {
            return {
              ...dept,
              children: [...dept.children, ...updateChildLevels([updatedDept], dept.level + 1)]
            };
          }
          if (dept.children.length > 0) {
            return { ...dept, children: addToParent(dept.children) };
          }
          return dept;
        });
      };
      
      return addToParent(newDepts);
    });
  }, []);
  
  const handleReset = useCallback(() => {
    if (confirm('确定要重置所有数据吗？')) {
      setDepartments([]);
      setAllEmployeesFlat([]);
      setZoom(100);
    }
  }, []);
  
  const handleLoadTestData = useCallback(() => {
    // 将测试数据转换为员工对象
    const employees: Employee[] = TEST_EMPLOYEES.map(e => ({
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
    
    setAllEmployeesFlat(employees);
    
    // 构建部门树
    const depts = buildDepartmentTree(employees, TEST_ORG);
    setDepartments(depts);
  }, []);
  
  return (
    <div className="flex h-screen">
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
        departments={departments}
        zoom={zoom}
        hasData={departments.length > 0}
      />
      
      <main className="flex-1 overflow-auto p-6" style={{ background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)' }}>
        <OrgChart
          departments={departments}
          onToggleExpand={handleToggleExpand}
          onUpdateDepartment={handleUpdateDepartment}
          onUpdateLeader={handleUpdateLeader}
          onMoveEmployee={handleMoveEmployee}
          onMoveDepartment={handleMoveDepartment}
          onChangeDepartmentLevel={handleChangeDepartmentLevel}
          onDeleteEmployee={handleDeleteEmployee}
          onCreateVirtualEmployee={handleCreateVirtualEmployee}
          allEmployees={allEmployeesFlat}
          zoom={zoom}
          canvasRef={canvasRef}
        />
      </main>
    </div>
  );
}
