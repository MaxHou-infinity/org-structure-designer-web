import * as XLSX from 'xlsx';
import { Employee, Department, OrgTemplate } from '../types';

export function parseEmployeeExcel(file: File): Promise<Employee[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet);
        
        const employees: Employee[] = json.map((row, index) => ({
          id: `emp-${index}-${Date.now()}`,
          name: String(row['姓名'] || ''),
          employeeId: String(row['工号'] || ''),
          level: String(row['职级'] || ''),
          dept1: String(row['一级部门'] || ''),
          dept2: String(row['二级部门'] || ''),
          dept3: String(row['三级部门'] || ''),
          dept4: String(row['四级部门'] || ''),
          dept5: String(row['五级部门'] || ''),
          dept6: String(row['六级部门'] || ''),
        }));
        
        resolve(employees);
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

export function parseOrgTemplateExcel(file: File): Promise<OrgTemplate[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet);
        
        const templates: OrgTemplate[] = json.map((row) => ({
          dept1: String(row['一级部门'] || ''),
          dept2: String(row['二级部门'] || ''),
          dept3: String(row['三级部门'] || ''),
          dept4: String(row['四级部门'] || ''),
          dept5: String(row['五级部门'] || ''),
          dept6: String(row['六级部门'] || ''),
          deptLevel: String(row['部门级别'] || ''),
          leaderId: String(row['部门负责人工号'] || ''),
          leaderName: String(row['部门负责人'] || ''),
        }));
        
        resolve(templates);
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

export function buildDepartmentTree(employees: Employee[], orgTemplates: OrgTemplate[]): Department[] {
  const deptMap = new Map<string, Department>();
  const deptKey = (level: number, name: string) => `${level}-${name}`;
  
  // 先从组织架构模板创建部门结构
  orgTemplates.forEach((template, idx) => {
    const levels = [
      { level: 1, name: template.dept1 },
      { level: 2, name: template.dept2 },
      { level: 3, name: template.dept3 },
      { level: 4, name: template.dept4 },
      { level: 5, name: template.dept5 },
      { level: 6, name: template.dept6 },
    ].filter((l): l is { level: number; name: string } => Boolean(l.name) && l.name !== 'undefined');
    
    let parentId: string | undefined;
    
    levels.forEach(({ level, name }) => {
      const key = deptKey(level, name);
      if (!deptMap.has(key)) {
        deptMap.set(key, {
          id: `dept-${idx}-${level}`,
          name,
          level,
          parentId,
          children: [],
          employees: [],
          expanded: level <= 3,
        });
      }
      
      const dept = deptMap.get(key)!;
      if (template.deptLevel && dept.level === parseInt(template.deptLevel, 10)) {
        dept.leaderId = template.leaderId;
        dept.leaderName = template.leaderName;
      }
      
      parentId = dept.id;
    });
  });
  
  // 添加没有在模板中但员工所属的部门
  employees.forEach(emp => {
    const deptNames = [emp.dept1, emp.dept2, emp.dept3, emp.dept4, emp.dept5, emp.dept6].filter(Boolean);
    let parentId: string | undefined;
    let currentLevel = 1;
    
    deptNames.forEach((name) => {
      if (!name) return;
      const key = deptKey(currentLevel, name);
      if (!deptMap.has(key)) {
        deptMap.set(key, {
          id: `dept-auto-${currentLevel}-${name}`,
          name,
          level: currentLevel,
          parentId,
          children: [],
          employees: [],
          expanded: currentLevel <= 3,
        });
      }
      const dept = deptMap.get(key)!;
      parentId = dept.id;
      currentLevel++;
    });
  });
  
  // 建立父子关系
  const rootDepts: Department[] = [];
  
  deptMap.forEach(dept => {
    if (dept.parentId) {
      const parent = deptMap.get(dept.parentId);
      if (parent) {
        parent.children.push(dept);
      }
    } else {
      rootDepts.push(dept);
    }
  });
  
  // 将员工分配到对应部门 - 使用完整路径匹配
  employees.forEach(emp => {
    const deptNames = [emp.dept1, emp.dept2, emp.dept3, emp.dept4, emp.dept5, emp.dept6].filter(Boolean);
    if (deptNames.length > 0) {
      // 尝试找到最匹配的部门（从最深层级开始查找）
      let matchedDept: Department | undefined;
      
      // 从最深层级开始尝试匹配
      for (let i = deptNames.length; i >= 1; i--) {
        // 遍历所有部门查找匹配
        for (const [key, dept] of deptMap) {
          // 检查从第1级到第i级是否完全匹配
          let fullMatch = true;
          let currentLevel = 1;
          
          for (const name of deptNames.slice(0, i)) {
            const checkKey = `${currentLevel}-${name}`;
            if (!key.includes(checkKey)) {
              fullMatch = false;
              break;
            }
            currentLevel++;
          }
          
          if (fullMatch && dept.level === i) {
            matchedDept = dept;
            break;
          }
        }
        
        if (matchedDept) break;
      }
      
      // 如果没有找到匹配，尝试简单匹配（只按最后一级）
      if (!matchedDept) {
        const lastName = deptNames[deptNames.length - 1];
        if (lastName) {
          const key = deptKey(deptNames.length, lastName);
          const dept = deptMap.get(key);
          if (dept) {
            matchedDept = dept;
          }
        }
      }
      
      if (matchedDept) {
        matchedDept.employees.push(emp);
      }
    }
  });
  
  // 排序子部门
  const sortDepts = (depts: Department[]): Department[] => {
    depts.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
    depts.forEach(d => sortDepts(d.children));
    return depts;
  };
  
  return sortDepts(rootDepts);
}

