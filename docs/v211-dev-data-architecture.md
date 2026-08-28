# OrgCompass v2.1.1「岗位化」— 工程 / 数据架构视角（dev-expert）

> 项目：`orgcompass`（React 18 + TS strict + Vite 8 + Tailwind 4 + Tauri 2 + xlsx CDN 0.20.3）
> 基线：v2.0.10（数据模型 `meta.version = 1`）
> 本文档性质：**可执行工程方案**，供 Captain 并入 `docs/v211-roadmap.md`。只写数据架构与联动，不写 UI 组件代码。
> 分工边界：HR 语义归 hr-expert（t1），AI 语义判断归 ai-data-expert（t3），产品形态归 product-expert（t4）。本文档只定义「结构化 + 可追溯 + 可迁移」层面，并在 §7 给出给 ai-data-expert 的接口约定。

---

## 0. TL;DR（结论速览）

1. **模型**：新增 `Position` 实体（岗位 = 编制名额的载体），`Department.headcount` 从「部门级真值」降级为「部门直属岗位编制之和」的**冗余派生字段**（保留字段以最大化向下兼容，真值源下沉到岗位）。`Employee` 增补 `positionId?`（主岗）、`assignmentType?`（主/兼）、`primaryEmployeeId?`（兼岗虚拟记录回指真人）、`reportsToEmployeeId?`（汇报线）。`Department` 增补 `positions: Position[]`（嵌套镜像）+ `leaderType?`（负责人类型）。
2. **关系**：**主路径用「员工内嵌 `positionId`」+「部门内嵌 `positions`」**，兼岗沿用虚拟员工副本但补 `primaryEmployeeId` 显式回指；**不引入独立 PositionAssignment 关系表**（留给未来，v2.1.1 控制复杂度）。岗位表独立 sheet 只在导入层作为「可选进阶」，持久化后仍落到上述结构。
3. **状态机**：人岗匹配四态 `placed(进图) / unassigned(未进图) / overstaffed(超编) / not_competent(不胜任)`，v2.1.1 落地前三态，`not_competent` 仅预留枚举（算法推迟 v2.2.0）。判定为纯函数、运行时派生、不进持久化。
4. **迁移**：`meta.version 1→2`，`parseProject` 走显式 `MIGRATIONS` 迁移链；v1 的 `Department.headcount > 0` 派生为各部门「默认岗位」，员工自动套岗到默认岗位，**保证迁移后空岗率/缺口/成本数字与迁移前完全一致**。
5. **落地顺序**：数据层（类型 + 迁移）→ 导入 → 健康度 → 画布/抽屉/报告 → 招聘缺口视图 → Tauri 回归。每步独立可回滚。

---

## 1. Position 实体与数据模型改造方案

### 1.1 现状问题（代码实测）

`src/types/index.ts` 现状：

- `Department.headcount?` 是**部门级**编制，无法细化到「末端岗位」；`Employee.title?` 只是自由文本岗位名，无实体、无外键。
- `Employee.isVirtual?` 是**布尔**兼岗标记，缺「真人是谁」「主/兼」的显式关系，导致 `computeManagerBreakdown` 只能「尽力而为」去重（见 `src/utils/analytics.ts` L591-651 注释「副职/挂名精确剔除需 v2.1.0 负责人类型字段」）。
- 编制/成本/目标职级无法一站式导入：`parseEmployeeExcel`（`src/utils/excel.ts` L189-203）只映射姓名/工号/职级/岗位(title)/dept1..6，`cost`/`targetLevel` 已建模但导入链路不读；编制靠 `HealthDrawer` 逐部门手录（`App.tsx` L611-618），目标职级靠 `window.prompt` 逐人录（`DepartmentCard.tsx` L220）。

### 1.2 推荐类型定义（v2，可直接落地）

