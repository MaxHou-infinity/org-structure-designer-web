import {
  ProjectFile,
  Scenario,
  LevelConfig,
  Employee,
  Department,
  Position,
  ScenarioCanvas,
} from '../types';
import { DEFAULT_LEVELS } from './levels';

/**
 * 项目 / 场景 / .orgproj 数据层（纯函数 + localStorage IO）。
 *
 * 领域模型：
 * - 一个工作区 = 一个 ProjectFile = 一个项目 + 多场景快照。
 * - .orgproj 项目文件即 ProjectFile 的 JSON 序列化（Web 下载 / Tauri saveFile）。
 * - 浏览器版持久化到 localStorage（自动保存），Tauri 版可另存为 .orgproj。
 */

/** 数据模型版本（用于迁移）。v2.1.1 升为 2：引入岗位（Position）实体。 */
export const PROJECT_VERSION = 2;

/** localStorage key */
export const PROJECT_STORAGE_KEY = 'org-designer.project.v2';

/** 默认场景名 */
export const DEFAULT_SCENARIO_NAME = '基线';

/** 生成一个稳定唯一 id（前缀 + 时间戳 + 随机）。供岗位/员工/部门等实体用。 */
export function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** 空场景快照（初始场景用） */
export function emptyScenarioSnapshot(): {
  departments: Department[];
  allEmployeesFlat: Employee[];
  levelConfigs: LevelConfig[];
  canvas: ScenarioCanvas;
} {
  return {
    departments: [],
    allEmployeesFlat: [],
    levelConfigs: DEFAULT_LEVELS.map((c) => ({ ...c })),
    canvas: { zoom: 100 },
  };
}

/** 用当前快照创建一个场景 */
export function createScenario(
  name: string,
  snapshot: {
    departments: Department[];
    allEmployeesFlat: Employee[];
    levelConfigs: LevelConfig[];
    canvas: ScenarioCanvas;
  },
  now: string = new Date().toISOString(),
): Scenario {
  return {
    id: uid('scene'),
    name: name || DEFAULT_SCENARIO_NAME,
    createdAt: now,
    updatedAt: now,
    departments: snapshot.departments,
    allEmployeesFlat: snapshot.allEmployeesFlat,
    levelConfigs: snapshot.levelConfigs,
    canvas: snapshot.canvas,
  };
}

/** 复制一个场景（生成「{原名} 副本」） */
export function cloneScenario(scenario: Scenario, now: string = new Date().toISOString()): Scenario {
  return {
    id: uid('scene'),
    name: `${scenario.name} 副本`,
    createdAt: now,
    updatedAt: now,
    departments: structuredClone(scenario.departments),
    allEmployeesFlat: structuredClone(scenario.allEmployeesFlat),
    levelConfigs: scenario.levelConfigs.map((c) => ({ ...c })),
    canvas: { ...scenario.canvas },
  };
}

/** 创建一个默认项目（含一个「基线」场景） */
export function createProject(name: string, now: string = new Date().toISOString()): ProjectFile {
  const baseline = createScenario(DEFAULT_SCENARIO_NAME, emptyScenarioSnapshot(), now);
  return {
    id: uid('proj'),
    name: name || '组织架构项目',
    version: PROJECT_VERSION,
    currentScenarioId: baseline.id,
    scenarios: [baseline],
    meta: { createdAt: now, updatedAt: now, version: PROJECT_VERSION },
  };
}

/** —— 序列化 —— */

export function serializeProject(project: ProjectFile): string {
  return JSON.stringify(project, null, 2);
}

/** 类型守卫：判断一个对象是否为合理部门（仅顶层字段检查，健壮迁移用） */
function isDepartmentLike(v: unknown): v is Department {
  if (!v || typeof v !== 'object') return false;
  const d = v as Record<string, unknown>;
  return (
    typeof d.id === 'string' &&
    typeof d.name === 'string' &&
    typeof d.level === 'number' &&
    Array.isArray(d.employees) &&
    Array.isArray(d.children)
  );
}

/** 递归清洗部门树（丢弃非法节点，归一化缺失字段） */
function sanitizeDepartments(list: unknown[]): Department[] {
  const out: Department[] = [];
  for (const item of list) {
    if (!isDepartmentLike(item)) continue;
    const children = Array.isArray(item.children) ? sanitizeDepartments(item.children) : [];
    const now = new Date().toISOString();
    const leaderType = isLeaderType(item.leaderType) ? item.leaderType : undefined;
    out.push({
      id: item.id,
      name: item.name,
      level: item.level,
      leaderId: typeof item.leaderId === 'string' ? item.leaderId : undefined,
      leaderName: typeof item.leaderName === 'string' ? item.leaderName : undefined,
      parentId: typeof item.parentId === 'string' ? item.parentId : undefined,
      children,
      employees: (Array.isArray(item.employees) ? item.employees : []).filter(
        (e: unknown): e is Employee => !!e && typeof (e as Employee).id === 'string',
      ),
      expanded: typeof item.expanded === 'boolean' ? item.expanded : item.level <= 3,
      headcount:
        typeof item.headcount === 'number' && Number.isFinite(item.headcount)
          ? item.headcount
          : undefined,
      // —— v2.1.1 岗位化 ——
      positions: Array.isArray(item.positions) ? sanitizePositions(item.positions, now) : [],
      ...(leaderType !== undefined ? { leaderType } : {}),
    });
  }
  return out;
}

