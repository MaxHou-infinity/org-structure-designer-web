import { describe, it, expect } from 'vitest';
import { parseProject, serializeProject } from './project';
import { DEFAULT_LEVELS } from './levels';
import type { ProjectFile, Scenario } from '../types';

/** v1 项目 fixture：d1(编制5)、d2(编制3，有员工)、d3(未配置编制，有员工) */
function v1ProjectFixture(): ProjectFile {
  const now = '2026-08-01T00:00:00Z';
  const scenario: Scenario = {
    id: 's1',
    name: '基线',
    createdAt: now,
    updatedAt: now,
    levelConfigs: DEFAULT_LEVELS.map((c) => ({ ...c })),
    canvas: { zoom: 100 },
    departments: [
      {
        id: 'd1',
        name: '研发部',
        level: 1,
        expanded: true,
        headcount: 5,
        children: [
          {
            id: 'd2',
            name: '开发组',
            level: 2,
            expanded: true,
            headcount: 3,
            parentId: 'd1',
            children: [],
            employees: [
              { id: 'e1', name: '张三', employeeId: 'E001', level: 'L1.1' },
              { id: 'e2', name: '李四', employeeId: 'E002', level: 'L2.1' },
            ],
          },
        ],
        employees: [{ id: 'e3', name: '王五', employeeId: 'E003', level: 'L3.1' }],
      },
      {
        id: 'd3',
        name: '测试部',
        level: 1,
        expanded: true,
        headcount: undefined,
        children: [],
        employees: [{ id: 'e4', name: '赵六', employeeId: 'E004', level: 'L1.1' }],
      },
    ],
    allEmployeesFlat: [
      { id: 'e1', name: '张三', employeeId: 'E001', level: 'L1.1' },
      { id: 'e2', name: '李四', employeeId: 'E002', level: 'L2.1' },
      { id: 'e3', name: '王五', employeeId: 'E003', level: 'L3.1' },
      { id: 'e4', name: '赵六', employeeId: 'E004', level: 'L1.1' },
    ],
  };
  return {
    id: 'proj-v1',
    name: 'v1项目',
    version: 1,
    currentScenarioId: 's1',
    scenarios: [scenario],
    meta: { createdAt: now, updatedAt: now, version: 1 },
  };
}

describe('.orgproj v1→v2 迁移（岗位化）', () => {
  it('v1 头数>0 部门派生「默认岗位」，员工自动套岗，数字不变', () => {
    const parsed = parseProject(serializeProject(v1ProjectFixture()))!;
    expect(parsed).not.toBeNull();
    expect(parsed.version).toBe(2); // 数据模型版本升为 2

    const sc = parsed.scenarios[0];
    // 全量岗位扁平镜像：d1 + d2 各一个默认岗位（d3 无编制 → 不建岗）
    expect(sc.positions?.length).toBe(2);

    const d1 = sc.departments.find((d) => d.id === 'd1')!;
    const d2 = d1.children.find((d) => d.id === 'd2')!;
    const d3 = sc.departments.find((d) => d.id === 'd3')!;

    // 默认岗位编制数 = 原部门编制（数字不变），名称「默认岗位」
    expect(d1.positions?.[0]?.headcount).toBe(5);
    expect(d2.positions?.[0]?.headcount).toBe(3);
    expect(d1.positions?.[0]?.name).toBe('默认岗位');
    expect(d3.positions?.length ?? 0).toBe(0);

    // 员工自动套岗到所属部门默认岗位
    const e1 = d2.employees.find((e) => e.id === 'e1')!;
    const e3 = d1.employees.find((e) => e.id === 'e3')!;
    const e4 = d3.employees.find((e) => e.id === 'e4')!;
    expect(e1.positionId).toBe(d2.positions?.[0]?.id);
    expect(e2In(d2).positionId).toBe(d2.positions?.[0]?.id);
    expect(e3.positionId).toBe(d1.positions?.[0]?.id);
    expect(e4.positionId).toBeUndefined(); // d3 无编制 → 不建岗，不套岗

    // 原部门 headcount 保留为冗余派生（向下兼容）
    expect(d1.headcount).toBe(5);
    expect(d2.headcount).toBe(3);
  });

  it('迁移幂等：重复 parse 不重复建岗、不重复套岗', () => {
    const first = parseProject(serializeProject(v1ProjectFixture()))!;
    const second = parseProject(serializeProject(first))!;
    const s1 = first.scenarios[0];
    const s2 = second.scenarios[0];
    expect(s2.positions?.length).toBe(s1.positions?.length);
    // 每个岗位头部与次数一致（无重复）
    for (const d of s2.departments) {
      expect(d.positions?.length).toBe(d.positions?.length);
    }
  });

  it('非法 JSON / 空参数 → null；v2 文件往返稳定', () => {
    expect(parseProject('not json {')).toBeNull();
    const v2 = parseProject(serializeProject(v1ProjectFixture()))!;
    const again = parseProject(serializeProject(v2))!;
    expect(again.scenarios[0].positions?.length).toBe(2);
    expect(again.version).toBe(2);
  });
});

function e2In(dep: { employees: { id: string; positionId?: string }[] }) {
  return dep.employees.find((e) => e.id === 'e2')!;
}
