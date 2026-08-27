import { Employee, Department, OrgTemplate } from '../types';
import type { WorkBook } from 'xlsx';

/** 懒加载 xlsx（体积 ~400KB，仅在上传/导出时按需加载） */
let xlsxModule: typeof import('xlsx') | null = null;
async function loadXlsx(): Promise<typeof import('xlsx')> {
  if (!xlsxModule) {
    xlsxModule = await import('xlsx');
  }
  return xlsxModule;
}

// ───────────────────────── 导入输入加固常量 ─────────────────────────

/** 单个导入文件的硬上限（字节）。超过则拒绝导入。 */
export const MAX_IMPORT_FILE_BYTES = 50 * 1024 * 1024; // 50MB
/** 单个导入文件的软提醒阈值（字节）。超过但未达硬上限时，可提示用户拆分。 */
export const WARN_IMPORT_FILE_BYTES = 10 * 1024 * 1024; // 10MB
/** 单个工作表最多解析的行数（含表头）。防止超大表拖垮内存/渲染。 */
export const MAX_IMPORT_ROWS = 50000;
/** 支持的 Excel 文件扩展名。 */
export const SUPPORTED_EXCEL_EXTENSIONS = ['.xlsx', '.xls'] as const;

// ───────────────────────── 导入错误类型 ─────────────────────────

export type ExcelImportErrorKind =
  | 'size-exceeded'
  | 'unsupported-type'
  | 'empty'
  | 'missing-columns'
  | 'invalid-structure'
  | 'parse-failed';

const IMPORT_ERROR_MESSAGES: Record<ExcelImportErrorKind, string> = {
  'size-exceeded': `文件超过 ${MAX_IMPORT_FILE_BYTES / 1048576}MB，请拆分为多个文件后导入`,
  'unsupported-type': '不支持的文件类型，请另存为 .xlsx 或 .xls 后导入',
  'empty': '文件中没有有效的表头或数据行，请使用示例模板整理后再导入',
  'missing-columns': '文件缺少必填列，请对照示例模板检查表头',
  'invalid-structure': '文件结构异常，请使用示例模板整理表格后再导入',
  'parse-failed': '文件解析失败，请确认文件为有效的 Excel 文件',
};

/**
 * 导入错误：带 `kind` 便于上层分支处理，`message` 为中文可行动提示。
 * - kind === 'missing-columns' 时附带 `missingColumns`（缺失的必填列名）。
 */
export class ExcelImportError extends Error {
  readonly kind: ExcelImportErrorKind;
  readonly missingColumns?: string[];

  constructor(kind: ExcelImportErrorKind, message?: string, missingColumns?: string[]) {
    if (missingColumns && missingColumns.length > 0) {
      super(`缺少必填列：${missingColumns.join('、')}，请对照示例模板补充表头后导入`);
      this.kind = 'missing-columns';
      this.missingColumns = missingColumns;
    } else {
      super(message ?? IMPORT_ERROR_MESSAGES[kind]);
      this.kind = kind;
    }
    this.name = 'ExcelImportError';
  }
}

/** 提取文件扩展名（小写，含点，如 '.xlsx'；无扩展名返回 ''） */
export function getExcelFileExtension(fileName: string): string {
  const trimmed = (fileName ?? '').trim();
  const match = /\.[^.]+$/.exec(trimmed);
  return match ? match[0].toLowerCase() : '';
}

function isSupportedExtension(ext: string): boolean {
  return (SUPPORTED_EXCEL_EXTENSIONS as readonly string[]).includes(ext);
}

/** employee 工作表必填列；org 模板工作表必填列 */
const REQUIRED_EMPLOYEE_COLUMNS = ['姓名', '一级部门'];
const REQUIRED_ORG_COLUMNS = ['一级部门'];

// ───────────────────────── 读取与解析 ─────────────────────────

/**
 * 从内存 buffer 读取第一个工作表并转为 JSON 行。
 * 测试可直接复用，避免依赖浏览器 FileReader。
 */