```typescript
// ─── 新增：岗位（编制名额的载体）───
export type PositionStatus = 'active' | 'archived'; // 软删除，不物理删

export interface Position {
  id: string;                // 稳定 uuid（uid('pos')），AI 可引用，永不依赖 index
  departmentId: string;      // 显式外键 → Department.id
  name: string;              // 岗位名称（如「前端工程师」）；原始值保留
  jobFamily?: string;        // 岗位序列（枚举建议：技术/产品/设计/职能/管理/销售/运营；AI 分组用）
  levelBandMin?: string;     // 职级带宽下限（fullCode，如 'L1'）；可空=不设带宽
  levelBandMax?: string;     // 职级带宽上限（fullCode，如 'L3.2'）
  headcount: number;         // 编制名额（本岗位可容纳人数；>=0；0=冻结编制）
  status: PositionStatus;    // active / archived
  createdAt: string;         // 时态/审计（AI 预留）
  updatedAt: string;
}

// ─── 负责人类型（v2.0.9 遗留：副职/挂名精确剔除）───
export type LeaderType = 'owner' | 'deputy' | 'acting' | 'external' | 'vacant';
// owner 正职 / deputy 副职 / acting 代理 / external 外部挂名 / vacant 空缺

// ─── 人岗匹配状态（见 §2）───
export type MatchStatus = 'placed' | 'unassigned' | 'overstaffed' | 'not_competent';

// ─── Department 增补 ───
export interface Department {
  // ...existing（id/name/level/leaderId?/leaderName?/parentId?/children/employees/expanded）
  positions: Position[];      // 本部门直属岗位（嵌套镜像，画布向下钻用）
  leaderType?: LeaderType;    // 负责人类型（缺省视为 'owner' 兼容旧数据）
  // headcount 保留为「冗余派生」：= 本部门直属岗位 headcount 之和（见 §3）
  headcount?: number;
}

// ─── Employee 增补 ───
export interface Employee {
  // ...existing（id/name/employeeId/level/dept1..6/isVirtual?/cost?/targetLevel?/title?）
  positionId?: string;          // 主岗外键 → Position.id；未套岗 = undefined
  assignmentType?: 'primary' | 'secondary'; // 主岗/兼岗（缺省 primary）
  primaryEmployeeId?: string;   // 兼岗虚拟记录回指真实员工 id（真人是谁）
  reportsToEmployeeId?: string; // 汇报线/直接上级（外键 → Employee.id 或 employeeId）
}

// ─── Scenario 增补 ───
export interface Scenario {
  // ...existing（departments/allEmployeesFlat/levelConfigs/canvas）
  positions: Position[];       // 全量岗位扁平列表（allPositionsFlat，供 analytics/AI/反查）
}

// ─── ProjectFile 不变；meta.version 升为 2 ───
```

**关键设计原则**：沿用现有「嵌套树 + 扁平镜像」双结构（`Department.employees` + `Scenario.allEmployeesFlat`），新增 `Department.positions`（嵌套）+ `Scenario.positions`（扁平）。理由：画布遍历走嵌套，analytics/AI/反查走扁平，与现状心智一致，改动最小。

### 1.3 岗位 vs 部门 vs 员工 三种关联（HR 语义的工程落点）

| HR 语义 | 工程落点 | 说明 |
| --- | --- | --- |
| 一个岗位多个编制名额 | `Position.headcount` 是整数名额；一个 Position 就是一个「岗位」，headcount 是它可容纳的 FTE 数 | 不再把 headcount 挂在部门 |
| 一岗多人 | 多个 `Employee.positionId` 指向同一 `Position.id` | `assignedCount = count(employee.positionId == pos.id)`（运行时派生） |
| 一人多岗（兼岗/矩阵） | 主岗 = 真人 `Employee.positionId`；兼岗 = 虚拟副本 `Employee{ isVirtual:true, primaryEmployeeId: 真人id, assignmentType:'secondary', positionId: 兼岗岗位id }` | 虚拟副本使画布仍能「人出现在两处」，`primaryEmployeeId` 使真人可追溯、去重可精确 |
| 编制名额（不挂人） | `Position.headcount > 0` 且 `assignedCount == 0` = 空岗（招聘缺口来源） | 岗位是缺口的自然载体 |

### 1.4 「岗位表独立 vs 员工表内嵌岗位字段」的决策

