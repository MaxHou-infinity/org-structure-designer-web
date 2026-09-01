import { describe, it, expect } from 'vitest';
import {
  benchmarkFor,
  buildLeadershipDossier,
  computeCompetencyStates,
  computeCompetencySummary,
  dimensionGap,
  gapStatusFromWorstGap,
  genDimensionKey,
  isManager,
  latestSupervisorAssessment,
  levelRequirement,
  listAssessmentHistory,
  normalizedWeights,
  positionBandRequirement,
} from './competency';
import { COMPETENCY_SCALE } from '../types';
import type {
  Assessment,
  CompetencyDimensionDef,
  CompetencyModel,
  Department,
  Employee,
  Position,
} from '../types';

/** —— 测试工厂 —— */

function dim(key: string, over: Partial<CompetencyDimensionDef> = {}): CompetencyDimensionDef {
  return {
    key,
    label: `维度-${key}`,
    definition: `定义-${key}`,
    weight: 0.25,
    group: 'leadership',
    order: 1,
    enabled: true,
    builtin: true,
    ...over,
  };
}

function model(...dims: CompetencyDimensionDef[]): CompetencyModel {
  return { dimensions: dims };
}

function asm(over: {
  employeeId: string;
  dimension: string;
  score: number;
  requirement?: number;
  assessorRole?: Assessment['assessorRole'];
  assessorId?: string;
  assessedAt?: string;
}): Assessment {
  const t = over.assessedAt ?? '2026-01-01T00:00:00.000Z';
  return {
    id: `asm-${over.employeeId}-${over.dimension}-${t}`,
    employeeId: over.employeeId,
    dimension: over.dimension,
    score: over.score,
    scale: COMPETENCY_SCALE,
    requirement: over.requirement ?? 3,
    assessorRole: over.assessorRole ?? 'supervisor',
    assessorId: over.assessorId,
    assessedAt: t,
    source: 'manual',
    createdAt: t,
    updatedAt: t,
  };
}

function emp(id: string, over: Partial<Employee> = {}): Employee {
  return { id, name: `员工${id}`, employeeId: `E${id}`, level: 'L1', ...over };
}

function pos(over: Partial<Position> & { id: string }): Position {
  return {
    departmentId: 'd1',
    name: '岗位',
    headcount: 1,
    status: 'active',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...over,
  };
}

/** —— §5.3 dimensionGap / gapStatusFromWorstGap —— */

describe('dimensionGap（维度 Gap = requirement − score）', () => {
  it('正 = 不足', () => {
    expect(dimensionGap(3, 5)).toBe(2);
    expect(dimensionGap(1, 3)).toBe(2);
  });
  it('负 = 超出', () => {
    expect(dimensionGap(5, 3)).toBe(-2);
  });
  it('零 = 达到', () => {
    expect(dimensionGap(3, 3)).toBe(0);
  });
});

describe('gapStatusFromWorstGap（木桶灯号，固定档位不可调）', () => {
  it('≤0 → healthy', () => {
    expect(gapStatusFromWorstGap(0)).toBe('healthy');
    expect(gapStatusFromWorstGap(-1)).toBe('healthy');
    expect(gapStatusFromWorstGap(-3)).toBe('healthy');
  });
  it('==1 → warn', () => {
    expect(gapStatusFromWorstGap(1)).toBe('warn');
  });
  it('≥2 → danger', () => {
    expect(gapStatusFromWorstGap(2)).toBe('danger');
    expect(gapStatusFromWorstGap(4)).toBe('danger');
  });
});

/** —— §5.2 levelRequirement / positionBandRequirement / benchmarkFor —— */

describe('levelRequirement（职级数字 → 要求分）', () => {
  it('n<3 → 3', () => {
    expect(levelRequirement(1)).toBe(3);
    expect(levelRequirement(2.9)).toBe(3);
  });
  it('n≥3 → 4', () => {
    expect(levelRequirement(3)).toBe(4);
    expect(levelRequirement(4.2)).toBe(4);
    expect(levelRequirement(5)).toBe(4);
  });
  it('NA(null) → 3', () => {
    expect(levelRequirement(null)).toBe(3);
  });
  it('不设 5（5 留高潜识别）', () => {
    expect(levelRequirement(6)).toBe(4);
  });
});

