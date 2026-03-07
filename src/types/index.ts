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

export const LEVEL_COLORS: Record<string, string> = {
  'L0': '#FF9999',
  'L1.1': '#FFCC99',
  'L1.2': '#FFFF99',
  'L2.1': '#CCFF99',
  'L2.2': '#99FF99',
  'L3.1': '#99FFCC',
  'E3.1': '#99CCFF',
  'L3.2': '#9999FF',
  'E3.2': '#CC99FF',
  'L4.1': '#FF99CC',
  'E4.1': '#FF99FF',
  'L4.2': '#CCCCCC',
  'L5': '#999999',
};

export const LEVEL_LABELS: Record<string, string> = {
  'L0': 'L0-实习生',
  'L1.1': 'L1.1-初级专员',
  'L1.2': 'L1.2-中级专员',
  'L2.1': 'L2.1-高级专员',
  'L2.2': 'L2.2-资深专员',
  'L3.1': 'L3.1-团队经理',
  'E3.1': 'E3.1-专家',
  'L3.2': 'L3.2-部门经理',
  'E3.2': 'E3.2-高级专家',
  'L4.1': 'L4.1-高级经理',
  'E4.1': 'E4.1-资深专家',
  'L4.2': 'L4.2-总监',
  'L5': 'L5-副总裁',
};