export function exportToExcel(_employees: Employee[], departments: Department[]): void {
  const collectAllEmployees = (depts: Department[]): Employee[] => {
    let result: Employee[] = [];
    depts.forEach(dept => {
      result = result.concat(dept.employees);
      result = result.concat(collectAllEmployees(dept.children));
    });
    return result;
  };
  
  const allEmployees = collectAllEmployees(departments);
  
  // 过滤掉虚拟员工（兼岗），不影响人数统计
  const realEmployees = allEmployees.filter(emp => !emp.isVirtual);
  
  const data = realEmployees.map(emp => ({
    '姓名': emp.name,
    '工号': emp.employeeId,
    '职级': emp.level,
    '一级部门': emp.dept1 || '',
    '二级部门': emp.dept2 || '',
    '三级部门': emp.dept3 || '',
    '四级部门': emp.dept4 || '',
    '五级部门': emp.dept5 || '',
    '六级部门': emp.dept6 || '',
  }));
  
  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, '员工信息');
  
  // 添加组织架构表
  const orgData: Record<string, string>[] = [];
  const collectDepts = (depts: Department[], prefix: string = '') => {
    depts.forEach(dept => {
      const prefixParts = prefix.split('/').filter(Boolean);
      orgData.push({
        '一级部门': dept.level === 1 ? dept.name : prefixParts[0] || '',
        '二级部门': dept.level === 2 ? dept.name : prefixParts[1] || '',
        '三级部门': dept.level === 3 ? dept.name : prefixParts[2] || '',
        '四级部门': dept.level === 4 ? dept.name : prefixParts[3] || '',
        '五级部门': dept.level === 5 ? dept.name : prefixParts[4] || '',
        '六级部门': dept.level === 6 ? dept.name : prefixParts[5] || '',
        '部门级别': String(dept.level),
        '部门负责人工号': dept.leaderId || '',
        '部门负责人': dept.leaderName || '',
      });
      collectDepts(dept.children, prefix + '/' + dept.name);
    });
  };
  collectDepts(departments);
  
  if (orgData.length > 0) {
    const orgWorksheet = XLSX.utils.json_to_sheet(orgData);
    XLSX.utils.book_append_sheet(workbook, orgWorksheet, '组织架构');
  }
  
  XLSX.writeFile(workbook, '组织架构数据.xlsx');
}

export function generateSampleEmployeeTemplate(): void {
  const data = [
    { '姓名': '张三', '工号': 'E001', '职级': 'L3.2', '一级部门': '技术部', '二级部门': '研发部', '三级部门': '前端组', '四级部门': '', '五级部门': '', '六级部门': '' },
    { '姓名': '李四', '工号': 'E002', '职级': 'L2.1', '一级部门': '技术部', '二级部门': '研发部', '三级部门': '前端组', '四级部门': '', '五级部门': '', '六级部门': '' },
    { '姓名': '王五', '工号': 'E003', '职级': 'L4.2', '一级部门': '技术部', '二级部门': '研发部', '三级部门': '', '四级部门': '', '五级部门': '', '六级部门': '' },
  ];
  
  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, '员工信息');
  XLSX.writeFile(workbook, '员工信息模板.xlsx');
}

export function generateSampleOrgTemplate(): void {
  const data = [
    { '一级部门': '技术部', '二级部门': '研发部', '三级部门': '前端组', '四级部门': '', '五级部门': '', '六级部门': '', '部门级别': '3', '部门负责人工号': 'E001', '部门负责人': '张三' },
    { '一级部门': '技术部', '二级部门': '研发部', '三级部门': '后端组', '四级部门': '', '五级部门': '', '六级部门': '', '部门级别': '3', '部门负责人工号': '', '部门负责人': '' },
    { '一级部门': '技术部', '二级部门': '测试部', '三级部门': '', '四级部门': '', '五级部门': '', '六级部门': '', '部门级别': '2', '部门负责人工号': '', '部门负责人': '' },
    { '一级部门': '人力资源部', '二级部门': '', '三级部门': '', '四级部门': '', '五级部门': '', '六级部门': '', '部门级别': '1', '部门负责人工号': '', '部门负责人': '' },
  ];
  
  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, '组织架构');
  XLSX.writeFile(workbook, '组织架构模板.xlsx');
}