describe('positionBandRequirement（levelBandMin → parseLevelNumber → levelRequirement）', () => {
  it('无岗位 / 无 levelBandMin → null', () => {
    expect(positionBandRequirement(undefined)).toBeNull();
    expect(positionBandRequirement(pos({ id: 'p', levelBandMin: undefined }))).toBeNull();
  });
  it('L2 → 3；L3 / L3.2 → 4', () => {
    expect(positionBandRequirement(pos({ id: 'p', levelBandMin: 'L2' }))).toBe(3);
    expect(positionBandRequirement(pos({ id: 'p', levelBandMin: 'L3' }))).toBe(4);
    expect(positionBandRequirement(pos({ id: 'p', levelBandMin: 'L3.2' }))).toBe(4);
  });
  it('无法解析 → null', () => {
    expect(positionBandRequirement(pos({ id: 'p', levelBandMin: 'xx' }))).toBeNull();
  });
});

describe('benchmarkFor（优先级 B3 显式 > B2 岗位带宽 > B1 职级 > 缺省 3）', () => {
  it('B3 显式最高（1..5 合法范围）', () => {
    expect(benchmarkFor(emp('a', { level: 'L5' }), pos({ id: 'p', levelBandMin: 'L2' }), 5)).toBe(5);
    expect(benchmarkFor(emp('a', { level: 'L1' }), undefined, 1)).toBe(1);
  });
  it('显式越界（0 / 6）视为无效，降级 B2', () => {
    expect(benchmarkFor(emp('a', { level: 'L5' }), pos({ id: 'p', levelBandMin: 'L2' }), 0)).toBe(3);
    expect(benchmarkFor(emp('a', { level: 'L5' }), pos({ id: 'p', levelBandMin: 'L2' }), 6)).toBe(3);
  });
  it('B2 岗位带宽 > B1 职级', () => {
    expect(benchmarkFor(emp('a', { level: 'L1' }), pos({ id: 'p', levelBandMin: 'L3' }))).toBe(4);
  });
  it('B1 职级：n≥3 → 4', () => {
    expect(benchmarkFor(emp('a', { level: 'L3.1' }))).toBe(4);
  });
  it('缺省 3：职级 n<3 或无法解析', () => {
    expect(benchmarkFor(emp('a', { level: 'L1' }))).toBe(3);
    expect(benchmarkFor(emp('a', { level: 'xx' }))).toBe(3);
  });
});

/** —— §5.4 latestSupervisorAssessment —— */

describe('latestSupervisorAssessment（supervisor 最新分；hrbp 不覆盖）', () => {
  const dims = model(dim('ls'));
  it('多份 supervisor 取 assessedAt 最新', () => {
    const list = [
      asm({ employeeId: 'a', dimension: 'ls', score: 2, assessedAt: '2026-01-01T00:00:00.000Z' }),
      asm({ employeeId: 'a', dimension: 'ls', score: 4, assessedAt: '2026-02-01T00:00:00.000Z' }),
    ];
    expect(latestSupervisorAssessment(list, 'a', 'ls')?.score).toBe(4);
    // computeCompetencySummary 走同一取数逻辑
    expect(computeCompetencySummary(list, 'a', dims)?.dimensions[0].score).toBe(4);
  });
  it('hrbp 校准分不覆盖 supervisor 原始分', () => {
    const list = [
      asm({ employeeId: 'a', dimension: 'ls', score: 2, assessorRole: 'supervisor', assessedAt: '2026-01-01T00:00:00.000Z' }),
      asm({ employeeId: 'a', dimension: 'ls', score: 5, assessorRole: 'hrbp', assessedAt: '2026-02-01T00:00:00.000Z' }),
    ];
    expect(latestSupervisorAssessment(list, 'a', 'ls')?.score).toBe(2);
  });
  it('self/peer 未实现，不参与', () => {
    const list = [asm({ employeeId: 'a', dimension: 'ls', score: 5, assessorRole: 'self' })];
    expect(latestSupervisorAssessment(list, 'a', 'ls')).toBeNull();
  });
  it('无匹配（他人/他维度）→ null', () => {
    const list = [asm({ employeeId: 'b', dimension: 'ls', score: 4 })];
    expect(latestSupervisorAssessment(list, 'a', 'ls')).toBeNull();
    expect(latestSupervisorAssessment(list, 'a', 'other')).toBeNull();
  });
});

/** —— §5.5 normalizedWeights —— */

