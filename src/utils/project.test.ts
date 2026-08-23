import { describe, it, expect } from 'vitest';
import {
  PROJECT_VERSION,
  createProject,
  createScenario,
  cloneScenario,
  serializeProject,
  parseProject,
  loadProject,
  persistProject,
  getCurrentScenario,
  PROJECT_STORAGE_KEY,
  DEFAULT_SCENARIO_NAME,
} from './project';
import { Scenario, Department, Employee } from '../types';

function emp(id: string): Employee {
  return { id, name: id, employeeId: id, level: 'L1.1' };
}

function dept(id: string, name: string, level: number, opts: Partial<Department> = {}): Department {
  return {
    id,
    name,
    level,
    children: opts.children ?? [],
    employees: opts.employees ?? [],
    expanded: true,
    headcount: opts.headcount,
  };
}

describe('createProject / createScenario', () => {
  it('默认项目含一个「基线」场景', () => {
    const p = createProject('测试项目');
    expect(p.name).toBe('测试项目');
    expect(p.version).toBe(PROJECT_VERSION);
    expect(p.scenarios).toHaveLength(1);
    expect(p.scenarios[0].name).toBe(DEFAULT_SCENARIO_NAME);
    expect(p.currentScenarioId).toBe(p.scenarios[0].id);
    expect(p.scenarios[0].departments).toEqual([]);
  });

  it('createScenario 生成带 id/时间的场景', () => {
    const s = createScenario('现状', { departments: [], allEmployeesFlat: [], levelConfigs: [], canvas: { zoom: 100 } }, '2026-01-01T00:00:00Z');
    expect(s.name).toBe('现状');
    expect(s.createdAt).toBe('2026-01-01T00:00:00Z');
    expect(s.updatedAt).toBe('2026-01-01T00:00:00Z');
    expect(s.id).toMatch(/^scene-/);
  });

  it('cloneScenario 复制为「{原名} 副本」且不共享引用', () => {
    const orig: Scenario = {
      id: 's1',
      name: '方案A',
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
      departments: [dept('d1', '技术部', 1, { employees: [emp('e1')] })],
      allEmployeesFlat: [emp('e1')],
      levelConfigs: [],
      canvas: { zoom: 120 },
    };
    const clone = cloneScenario(orig, '2026-01-02');
    expect(clone.name).toBe('方案A 副本');
    expect(clone.id).not.toBe(orig.id);
    expect(clone.departments).not.toBe(orig.departments);
    expect(clone.departments[0]).not.toBe(orig.departments[0]);
    expect(clone.departments[0].employees).not.toBe(orig.departments[0].employees);
    // 原场景不受影响
    expect(orig.departments[0].name).toBe('技术部');
  });
});

describe('序列化 / 反序列化往返', () => {
  it('serialize → parse 保留数据', () => {
    const p = createProject('往返项目');
    const s = p.scenarios[0];
    s.departments = [dept('d1', '技术部', 1, { children: [dept('d2', '研发组', 2)], headcount: 5 })];
    s.allEmployeesFlat = [emp('e1')];
    s.canvas = { zoom: 150 };

    const roundTrip = parseProject(serializeProject(p));
    expect(roundTrip).not.toBeNull();
    expect(roundTrip!.name).toBe('往返项目');
    expect(roundTrip!.currentScenarioId).toBe(p.currentScenarioId);
    expect(roundTrip!.scenarios).toHaveLength(1);
    const rs = roundTrip!.scenarios[0];
    expect(rs.departments).toHaveLength(1);
    expect(rs.departments[0].name).toBe('技术部');
    expect(rs.departments[0].headcount).toBe(5);
    expect(rs.canvas.zoom).toBe(150);
    expect(rs.allEmployeesFlat).toHaveLength(1);
  });

  it('非法 JSON 返回 null', () => {
    expect(parseProject('{bad json')).toBeNull();
    expect(parseProject('')).toBeNull();
    expect(parseProject('123')).toBeNull();
  });

  it('缺场景时补一个「基线」场景，失效 currentScenarioId 回退第一个', () => {
    const brokenRaw = JSON.stringify({
      id: 'proj',
      name: 'X',
      version: 1,
      currentScenarioId: 'no-such-scene',
      scenarios: [{ id: 's1', name: 'A', departments: [], allEmployeesFlat: [], levelConfigs: [], canvas: {} }],
      meta: {},
    });
    const p = parseProject(brokenRaw)!;
    expect(p.currentScenarioId).toBe('s1');
    expect(p.scenarios).toHaveLength(1);

    const noScenarios = parseProject(JSON.stringify({ id: 'proj', name: 'Y', scenarios: [] }))!;
    expect(noScenarios.scenarios).toHaveLength(1);
    expect(noScenarios.scenarios[0].name).toBe(DEFAULT_SCENARIO_NAME);
  });

  it('清洗非法部门节点与未知职级颜色', () => {
    const dirty = JSON.stringify({
      id: 'proj',
      name: 'Z',
      currentScenarioId: 's1',
      scenarios: [{
        id: 's1',
        name: 'A',
        departments: [{ id: 'd1', name: '合法', level: 1, employees: [], children: [] }, { bogus: true }],
        allEmployeesFlat: [],
        levelConfigs: [{ code: 'L', number: '1.1', label: '初级', color: '#FFCC99', cost: 2.5 }],
        canvas: {},
      }],
    });
    const p = parseProject(dirty)!;
    expect(p.scenarios[0].departments).toHaveLength(1);
    expect(p.scenarios[0].departments[0].name).toBe('合法');
    expect(p.scenarios[0].departments[0].expanded).toBe(true);
    expect(p.scenarios[0].levelConfigs[0].cost).toBe(2.5);
  });
});

