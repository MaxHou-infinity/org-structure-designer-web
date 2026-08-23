import { describe, it, expect } from 'vitest';
import {
  computeTreeDepth,
  computeL1,
  computeL2,
  computeL3,
  computeHealthReport,
  flattenDepartments,
  HEALTH_STATUS_LABEL,
} from './analytics';
import { Employee, Department, LevelConfig } from '../types';

/** 便捷构造员工 */
function emp(id: string, level: string, opts: Partial<Employee> = {}): Employee {
  return { id, name: `员工${id}`, employeeId: id, level, ...opts };
}

/** 便捷构造部门（不带头count） */
function dept(
  id: string,
  name: string,
  level: number,
  opts: Partial<Department> = {},
): Department {
  return {
    id,
    name,
    level,
    parentId: opts.parentId,
    children: opts.children ?? [],
    employees: opts.employees ?? [],
    expanded: true,
    headcount: opts.headcount,
    leaderId: opts.leaderId,
    leaderName: opts.leaderName,
  };
}

const COSTS: LevelConfig[] = [
  { code: 'L', number: '1.1', label: '初级', color: '#FFCC99', cost: 2 },
  { code: 'L', number: '2.1', label: '高级', color: '#CCFF99', cost: 3 },
  { code: 'L', number: '3.2', label: '经理', color: '#9999FF', cost: 5 },
];

/** 构造一条 depth 层深链（根 level=1 ... 叶子 level=depth） */
function chain(depth: number): Department {
  let node = dept(`n${depth}`, `D${depth}`, depth);
  for (let i = depth - 1; i >= 1; i--) {
    node = dept(`n${i}`, `D${i}`, i, { children: [node] });
  }
  return node;
}

describe('computeTreeDepth（层级深度）', () => {
  it('空树深度为 0', () => {
    expect(computeTreeDepth([])).toBe(0);
  });
  it('单根无子 → 1', () => {
    expect(computeTreeDepth([dept('a', 'A', 1)])).toBe(1);
  });
  it('三层嵌套 → 3', () => {
    const c = dept('c', 'C', 3);
    const b = dept('b', 'B', 2, { children: [c] });
    const a = dept('a', 'A', 1, { children: [b] });
    expect(computeTreeDepth([a])).toBe(3);
  });
  it('取最深路径（不等深兄弟）', () => {
    const leaf = dept('leaf', 'Leaf', 4);
    const deep = dept('deep', 'Deep', 2, { children: [dept('d2', 'D2', 3, { children: [leaf] })] });
    const shallow = dept('shallow', 'Shallow', 2);
    const root = dept('root', 'Root', 1, { children: [deep, shallow] });
    expect(computeTreeDepth([root])).toBe(4);
  });
});

describe('computeL1（一级部门概览）', () => {
  it('汇总子树人数与编制', () => {
    const leafEmp = [emp('e1', 'L1.1'), emp('e2', 'L1.1')];
    const leaf = dept('leaf', '研发组', 2, { employees: leafEmp, headcount: 3 });
    const root = dept('tech', '技术部', 1, { children: [leaf], headcount: 5 });
    const rows = computeL1([root]);
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('技术部');
    expect(rows[0].actual).toBe(2); // 子树 2 人
    expect(rows[0].headcount).toBe(8); // 子树编制 = 根 5 + 叶子 3
    expect(rows[0].levelDistribution['L1.1']).toBe(2);
  });

  it('未配置编制 → headcount null 且状态为关注', () => {
    const root = dept('tech', '技术部', 1, { employees: [emp('e1', 'L1.1')] });
    const rows = computeL1([root]);
    expect(rows[0].headcount).toBeNull();
    expect(rows[0].status).toBe('warn');
  });
});

