import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { buildDepartmentTree } from './excel';
import type { Employee, OrgTemplate, Department } from '../types';

/**
 * 集成测试：直接读取仓库根目录下真实生成的测试 xlsx，
 * 模拟「上传 → 解析 → 建树」的用户数据流，验证画布能真正渲染出结构。
 * （纯 node 环境无 FileReader，故绕过 parse*Excel 的 FileReader 包装，
 *   直接复用与 parse*Excel 完全一致的字段映射逻辑。）
 */

function cellString(value: unknown): string {
  const str = String(value ?? '');
  return str === 'undefined' ? '' : str;
}

function rowsToEmployees(rows: Record<string, unknown>[]): Employee[] {
  return rows.map((row, index) => ({
    id: `emp-${index}-${Date.now()}`,
    name: cellString(row['姓名']),
    employeeId: cellString(row['工号']),
    level: cellString(row['职级']),
    dept1: cellString(row['一级部门']),
    dept2: cellString(row['二级部门']),
    dept3: cellString(row['三级部门']),
    dept4: cellString(row['四级部门']),
    dept5: cellString(row['五级部门']),
    dept6: cellString(row['六级部门']),
  }));
}

function rowsToOrgTemplates(rows: Record<string, unknown>[]): OrgTemplate[] {
  return rows.map((row) => ({
    dept1: cellString(row['一级部门']),
    dept2: cellString(row['二级部门']),
    dept3: cellString(row['三级部门']),
    dept4: cellString(row['四级部门']),
    dept5: cellString(row['五级部门']),
    dept6: cellString(row['六级部门']),
    deptLevel: cellString(row['部门级别']),
    leaderId: cellString(row['部门负责人工号']),
    leaderName: cellString(row['部门负责人']),
  }));
}

function readRows(file: string): Record<string, unknown>[] {
  const wb = XLSX.readFile(file);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);
}

function findDept(depts: Department[], name: string): Department | undefined {
  for (const d of depts) {
    if (d.name === name) return d;
    const found = findDept(d.children, name);
    if (found) return found;
  }
  return undefined;
}

function collectEmployees(dept: Department): Employee[] {
  return [...dept.employees, ...dept.children.flatMap(collectEmployees)];
}

describe('真实测试文件集成：员工+组织架构 → 树渲染（P0 bug #1）', () => {
  it('test_employee_import.xlsx + test_org_import.xlsx → 完整部门树且员工正确归属', () => {
    const employees = rowsToEmployees(readRows('test_employee_import.xlsx'));
    const orgTemplates = rowsToOrgTemplates(readRows('test_org_import.xlsx'));

    // 两个文件解析出的数据量符合预期
    expect(employees).toHaveLength(10);
    expect(orgTemplates).toHaveLength(9);

    // 用「组织架构模板重建部门结构 + 员工路径归属」建树（与 App 上传逻辑一致）
    const tree = buildDepartmentTree(employees, orgTemplates);

    // 三个一级部门（按中文拼音排序：技术部 < 人力资源部 < 销售部）
    const topNames = tree.map((d) => d.name);
    expect(topNames).toEqual(['技术部', '人力资源部', '销售部']);

    // 技术部(L1) → 研发组/测试组(L2) → 后端/前端/功能测试/自动化测试(L3)
    const 技术部 = findDept(tree, '技术部');
    expect(技术部).toBeDefined();
    expect(技术部!.level).toBe(1);
    const 研发组 = findDept(tree, '研发组');
    expect(研发组!.parentId).toBe(技术部!.id);
    const 后端 = findDept(tree, '后端');
    const 前端 = findDept(tree, '前端');
    expect(后端!.level).toBe(3);
    expect(前端!.level).toBe(3);
    // 后端应含 张伟(E001,L3.2)+李娜(E002,L2.1) = 2 人
    expect(collectEmployees(后端!).map((e) => e.employeeId).sort()).toEqual(['E001', 'E002']);
    expect(collectEmployees(前端!).map((e) => e.employeeId)).toEqual(['E003']);

    // 模板负责人传承：后端负责人=张伟
    expect(后端!.leaderId).toBe('E001');
    expect(后端!.leaderName).toBe('张伟');

    // 销售部：华北区/华东区/华南区（L2），无三级可归属则落在二级部门
    const 销售部 = findDept(tree, '销售部');
    expect(销售部!.children.map((c) => c.name).sort()).toEqual(['华东区', '华南区', '华北区'].sort());
    const 华北区 = findDept(tree, '华北区');
    expect(collectEmployees(华北区!).map((e) => e.employeeId)).toEqual(['E007']);

    // 人力资源部：招聘组/薪酬福利组
    const 人力资源部 = findDept(tree, '人力资源部');
    expect(人力资源部).toBeDefined();
    expect(人力资源部!.children.map((c) => c.name).sort()).toEqual(['招聘组', '薪酬福利组'].sort());

    // 员工总数=10（不重复、无丢失）
    const allEmps = tree.flatMap((d) => collectEmployees(d));
    expect(allEmps.length).toBe(10);
  });

  it('员工文件无有效数据 → 空树（上传提示「员工文件无有效数据」的判定路径）', () => {
    const tree = buildDepartmentTree([], []);
    expect(tree).toEqual([]);
  });
});