- **持久化层：岗位实体独立存在**（`Position` 数组），员工只存 `positionId` 外键 —— 这是唯一真值源，不讨论。
- **导入层（用户侧）**：与 product-expert 决策 #1 对齐 —— **员工表内嵌「岗位名称」列为主路径**（轻量、复用现有单 sheet 心智），**「岗位表」独立 sheet 为进阶**（一次性录入岗位 + 编制 + 序列 + 职级带宽）。两者都收敛到同一 `Position` 结构。
- **理由**：多数小团队「一个员工一个岗位」，员工表内嵌岗位名即可套岗；多岗位/多名额场景才需要岗位表。避免强制双 sheet 增加老用户负担。

### 1.5 leaderType 负责人类型设计

- 字段：`Department.leaderType?: LeaderType`，枚举 5 值（owner/deputy/acting/external/vacant）。
- 消费点：`computeManagerBreakdown`（`analytics.ts`）把「正职 owner」计分子、「deputy/acting/external」仅展示不计分子、`vacant` 触发「负责人空缺」提示。解决 v2.0.9 遗留的「副职/挂名精确剔除」。
- 迁移：v1 无此字段 → 缺省 `owner`（旧行为不变，向后兼容）。

---

## 2. 人岗匹配状态机

### 2.1 状态定义

| 状态 | 含义 | 判定（纯函数，运行时派生） |
| --- | --- | --- |
| `unassigned` 未进图 | 名册员工（非虚拟）未套到任何岗位 | `!emp.positionId`（且未挂到任何 `Department.positions` 对应的岗位） |
| `placed` 进图 | 已套岗，且所在岗位未超编 | `emp.positionId` 有效，且 `assignedCount(pos) <= pos.headcount` |
| `overstaffed` 超编 | 岗位实际人数 > 编制名额，超出部分人员 | `assignedCount(pos) > pos.headcount`，按「套岗时间序」后进者标记 |
| `not_competent` 不胜任 | 胜任度不足（**v2.2.0 算法**） | v2.1.1 仅预留枚举，不产出该状态 |

> 说明：`placed` 与 `overstaffed` 是**岗位级**信号（岗位满编与否），人员个体只是「挂在该岗位」+ 归属标记。超编人员仍「进图」（挂在该岗位），带 overstaffed 标记，提示转岗或扩编。

### 2.2 判定伪代码（`src/utils/match.ts` 新增，纯函数）

```typescript
import { Employee, Position, Department } from '../types';

export interface MatchResult {
  employeeId: string;
  status: MatchStatus;
  positionId?: string;         // 已套岗位（placed/overstaffed 有值）
  reason?: 'no_position' | 'overstaffed' | 'unknown'; // 未进图归因
}

export function computeMatchStates(
  allEmployees: Employee[],   // 非虚拟 + 虚拟全量
  positions: Position[],
): MatchResult[] {
  const byId = new Map(positions.map((p) => [p.id, p]));
  // 1) 岗位 assignedCount + 套岗顺序（用 Employee 数组序近似「套岗时间序」，
  //    若需精确可在 Employee 增补 assignedAt 字段）
  const assignedOrder: string[] = [];   // positionId 归属的 employeeId 序
  const assignedCount = new Map<string, number>();
  for (const e of allEmployees) {
    if (e.isVirtual) continue;          // 兼岗虚拟副本不计「名额占用」主体
    if (!e.positionId) continue;
    const p = byId.get(e.positionId);
    if (!p || p.status !== 'active') continue;
    assignedCount.set(e.positionId, (assignedCount.get(e.positionId) ?? 0) + 1);
    assignedOrder.push(e.id);
  }

  const results: MatchResult[] = [];
  for (const e of allEmployees) {
    if (e.isVirtual) {
      // 兼岗虚拟副本：跟随主岗真人状态，标 secondary（本版本简化处理）
      continue; // 或产出 { status:'placed', positionId: e.positionId } 仅展示
    }
    if (!e.positionId) {
      results.push({ employeeId: e.id, status: 'unassigned', reason: 'no_position' });
      continue;
    }
    const p = byId.get(e.positionId);
    if (!p || p.status !== 'active') {
      results.push({ employeeId: e.id, status: 'unassigned', reason: 'no_position' });
      continue;
    }
    const count = assignedCount.get(e.positionId) ?? 0;
    // 超编 = 岗位超出名额；超出部分按「套岗顺序后进者」标记
    const overflow = count > p.headcount;
    const isLate = overflow && assignedOrder.indexOf(e.id) >= p.headcount;
    results.push({
      employeeId: e.id,
      status: isLate ? 'overstaffed' : 'placed',
      positionId: e.positionId,
    });
  }
  return results;
}
```