export async function parseExcelFromBuffer(buffer: ArrayBuffer | Uint8Array): Promise<Record<string, unknown>[]> {
  const XLSX = await loadXlsx();
  return sheetToRows(XLSX, readWorkbook(XLSX, buffer));
}

function readWorkbook(XLSX: typeof import('xlsx'), buffer: ArrayBuffer | Uint8Array): WorkBook {
  try {
    return XLSX.read(buffer, { type: 'array', dense: true, sheetRows: MAX_IMPORT_ROWS });
  } catch {
    throw new ExcelImportError('parse-failed', IMPORT_ERROR_MESSAGES['parse-failed']);
  }
}

function sheetToRows(XLSX: typeof import('xlsx'), workbook: WorkBook): Record<string, unknown>[] {
  const firstSheetName = workbook?.SheetNames?.[0];
  const firstSheet = firstSheetName ? workbook.Sheets?.[firstSheetName] : undefined;
  if (!firstSheet) {
    throw new ExcelImportError('empty', IMPORT_ERROR_MESSAGES['empty']);
  }
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet);
  // 结构异常：sheet 存在但表头为空/非有效列名（SheetJS 会生成 ''、'__N' 之类的占位 key），
  // 无法据此做字段映射，应视为结构异常而非静默透传。
  const hasMeaningfulColumn = rows.some((row) =>
    Object.keys(row).some((key) => key.trim() !== '' && !/^_[0-9]+$/.test(key)),
  );
  if (rows.length > 0 && !hasMeaningfulColumn) {
    throw new ExcelImportError('invalid-structure', IMPORT_ERROR_MESSAGES['invalid-structure']);
  }
  return rows;
}

/** File → ArrayBuffer（浏览器走 FileReader；Node/测试环境用 Blob.arrayBuffer()） */
async function readFileBuffer(file: File): Promise<ArrayBuffer> {
  if (typeof FileReader !== 'undefined') {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(file);
    });
  }
  return file.arrayBuffer();
}

/** 大小/扩展名护栏 + 读取 + 必填列校验，返回 JSON 行 */
async function readAndValidateFile(file: File, requiredColumns: string[]): Promise<Record<string, unknown>[]> {
  const ext = getExcelFileExtension(file.name);
  if (!isSupportedExtension(ext)) {
    throw new ExcelImportError('unsupported-type', IMPORT_ERROR_MESSAGES['unsupported-type']);
  }
  if (file.size > MAX_IMPORT_FILE_BYTES) {
    throw new ExcelImportError('size-exceeded', IMPORT_ERROR_MESSAGES['size-exceeded']);
  }
  const buffer = await readFileBuffer(file);
  const rows = await parseExcelFromBuffer(buffer);
  assertRequiredColumns(rows, requiredColumns);
  return rows;
}

function assertRequiredColumns(rows: Record<string, unknown>[], requiredColumns: string[]): void {
  if (rows.length === 0) {
    throw new ExcelImportError('empty', IMPORT_ERROR_MESSAGES['empty']);
  }
  const present = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) present.add(key);
  }
  const missing = requiredColumns.filter((col) => !present.has(col));
  if (missing.length > 0) {
    throw new ExcelImportError('missing-columns', IMPORT_ERROR_MESSAGES['missing-columns'], missing);
  }
}

/**
 * UI 在解析前做一次轻量文件校验（大小 + 扩展名），避免直接进入读取流程。
 */
export function validateImportFile(file: { name: string; size: number }): { ok: true } | { ok: false; error: ExcelImportError } {
  const ext = getExcelFileExtension(file.name);
  if (!isSupportedExtension(ext)) {
    return { ok: false, error: new ExcelImportError('unsupported-type', IMPORT_ERROR_MESSAGES['unsupported-type']) };
  }
  if (file.size > MAX_IMPORT_FILE_BYTES) {
    return { ok: false, error: new ExcelImportError('size-exceeded', IMPORT_ERROR_MESSAGES['size-exceeded']) };
  }
  return { ok: true };
}

/** 将任意错误转换为对用户友好的中文提示（复用 ExcelImportError.message，其余兜底）。 */
export function getImportErrorMessage(error: unknown): string {
  if (error instanceof ExcelImportError) {
    return error.message;
  }
  return '导入失败，请检查文件后重试';
}

