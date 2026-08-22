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
}