### 2.3 状态转移图

```
unassigned ──套岗(设 positionId)──────────► placed
placed     ──编制下调/他人挤占(headcount<assigned)──► overstaffed
overstaffed──转岗(改 positionId)──────────► placed
overstaffed──扩编(headcount↑ 使 >=assigned)──► placed
placed/overstaffed ──移除套岗(清 positionId)──► unassigned
(未来) placed ──胜任度评估(v2.2.0)──► not_competent
```

### 2.4 与现有 `computeUnassignedEmployees` 的关系

现有 `computeUnassignedEmployees`（`analytics.ts` L1213）判定「员工不在任何 `Department.employees` 内」= **未入架构**（连树都没进）。这是比「未套岗」更严格的一层。

v2.1.1 建议**保留** `computeUnassignedEmployees` 语义不变，新增 `computeMatchStates` 提供第二层「套岗」判定。两段式（与 product-expert 决策 #3 对齐）：

- 第一层「未入架构」= 连部门都没挂（现状能力，抽屉上半段）。
- 第二层「未进图（未套岗）」= 挂了部门但没套岗位（抽屉下半段，新增）。

`UnassignedEmployeesDrawer` 升级为两段式；`onPlaceEmployee` 的目标从「部门」扩展为「部门 + 岗位」。

---

## 3. .orgproj 迁移方案（version 1 → 2）

### 3.1 迁移策略（核心：数字不变）

现状：`src/utils/project.ts` `PROJECT_VERSION = 1`，`parseProject` 靠 `sanitize*` 函数「尽力归一化」，**没有显式版本迁移链**。v2.1.1 引入 `PROJECT_VERSION = 2` 与显式迁移钩子。

v1 → v2 规则：

1. 遍历每个 `Department`：
   - 若 `headcount` 有效（`> 0`）→ 创建**默认岗位** `Position { id: uid('pos'), departmentId: dept.id, name: '默认岗位', headcount: dept.headcount, status:'active', createdAt/updatedAt: now }`，push 到 `dept.positions`。
   - `dept.headcount` **保留原值**（冗余派生字段，向下兼容），不置空。
2. 每个 `Department.employees` 内的**非虚拟**员工，若 `positionId` 为空 → 归入本部门默认岗位（`positionId = 默认岗位.id`）。**保证迁移后「进图人数 = 原部门人数」，空岗率/缺口/成本与迁移前完全一致**（product-expert 决策 #2「不增减数字」）。
3. 无 `headcount`（未配置编制）的部门：不创建默认岗位，员工 `positionId` 保持 undefined（未套岗，用户后续手动建岗套岗）。
4. `Employee` 无 `positionId/assignmentType/primaryEmployeeId/reportsToEmployeeId` → 全为 undefined（旧数据自然缺省）。
5. `Department.leaderType` 缺省 `'owner'`。

### 3.2 `project.ts` 迁移钩子设计（伪代码）