describe('normalizedWeights（已评估维度间归一化，跨组合并；全零回退等权）', () => {
  const m = model(
    dim('ls', { weight: 0.25, group: 'leadership' }),
    dim('team', { weight: 0.25, group: 'leadership' }),
    dim('biz', { weight: 0.5, group: 'staff' }),
  );
  it('跨组合并归一：只对已评估 key 归一化', () => {
    const w = normalizedWeights(m, new Set(['ls', 'biz']));
    expect(w.get('ls')).toBeCloseTo(1 / 3, 6);
    expect(w.get('biz')).toBeCloseTo(2 / 3, 6);
    expect(w.get('team')).toBeUndefined();
  });
  it('全部权重为 0 → 等权（简单平均）', () => {
    const m0 = model(dim('a', { weight: 0 }), dim('b', { weight: 0 }), dim('c', { weight: 0 }));
    const w = normalizedWeights(m0, new Set(['a', 'b', 'c']));
    expect(w.get('a')).toBeCloseTo(1 / 3, 6);
    expect(w.get('b')).toBeCloseTo(1 / 3, 6);
    expect(w.get('c')).toBeCloseTo(1 / 3, 6);
  });
  it('不在 model 的 key / 软删维度 key → 忽略', () => {
    const md = model(dim('a', { enabled: false }), dim('b'));
    const w = normalizedWeights(md, new Set(['a', 'ghost']));
    expect(w.size).toBe(0);
    const w2 = normalizedWeights(md, new Set(['b']));
    expect(w2.get('b')).toBe(1);
  });
});

/** —— §5.6 computeCompetencySummary / computeCompetencyStates —— */