describe('computeL2（红黄绿阈值 + 判读）', () => {
  it('管理幅度绿：有负责人部门平均直管 3-8 人 → 健康', () => {
    // 2 个有负责人的部门，各 4 名直属员工 => 平均直管 = (4+4)/2 = 4 → healthy
    const m1 = dept('m1', 'M1', 1, { leaderId: 'L01', leaderName: '领导A', employees: [emp('a', 'L2.1'), emp('b', 'L2.1'), emp('c', 'L2.1'), emp('d', 'L2.1')] });
    const m2 = dept('m2', 'M2', 1, { leaderId: 'L02', leaderName: '领导B', employees: [emp('e', 'L2.1'), emp('f', 'L2.1'), emp('g', 'L2.1'), emp('h', 'L2.1')] });
    const l2 = computeL2([m1, m2]);
    const span = l2.find((x) => x.key === 'span')!;
    expect(span.value).toBeCloseTo(4, 0);
    expect(span.status).toBe('healthy');
    expect(span.verdict).toContain('管理幅度适中');
  });

  it('管理幅度只计直属下属（非整棵子树）', () => {
    // 部门 A 有负责人，直属 2 人，但带一个 20 人的子部门：管理幅度只算直属 2 人，即 2/1=2 → 关注
    const child = dept('a1', 'A1', 2, { employees: Array.from({ length: 20 }, (_, i) => emp(`c${i}`, 'L1.1')) });
    const a = dept('a', 'A', 1, { leaderId: 'L01', leaderName: '领导A', employees: [emp('x', 'L2.1'), emp('y', 'L2.1')], children: [child] });
    const l2 = computeL2([a]);
    const span = l2.find((x) => x.key === 'span')!;
    expect(span.value).toBeCloseTo(2, 0);
    expect(span.status).toBe('warn');
  });

  it('管理者比健康阈值 ≤15%', () => {
    // 1 个管理者，20 个员工（含管理者去重后 19 非管理）但这里 manager 不在 employees
    const m1 = dept('m1', 'M1', 1, { leaderId: 'L01', leaderName: '领导A', employees: [emp('e1', 'L2.1'), emp('e2', 'L2.1')] });
    const reporter = dept('m2', 'M2', 1, { leaderId: 'L02', leaderName: '领导B', employees: [emp('e3', 'L2.1'), emp('e4', 'L2.1'), emp('e5', 'L2.1')] });
    const l2 = computeL2([m1, reporter]);
    const ratio = l2.find((x) => x.key === 'managerRatio')!;
    // totalEmployees=5, managers=2 => 40% -> danger(>25)
    expect(ratio.value).toBeCloseTo(40, 0);
    expect(ratio.status).toBe('danger');
  });

  it('空岗率绿色 ≤10%（编制 40，实际 36）', () => {
    const root = dept('tech', '技术部', 1, { headcount: 40, employees: [emp('e1', 'L1.1')] });
    const leaf = dept('leaf', '组', 2, { children: [], employees: Array.from({ length: 35 }, (_, i) => emp(`e${i + 2}`, 'L1.1')) });
    root.children = [leaf];
    const l2 = computeL2([root]);
    const vac = l2.find((x) => x.key === 'vacancy')!;
    // 编制40，实际36 => 10% → healthy
    expect(vac.value).toBeCloseTo(10, 0);
    expect(vac.status).toBe('healthy');
  });

  it('未配置编制 → 空岗率 null + 关注', () => {
    const root = dept('tech', '技术部', 1, { employees: [emp('e1', 'L1.1')] });
    const l2 = computeL2([root]);
    const vac = l2.find((x) => x.key === 'vacancy')!;
    expect(vac.value).toBeNull();
    expect(vac.status).toBe('warn');
    expect(vac.verdict).toContain('未配置编制');
  });

  it('无负责人 → 管理幅度 null + 关注', () => {
    const root = dept('tech', '技术部', 1, { employees: [emp('e1', 'L1.1')] });
    const l2 = computeL2([root]);
    const span = l2.find((x) => x.key === 'span')!;
    expect(span.value).toBeNull();
    expect(span.status).toBe('warn');
  });
});