```typescript
export const PROJECT_VERSION = 2;

type Migration = (data: Record<string, unknown>) => Record<string, unknown>;

const MIGRATIONS: Record<number, Migration> = {
  // v1 → v2：引入岗位
  1: (data) => {
    const p = data as Record<string, unknown>;
    const scenarios = Array.isArray(p.scenarios) ? p.scenarios : [];
    const now = new Date().toISOString();
    for (const sRaw of scenarios) {
      const s = sRaw as Record<string, unknown>;
      const depts = Array.isArray(s.departments) ? s.departments : [];
      const allPositions: Record<string, unknown>[] = Array.isArray(s.positions) ? s.positions : [];
      migrateDepts(depts, allPositions, now);
      s.positions = allPositions;
    }
    return p;
  },
};

function migrateDepts(depts: unknown[], allPositions: Record<string, unknown>[], now: string) {
  for (const dRaw of depts) {
    const d = dRaw as Record<string, unknown>;
    const positions = Array.isArray(d.positions) ? d.positions : [];
    const hc = typeof d.headcount === 'number' && Number.isFinite(d.headcount) && d.headcount > 0
      ? d.headcount : null;
    let defaultPosId: string | null = null;
    if (hc != null) {
      defaultPosId = uid('pos');
      const pos = {
        id: defaultPosId, departmentId: d.id, name: '默认岗位',
        headcount: hc, status: 'active', createdAt: now, updatedAt: now,
      };
      positions.push(pos);
      allPositions.push(pos);
    }
    // 员工套岗到默认岗位（数字不变）
    const emps = Array.isArray(d.employees) ? d.employees : [];
    for (const eRaw of emps) {
      const e = eRaw as Record<string, unknown>;
      if (e.isVirtual) continue;
      if (e.positionId == null && defaultPosId) e.positionId = defaultPosId;
    }
    d.positions = positions;
    const children = Array.isArray(d.children) ? d.children : [];
    migrateDepts(children, allPositions, now);
  }
}

// parseProject 入口：先迁移再 sanitize
export function parseProject(raw: string): ProjectFile | null {
  let data: unknown;
  try { data = JSON.parse(raw); } catch { return null; }
  if (!data || typeof data !== 'object') return null;
  const migrated = migrateToCurrent(data as Record<string, unknown>);
  // ...原 sanitizeProject 逻辑处理 migrated
}

function migrateToCurrent(data: Record<string, unknown>): Record<string, unknown> {
  let v = typeof data.version === 'number' ? data.version : 1;
  let out = data;
  while (v < PROJECT_VERSION) {
    const fn = MIGRATIONS[v];
    if (!fn) break;            // 未知版本：停止迁移，交由 sanitize 尽力处理
    out = fn(out);
    out.version = v + 1;
    v += 1;
  }
  return out;
}
```

**幂等性**：迁移前判断 `if (e.positionId == null)` / `if (positions 为空才创建默认岗位)`，重复 `parseProject` 不重复建岗。版本号迁移后写入 `version: 2`。

### 3.3 向上 / 向下兼容

- **向上兼容（v2 读 v1 文件）**：自动迁移，无损。✅
- **向下兼容（v1 读 v2 文件）**：v2 保留 `Department.headcount`（= 部门直属岗位编制之和，冗余同步），旧版 `sanitizeDepartments` 仍能读到 headcount → 旧版**编制数字可见**，不会静默丢数据。但旧版看不到「岗位」实体与「套岗」信息（预期内，不承诺完整回读）。
- **必须明示**：v2.1.1 保存的 `.orgproj` 版本号升为 2，旧版打开后**岗位信息不显示但编制数字仍在**；如需完全回退，导出前应提示备份。

### 3.4 回滚

- 迁移是「读时单向」，**不改写原始文件**（`loadProject`/`importProjectJson` 只读+迁移+写 localStorage；`exportProjectJson` 才产出 v2 文件）。
- 回滚点：迁移失败（`JSON.parse` 失败 / 迁移抛错）→ `parseProject` 返回 `null`，`importProjectJson` 返回 false，原文件不动；localStorage 载入失败回退 `createProject`（现状逻辑已具备）。
- 迁移链含单元测试 + 一个固定 v1 fixture 文件，保证「v1 样例 → 迁移 → 数字一致」可复算。

---

## 4. 导入链路改造（富字段导入）

### 4.1 员工表列扩展（主路径）

`parseEmployeeExcel` / `mapEmployeeRows`（`src/utils/excel.ts`）扩展**可选列**，必填列仍为 `姓名/一级部门`：