function isLeaderType(v: unknown): v is import('../types').LeaderType {
  return v === 'owner' || v === 'deputy' || v === 'acting' || v === 'external' || v === 'vacant';
}

function sanitizePositions(list: unknown[], now: string): Position[] {
  const out: Position[] = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const p = item as Record<string, unknown>;
    if (typeof p.id !== 'string' || typeof p.name !== 'string') continue;
    const status = p.status === 'active' || p.status === 'frozen' || p.status === 'archived' ? p.status : 'active';
    out.push({
      id: p.id,
      departmentId: typeof p.departmentId === 'string' ? p.departmentId : '',
      name: p.name,
      jobFamily: typeof p.jobFamily === 'string' ? p.jobFamily : undefined,
      levelBandMin: typeof p.levelBandMin === 'string' ? p.levelBandMin : undefined,
      levelBandMax: typeof p.levelBandMax === 'string' ? p.levelBandMax : undefined,
      headcount: typeof p.headcount === 'number' && Number.isFinite(p.headcount) ? p.headcount : 0,
      status,
      createdAt: typeof p.createdAt === 'string' ? p.createdAt : now,
      updatedAt: typeof p.updatedAt === 'string' ? p.updatedAt : now,
    });
  }
  return out;
}

function sanitizeLevelConfigs(list: unknown[]): LevelConfig[] {
  const out: LevelConfig[] = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const c = item as Record<string, unknown>;
    if (typeof c.code !== 'string' || typeof c.number !== 'string' || typeof c.label !== 'string' || typeof c.color !== 'string') continue;
    out.push({
      code: c.code,
      number: c.number,
      label: c.label,
      color: c.color,
      cost: typeof c.cost === 'number' && Number.isFinite(c.cost) ? c.cost : undefined,
    });
  }
  return out.length > 0 ? out : DEFAULT_LEVELS.map((c) => ({ ...c }));
}

function sanitizeScenario(raw: Record<string, unknown>, index: number): Scenario | null {
  const now = new Date().toISOString();
  const id = typeof raw.id === 'string' ? raw.id : uid('scene');
  const name = typeof raw.name === 'string' && raw.name.trim() ? raw.name : `场景 ${index + 1}`;
  const departments = Array.isArray(raw.departments) ? sanitizeDepartments(raw.departments) : [];
  const allEmployeesFlat = Array.isArray(raw.allEmployeesFlat)
    ? (raw.allEmployeesFlat as Employee[]).filter((e) => e && typeof e.id === 'string')
    : [];
  const levelConfigs = Array.isArray(raw.levelConfigs) ? sanitizeLevelConfigs(raw.levelConfigs) : DEFAULT_LEVELS.map((c) => ({ ...c }));

  const canvasRaw = raw.canvas && typeof raw.canvas === 'object' ? (raw.canvas as Record<string, unknown>) : {};
  const canvas: ScenarioCanvas = {
    zoom:
      typeof canvasRaw.zoom === 'number' && Number.isFinite(canvasRaw.zoom)
        ? Math.round(Math.min(Math.max(canvasRaw.zoom, 50), 200))
        : 100,
    lastFocusedDeptId: typeof canvasRaw.lastFocusedDeptId === 'string' ? canvasRaw.lastFocusedDeptId : undefined,
  };

  return {
    id,
    name,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : now,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : now,
    departments,
    allEmployeesFlat,
    levelConfigs,
    canvas,
    positions: Array.isArray(raw.positions) ? sanitizePositions(raw.positions, now) : [],
  };
}

/** —— v2.1.1：显式迁移链（.orgproj 数据模型版本升级）—— */

type Migration = (data: Record<string, unknown>) => Record<string, unknown>;

const MIGRATIONS: Record<number, Migration> = {
  // v1 → v2：引入岗位。旧部门级 headcount>0 派生「默认岗位」，部门内非虚拟员工自动套岗；
  // dept.headcount 保留为冗余派生（= 部门直属岗位编制之和），保证报告/诊断数字与迁移前一致。
  1: (data) => migrateV1ToV2(data),
};

/** 将任意版本数据迁移到当前 PROJECT_VERSION（只读输入，返回 v2 结构；未知版本交由 sanitize 尽力处理）。 */
function migrateToCurrent(data: Record<string, unknown>): Record<string, unknown> {
  let v = typeof data.version === 'number' ? data.version : 1;
  let out = data;
  while (v < PROJECT_VERSION) {
    const fn = MIGRATIONS[v];
    if (!fn) break;
    out = fn(out);
    out.version = v + 1;
    v += 1;
  }
  return out;
}