/** 将单元格值安全转换为字符串，过滤空值/'undefined' */
function cellString(value: unknown): string {
  const str = String(value ?? '');
  return str === 'undefined' ? '' : str;
}

// ───────────────────────── 行 → 领域对象映射 ─────────────────────────

/** 员工行 → 员工对象（独立导出，测试可复用；字段映射与升级前完全一致） */
export function mapEmployeeRows(rows: Record<string, unknown>[]): Employee[] {
  return rows.map((row, index) => ({
    id: `emp-${index}-${Date.now()}`,
    name: cellString(row['姓名']),
    employeeId: cellString(row['工号']),
    level: cellString(row['职级']) || 'NA',
    title: cellString(row['岗位'] ?? row['职位']) || 'NA',
    dept1: cellString(row['一级部门']),
    dept2: cellString(row['二级部门']),
    dept3: cellString(row['三级部门']),
    dept4: cellString(row['四级部门']),
    dept5: cellString(row['五级部门']),
    dept6: cellString(row['六级部门']),
  }));
}

/** 组织模板行 → OrgTemplate 对象（独立导出，测试可复用） */
export function mapOrgTemplateRows(rows: Record<string, unknown>[]): OrgTemplate[] {
  return rows.map((row) => ({
    dept1: cellString(row['一级部门']),
    dept2: cellString(row['二级部门']),
    dept3: cellString(row['三级部门']),
    dept4: cellString(row['四级部门']),
    dept5: cellString(row['五级部门']),
    dept6: cellString(row['六级部门']),
    deptLevel: cellString(row['部门级别']),
    leaderId: cellString(row['部门负责人工号']),
    leaderName: cellString(row['部门负责人']),
  }));
}

// ───────────────────────── 导入入口 ─────────────────────────

export async function parseEmployeeExcel(file: File): Promise<Employee[]> {
  const rows = await readAndValidateFile(file, REQUIRED_EMPLOYEE_COLUMNS);
  return mapEmployeeRows(rows);
}

export async function parseOrgTemplateExcel(file: File): Promise<OrgTemplate[]> {
  const rows = await readAndValidateFile(file, REQUIRED_ORG_COLUMNS);
  return mapOrgTemplateRows(rows);
}