describe('computeL3（编制 vs 实际 vs 缺口 + 成本）', () => {
  it('正缺口 = 空岗，缺口成本 = 缺口 × 平均成本', () => {
    const leaf = dept('leaf', '研发组', 2, { employees: [emp('e1', 'L1.1', { isVirtual: false })], headcount: 2 });
    const root = dept('tech', '技术部', 1, { children: [leaf], headcount: 5 });
    const rows = computeL3([root], COSTS);
    const tech = rows.find((r) => r.deptId === 'tech')!;
    expect(tech.actual).toBe(1);
    expect(tech.headcount).toBe(7); // 5 + 2
    expect(tech.gap).toBe(6);
    expect(tech.avgCost).toBe(2); // 1 人 L1.1 成本 2
    expect(tech.actualCost).toBe(2);
    expect(tech.gapCost).toBe(12); // 6 × 2
    expect(tech.status).toBe('danger'); // 大空岗
  });

  it('负缺口 = 超编 + 预警', () => {
    const root = dept('tech', '技术部', 1, {
      headcount: 2,
      employees: [emp('e1', 'L1.1'), emp('e2', 'L1.1'), emp('e3', 'L1.1')],
    });
    const rows = computeL3([root], COSTS);
    expect(rows[0].gap).toBe(-1);
    expect(rows[0].status).toBe('danger');
  });

  it('未配置编制 → headcount null、gap null、状态关注', () => {
    const root = dept('tech', '技术部', 1, { employees: [emp('e1', 'L1.1')] });
    const rows = computeL3([root], COSTS);
    expect(rows[0].headcount).toBeNull();
    expect(rows[0].gap).toBeNull();
    expect(rows[0].status).toBe('warn');
  });

  it('员工个人成本覆盖职级成本映射', () => {
    // L1.1 职级成本为 2，但该员工个人 cost=5 → 实际成本/平均成本按个人 5
    const root = dept('tech', '技术部', 1, { employees: [emp('e1', 'L1.1', { cost: 5 })] });
    const rows = computeL3([root], COSTS);
    expect(rows[0].actualCost).toBe(5);
    expect(rows[0].avgCost).toBe(5);
  });
});

describe('computeHealthReport（主入口 + 汇总）', () => {
  it('覆盖全公司口径汇总', () => {
    const techLeaf = dept('tl', '研发组', 2, { employees: [emp('e1', 'L1.1'), emp('e2', 'L2.1')], headcount: 2 });
    const tech = dept('tech', '技术部', 1, { children: [techLeaf], headcount: 5 });
    const sales = dept('sales', '销售部', 1, { employees: [emp('e3', 'L3.2', { isVirtual: false })], headcount: 3 });
    const report = computeHealthReport([tech, sales], COSTS);
    // totalEmployees = 3 (2 + 1)
    expect(report.totals.totalEmployees).toBe(3);
    // totalDepartments
    expect(report.totals.totalDepartments).toBe(3);
    // totalHeadcount = (5+2) + 3 = 10, totalGap = 10 - 3 = 7
    expect(report.totals.totalGap).toBe(7);
    expect(report.l1).toHaveLength(2);
    expect(report.l2).toHaveLength(4);
    expect(report.summary.overall).toBeDefined();
  });

  it('聚焦单个 L1 → scope 只算该子树', () => {
    const a = dept('a', 'A', 1, { children: [dept('a1', 'A1', 2, { employees: [emp('x', 'L1.1')] })], headcount: 3 });
    const b = dept('b', 'B', 1, { employees: [emp('y', 'L1.1')], headcount: 1 });
    const report = computeHealthReport([a, b], COSTS, 'a');
    expect(report.scopeDeptId).toBe('a');
    expect(report.l1.map((r) => r.deptId)).toEqual(['a']);
    expect(report.totals.totalEmployees).toBe(1);
  });
});

describe('辅助', () => {
  it('flattenDepartments 扁平化所有部门', () => {
    const c = dept('c', 'C', 3);
    const b = dept('b', 'B', 2, { children: [c] });
    const a = dept('a', 'A', 1, { children: [b] });
    expect(flattenDepartments([a]).map((d) => d.id)).toEqual(['a', 'b', 'c']);
  });
  it('状态文案映射', () => {
    expect(HEALTH_STATUS_LABEL.healthy).toBe('健康');
    expect(HEALTH_STATUS_LABEL.warn).toBe('关注');
    expect(HEALTH_STATUS_LABEL.danger).toBe('预警');
  });
});