| 新可选列 | 映射目标 | 缺省降级 |
| --- | --- | --- |
| `岗位名称` | 在员工匹配到的部门下 `find or create` 岗位，设 `Employee.positionId` | 无该列 → `positionId` undefined（未套岗） |
| `个人成本` | `Employee.cost` | 无 → 降级按职级成本映射（现状 `employeeCost` 逻辑） |
| `目标职级` | `Employee.targetLevel` | 无 → undefined（替代逐人 `window.prompt`） |
| `直接上级工号` / `直接上级` | `Employee.reportsToEmployeeId`（按 employeeId 匹配，兜底姓名） | 无 → undefined |
| （编制不放在员工表） | —— | 编制是岗位属性，放岗位表 sheet，避免一岗多人时重复 |

`mapEmployeeRows` 增补映射：`cost: number`, `targetLevel: string`, `positionName: string`, `reportsToId: string`, `reportsToName: string`。

### 4.2 岗位表 sheet（进阶）

新增独立 `岗位表` sheet，列：`部门路径(一级~六级)`、`岗位名称`、`序列`、`职级带宽下限`、`职级带宽上限`、`编制数`。解析为 `Position[]`，与员工表套岗逻辑合并（岗位表先建岗，员工表 `岗位名称` 只查不建，避免歧义）。

新增 `parsePositionExcel(file)` + `mapPositionRows(rows)`，复用 `readAndValidateFile` 护栏（size/rows/columns 不变），必填列 `岗位名称`。

### 4.3 对现有测试的影响

- `excel.test.ts`：新增富字段映射断言（cost/targetLevel/positionName/reportsTo 解析 + 缺省降级）。
- `excel.security.test.ts`：护栏（`MAX_IMPORT_FILE_BYTES`/`MAX_IMPORT_ROWS`/`SUPPORTED_EXCEL_EXTENSIONS`）不变；新增岗位表 sheet 的空表/缺列结构校验断言。
- `excel.integration.test.ts`：新增「富字段 Excel → Position 树 + 员工套岗 + 岗位级编制正确」端到端断言。
- 兼容性：旧模板（无新列）仍可导入，`positionId` 缺省 undefined —— 不破坏老用户流程。

---

## 5. 画布与健康度影响

### 5.1 `analytics.ts` 改动

1. **统一编制读取入口**：新增 `deptHeadcount(d: Department): number | null`，优先聚合 `d.positions[].headcount`，回退读 `d.headcount`（过渡期）。替换 `sumHeadcountSubtree`（L385）、`computeL2` vacancy（L768-783）、`computeL3`（L891）中对 `d.headcount` 的直接读取。

   ```typescript
   function deptHeadcount(dept: Department): number | null {
     if (dept.positions?.length) {
       const sum = dept.positions.reduce((s, p) => s + (p.status === 'active' ? p.headcount : 0), 0);
       return sum > 0 ? sum : null;
     }
     return typeof dept.headcount === 'number' && dept.headcount > 0 ? dept.headcount : null;
   }
   ```

2. **新增岗位级汇总**：`computePositionSummary(positions, configs): PositionSummary[]`，输出岗位级 `headcount / assignedCount / gap / avgCost / gapCost / status`，供招聘缺口视图与 L3 岗位展开消费。

3. **状态机接入**：新增 `computeMatchStates`（§2），`computeUnassignedEmployees`（L1213）保留为「未入架构」第一层。

4. **管理者比精确化**：`computeManagerBreakdown`（L591）改用 `leaderType` —— 分子只计 `owner`，`deputy/acting/external` 仅展示、`vacant` 提示空缺。

### 5.2 组件联动清单（只描述，不写代码）

| 组件 | 需要改什么 |
| --- | --- |
| `DepartmentCard.tsx` | 向下钻显示岗位（岗位名/编制/在岗数/缺口）；员工标签加套岗状态点与兼岗归属；`window.prompt` 设目标职级改为读富字段导入值 |
| `HealthDrawer.tsx` | L3 编制表支持「部门 → 岗位」展开；编制编辑从「部门 headcount」改为「岗位 headcount」（`App.tsx` L611-618 的 handler 同步改） |
| `DiagnosticReport.tsx` | 增加岗位级缺口表；部门编制列改为岗位级汇总（数字不变） |
| `ScenarioDiffView.tsx` | headcount diff 保持部门级兼容 + 新增岗位级 diff 增量（可选，后置） |
| `UnassignedEmployeesDrawer.tsx` | 升级两段式：未入架构 + 未套岗；套岗目标选择「部门 + 岗位」 |
| `ManagementReport.tsx` | 编制列改岗位级汇总口径；兼岗列补 `primaryEmployeeId` 真人归属 |
| `App.tsx` | 新增岗位 CRUD handler（`onCreatePosition/onSetPositionHeadcount/onAssignEmployeeToPosition`）；`handleHeadcount` 改为岗位级 |