export function buildDepartmentTree(employees: Employee[], orgTemplates: OrgTemplate[]): Department[] {
  // deptMap: 以 (层级-名称) 为 key 去重；idMap: 以部门 id 反查，用于建立父子关系
  const deptMap = new Map<string, Department>();
  const idMap = new Map<string, Department>();
  const deptKey = (level: number, name: string) => `${level}-${name}`;

  /** 获取或创建部门节点 */
  const ensureDept = (
    key: string,
    id: string,
    name: string,
    level: number,
    parentId: string | undefined,
  ): Department => {
    let dept = deptMap.get(key);
    if (!dept) {
      dept = { id, name, level, parentId, children: [], employees: [], expanded: level <= 3 };
      deptMap.set(key, dept);
      idMap.set(id, dept);
    }
    return dept;
  };

  // 先从组织架构模板创建部门结构
  orgTemplates.forEach((template, idx) => {
    const levels = [
      { level: 1, name: template.dept1 },
      { level: 2, name: template.dept2 },
      { level: 3, name: template.dept3 },
      { level: 4, name: template.dept4 },
      { level: 5, name: template.dept5 },
      { level: 6, name: template.dept6 },
    ].filter((l): l is { level: number; name: string } => Boolean(l.name) && l.name !== 'undefined');

    let parentId: string | undefined;

    levels.forEach(({ level, name }) => {
      const key = deptKey(level, name);
      const dept = ensureDept(key, `dept-${idx}-${level}`, name, level, parentId);
      if (template.deptLevel && dept.level === parseInt(template.deptLevel, 10)) {
        dept.leaderId = template.leaderId;
        dept.leaderName = template.leaderName;
      }
      parentId = dept.id;
    });
  });

  // 添加没有在模板中但员工所属的部门
  employees.forEach(emp => {
    const deptNames = [emp.dept1, emp.dept2, emp.dept3, emp.dept4, emp.dept5, emp.dept6].filter(Boolean);
    let parentId: string | undefined;
    let currentLevel = 1;

    deptNames.forEach((name) => {
      if (!name) return;
      const key = deptKey(currentLevel, name);
      ensureDept(key, `dept-auto-${currentLevel}-${name}`, name, currentLevel, parentId);
      parentId = deptMap.get(key)!.id;
      currentLevel++;
    });
  });

  // 建立父子关系（用 idMap 以部门 id 反查父节点，避免 id 与 key 混淆）
  const rootDepts: Department[] = [];

  deptMap.forEach(dept => {
    if (dept.parentId) {
      const parent = idMap.get(dept.parentId);
      if (parent) {
        parent.children.push(dept);
      } else {
        // 父节点缺失时提升为根节点，避免节点丢失
        rootDepts.push(dept);
      }
    } else {
      rootDepts.push(dept);
    }
  });
  
  // 将员工分配到对应部门 - 沿树路径逐级精确匹配（替代原 O(n²) 字符串 includes 匹配）
  employees.forEach(emp => {
    const deptNames = [emp.dept1, emp.dept2, emp.dept3, emp.dept4, emp.dept5, emp.dept6]
      .filter((name): name is string => Boolean(name));
    if (deptNames.length === 0) return;

    // 从根部门开始，逐级在 children 中按名称精确查找
    let matchedDept: Department | undefined;
    let candidates: Department[] = rootDepts;
    for (const name of deptNames) {
      const found = candidates.find(dept => dept.name === name);
      if (!found) break;
      matchedDept = found;
      candidates = found.children;
    }

    // 兜底：路径未完全匹配时，按 (层级数, 最后一级名称) 查找
    if (!matchedDept) {
      const lastName = deptNames[deptNames.length - 1];
      matchedDept = deptMap.get(deptKey(deptNames.length, lastName));
    }

    if (matchedDept) {
      matchedDept.employees.push(emp);
    }
  });
  
  // 排序子部门
  const sortDepts = (depts: Department[]): Department[] => {
    depts.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
    depts.forEach(d => sortDepts(d.children));
    return depts;
  };
  
  return sortDepts(rootDepts);
}

/**
 * 生成组织架构 Excel 文件字节（含「员工信息」与「组织架构」两个工作表）。
 * 调用方决定保存方式（浏览器下载 / Tauri 另存为）。
 */
export async function buildOrgExcelBytes(departments: Department[]): Promise<Uint8Array> {
  const XLSX = await loadXlsx();
  const collectAllEmployees = (depts: Department[]): Employee[] => {
    let result: Employee[] = [];
    depts.forEach(dept => {
      result = result.concat(dept.employees);
      result = result.concat(collectAllEmployees(dept.children));
    });
    return result;
  };
  
  const allEmployees = collectAllEmployees(departments);
  
  // 过滤掉虚拟员工（兼岗），不影响人数统计
  const realEmployees = allEmployees.filter(emp => !emp.isVirtual);
  
  const data = realEmployees.map(emp => ({
    '姓名': emp.name,
    '工号': emp.employeeId,
    '职级': emp.level,
    '一级部门': emp.dept1 || '',
    '二级部门': emp.dept2 || '',
    '三级部门': emp.dept3 || '',
    '四级部门': emp.dept4 || '',
    '五级部门': emp.dept5 || '',
    '六级部门': emp.dept6 || '',
  }));
  
  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, '员工信息');
  
  // 添加组织架构表
  const orgData: Record<string, string>[] = [];
  const collectDepts = (depts: Department[], prefix: string = '') => {
    depts.forEach(dept => {
      const prefixParts = prefix.split('/').filter(Boolean);
      orgData.push({
        '一级部门': dept.level === 1 ? dept.name : prefixParts[0] || '',
        '二级部门': dept.level === 2 ? dept.name : prefixParts[1] || '',
        '三级部门': dept.level === 3 ? dept.name : prefixParts[2] || '',
        '四级部门': dept.level === 4 ? dept.name : prefixParts[3] || '',
        '五级部门': dept.level === 5 ? dept.name : prefixParts[4] || '',
        '六级部门': dept.level === 6 ? dept.name : prefixParts[5] || '',
        '部门级别': String(dept.level),
        '部门负责人工号': dept.leaderId || '',
        '部门负责人': dept.leaderName || '',
      });
      collectDepts(dept.children, prefix + '/' + dept.name);
    });
  };
  collectDepts(departments);
  
  if (orgData.length > 0) {
    const orgWorksheet = XLSX.utils.json_to_sheet(orgData);
    XLSX.utils.book_append_sheet(workbook, orgWorksheet, '组织架构');
  }
  
  const out = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
  return new Uint8Array(out as ArrayBuffer);
}

