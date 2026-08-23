import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  computeTreeDepth,
  computeL1,
  computeL2,
  computeL3,
  computeHealthReport,
  flattenDepartments,
  HEALTH_STATUS_LABEL,
  generateSuggestions,
  generateDeptSuggestions,
  collectAllSuggestions,
  DEFAULT_HEALTH_THRESHOLDS,
  getHealthThresholds,
  setHealthThresholds,
  resetHealthThresholds,
  HealthThresholds,
  L2Metric,
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
  it('空树：depth=0 判中性/关注（不作层级健康），span/vacancy/managerRatio 均为 null', () => {
    const l2 = computeL2([]);
    expect(l2).toHaveLength(4);
    const depth = l2.find((x) => x.key === 'depth')!;
    expect(depth.value).toBe(0);
    expect(depth.status).toBe('warn');
    expect(depth.verdict).toContain('无法评估层级');
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

describe('generateSuggestions（指标级建议，P1-3）', () => {
  it('健康指标不产生建议', () => {
    // 8 人 + 编制 8（满编）+ 1 管理者（12.5%）→ 四项均为健康
    const root = dept('tech', '技术部', 1, {
      leaderId: 'L1',
      leaderName: '领导',
      headcount: 8,
      employees: Array.from({ length: 8 }, (_, i) => emp(`e${i}`, 'L1.1')),
    });
    const l2 = computeL2([root]);
    expect(l2.every((m) => m.status === 'healthy')).toBe(true);
    expect(generateSuggestions(l2)).toEqual([]);
  });

  it('空岗指标预警 → 生成招聘建议', () => {
    const root = dept('t', 'T', 1, { headcount: 40, employees: Array.from({ length: 20 }, (_, i) => emp(`e${i}`, 'L1.1')) });
    const l2 = computeL2([root]);
    const s = generateSuggestions(l2);
    const vacS = s.find((x) => x.metricKey === 'vacancy' && x.severity === 'critical');
    expect(vacS).toBeDefined();
    expect(vacS!.title).toContain('招聘');
  });

  it('管理幅度预警 → 生成优化汇报线建议', () => {
    const only = dept('m', 'M', 1, { leaderId: 'L1', leaderName: '领导', employees: [] });
    const l2 = computeL2([only]);
    const s = generateSuggestions(l2);
    const spanS = s.find((x) => x.metricKey === 'span');
    expect(spanS).toBeDefined();
    expect(spanS!.detail).toContain('管理幅度');
  });
});

describe('generateDeptSuggestions（部门级建议，P1-3）', () => {
  it('空岗部门 → 生成带部门名的补编建议', () => {
    const root = dept('tech', '技术部', 1, { headcount: 10, employees: Array.from({ length: 4 }, (_, i) => emp(`e${i}`, 'L1.1')) });
    const s = generateDeptSuggestions([root]);
    const vacS = s.find((x) => x.deptId === 'tech' && x.title.includes('空岗'));
    expect(vacS).toBeDefined();
    expect(vacS!.deptName).toBe('技术部');
    expect(vacS!.severity).toBe('critical'); // 60% 空岗
  });

  it('规模偏窄的管理部门 → 建议合并小组', () => {
    const root = dept('tech', '技术部', 1, { leaderId: 'L01', leaderName: '领导', employees: [emp('a', 'L1.1')] });
    const s = generateDeptSuggestions([root]);
    const spanS = s.find((x) => x.metricKey === 'span' && x.title.includes('偏窄'));
    expect(spanS).toBeDefined();
    expect(spanS!.detail).toContain('合并');
  });

  it('未配置编制 → 提示补充编制（info）', () => {
    const root = dept('tech', '技术部', 1, { employees: [emp('a', 'L1.1')] });
    const s = generateDeptSuggestions([root]);
    const nohc = s.find((x) => x.title.includes('未配置编制'));
    expect(nohc).toBeDefined();
    expect(nohc!.severity).toBe('info');
  });
});

describe('collectAllSuggestions（合并指标+部门建议）', () => {
  it('合并并按严重级排序', () => {
    const root = dept('tech', '技术部', 1, { headcount: 10, employees: Array.from({ length: 4 }, (_, i) => emp(`e${i}`, 'L1.1')), leaderId: 'L0', leaderName: '领导' });
    const report = computeHealthReport([root], COSTS);
    const all = collectAllSuggestions(report, [root]);
    expect(all.length).toBeGreaterThan(0);
    const sevRank = { critical: 0, major: 1, minor: 2, info: 3 } as const;
    for (let i = 1; i < all.length; i++) {
      expect(sevRank[all[i].severity]).toBeGreaterThanOrEqual(sevRank[all[i - 1].severity]);
    }
  });
});

describe('阈值可配置化（P2-7）', () => {
  it('computeL2 支持自定义空岗率阈值', () => {
    const root = dept('t', 'T', 1, { headcount: 20, employees: Array.from({ length: 4 }, (_, i) => emp(`e${i}`, 'L1.1')) });
    const custom = { ...DEFAULT_HEALTH_THRESHOLDS, vacancyHealthyMax: 90, vacancyWarnMax: 95 };
    const vac = computeL2([root], custom).find((x) => x.key === 'vacancy')!;
    // (20-4)/20 = 80% ≤ 90 → healthy（默认阈值下为 danger）
    expect(vac.status).toBe('healthy');
  });

  it('computeHealthReport 支持自定义管理幅度阈值', () => {
    const only = dept('m', 'M', 1, { leaderId: 'L1', leaderName: '领导', employees: [emp('a', 'L1.1')] });
    const strict = { ...DEFAULT_HEALTH_THRESHOLDS, spanWarnMax: 0, spanWarnLow: 0, spanHealthyMin: 0, spanHealthyMax: 0 };
    const report = computeHealthReport([only], COSTS, undefined, strict);
    const span = report.l2.find((x) => x.key === 'span')!;
    // 1 人直管，健康区间 [0,0]，1>0 且 1>warnMax(0) → danger
    expect(span.status).toBe('danger');
  });
});

// —— 以下为测试专家补测（填补前端未覆盖边界） ——

describe('generateSuggestions（指标级建议）边界补充', () => {
  it('多项异常 → 每条非健康指标各生成建议，健康指标被跳过', () => {
    const metrics: L2Metric[] = [
      { key: 'span', label: '管理幅度', value: 1.5, unit: '人', status: 'warn', verdict: '偏窄' },
      { key: 'depth', label: '层级深度', value: 3, unit: '层', status: 'healthy', verdict: '精简' },
      { key: 'managerRatio', label: '管理者比', value: 30, unit: '%', status: 'danger', verdict: '过高' },
      { key: 'vacancy', label: '空岗率', value: 8, unit: '%', status: 'healthy', verdict: '满编' },
    ];
    const s = generateSuggestions(metrics);
    // 只有 span(warn) 与 managerRatio(danger) 两条；depth/vacancy 健康被跳过
    expect(s).toHaveLength(2);
    expect(s.map((x) => x.metricKey).sort()).toEqual(['managerRatio', 'span']);
  });

  it('风险优先级：danger → critical、warn → major', () => {
    const metrics: L2Metric[] = [
      { key: 'vacancy', label: '空岗率', value: 30, unit: '%', status: 'danger', verdict: '严重缺编' },
      { key: 'span', label: '管理幅度', value: 1.5, unit: '人', status: 'warn', verdict: '偏窄' },
    ];
    const s = generateSuggestions(metrics);
    const vac = s.find((x) => x.metricKey === 'vacancy')!;
    const span = s.find((x) => x.metricKey === 'span')!;
    expect(vac.severity).toBe('critical');
    expect(span.severity).toBe('major');
  });

  it('span 值为 null（无任何有负责人部门）→ 仍生成建议，detail 提示配置负责人', () => {
    // 无 leaderId/leaderName → spanLeaders=0 → span=null，status=warn
    const noLeader = dept('t', 'T', 1, { employees: [emp('a', 'L1.1')] });
    const s = generateSuggestions(computeL2([noLeader]));
    const span = s.find((x) => x.metricKey === 'span')!;
    expect(span).toBeDefined();
    expect(span.title).toBe('优化管理幅度');
    expect(span.detail).toContain('配置负责人');
    expect(span.severity).toBe('major');
  });

  it('建议 id 格式为 m-<key>', () => {
    const metrics: L2Metric[] = [
      { key: 'depth', label: '层级深度', value: 8, unit: '层', status: 'danger', verdict: '过深' },
    ];
    const s = generateSuggestions(metrics);
    expect(s[0].id).toBe('m-depth');
  });
});

describe('generateDeptSuggestions（部门级建议）边界补充', () => {
  it('管理幅度偏宽（direct > spanHealthyMax=8）→ major', () => {
    const employees = Array.from({ length: 9 }, (_, i) => emp(`e${i}`, 'L1.1'));
    const root = dept('tech', '技术部', 1, { leaderId: 'L01', leaderName: '领导', employees });
    const s = generateDeptSuggestions([root], DEFAULT_HEALTH_THRESHOLDS);
    const wide = s.find((x) => x.id === 'd-tech-spanwide')!;
    expect(wide).toBeDefined();
    expect(wide.severity).toBe('major');
    expect(wide.title).toContain('偏宽');
    expect(wide.title).toContain('9 人');
  });

  it('超编（gap<0）超编占比 > overWarnRatio=20% → critical', () => {
    // headcount=10, actual=13 → gap=-3, 超编占比 3/13≈23.1% > 20% → critical
    const root = dept('o', '市场部', 1, { headcount: 10, employees: Array.from({ length: 13 }, (_, i) => emp(`e${i}`, 'L1.1')) });
    const s = generateDeptSuggestions([root], DEFAULT_HEALTH_THRESHOLDS);
    const over = s.find((x) => x.id === 'd-o-over')!;
    expect(over).toBeDefined();
    expect(over.severity).toBe('critical');
    expect(over.title).toContain('超编 3 人');
    expect(over.detail).toContain('内部转岗');
  });

  it('空岗率三级分级：=10% minor、(10,20]% major、>20% critical', () => {
    const minor = dept('mi', '轻微缺编', 1, { headcount: 10, employees: Array.from({ length: 9 }, (_, i) => emp(`e${i}`, 'L1.1')) }); // 10% → minor
    const major = dept('ma', '中度缺编', 1, { headcount: 10, employees: Array.from({ length: 8 }, (_, i) => emp(`e${i}`, 'L1.1')) }); // 20% → major
    const s = generateDeptSuggestions([minor, major], DEFAULT_HEALTH_THRESHOLDS);
    const mi = s.find((x) => x.deptId === 'mi' && x.title.includes('空岗'))!;
    const ma = s.find((x) => x.deptId === 'ma' && x.title.includes('空岗'))!;
    expect(mi.severity).toBe('minor');
    expect(ma.severity).toBe('major');
  });

  it('建议按严重度排序（critical → major → minor → info）且 id 含部门', () => {
    const critical = dept('c', 'C组', 1, { headcount: 10, employees: Array.from({ length: 4 }, (_, i) => emp(`e${i}`, 'L1.1')) }); // 60% 空岗 critical
    const info = dept('i', 'I组', 1, { employees: [emp('a', 'L1.1')] }); // 未配置编制 info
    const s = generateDeptSuggestions([info, critical], DEFAULT_HEALTH_THRESHOLDS);
    const sevRank = { critical: 0, major: 1, minor: 2, info: 3 } as const;
    for (let i = 1; i < s.length; i++) {
      expect(sevRank[s[i].severity]).toBeGreaterThanOrEqual(sevRank[s[i - 1].severity]);
    }
    expect(s[0].severity).toBe('critical');
    expect(s[0].deptId).toBe('c');
    expect(s[s.length - 1].severity).toBe('info');
  });
});

describe('阈值可配置化（get/set/reset + localStorage 默认回退）', () => {
  const storage = new Map<string, string>();

  beforeEach(() => {
    storage.clear();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => storage.set(k, v),
      removeItem: (k: string) => storage.delete(k),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('未配置 → getHealthThresholds 返回默认阈值', () => {
    expect(getHealthThresholds()).toEqual(DEFAULT_HEALTH_THRESHOLDS);
  });

  it('setHealthThresholds 持久化后 getHealthThresholds 返回覆盖值，未覆盖字段回退默认', () => {
    const custom: HealthThresholds = { ...DEFAULT_HEALTH_THRESHOLDS, vacancyHealthyMax: 30, vacancyWarnMax: 40 };
    setHealthThresholds(custom);
    expect(storage.get('org-designer.health-thresholds')).toBeTruthy();
    const got = getHealthThresholds();
    expect(got.vacancyHealthyMax).toBe(30);
    expect(got.vacancyWarnMax).toBe(40);
    expect(got.spanHealthyMin).toBe(DEFAULT_HEALTH_THRESHOLDS.spanHealthyMin);
  });

  it('getHealthThresholds 对部分覆盖做合并（缺省字段回退默认）', () => {
    storage.set('org-designer.health-thresholds', JSON.stringify({ spanHealthyMax: 10 }));
    const got = getHealthThresholds();
    expect(got.spanHealthyMax).toBe(10);
    expect(got.spanHealthyMin).toBe(DEFAULT_HEALTH_THRESHOLDS.spanHealthyMin);
  });

  it('解析非法 JSON → 回退默认阈值', () => {
    storage.set('org-designer.health-thresholds', '{not valid json');
    expect(getHealthThresholds()).toEqual(DEFAULT_HEALTH_THRESHOLDS);
  });

  it('resetHealthThresholds 清除配置并恢复默认', () => {
    setHealthThresholds({ ...DEFAULT_HEALTH_THRESHOLDS, spanHealthyMin: 1 });
    resetHealthThresholds();
    expect(storage.has('org-designer.health-thresholds')).toBe(false);
    expect(getHealthThresholds()).toEqual(DEFAULT_HEALTH_THRESHOLDS);
  });
});

describe('computeL1 接受阈值参数（可配置化缺口）', () => {
  it('computeL1 用传入阈值覆盖空岗状态', () => {
    const root = dept('t', '技术部', 1, { headcount: 10, employees: Array.from({ length: 4 }, (_, i) => emp(`e${i}`, 'L1.1')) });
    // 缺省（当前阈值）：空岗率 60% > 20% → danger
    expect(computeL1([root])[0].status).toBe('danger');
    // 自定义放宽空岗阈值：60% ≤ 90 → healthy
    const loose: HealthThresholds = { ...DEFAULT_HEALTH_THRESHOLDS, vacancyHealthyMax: 90, vacancyWarnMax: 95 };
    expect(computeL1([root], loose)[0].status).toBe('healthy');
  });
});
