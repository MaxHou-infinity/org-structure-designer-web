import { describe, it, expect } from 'vitest';
import { moveEmployeesBetween } from './departments';
import { Department, Employee } from '../types';

function emp(id: string, name: string, employeeId: string, level = 'L1.1'): Employee {
  return { id, name, employeeId, level };
}

function dept(id: string, name: string, level: number, opts: Partial<Department> = {}): Department {
  return {
    id,
    name,
    level,
    parentId: opts.parentId,
    children: opts.children ?? [],
    employees: opts.employees ?? [],
    expanded: opts.expanded ?? true,
    headcount: opts.headcount,
    leaderId: opts.leaderId,
    leaderName: opts.leaderName,
  };
}

/** 技术部(L1) → 研发组(L2) → 后端(L3)；以及 销售部(L1) */
function build(): Department[] {
  const backend = dept('d-backend', '后端', 3, {
    employees: [emp('e-wang', '王五', 'E003'), emp('e-li', '李四', 'E004'), emp('e-zhao', '赵六', 'E006')],
  });
  const rd = dept('d-rd', '研发组', 2, { children: [backend], leaderId: 'E001', leaderName: '张三' });
  const tech = dept('d-tech', '技术部', 1, { children: [rd], employees: [emp('e-zhang', '张三', 'E001'), emp('e-chen', '陈静', 'E005')] });
  const sales = dept('d-sales', '销售部', 1, { employees: [emp('e-sun', '孙丽', 'E007')] });
  return [tech, sales];
}

function findDept(depts: Department[], id: string): Department | undefined {
  for (const d of depts) {
    if (d.id === id) return d;
    const found = findDept(d.children, id);
    if (found) return found;
  }
  return undefined;
}

describe('moveEmployeesBetween（批量移动，P0）', () => {
  it('把员工从各自所在部门移除并一次性加入目标部门', () => {
    const tree = build();
    // 把 王五(E003, 后端) + 陈静(E005, 技术部直属) 一起移动到 销售部
    const result = moveEmployeesBetween(tree, ['e-wang', 'e-chen'], 'd-sales');

    const 后端 = findDept(result, 'd-backend')!;
    expect(后端.employees.map((e) => e.id)).toEqual(['e-li', 'e-zhao']); // 王五已移除
    const 技术部 = findDept(result, 'd-tech')!;
    expect(技术部.employees.map((e) => e.id)).toEqual(['e-zhang']); // 陈静已移除
    const 销售部 = findDept(result, 'd-sales')!;
    expect(销售部.employees.map((e) => e.id).sort()).toEqual(['e-chen', 'e-sun', 'e-wang'].sort());
  });

  it('未改动结构时返回原引用（避免产生空历史）', () => {
    const tree = build();
    const result = moveEmployeesBetween(tree, [], 'd-sales');
    expect(result).toBe(tree);
  });

  it('empIds 为空 → 原引用', () => {
    const tree = build();
    expect(moveEmployeesBetween(tree, [], 'd-sales')).toBe(tree);
  });

  it('目标部门不存在 → 不移动（原引用）', () => {
    const tree = build();
    const result = moveEmployeesBetween(tree, ['e-wang'], 'd-nonexistent');
    expect(result).toBe(tree);
  });

  it('跨部门移动保留其他员工归属', () => {
    const tree = build();
    const result = moveEmployeesBetween(tree, ['e-li'], 'd-tech');
    const 技术部 = findDept(result, 'd-tech')!;
    expect(技术部.employees.map((e) => e.id).sort()).toEqual(['e-chen', 'e-li', 'e-zhang'].sort());
    const 后端 = findDept(result, 'd-backend')!;
    expect(后端.employees.map((e) => e.id)).toEqual(['e-wang', 'e-zhao']);
  });
});
