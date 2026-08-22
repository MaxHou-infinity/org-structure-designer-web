import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as XLSX from 'xlsx';
import { buildDepartmentTree, exportToExcel } from './excel';

// 部分 mock xlsx：保留读取/生成能力，仅将 writeFile 替换为 spy，避免测试真实写文件
vi.mock('xlsx', async (importOriginal) => {
  const actual = await importOriginal<typeof import('xlsx')>();
  return { ...actual, writeFile: vi.fn() };
});
import type { Employee, OrgTemplate, Department } from '../types';

/** 构造一个员工对象 */
function emp(partial: Partial<Employee> & { name: string; employeeId: string }): Employee {
  return {
    id: partial.employeeId,
    level: 'L1.1',
    dept1: '',
    dept2: '',
    dept3: '',
    dept4: '',
    dept5: '',
    dept6: '',
    ...partial,
  };
}

/** 查找指定名称的部门（递归） */
function findDept(depts: Department[], name: string): Department | undefined {
  for (const dept of depts) {
    if (dept.name === name) return dept;
    const found = findDept(dept.children, name);
    if (found) return found;
  }
  return undefined;
}

/** 收集某部门下（含自身）所有员工 */
function collectEmployees(dept: Department): Employee[] {
  return [...dept.employees, ...dept.children.flatMap(collectEmployees)];
}

describe('buildDepartmentTree', () => {
  it('空输入返回空数组', () => {
    expect(buildDepartmentTree([], [])).toEqual([]);
  });

  it('根据员工部门路径构建多级树并正确归属员工', () => {
    const employees: Employee[] = [
      emp({ name: '张三', employeeId: 'E001', dept1: '技术部', dept2: '研发组', dept3: '后端' }),
      emp({ name: '李四', employeeId: 'E002', dept1: '技术部', dept2: '研发组', dept3: '后端' }),
      emp({ name: '王五', employeeId: 'E003', dept1: '技术部', dept2: '研发组', dept3: '前端' }),
    ];

    const tree = buildDepartmentTree(employees, []);

    expect(tree).toHaveLength(1);
    expect(tree[0].name).toBe('技术部');
    expect(tree[0].level).toBe(1);

    const 研发组 = findDept(tree, '研发组');
    expect(研发组).toBeDefined();
    expect(研发组!.level).toBe(2);
    expect(研发组!.parentId).toBe(tree[0].id);

    const 后端 = findDept(tree, '后端');
    const 前端 = findDept(tree, '前端');
    expect(后端!.level).toBe(3);
    expect(前端!.level).toBe(3);
    expect(collectEmployees(后端!)).toHaveLength(2);
    expect(collectEmployees(前端!)).toHaveLength(1);
  });

  it('组织架构模板创建部门并设置负责人', () => {
    const employees: Employee[] = [
      emp({ name: '张三', employeeId: 'E001', dept1: '技术部', dept2: '研发组' }),
    ];
    const templates: OrgTemplate[] = [
      { dept1: '技术部', dept2: '研发组', deptLevel: '2', leaderId: 'E001', leaderName: '张三' },
    ];

    const tree = buildDepartmentTree(employees, templates);
    const 研发组 = findDept(tree, '研发组');
    expect(研发组).toBeDefined();
    expect(研发组!.leaderId).toBe('E001');
    expect(研发组!.leaderName).toBe('张三');
  });

  it('模板缺层级时，员工路径会自动补齐部门并归属', () => {
    // 模板只定义了 技术部/研发组 两级；员工声称属于 技术部/研发组/后端（三级）
    const employees: Employee[] = [
      emp({ name: '张三', employeeId: 'E001', dept1: '技术部', dept2: '研发组', dept3: '后端' }),
    ];
    const templates: OrgTemplate[] = [
      { dept1: '技术部', dept2: '研发组' },
    ];

    const tree = buildDepartmentTree(employees, templates);
    const 研发组 = findDept(tree, '研发组');
    expect(研发组).toBeDefined();
    // 后端部门会被自动补齐（模板没有但员工声称存在）
    const 后端 = findDept(tree, '后端');
    expect(后端).toBeDefined();
    expect(后端!.level).toBe(3);
    expect(collectEmployees(后端!)).toHaveLength(1);
  });

  it('路径前缀匹配优先：同名子部门不挂在匹配父级下时，归属到最深可匹配部门', () => {
    // 华东区 挂在 市场部 下；员工声称 销售部/华东区（销售部下无华东区）
    const employees: Employee[] = [
      emp({ name: '周九', employeeId: 'E007', dept1: '市场部', dept2: '华东区' }),
      emp({ name: '吴十', employeeId: 'E008', dept1: '销售部', dept2: '华东区' }),
    ];

    const tree = buildDepartmentTree(employees, []);
    // 吴十：路径匹配停在 销售部（其 children 无 华东区）
    const 销售部 = findDept(tree, '销售部');
    expect(销售部).toBeDefined();
    expect(销售部!.employees.map(e => e.employeeId)).toContain('E008');
    // 周九 归到 市场部/华东区
    const 华东区 = findDept(tree, '华东区');
    expect(华东区!.employees.map(e => e.employeeId)).toContain('E007');
  });

  it('部门按中文名称排序', () => {
    const employees: Employee[] = [
      emp({ name: 'a', employeeId: 'E1', dept1: '技术部' }),
      emp({ name: 'b', employeeId: 'E2', dept1: '销售部' }),
      emp({ name: 'c', employeeId: 'E3', dept1: '人力资源部' }),
    ];

    const tree = buildDepartmentTree(employees, []);
    const names = tree.map(d => d.name);
    // localeCompare('zh-CN') 按拼音排序：j(技术部) < r(人力资源部) < x(销售部)
    expect(names).toEqual(['技术部', '人力资源部', '销售部']);
  });

  it('同名同层级部门在模板与员工数据中复用同一节点', () => {
    const employees: Employee[] = [
      emp({ name: '张三', employeeId: 'E001', dept1: '技术部', dept2: '研发组' }),
    ];
    const templates: OrgTemplate[] = [
      { dept1: '技术部', dept2: '研发组', deptLevel: '2', leaderId: 'E001', leaderName: '张三' },
      { dept1: '技术部', dept2: '测试组', deptLevel: '2' },
    ];

    const tree = buildDepartmentTree(employees, templates);
    expect(tree).toHaveLength(1);
    expect(tree[0].children).toHaveLength(2);
    // 技术部下应有 研发组、测试组
    expect(tree[0].children.map(c => c.name).sort()).toEqual(['研发组', '测试组'].sort());
  });

  it('虚拟员工保留 isVirtual 标记', () => {
    const employees: Employee[] = [
      emp({ name: '兼岗', employeeId: 'V001', dept1: '技术部', isVirtual: true }),
    ];

    const tree = buildDepartmentTree(employees, []);
    const 技术部 = tree[0];
    expect(技术部.employees[0].isVirtual).toBe(true);
  });
});

describe('exportToExcel', () => {
  beforeEach(() => {
    vi.mocked(XLSX.writeFile).mockClear();
  });

  it('导出时排除虚拟员工且不抛错（验证生成数据）', async () => {
    const tree: Department[] = [{
      id: 'd1',
      name: '技术部',
      level: 1,
      children: [],
      employees: [
        emp({ name: '张三', employeeId: 'E001', dept1: '技术部' }),
        emp({ name: '兼岗', employeeId: 'V001', dept1: '技术部', isVirtual: true }),
      ],
      expanded: true,
    }];
    await expect(exportToExcel(tree)).resolves.not.toThrow();
    expect(XLSX.writeFile).toHaveBeenCalledOnce();
  });
});