---

## 6. 可行性与分阶段落地

### 6.1 分阶段 + 回滚点

| 阶段 | 内容 | 依赖 | 回滚点 |
| --- | --- | --- | --- |
| **P0 数据层** | `types` 增 Position/LeaderType/Employee 增补字段；`project.ts` 迁移链 v1→v2 | 无 | 迁移测试 + `PROJECT_VERSION` 常量 |
| **P1 导入链路** | 富字段列 + 岗位表 sheet + 建岗/套岗 | P0 | 新旧模板兼容测试 |
| **P2 健康度联动** | `analytics.ts` 岗位级编制/缺口/成本 + 状态机 | P0 | 岗位级单测 + 数字一致性断言 |
| **P3 画布/抽屉/报告** | 岗位视图 + 套岗交互 + 报告联动 | P2 | 组件级回归 |
| **P4 招聘缺口视图** | 岗位缺口汇总卡/表 + 导出 | P2 | 纯视图层，可独立回退 |
| **P5 Tauri 回归** | 桌面端读旧 .orgproj 迁移验证 + 全量回归 | P0-P4 | 版本号注入不变 |

**可并行**：P0（dev 数据层）与 §7 接口约定（ai-data-expert）并行；P1（导入）与 P2（analytics）在 P0 定稿后并行；P4 依赖 P2 但可与 P3 并行。

### 6.2 Tauri / 桌面端无回归验证

- 迁移逻辑在 `parseProject`（Web 与 Tauri 共用），桌面端 `saveFile`/`readTextFile` 读 `.orgproj` 走同一迁移链，无平台分叉。
- 版本号注入不变：UI 版本由 `package.json` 注入，安装包版本由 `src-tauri/tauri.conf.json` + `Cargo.toml` + `Cargo.lock` 决定 —— 本次仅改 `package.json` 版本号 + 三处 Tauri 版本号，沿用既有发版流程（`docs/v209-v300-version-plan.md` §9 已述「只修不发版」模式由用户确认后发版）。
- 验证清单：旧 `.orgproj` 在桌面端打开 → 默认岗位派生 → 空岗率/缺口/成本与旧版一致；富字段 Excel 导入 → 岗位树 + 套岗正确；`tauri build` 产物无 Rust 侧回归（本改造纯前端数据层，Rust 侧零改动）。

### 6.3 测试策略

| 测试 | 覆盖点 |
| --- | --- |
| 迁移测试（新增 `project.migration.test.ts`） | v1 fixture → 默认岗位派生 / headcount 保留 / 员工套岗 / 数字一致；非法 v1 → null；重复迁移幂等 |
| 岗位级编制单测（`analytics` 扩展） | `deptHeadcount` 聚合 = 部门直属岗位之和；岗位级 gap/gapCost 与部门级一致；空岗率口径不变 |
| 状态机单测（`match.test.ts`） | 进图/未进图/超编边界：满编、超编 1、编制 0、虚拟兼岗、archived 岗位 |
| 导入回归（`excel.test` / `excel.security.test` / `excel.integration.test`） | 富字段映射 + 缺省降级 + 护栏不变 + 岗位表 sheet |
| 端到端 | 导入 → 画布 → 健康度 → 导出 → 重新导入 闭环；数字可复算 |

---

## 7. 给 ai-data-expert 的接口约定（结构化 + 可追溯层面）

本文档定义「结构化与可追溯」契约，语义判断交给 ai-data-expert：

