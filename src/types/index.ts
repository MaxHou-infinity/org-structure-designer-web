export interface Employee {
  id: string;
  name: string;
  employeeId: string;
  level: string;
  dept1?: string;
  dept2?: string;
  dept3?: string;
  dept4?: string;
  dept5?: string;
  dept6?: string;
  isVirtual?: boolean;
  /** 个人月均成本（可选；L3 成本分析用）。缺省时降级按职级成本映射核算。 */
  cost?: number;
}

export interface Department {
  id: string;
  name: string;
  level: number;
  leaderId?: string;
  leaderName?: string;
  parentId?: string;
  children: Department[];
  employees: Employee[];
  expanded: boolean;
  /** 部门编制人数（可空；用于健康度 L3「编制 vs 实际 vs 缺口」与空岗率）。 */
  headcount?: number;
}

export interface OrgTemplate {
  dept1?: string;
  dept2?: string;
  dept3?: string;
  dept4?: string;
  dept5?: string;
  dept6?: string;
  deptLevel?: string;
  leaderId?: string;
  leaderName?: string;
}

/**
 * 职级配置项。
 * - code: 职级序列代码，1-2 位大写英文字母（如 L / E / MD）。
 * - number: 职级编号，整数或一位小数（如 1 / 1.1 / 2.5），以字符串存储避免浮点精度损失。
 * - label: 中文标签（如「初级专员」）。
 * - color: 关联色（十六进制），新建时可走 12 色哈希自动分配。
 * 完整职级码 fullCode = code + number（如 "L1.1"），用作去重 / 查找 key。
 */
export interface LevelConfig {
  code: string;
  number: string;
  label: string;
  color: string;
  /** 该职级的月均成本（可选；用于健康度 L3 成本核算，如 2.4 表示 2.4w/月）。 */
  cost?: number;
}

/**
 * 工作区 + 场景快照模型（v2.0.2 数据可信层）。
 * - 一个工作区 = 一个 ProjectFile = 一个项目 + 多场景快照。
 * - 场景用于演练对比（「现状」「调优方案A/B」），互不覆盖。
 * - .orgproj 项目文件即 ProjectFile 的 JSON 序列化。
 */

/** 画布状态（随场景保存） */
export interface ScenarioCanvas {
  /** 缩放百分比（50-200） */
  zoom: number;
  /** 最近聚焦的部门 id（可选，供画布定位回放） */
  lastFocusedDeptId?: string;
}

/** 单一场景快照 */
export interface Scenario {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  /** 组织树（完整快照） */
  departments: Department[];
  /** 全量员工扁平列表（供负责人搜索 / 模板重建） */
  allEmployeesFlat: Employee[];
  /** 职级配置快照 */
  levelConfigs: LevelConfig[];
  /** 画布状态 */
  canvas: ScenarioCanvas;
}

/** 项目 / .orgproj 文件的元信息 */
export interface ProjectMeta {
  createdAt: string;
  updatedAt: string;
  /** 数据模型版本（用于迁移） */
  version: number;
}

/** 项目 / .orgproj 文件根结构 */
export interface ProjectFile {
  id: string;
  name: string;
  version: number;
  currentScenarioId: string;
  scenarios: Scenario[];
  meta: ProjectMeta;
}

/** 当前工作区（App 运行时状态，导出/持久化的统一快照口径） */
export interface WorkspaceSnapshot {
  projectName: string;
  currentScenarioId: string;
  scenarios: Scenario[];
}