export async function exportToExcel(departments: Department[]): Promise<void> {
  const bytes = await buildOrgExcelBytes(departments);
  const { saveFile } = await import('./tauri');
  await saveFile('组织架构数据.xlsx', bytes, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** 构建「员工信息」示例模板的 Excel 字节（调用方决定保存方式：Tauri 另存为 / 浏览器下载） */
export async function buildSampleEmployeeTemplateBytes(): Promise<Uint8Array> {
  const XLSX = await loadXlsx();
  const data = [
    { '姓名': '张三', '工号': 'E001', '职级': 'L3.2', '岗位': '前端工程师', '一级部门': '技术部', '二级部门': '研发部', '三级部门': '前端组', '四级部门': '', '五级部门': '', '六级部门': '' },
    { '姓名': '李四', '工号': 'E002', '职级': 'L2.1', '岗位': '前端开发', '一级部门': '技术部', '二级部门': '研发部', '三级部门': '前端组', '四级部门': '', '五级部门': '', '六级部门': '' },
    { '姓名': '王五', '工号': 'E003', '职级': 'L4.2', '岗位': '研发经理', '一级部门': '技术部', '二级部门': '研发部', '三级部门': '', '四级部门': '', '五级部门': '', '六级部门': '' },
  ];

  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, '员工信息');
  const out = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
  return new Uint8Array(out as ArrayBuffer);
}

/** 构建「员工信息」示例模板文件（Tauri 原生另存为 / 浏览器下载） */
export async function generateSampleEmployeeTemplate(): Promise<void> {
  const bytes = await buildSampleEmployeeTemplateBytes();
  const { saveFile } = await import('./tauri');
  await saveFile('员工信息模板.xlsx', bytes, XLSX_MIME);
}

/** 构建「组织架构」示例模板的 Excel 字节 */
export async function buildSampleOrgTemplateBytes(): Promise<Uint8Array> {
  const XLSX = await loadXlsx();
  const data = [
    { '一级部门': '技术部', '二级部门': '研发部', '三级部门': '前端组', '四级部门': '', '五级部门': '', '六级部门': '', '部门级别': '3', '部门负责人工号': 'E001', '部门负责人': '张三' },
    { '一级部门': '技术部', '二级部门': '研发部', '三级部门': '后端组', '四级部门': '', '五级部门': '', '六级部门': '', '部门级别': '3', '部门负责人工号': '', '部门负责人': '' },
    { '一级部门': '技术部', '二级部门': '测试部', '三级部门': '', '四级部门': '', '五级部门': '', '六级部门': '', '部门级别': '2', '部门负责人工号': '', '部门负责人': '' },
    { '一级部门': '人力资源部', '二级部门': '', '三级部门': '', '四级部门': '', '五级部门': '', '六级部门': '', '部门级别': '1', '部门负责人工号': '', '部门负责人': '' },
  ];

  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, '组织架构');
  const out = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
  return new Uint8Array(out as ArrayBuffer);
}

/** 构建「组织架构」示例模板文件（Tauri 原生另存为 / 浏览器下载） */
export async function generateSampleOrgTemplate(): Promise<void> {
  const bytes = await buildSampleOrgTemplateBytes();
  const { saveFile } = await import('./tauri');
  await saveFile('组织架构模板.xlsx', bytes, XLSX_MIME);
}