describe('computeL1 边界', () => {
  it('空树返回空数组', () => {
    expect(computeL1([])).toEqual([]);
  });

  it('单部门无子节点：汇总自身人数/编制/职级分布', () => {
    const root = dept('tech', '技术部', 1, {
      employees: [emp('e1', 'L1.1'), emp('e2', 'L2.1')],
      headcount: 2,
    });
    const rows = computeL1([root]);
    expect(rows).toHaveLength(1);
    expect(rows[0].deptId).toBe('tech');
    expect(rows[0].actual).toBe(2);
    expect(rows[0].headcount).toBe(2);
    expect(rows[0].levelDistribution).toEqual({ 'L1.1': 1, 'L2.1': 1 });
  });

  it('编制为 0（=未配置）→ headcount null，状态为关注', () => {
    const root = dept('tech', '技术部', 1, { employees: [emp('e1', 'L1.1')], headcount: 0 });
    const rows = computeL1([root]);
    // sumHeadcountSubtree 只累加 headcount>0；编制为 0 视为无有效编制 → 返回 null
    expect(rows[0].headcount).toBeNull();
    // 未配置编制 → 无法判空岗 → 关注
    expect(rows[0].status).toBe('warn');
  });

  it('number 型 headcount 非法（NaN/Infinity）不累加，子树未配置则返回 null', () => {
    const root = dept('tech', '技术部', 1, { headcount: Number.NaN });
    const rows = computeL1([root]);
    expect(rows[0].headcount).toBeNull();
    expect(rows[0].status).toBe('warn');
  });
});

describe('computeL2 边界', () => {
  it('空树：depth=0 健康，span/vacancy/managerRatio 均为 null', () => {
    const l2 = computeL2([]);
    expect(l2).toHaveLength(4);
    const depth = l2.find((x) => x.key === 'depth')!;
    expect(depth.value).toBe(0);
    expect(depth.status).toBe('healthy');
    for (const key of ['span', 'vacancy', 'managerRatio'] as const) {
      expect(l2.find((x) => x.key === key)!.value).toBeNull();
    }
  });

  it('层级深度阈值：≤4 健康、5-6 关注、>6 预警', () => {
    expect(computeL2([chain(4)]).find((x) => x.key === 'depth')!.status).toBe('healthy');
    expect(computeL2([chain(5)]).find((x) => x.key === 'depth')!.status).toBe('warn');
    expect(computeL2([chain(6)]).find((x) => x.key === 'depth')!.status).toBe('warn');
    expect(computeL2([chain(7)]).find((x) => x.key === 'depth')!.status).toBe('danger');
  });

  it('管理幅度阈值：3-8 健康、1-2 与 9-12 关注、<1 或 >12 预警', () => {
    // 1 个有负责人的部门 + 1 名直属员工 → 平均直管 = 1/1 = 1 → warn（1-2 关注）
    const only = dept('m', 'M', 1, { leaderId: 'L1', leaderName: '领导', employees: [emp('a', 'L1.1')] });
    expect(computeL2([only]).find((x) => x.key === 'span')!.status).toBe('warn');

    // 2 个有负责人的部门，各 2 名直属员工 → 平均直管 = (2+2)/2 = 2 → warn
    const m1 = dept('m1', 'M1', 1, { leaderId: 'L1', leaderName: '领导A', employees: [emp('a', 'L1.1'), emp('b', 'L1.1')] });
    const m2 = dept('m2', 'M2', 1, { leaderId: 'L2', leaderName: '领导B', employees: [emp('c', 'L1.1'), emp('d', 'L1.1')] });
    expect(computeL2([m1, m2]).find((x) => x.key === 'span')!.status).toBe('warn');

    // 有负责人但 0 直属员工 → 平均直管 = 0 → <1 → 预警
    const empty = dept('e', 'E', 1, { leaderId: 'L3', leaderName: '领导C', employees: [] });
    expect(computeL2([empty]).find((x) => x.key === 'span')!.status).toBe('danger');
  });

  it('管理者比阈值：≤15 健康、≤25 关注、>25 预警', () => {
    // 1 管理者 + 4 非管理员工（管理者不在员工表）→ 1/4=25% → warn 边界
    const w = dept('w', 'W', 1, {
      leaderId: 'L1',
      leaderName: '领导',
      employees: [emp('e1', 'L1.1'), emp('e2', 'L1.1'), emp('e3', 'L1.1'), emp('e4', 'L1.1')],
    });
    const wRatio = computeL2([w]).find((x) => x.key === 'managerRatio')!;
    expect(wRatio.value).toBeCloseTo(25, 0);
    expect(wRatio.status).toBe('warn');

    // 1 管理者 + 1 非管理员工 → 1/1=100% → danger
    const d = dept('d', 'D', 1, { leaderId: 'L2', leaderName: '领导', employees: [emp('x', 'L1.1')] });
    const dRatio = computeL2([d]).find((x) => x.key === 'managerRatio')!;
    expect(dRatio.value).toBeCloseTo(100, 0);
    expect(dRatio.status).toBe('danger');
  });

  it('空岗率阈值：≤10 健康、≤20 关注、>20 预警', () => {
    // 编制 9、实际 5 → (9-5)/9=44.4% → danger
    const root = dept('t', 'T', 1, { headcount: 9, employees: Array.from({ length: 5 }, (_, i) => emp(`e${i}`, 'L1.1')) });
    const vac = computeL2([root]).find((x) => x.key === 'vacancy')!;
    expect(vac.value).toBeCloseTo(44.4, 1);
    expect(vac.status).toBe('danger');
  });

  it('无任何部门/员工/编制 → 全部不可计算指标为 null', () => {
    const l2 = computeL2([dept('empty', '空部门', 1, {})]);
    expect(l2.find((x) => x.key === 'span')!.value).toBeNull();
    expect(l2.find((x) => x.key === 'depth')!.value).toBe(1); // 单节点自身层级为 1
    expect(l2.find((x) => x.key === 'managerRatio')!.value).toBeNull();
    expect(l2.find((x) => x.key === 'vacancy')!.value).toBeNull();
  });
});