describe('computeCompetencySummary', () => {
  it('未评估维度不参与总分与灯号（未评估 ≠ 0）', () => {
    const m = model(dim('ls'), dim('team'));
    const list = [asm({ employeeId: 'a', dimension: 'ls', score: 4 })];
    const s = computeCompetencySummary(list, 'a', m);
    expect(s).not.toBeNull();
    expect(s!.dimensions).toHaveLength(1);
    expect(s!.dimensions[0].dimension).toBe('ls');
    expect(s!.overall!.score).toBeCloseTo(4, 6); // 单维归一化权重 = 1
    expect(s!.overall!.status).toBe('healthy');
    expect(s!.overall!.worstGap).toBe(-1);
  });

  it('缺全部有效维度 → null（整体未评估）；hrbp 仅校准也不算评估', () => {
    const m = model(dim('ls'));
    expect(computeCompetencySummary([], 'a', m)).toBeNull();
    const onlyHrbp = [asm({ employeeId: 'a', dimension: 'ls', score: 4, assessorRole: 'hrbp' })];
    expect(computeCompetencySummary(onlyHrbp, 'a', m)).toBeNull();
  });

  it('灯号 = 最差维度（木桶）；worstGap 决定 notCompetentCandidate', () => {
    const m = model(dim('ls'), dim('team'));
    const list = [
      asm({ employeeId: 'a', dimension: 'ls', score: 4 }), // gap -1
      asm({ employeeId: 'a', dimension: 'team', score: 2 }), // gap 1
    ];
    const s = computeCompetencySummary(list, 'a', m)!;
    expect(s.overall!.worstGap).toBe(1);
    expect(s.overall!.status).toBe('warn');
    expect(s.notCompetentCandidate).toBe(false);
  });

  it('worstGap ≥ 2 → danger + notCompetentCandidate', () => {
    const m = model(dim('ls'));
    const list = [asm({ employeeId: 'a', dimension: 'ls', score: 1 })]; // req 3 → gap 2
    const s = computeCompetencySummary(list, 'a', m)!;
    expect(s.dimensions[0].status).toBe('danger');
    expect(s.overall!.status).toBe('danger');
    expect(s.notCompetentCandidate).toBe(true);
  });

  it('总分 = 跨组加权平均（只排序，不判灯）；灯号不受权重影响', () => {
    const m = model(dim('ls', { weight: 0.25, group: 'leadership' }), dim('biz', { weight: 0.5, group: 'staff' }));
    const list = [
      asm({ employeeId: 'a', dimension: 'ls', score: 4 }), // gap -1
      asm({ employeeId: 'a', dimension: 'biz', score: 2 }), // gap 1
    ];
    const s = computeCompetencySummary(list, 'a', m)!;
    // 归一化权重：ls=1/3, biz=2/3 → score = 4/3 + 4/3 = 8/3；gap = 3 − 8/3 = 1/3
    expect(s.overall!.score).toBeCloseTo(8 / 3, 6);
    expect(s.overall!.gap).toBeCloseTo(1 / 3, 6);
    expect(s.overall!.status).toBe('warn'); // 最差维度 gap=1，不因权重改变
  });

  it('自定义维度：改 label/definition/weight 后灯号不变、总分变', () => {
    const m1 = model(dim('x', { weight: 0.8 }), dim('y', { weight: 0.2 }));
    const m2 = model(dim('x', { weight: 0.2, label: '改名', definition: '新定义' }), dim('y', { weight: 0.8 }));
    const list = [
      asm({ employeeId: 'a', dimension: 'x', score: 2 }), // gap 1
      asm({ employeeId: 'a', dimension: 'y', score: 5 }), // gap -2
    ];
    const s1 = computeCompetencySummary(list, 'a', m1)!;
    const s2 = computeCompetencySummary(list, 'a', m2)!;
    expect(s2.dimensions[0].label).toBe('改名');
    expect(s2.dimensions[0].definition).toBe('新定义');
    expect(s1.overall!.status).toBe(s2.overall!.status); // 灯号不变（warn）
    expect(s1.overall!.worstGap).toBe(s2.overall!.worstGap);
    expect(s1.overall!.score).toBeCloseTo(2 * 0.8 + 5 * 0.2, 6); // 2.6
    expect(s2.overall!.score).toBeCloseTo(2 * 0.2 + 5 * 0.8, 6); // 4.4
  });

  it('group 派生：取评估数多者；平局取首个已评维度 group（model 顺序）', () => {
    const m = model(dim('ls', { group: 'leadership' }), dim('biz', { group: 'staff' }));
    const tie = [
      asm({ employeeId: 'a', dimension: 'ls', score: 3 }),
      asm({ employeeId: 'a', dimension: 'biz', score: 3 }),
    ];
    expect(computeCompetencySummary(tie, 'a', m)!.group).toBe('leadership'); // 平局 → model 顺序首个

    const majority = [
      asm({ employeeId: 'a', dimension: 'ls', score: 3 }),
      asm({ employeeId: 'a', dimension: 'team', score: 3 }),
      asm({ employeeId: 'a', dimension: 'results', score: 3 }),
      asm({ employeeId: 'a', dimension: 'biz', score: 3 }),
    ];
    const m2 = model(
      dim('ls', { group: 'leadership' }),
      dim('team', { group: 'leadership' }),
      dim('results', { group: 'leadership' }),
      dim('biz', { group: 'staff' }),
    );
    expect(computeCompetencySummary(majority, 'a', m2)!.group).toBe('leadership');
  });

  it('assessedBy 去重 + latestAssessedAt 取最新', () => {
    const m = model(dim('ls'), dim('team'));
    const list = [
      asm({ employeeId: 'a', dimension: 'ls', score: 3, assessorId: 's1', assessedAt: '2026-01-01T00:00:00.000Z' }),
      asm({ employeeId: 'a', dimension: 'team', score: 3, assessorId: 's1', assessedAt: '2026-02-01T00:00:00.000Z' }),
      asm({ employeeId: 'a', dimension: 'ls', score: 4, assessorId: 's2', assessedAt: '2026-03-01T00:00:00.000Z' }),
    ];
    const s = computeCompetencySummary(list, 'a', m)!;
    expect(s.assessedBy.sort()).toEqual(['s1', 's2']);
    expect(s.latestAssessedAt).toBe('2026-03-01T00:00:00.000Z');
  });

  it('软删维度（enabled:false）不进当前灯号/总分', () => {
    const m = model(dim('ls', { enabled: false }), dim('team'));
    const list = [
      asm({ employeeId: 'a', dimension: 'ls', score: 1 }), // 软删维度历史分（gap 2）
      asm({ employeeId: 'a', dimension: 'team', score: 4 }),
    ];
    const s = computeCompetencySummary(list, 'a', m)!;
    expect(s.dimensions.map((d) => d.dimension)).toEqual(['team']);
    expect(s.overall!.status).toBe('healthy'); // 软删维度的红灯不进当前灯号

    const onlyDisabled = [asm({ employeeId: 'a', dimension: 'ls', score: 1 })];
    expect(computeCompetencySummary(onlyDisabled, 'a', m)).toBeNull();
  });

  it('orphan 维度（key 不在 model）→ 当前灯号排除', () => {
    const m = model(dim('team'));
    const list = [
      asm({ employeeId: 'a', dimension: 'ghost', score: 1 }),
      asm({ employeeId: 'a', dimension: 'team', score: 4 }),
    ];
    const s = computeCompetencySummary(list, 'a', m)!;
    expect(s.dimensions.map((d) => d.dimension)).toEqual(['team']);
    const onlyOrphan = [asm({ employeeId: 'a', dimension: 'ghost', score: 1 })];
    expect(computeCompetencySummary(onlyOrphan, 'a', m)).toBeNull();
  });
});