1. **稳定 ID**：所有实体（Position/Employee/Department/LevelConfig）用 uuid（`uid('pos'|'emp'|'dept'|...)`），**永不依赖 index/name 匹配**。现 `Employee.id` 用 `emp-${index}-${Date.now()}`（`excel.ts` L191）是脆弱点，建议 v2 改为 `uid('emp')`（迁移时不强改存量 id，新导入统一 uuid）。
2. **显式外键**：`Position.departmentId`、`Employee.positionId`、`Employee.reportsToEmployeeId`、`Employee.primaryEmployeeId`（兼岗回指真人）。不再靠 `dept1..6` 字符串路径或 `leaderName` 姓名匹配推导关系。
3. **结构化枚举**：`PositionStatus`、`LeaderType`、`MatchStatus`、`jobFamily` 用 union/枚举；自由文本（`name`/`title`）保留原始值，派生规范化字段（如 `jobFamily`）分离存储。
4. **时态/审计**：所有实体带 `createdAt/updatedAt`；Position 用 `status: 'archived'` 软删除（不物理删，保留历史可溯）。
5. **原始值 vs 派生值分离**：持久化只存原始字段（headcount/cost/level/targetLevel/positionId），派生指标（assignedCount/gap/gapCost/MatchStatus/灯号）**运行时计算、不进持久化**（沿用 v2.0.9「运行时派生」原则）。
6. **汇报线显式化**：`reportsToEmployeeId` 使「组织图 → 汇报链」可从数据直接重建，供未来 AI 分析汇报关系/管理幅度。

> 注意：是否引入独立 `PositionAssignment` 关系表（含 startDate/endDate 时态、primary/secondary 多角色）是 ai-data-expert 的语义判断。工程上 v2.1.1 用「员工内嵌 positionId + 虚拟副本 primaryEmployeeId」等价覆盖「一岗多人/一人多岗」，如需完整时态关系表，建议 v2.2.0 与胜任度一起引入，避免 v2.1.1 过度设计。

---

## 8. 硬依赖 / 可裁剪清单

**硬依赖（不可裁剪）**：
- Position 实体 + `Department.positions` + `Employee.positionId`（岗位化地基）。
- `.orgproj` v1→v2 迁移链 + 默认岗位派生（老用户无感）。
- `leaderType` 字段（v2.0.9 遗留的副职/挂名精确剔除）。
- 富字段导入：个人成本 + 目标职级（HR 审计「数据字段对齐」最大断点，替代逐人手录）。

**可裁剪（延后/不做）**：
- 独立 `PositionAssignment` 关系表（时态）→ 延后 v2.2.0。
- 岗位级 `ScenarioDiffView` 对比矩阵 → 后置（product-expert 已定）。
- 岗位表 sheet → 进阶可选（员工表内嵌岗位列已覆盖主路径）。
- `jobFamily` 序列分组视图 → 后置，字段先预留。
- `reportsToEmployeeId` 汇报线 → 字段预留即可，若本轮成本超可降级为「仅导入存储、不画汇报链」。
- `not_competent` 状态 → 仅枚举预留，算法 v2.2.0。

---

## 附：改动文件清单（供排期）

| 文件 | 改动 |
| --- | --- |
| `src/types/index.ts` | 新增 Position/LeaderType/MatchStatus；增补 Department/Employee/Scenario 字段 |
| `src/utils/project.ts` | `PROJECT_VERSION=2` + MIGRATIONS 迁移链 + sanitize 岗位清洗 |
| `src/utils/excel.ts` | 富字段映射 + 岗位表 sheet 解析 + 建岗/套岗 |
| `src/utils/analytics.ts` | `deptHeadcount` 统一入口 + 岗位级汇总 + 状态机 + leaderType 精确化 |
| `src/utils/match.ts`（新增） | `computeMatchStates` 纯函数 |
| `src/utils/useOrgWorkspace.ts` | Scenario.positions 纳入快照/历史/持久化 |
| `src/App.tsx` | 岗位 CRUD + 套岗 handler |
| `src/components/DepartmentCard.tsx` / `HealthDrawer.tsx` / `DiagnosticReport.tsx` / `UnassignedEmployeesDrawer.tsx` / `ScenarioDiffView.tsx` / `ManagementReport.tsx` | 岗位视图与联动（§5.2） |
| `src/utils/*.test.ts`（新增/扩展） | 迁移/状态机/岗位级编制/导入回归 |