describe('computeL3 边界', () => {
  it('空树返回空数组', () => {
    expect(computeL3([], COSTS)).toEqual([]);
  });

  it('缺编（正缺口）状态：缺口≤10% 健康、≤20% 关注、>20% 预警', () => {
    // 编制 10、实际 9 → 缺口 1 → 10% → healthy
    const ok = dept('ok', 'OK', 1, { headcount: 10, employees: Array.from({ length: 9 }, (_, i) => emp(`e${i}`, 'L1.1')) });
    expect(computeL3([ok], COSTS)[0].status).toBe('healthy');

    // 编制 10、实际 8 → 缺口 2 → 20% → warn
    const w = dept('w', 'W', 1, { headcount: 10, employees: Array.from({ length: 8 }, (_, i) => emp(`e${i}`, 'L1.1')) });
    expect(computeL3([w], COSTS)[0].status).toBe('warn');

    // 编制 10、实际 7 → 缺口 3 → 30% → danger
    const d = dept('d', 'D', 1, { headcount: 10, employees: Array.from({ length: 7 }, (_, i) => emp(`e${i}`, 'L1.1')) });
    expect(computeL3([d], COSTS)[0].status).toBe('danger');
  });

  it('gapCost 在无成本配置时按 0 计（avgCost=0）', () => {
    // 员工职级未配置任何 cost → avgCost=0，gapCost=0，但缺口存在
    const root = dept('t', 'T', 1, { headcount: 3, employees: [emp('e1', 'ZZ1')] });
    const row = computeL3([root], COSTS)[0];
    expect(row.gap).toBe(2);
    expect(row.avgCost).toBe(0);
    expect(row.gapCost).toBe(0);
    expect(row.actualCost).toBe(0);
  });

  it('编制为 0（=未配置）→ headcount null、缺口 null、状态关注', () => {
    const root = dept('t', 'T', 1, { headcount: 0, employees: [emp('e1', 'L1.1'), emp('e2', 'L1.1')] });
    const row = computeL3([root], COSTS)[0];
    // sumHeadcountSubtree 只累加 headcount>0；编制为 0 → 无有效编制 → headcount=null
    expect(row.headcount).toBeNull();
    expect(row.gap).toBeNull();
    expect(row.status).toBe('warn');
  });

  it('超编梯度：轻微超编关注、严重超编预警', () => {
    // headcount=10, actual=11 → gap=-1, 超编占比=1/11≈9% ≤20% → warn（关注）
    const slight = dept('s', 'S', 1, { headcount: 10, employees: Array.from({ length: 11 }, (_, i) => emp(`e${i}`, 'L1.1')) });
    // headcount=10, actual=15 → gap=-5, 超编占比=5/15≈33% >20% → danger（预警）
    const severe = dept('sv', 'SV', 1, { headcount: 10, employees: Array.from({ length: 15 }, (_, i) => emp(`g${i}`, 'L1.1')) });
    expect(computeL3([slight], COSTS)[0].status).toBe('warn');
    expect(computeL3([severe], COSTS)[0].status).toBe('danger');
  });
});