describe('localStorage IO', () => {
  it('persistProject → loadProject 往返', () => {
    const p = createProject('存储项目');
    p.scenarios[0].name = '已改';
    // 模拟 localStorage
    const storage = new Map<string, string>();
    (globalThis as unknown as { localStorage: Storage }).localStorage = {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => void storage.set(k, v),
      removeItem: (k: string) => void storage.delete(k),
      clear: () => storage.clear(),
      key: () => null,
      length: storage.size,
    } as unknown as Storage;

    expect(persistProject(p)).toBe(true);
    expect(storage.has(PROJECT_STORAGE_KEY)).toBe(true);
    const loaded = loadProject();
    expect(loaded).not.toBeNull();
    expect(loaded!.name).toBe('存储项目');
    expect(loaded!.scenarios[0].name).toBe('已改');
  });
});

describe('getCurrentScenario', () => {
  it('取 currentScenarioId 对应场景', () => {
    const p = createProject('x');
    const s2 = createScenario('方案B', { departments: [], allEmployeesFlat: [], levelConfigs: [], canvas: { zoom: 100 } });
    p.scenarios.push(s2);
    p.currentScenarioId = s2.id;
    expect(getCurrentScenario(p)!.id).toBe(s2.id);
  });

  it('currentScenarioId 失效 → 回退第一个场景', () => {
    const p = createProject('x');
    p.currentScenarioId = 'no-such-scene';
    expect(getCurrentScenario(p)!.id).toBe(p.scenarios[0].id);
  });
});

describe('parseProject 版本迁移与字段归一化', () => {
  it('缺 version → 默认 PROJECT_VERSION（1）', () => {
    const raw = JSON.stringify({ id: 'proj', name: 'x', scenarios: [{ id: 's1', name: 'A' }] });
    const p = parseProject(raw)!;
    expect(p.version).toBe(PROJECT_VERSION);
    expect(p.meta.version).toBe(PROJECT_VERSION);
  });

  it('显式 version 0（历史项目）→ 保留 0，不强行迁移为 1', () => {
    const raw = JSON.stringify({ id: 'proj', name: 'x', version: 0, scenarios: [{ id: 's1', name: 'A' }] });
    const p = parseProject(raw)!;
    expect(p.version).toBe(0);
    expect(p.meta.version).toBe(0);
  });

  it('旧场景缺 canvas/departments/allEmployeesFlat/levelConfigs → 归一化补默认', () => {
    const raw = JSON.stringify({ id: 'proj', name: 'legacy', scenarios: [{ id: 's1', name: '旧场景' }] });
    const p = parseProject(raw)!;
    const s = p.scenarios[0];
    expect(s.departments).toEqual([]);
    expect(s.allEmployeesFlat).toEqual([]);
    expect(s.levelConfigs.length).toBeGreaterThan(0); // 回退默认职级
    expect(s.canvas.zoom).toBe(100);
    expect(s.canvas.lastFocusedDeptId).toBeUndefined();
  });

  it('部门缺 expanded/headcount/leader → expanded 取 level<=3，headcount 为 undefined', () => {
    const raw = JSON.stringify({
      id: 'proj',
      name: 'x',
      scenarios: [{
        id: 's1',
        name: 'A',
        departments: [
          { id: 'd1', name: '技术部', level: 1, employees: [], children: [] },
          { id: 'd2', name: '深组', level: 5, employees: [], children: [] },
        ],
      }],
    });
    const p = parseProject(raw)!;
    const [d1, d2] = p.scenarios[0].departments;
    expect(d1.expanded).toBe(true); // level 1 <= 3
    expect(d2.expanded).toBe(false); // level 5 > 3
    expect(d1.headcount).toBeUndefined();
    expect(d1.leaderId).toBeUndefined();
  });

  it('headcount 归一化：number（含 0）保留、字符串/NaN 丢弃为 undefined', () => {
    const raw = JSON.stringify({
      id: 'proj',
      name: 'x',
      scenarios: [{
        id: 's1',
        name: 'A',
        departments: [
          { id: 'd1', name: 'A', level: 1, employees: [], children: [], headcount: 0 },
          { id: 'd2', name: 'B', level: 1, employees: [], children: [], headcount: '5' },
          { id: 'd3', name: 'C', level: 1, employees: [], children: [], headcount: Number.NaN },
        ],
      }],
    });
    const p = parseProject(raw)!;
    const [d1, d2, d3] = p.scenarios[0].departments;
    expect(d1.headcount).toBe(0); // number 保留，含 0
    expect(d2.headcount).toBeUndefined();
    expect(d3.headcount).toBeUndefined();
  });
});
