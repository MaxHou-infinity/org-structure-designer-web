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
  /** 目标职级（可选；员工层职级差距红黄绿分析用）。 */
  targetLevel?: string;
  /** 岗位/职位名称（可选；画布显示用，录入为空时落 'NA'）。 */
  title?: string;
  // —— v2.1.1 岗位化 ——
  /** 主岗外键 → Position.id；未套岗 = undefined */
  positionId?: string;
  /** 主岗/兼岗（缺省 primary） */
  assignmentType?: 'primary' | 'secondary';
  /** 兼岗虚拟记录回指真人员工 id */
  primaryEmployeeId?: string;
  /** 汇报线/直接上级（外键 → Employee.id 或 employeeId） */
  reportsToEmployeeId?: string;
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
  /** 部门编制人数（冗余派生字段，= 部门直属岗位编制之和；向下兼容）。 */
  headcount?: number;
  // —— v2.1.1 岗位化 ——
  /** 本部门直属岗位（嵌套镜像，画布向下钻用；旧版文件缺省为空数组） */
  positions?: Position[];
  /** 负责人类型（缺省视为 'owner' 兼容旧数据） */
  leaderType?: LeaderType;
}

/** —— v2.1.1 岗位化 —— */

/** 岗位状态：active 正常 / frozen 编制冻结（headcount 不计待补缺口）/ archived 软删除 */
export type PositionStatus = 'active' | 'frozen' | 'archived';

/** 岗位（编制名额的载体）：岗位 = 工作定义，编制 = 岗位的计数属性，员工 = 实际占用。 */
export interface Position {
  id: string;                // 稳定 uuid（uid('pos')），AI 可引用
  departmentId: string;      // 显式外键 → Department.id
  name: string;              // 岗位名称（如「前端工程师」）
  jobFamily?: string;        // 岗位序列（技术/产品/设计/职能/管理/销售/运营）
  levelBandMin?: string;     // 职级带宽下限（fullCode，如 'L1'）
  levelBandMax?: string;     // 职级带宽上限（fullCode，如 'L3.2'）
  headcount: number;         // 编制名额（>=0；frozen 时不计缺口）
  status: PositionStatus;
  createdAt: string;         // 时态/审计
  updatedAt: string;
}

/** 负责人类型：owner 正职 / deputy 副职 / acting 代理 / external 外部挂名 / vacant 空缺 */
export type LeaderType = 'owner' | 'deputy' | 'acting' | 'external' | 'vacant';

/** 人岗匹配状态：进图 / 未进图（未套岗）/ 超编 / 不胜任（仅预留，v2.2.0 判定） */
export type MatchStatus = 'placed' | 'unassigned' | 'overstaffed' | 'not_competent';

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
  /** v2.1.1：全量岗位扁平列表（所有部门岗位的镜像，作 analytics/AI/反查用；旧版文件缺省为空数组） */
  positions?: Position[];
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