describe('口径一致性（L1 与 L3 对同一部门状态一致，回归 t4）', () => {
  it('未配置编制（0 与 undefined）→ L1 与 L3 均判关注（消除 L1 关注/L3 超编矛盾）', () => {
    // headcount=0 → 视为无有效编制 → 两者都 warn
    const zero = dept('zero', 'Z', 1, { headcount: 0, employees: [emp('a', 'L1.1'), emp('b', 'L1.1')] });
    expect(computeL1([zero])[0].status).toBe('warn');
    expect(computeL3([zero], COSTS)[0].status).toBe('warn');
    // 完全未配置 headcount → 两者都 warn
    const none = dept('none', 'N', 1, { employees: [emp('c', 'L1.1')] });
    expect(computeL1([none])[0].status).toBe('warn');
    expect(computeL3([none], COSTS)[0].status).toBe('warn');
  });

  it('满编 → L1 与 L3 均判健康', () => {
    const full = dept('full', 'F', 1, { headcount: 3, employees: [emp('a', 'L1.1'), emp('b', 'L1.1'), emp('c', 'L1.1')] });
    expect(computeL1([full])[0].status).toBe('healthy');
    expect(computeL3([full], COSTS)[0].status).toBe('healthy');
  });

  it('空岗与超编 → L1 与 L3 状态一致（共用 deptStatus）', () => {
    // 空岗：编制 10、实际 4 → 60% 空岗 → danger
    const vac = dept('vac', 'V', 1, { headcount: 10, employees: Array.from({ length: 4 }, (_, i) => emp(`e${i}`, 'L1.1')) });
    expect(computeL1([vac])[0].status).toBe('danger');
    expect(computeL3([vac], COSTS)[0].status).toBe('danger');
    // 超编：编制 5、实际 6 → 缺口占比 16.7% ≤20% → warn
    const over = dept('over', 'O', 1, { headcount: 5, employees: Array.from({ length: 6 }, (_, i) => emp(`e${i}`, 'L1.1')) });
    expect(computeL1([over])[0].status).toBe('warn');
    expect(computeL3([over], COSTS)[0].status).toBe('warn');
  });
});

describe('computeHealthReport 边界', () => {
  it('空树：各项为空且 totals 归零', () => {
    const report = computeHealthReport([], COSTS);
    expect(report.l1).toEqual([]);
    expect(report.l2).toHaveLength(4);
    expect(report.l3).toEqual([]);
    expect(report.totals.totalEmployees).toBe(0);
    expect(report.totals.totalDepartments).toBe(0);
    expect(report.totals.totalGap).toBe(0);
    expect(report.totals.totalCost).toBe(0);
    expect(report.totals.configuredHeadcount).toBe(0);
  });

  it('聚焦不存在的部门 id → 回退全公司口径', () => {
    const a = dept('a', 'A', 1, { employees: [emp('x', 'L1.1')], headcount: 1 });
    const b = dept('b', 'B', 1, { employees: [emp('y', 'L1.1')], headcount: 1 });
    const report = computeHealthReport([a, b], COSTS, 'no-such-id');
    expect(report.scopeDeptId).toBe('no-such-id');
    expect(report.totals.totalEmployees).toBe(2);
    expect(report.l1).toHaveLength(2);
  });

  it('虚拟兼岗不计入实际人数与成本，但计入职级分布', () => {
    const root = dept('t', 'T', 1, {
      headcount: 2,
      employees: [emp('real', 'L1.1'), emp('virt', 'L2.1', { isVirtual: true })],
    });
    const report = computeHealthReport([root], COSTS);
    expect(report.totals.totalEmployees).toBe(1); // 虚拟排除
    const l1 = report.l1[0];
    expect(l1.actual).toBe(1);
    expect(l1.levelDistribution).toEqual({ 'L1.1': 1, 'L2.1': 1 }); // 分布含虚拟
    const l3 = report.l3[0];
    expect(l3.actualCost).toBe(2); // 仅 real (L1.1 cost 2)
  });
});