describe('computeCompetencyStates（每员工一条；未评估占位不伪装绿/红）', () => {
  it('无评估员工 → overall:null 占位', () => {
    const m = model(dim('ls'));
    const list = [asm({ employeeId: 'a', dimension: 'ls', score: 4 })];
    const employees = [emp('a'), emp('b')];
    const states = computeCompetencyStates(list, employees, m);
    expect(states).toHaveLength(2);
    expect(states[0].employeeId).toBe('a');
    expect(states[0].overall).not.toBeNull();
    expect(states[1]).toMatchObject({
      employeeId: 'b',
      group: null,
      dimensions: [],
      overall: null,
      notCompetentCandidate: false,
      assessedBy: [],
      latestAssessedAt: null,
    });
  });
});

/** —— §5.7 listAssessmentHistory —— */

describe('listAssessmentHistory（含软删/orphan；组内升序；组间最近优先）', () => {
  it('含 supervisor + hrbp 记录，组内按 assessedAt 升序', () => {
    const m = model(dim('ls'), dim('team'));
    const list = [
      asm({ employeeId: 'a', dimension: 'ls', score: 3, assessorRole: 'supervisor', assessedAt: '2026-01-01T00:00:00.000Z' }),
      asm({ employeeId: 'a', dimension: 'ls', score: 4, assessorRole: 'hrbp', assessedAt: '2026-02-01T00:00:00.000Z' }),
      asm({ employeeId: 'a', dimension: 'ls', score: 5, assessorRole: 'supervisor', assessedAt: '2026-03-01T00:00:00.000Z' }),
    ];
    const h = listAssessmentHistory(list, 'a', m);
    expect(h).toHaveLength(1);
    expect(h[0].records.map((r) => r.score)).toEqual([3, 4, 5]); // 升序
  });

  it('组间按最近评估 assessedAt 降序', () => {
    const m = model(dim('ls'), dim('team'));
    const list = [
      asm({ employeeId: 'a', dimension: 'team', score: 3, assessedAt: '2026-02-01T00:00:00.000Z' }),
      asm({ employeeId: 'a', dimension: 'ls', score: 3, assessedAt: '2026-01-01T00:00:00.000Z' }),
    ];
    const h = listAssessmentHistory(list, 'a', m);
    expect(h.map((x) => x.dimension)).toEqual(['team', 'ls']);
  });

  it('软删维度历史可见（enabled:false）', () => {
    const m = model(dim('ls', { enabled: false }), dim('team'));
    const list = [
      asm({ employeeId: 'a', dimension: 'ls', score: 1 }),
      asm({ employeeId: 'a', dimension: 'team', score: 4 }),
    ];
    const h = listAssessmentHistory(list, 'a', m);
    const ls = h.find((x) => x.dimension === 'ls')!;
    expect(ls.enabled).toBe(false);
    expect(ls.orphan).toBe(false);
    expect(ls.label).toBe('维度-ls');
  });

  it('orphan 维度：label 回退 key、definition 降级文案、group null', () => {
    const m = model(dim('team'));
    const list = [asm({ employeeId: 'a', dimension: 'ghost', score: 2 })];
    const h = listAssessmentHistory(list, 'a', m);
    expect(h).toHaveLength(1);
    expect(h[0]).toMatchObject({
      dimension: 'ghost',
      label: 'ghost',
      definition: '（维度已删除，定义不可用）',
      enabled: false,
      orphan: true,
      group: null,
    });
  });

  it('无评估 → 空数组', () => {
    expect(listAssessmentHistory([], 'a', model(dim('ls')))).toEqual([]);
  });
});