function migrateV1ToV2(data: Record<string, unknown>): Record<string, unknown> {
  const now = new Date().toISOString();
  const scenarios = Array.isArray(data.scenarios) ? data.scenarios : [];
  for (const sRaw of scenarios) {
    const s = sRaw as Record<string, unknown>;
    const depts = Array.isArray(s.departments) ? s.departments : [];
    const allPositions: Record<string, unknown>[] = [];
    migrateDepts(depts, allPositions, now);
    s.positions = allPositions;
  }
  return data;
}

function migrateDepts(depts: unknown[], allPositions: Record<string, unknown>[], now: string): void {
  for (const dRaw of depts) {
    const d = dRaw as Record<string, unknown>;
    const positions = Array.isArray(d.positions) ? (d.positions as Record<string, unknown>[]) : [];
    const hc =
      typeof d.headcount === 'number' && Number.isFinite(d.headcount) && d.headcount > 0
        ? d.headcount
        : null;

    let defaultPosId: string | null = null;
    if (hc != null) {
      if (positions.length === 0) {
        // 首次迁移：派生「默认岗位」，编制数 = 旧 headcount（数字不变）
        defaultPosId = uid('pos');
        const pos: Record<string, unknown> = {
          id: defaultPosId,
          departmentId: d.id,
          name: '默认岗位',
          headcount: hc,
          status: 'active',
          createdAt: now,
          updatedAt: now,
        };
        positions.push(pos);
        allPositions.push(pos);
      } else {
        // 二次迁移（幂等）：已有岗位则套岗到第一个 active 岗位，不重复建岗
        const firstActive = positions.find((p) => p.status === 'active') ?? positions[0];
        defaultPosId = (firstActive?.id as string) ?? null;
      }
    }

    // 部门内非虚拟员工：无 positionId → 套岗到默认岗位（幂等：已有则不覆盖）
    const emps = Array.isArray(d.employees) ? d.employees : [];
    for (const eRaw of emps) {
      const e = eRaw as Record<string, unknown>;
      if (e.isVirtual) continue;
      if (e.positionId == null && defaultPosId) {
        e.positionId = defaultPosId;
      }
    }

    d.positions = positions;
    const children = Array.isArray(d.children) ? d.children : [];
    migrateDepts(children, allPositions, now);
  }
}

/**
 * 解析 + 迁移 .orgproj JSON 字符串。
 * 先跑迁移链（v1→v2：岗位派生 + 员工套岗），再做 sanitize（归一化 + 校验）。
 * @returns 合法 ProjectFile；解析失败或结构非法返回 null。
 */
export function parseProject(raw: string): ProjectFile | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!data || typeof data !== 'object') return null;
  const migratedRaw = migrateToCurrent(data as Record<string, unknown>);
  const p = migratedRaw;

  const now = new Date().toISOString();
  const scenariosRaw = Array.isArray(p.scenarios) ? p.scenarios : [];
  const scenarios = scenariosRaw
    .map((s, i) => sanitizeScenario(s as Record<string, unknown>, i))
    .filter((s): s is Scenario => s !== null);

  const name = typeof p.name === 'string' && p.name.trim() ? p.name : '组织架构项目';
  let currentScenarioId = typeof p.currentScenarioId === 'string' ? p.currentScenarioId : '';

  if (scenarios.length === 0) {
    const baseline = createScenario(DEFAULT_SCENARIO_NAME, emptyScenarioSnapshot(), now);
    scenarios.push(baseline);
    currentScenarioId = baseline.id;
  } else if (!scenarios.some((s) => s.id === currentScenarioId)) {
    // 迁移持有未知/失效的场景 id → 回退到第一个场景
    currentScenarioId = scenarios[0].id;
  }

  const version = typeof p.version === 'number' ? p.version : PROJECT_VERSION;
  const metaRaw = p.meta && typeof p.meta === 'object' ? (p.meta as Record<string, unknown>) : {};

  return {
    id: typeof p.id === 'string' ? p.id : uid('proj'),
    name,
    version,
    currentScenarioId,
    scenarios,
    meta: {
      createdAt: typeof metaRaw.createdAt === 'string' ? metaRaw.createdAt : now,
      updatedAt: typeof metaRaw.updatedAt === 'string' ? metaRaw.updatedAt : now,
      version,
    },
  };
}

/** —— localStorage IO —— */

export function loadProject(): ProjectFile | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(PROJECT_STORAGE_KEY);
    if (!raw) return null;
    return parseProject(raw);
  } catch (error) {
    console.error('加载项目失败:', error);
    return null;
  }
}

export function persistProject(project: ProjectFile): boolean {
  if (typeof localStorage === 'undefined') return true;
  try {
    localStorage.setItem(PROJECT_STORAGE_KEY, serializeProject(project));
    return true;
  } catch (error) {
    console.error('保存项目失败:', error);
    return false;
  }
}

/** 取当前场景；无则回退第一个（并返回它）。 */
export function getCurrentScenario(project: ProjectFile): Scenario {
  return (
    project.scenarios.find((s) => s.id === project.currentScenarioId) ?? project.scenarios[0]
  );
}