/** —— §5.8 buildLeadershipDossier —— */

describe('buildLeadershipDossier（只读呈现，不输出定级结论）', () => {
  it('只含 leadership 且 enabled 的维度', () => {
    const m = model(
      dim('ls', { group: 'leadership' }),
      dim('biz', { group: 'staff' }),
      dim('old', { group: 'leadership', enabled: false }),
    );
    const list = [
      asm({ employeeId: 'a', dimension: 'ls', score: 3 }),
      asm({ employeeId: 'a', dimension: 'biz', score: 1 }),
      asm({ employeeId: 'a', dimension: 'old', score: 1 }),
    ];
    const d = buildLeadershipDossier(list, 'a', m, 'L3');
    expect(d).not.toBeNull();
    expect(d!.targetLevel).toBe('L3');
    expect(d!.dimensions.map((x) => x.dimension)).toEqual(['ls']);
  });

  it('无 leadership 评估 → null', () => {
    const m = model(dim('ls', { group: 'leadership' }), dim('biz', { group: 'staff' }));
    const list = [asm({ employeeId: 'a', dimension: 'biz', score: 1 })];
    expect(buildLeadershipDossier(list, 'a', m)).toBeNull();
  });

  it('overall 只在 leadership 已评维度上加权；worstGap 决定灯号', () => {
    const m = model(
      dim('ls', { group: 'leadership', weight: 0.25 }),
      dim('team', { group: 'leadership', weight: 0.25 }),
    );
    const list = [
      asm({ employeeId: 'a', dimension: 'ls', score: 4 }),
      asm({ employeeId: 'a', dimension: 'team', score: 2 }),
    ];
    const d = buildLeadershipDossier(list, 'a', m)!;
    expect(d.overall!.score).toBeCloseTo(3, 6); // (4+2)/2
    expect(d.overall!.worstGap).toBe(1);
    expect(d.overall!.status).toBe('warn');
    expect('suggestLeadershipGrade' in d).toBe(false); // 无建议定级输出
  });
});

/** —— §5.2 genDimensionKey —— */

describe('genDimensionKey（custom_<slug>_<rand6>）', () => {
  it('产物匹配 /^[a-z][a-z0-9_]*$/ 且唯一', () => {
    const keys = Array.from({ length: 200 }, () => genDimensionKey('战略解码'));
    for (const k of keys) expect(k).toMatch(/^[a-z][a-z0-9_]*$/);
    expect(new Set(keys).size).toBe(keys.length);
  });
  it('中文 label 回退 dim', () => {
    expect(genDimensionKey('客户洞察')).toMatch(/^custom_dim_[a-z0-9]{6}$/);
    expect(genDimensionKey('   ')).toMatch(/^custom_dim_[a-z0-9]{6}$/);
  });
  it('英文 label 转 slug（小写 + 下划线）', () => {
    expect(genDimensionKey('Strategic  Thinking')).toMatch(
      /^custom_strategic_thinking_[a-z0-9]{6}$/,
    );
  });
});

/** —— §2 D7 isManager —— */

describe('isManager（干部识别：部门负责人递归整树 / 有直管下属）', () => {
  const depts: Department[] = [
    {
      id: 'd1',
      name: 'A',
      level: 1,
      leaderId: 'm1',
      children: [
        {
          id: 'd2',
          name: 'A1',
          level: 2,
          leaderId: 'm2',
          children: [],
          employees: [],
          expanded: true,
        },
      ],
      employees: [],
      expanded: true,
    },
    { id: 'd3', name: 'B', level: 1, children: [], employees: [], expanded: true },
  ];
  const emps = [emp('m1'), emp('m2'), emp('s1'), emp('r1', { reportsToEmployeeId: 'm3' }), emp('m3')];
  it('部门负责人（含嵌套子树）→ true', () => {
    expect(isManager('m1', depts, emps)).toBe(true);
    expect(isManager('m2', depts, emps)).toBe(true);
  });
  it('有直管下属（reportsToEmployeeId 指向）→ true', () => {
    expect(isManager('m3', depts, emps)).toBe(true);
  });
  it('普通员工 → false', () => {
    expect(isManager('s1', depts, emps)).toBe(false);
    expect(isManager('r1', depts, emps)).toBe(false);
  });
});
