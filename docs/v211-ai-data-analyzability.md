# OrgCompass v2.1.1 — AI 主数据可分析性（前瞻建模视角）

> 归属：v2.1.1「岗位化」路线图的 **AI 主数据可分析性** 视角（Captain 指定的前瞻硬要求）。
> 作者：ai-data-expert（v211-roadmap 团队）。
> 性质：**数据建模约束清单**，不是 AI 功能规格。本版本 **不实现任何 AI**，只保证「主数据（岗位/组织/人员/职级/胜任度）未来能被 LLM/分析模型可靠读取、关联、推理，而无需推倒重做数据层」。
> 关联：版本切分 [v209-v300-version-plan.md](v209-v300-version-plan.md) §4（v2.1.1 岗位化）；岗位实体+迁移方案另行见 [v211-position-model-design.md](v211-position-model-design.md)（规划中）；V3 需求 [v300-requirements.md](v300-requirements.md)。
> 一句话承诺：**把「数据能不能被 AI 读懂」当成 v2.1.1 建模的第一性约束——但只做「铺路」，不建「AI 系统」。**

---

## 0. 结论先行（TL;DR）

1. AI 分析主数据，本质是**在图上做可解释的关联推理**（岗位↔部门↔员工↔汇报线↔职级），不是「喂文本」。所以决定 AI 成败的只有四件事：**稳定全局唯一 ID、显式外键、结构化枚举、时态/快照**。当前模型四样都缺或半缺。
2. v2.1.1 必须**现在就落地**的是：全实体 `uuid`、岗位实体 + 显式外键、人岗匹配/岗位状态枚举、岗位级编制、软删除 + `updatedAt`、原始值 vs 派生值分离约定。这些同时是岗位化本身的地基，不是「为 AI 加戏」。
3. **只留口、不实现**的是：胜任度/评分结构（Assessment 表形）、字段级敏感标记元数据、可版本化的结构化导出 schema、生效时间字段（可空）。这些占位成本近乎为零，但能避免未来改数据层。
4. **应该砍掉**的是：双时态/事件溯源、全量审计回放、图数据库/规范化关系库、岗位族任职资格库、运行时字段级访问控制。这些要么与「本地优先、树状 JSON」冲突，要么是 v2.2.0+ 的事，现在做就是大而全。

> 与「本地优先、无云端、无遥测」边界的兼容方式：所有建议**都只是本地 JSON 数据模型与导出格式的约定**，不引入任何云端依赖、不上传、不遥测。AI 边界（§3）全部通过「用户主动、显式、可脱敏的导出」留口，默认状态仍 100% 本地。

---

## 1. AI 分析这类主数据需要的数据基础

> 本节回答「AI 要什么」。每条都对应 §2 的字段级落地。

### 1.1 稳定全局唯一 ID（而非 index/name 匹配）

LLM 的推理链是「A 关联到 B 再关联到 C」。如果 A 的 ID 会随重新导入/排序漂移，或者必须靠「姓名/工号」字符串去 join，模型就会：

- 把同名员工当同一人（同名歧义）；
- 把改过工号的人当两个人（工号漂移）；
- 在工号为空时退化为 `id`（而当前 `id` 是 `emp-${index}-${Date.now()}`，导入即漂移）。

**结论**：每个实体都要有一个**跨导入、跨场景、跨文件稳定**的代理主键（`uuid`），业务键（工号）降级为「可空的自然键 + 辅助去重」。

### 1.2 显式外键关联（岗位↔部门↔员工↔汇报线）

当前「汇报线」是从 `Department.leaderId/leaderName` 反推，「员工在哪」藏在 `dept.employees[]`（树内嵌）与 `Employee.dept1..6`（字符串路径）两处，二者可能不一致。AI 要的是**明确的三元组关系**，而不是「从结构里猜」：

- `员工 —属于→ 岗位`（一个员工至少挂一个岗位；兼岗 = 多岗位，用分配关系表）；
- `岗位 —隶属→ 部门`（岗位是部门的孩子，编制落到岗位）；
- `岗位 —汇报给→ 岗位` / `员工 —直属上级→ 员工`（显式汇报边，而非「部门负责人」这个部门属性）；
- `员工 —职级→ 职级配置`（外键，而非自由文本 `level` 字符串）。

### 1.3 结构化枚举（而非自由文本）

`Employee.level` 现在是自由文本（`'NA'` 都允许），`title`（岗位/职位）也是自由文本。AI 对自由文本只能「模糊匹配」，对枚举却能做「集合运算」（在职 vs 冻结 vs 裁撤；在岗 vs 超编 vs 不胜任）。主数据里**凡是状态/类型/序列，都应是枚举**；凡是「人话描述」才用文本。

### 1.4 时态与快照（某岗位某时点的编制/负责人）

「某岗位 3 月编制 5、6 月扩到 8」这类问题，AI 需要**时间轴**。当前只有「场景快照」这一层粗粒度时间轴（基线/方案A/B 是并列快照，不是时间序列）。主数据实体应预留 `effectiveFrom/effectiveTo`（可空）与 `updatedAt`，让「某时点事实」可表达，而不是只剩「最后保存的那一份」。

### 1.5 可追溯的原始值 vs 派生值（指标 vs 原始字段分离）

`gap / gapCost / avgCost / 灯号` 都是**派生值**，现在正确地「运行时算、不落库」（`analytics.ts` 纯函数）。这是对 AI 有利的好设计，但要显式固化成约定：**派生值永远不持久化**，且关键原始字段（编制、成本、目标职级、评分）要带**来源（import/manual）与时间**，AI 才能区分「这是事实」还是「这是算出来的」。

---

## 2. 对 v2.1.1 数据模型的具体要求清单（字段级）

> 每条：`建议字段` → `约束/枚举` → `为什么对 AI 有用`。落地方式分「现在实现（§5 P0）」「预留占位（§5 P1）」。

### 2.1 全实体基础字段（现在实现）

| 实体 | 建议字段 | 约束 | 为什么对 AI 有用 |
| --- | --- | --- | --- |
| 所有实体 | `uuid: string` | `crypto.randomUUID()`；跨导入/场景/文件稳定；旧 `id` 保留为 `legacyId` 仅作迁移 | 唯一、稳定、可 join 的代理主键，杜绝 name/index 匹配 |
| 所有实体 | `createdAt` / `updatedAt: string(ISO)` | 每次写操作刷新 `updatedAt` | 时间轴与「最近变更」推理的前提 |
| 可删除实体（部门/岗位/员工） | `deletedAt: string \| null` | 软删除；`null`=存活 | 保留被删节点的历史引用，避免外键悬空；AI 可区分「从未存在」vs「已裁撤」 |
| 关键原始字段（编制/成本/目标职级/评分） | `source: 'import' \| 'manual' \| 'derived'` | 枚举；`derived` 禁止落库 | 区分事实 vs 录入 vs 派生，可追溯 |

> **软删除是硬约束**：AI 最怕「员工从部门移除后，历史岗位/编制关系断了外键」。删部门/岗位/员工一律软删，`.orgproj` 保留 `deletedAt`。

### 2.2 岗位（Position）实体 —— 现在实现（v2.1.1 核心）

```ts
interface Position {
  uuid: string;               // 稳定代理主键
  legacyId?: string;          // 旧 dept/emp id，仅迁移用
  name: string;               // 岗位名（如「前端工程师」），≠ 员工 title 的自由文本，是结构化岗位
  code?: string;              // 岗位编号（可选，业务自然键）
  deptId: string;             // FK → Department.uuid（岗位隶属部门）
  reportsToPositionId?: string; // FK → Position.uuid（汇报给哪个岗位；部门负责人岗 = 该部门 leaderPositionId）
  type: PositionType;         // 枚举：management | professional | specialist | support
  status: PositionStatus;     // 枚举：active | frozen | abolished（在编/冻结/裁撤）
  headcount: number | null;   // 编制下沉到岗位级（原 Department.headcount 的细化）
  targetLevelCode?: string;   // FK → LevelConfig.fullCode（目标职级，结构化而非文本）
  createdAt: string; updatedAt: string; deletedAt: string | null;
}
```

- **为什么对 AI 有用**：岗位成为「部门—人员—编制—汇报」的枢纽实体，LLM 可直接回答「哪些岗位超编、哪些空岗、这个岗位汇报给谁、目标职级是什么」而无需解析树。
- **迁移**：旧 `Department.headcount` 升级为「部门内岗位 headcount 合计」（部门级编制 = Σ 岗位编制），保证老文件无损。

### 2.3 人岗匹配状态机 —— 现在实现（v2.1.1 验收项 B）

```ts
type AssignmentStatus =
  | 'in-post'        // 进图 / 在岗
  | 'unassigned'     // 未进图 / 未分配
  | 'over-staffed'   // 超编
  | 'unqualified';   // 不胜任（胜任度数据 v2.2.0 才有，v2.1.1 先留枚举与 reason）

interface Assignment {      // 员工 ↔ 岗位 分配关系（兼岗 = 一员工多 Assignment）
  uuid: string;
  employeeId: string;       // FK → Employee.uuid
  positionId: string;       // FK → Position.uuid
  status: AssignmentStatus;
  reason?: string;          // 枚举：vacant | surplus | not-competent | ...（未进图/超编/不胜任的原因，可追溯）
  isPrimary: boolean;       // 主岗标记（兼岗时区分主/兼）
  effectiveFrom?: string;   // 生效时间（可空，P1）
  effectiveTo?: string;     // 失效时间（可空，P1）
  createdAt: string; updatedAt: string;
}
```

- **为什么对 AI 有用**：把「谁在什么岗位、是否进图、为什么没进图」从「运行时由树反推」变成「显式事实」，是 V3 §4「人岗匹配可溯」的地基，也是招聘缺口视图的输入。

### 2.4 员工（Employee）字段规范 —— 现在实现

| 字段 | 现状 | v2.1.1 建议 | 为什么 |
| --- | --- | --- | --- |
| `id` | `emp-${index}-${Date.now()}` 不稳定 | 升级 `uuid` + `legacyId` | 稳定主键 |
| `employeeId` | 可空字符串（工号） | 保留为**自然键**，标注「可空/可重复，仅辅助」；跨导入匹配用它做**软键**而非唯一键 | 工号会改/空/重，不能当主键 |
| `level` | 自由文本 `'L3.2'`/`'NA'` | 改为 `levelCode: string`（FK → LevelConfig.fullCode）+ 保留 `level` 兼容只读 | 结构化职级，AI 可做序列/级别集合运算 |
| `title` | 自由文本岗位名 | 保留为**展示文本**，另加 `positionId`（FK → Position.uuid） | title 是「人话」，position 是「结构化实体」 |
| `dept1..dept6` | 字符串路径（每员工冗余一份） | 保留兼容导入，**降级为只读快照**；真实归属以 `dept.employees[]`/`Assignment` 为准 | 消除「两处真相」，AI 只认外键不认路径字符串 |
| `managerId` | 无 | 新增 `managerId?: string`（FK → Employee.uuid，直属上级） | 显式汇报边，供 span/reporting-chain 推理 |
| `cost` / `targetLevel` | 已存在（number / string） | 加 `source` + `updatedAt`；`targetLevel` 改 `targetLevelCode`（FK） | 可追溯的原始值 |
| `isVirtual` | boolean（兼岗标记） | 保留，语义收敛为「非主岗分配」 | 与 Assignment.isPrimary 对齐 |

### 2.5 部门（Department）字段规范 —— 现在实现

| 字段 | 现状 | v2.1.1 建议 | 为什么 |
| --- | --- | --- | --- |
| `id` | `dept-${idx}-${level}` 不稳定 | `uuid` + `legacyId` | 稳定主键 |
| `parentId` | 已有（可空） | 保持，根节点 `null`；写入时保证无环 | 显式父子外键 |
| `leaderId/leaderName` | 冗余双存 + 无类型 | 改为 `leaderPositionId`（FK → Position.uuid，负责人=岗位）；`leaderName` 保留只读展示；新增 `leaderType` 枚举（`full | deputy | nominal | external`，正职/副职/挂名/外部） | 负责人从「名字」变「岗位」；`leaderType` 是 v2.0.9 已点名欠的字段（管理者比精确剔除） |
| `headcount` | 部门级 | 保留为「部门级汇总只读」，真实来源改为 Σ 岗位 headcount | 编制落到岗位，部门级不再是一等来源 |

### 2.6 职级（LevelConfig）规范 —— 现在实现（小改）

| 字段 | 现状 | v2.1.1 建议 | 为什么 |
| --- | --- | --- | --- |
| key | `fullCode = code+number`（无独立 id） | 新增 `uuid`；`fullCode` 保留为**自然键 + 唯一约束** | AI join 用 uuid，人读用 fullCode |
| `cost` | 可选 number | 加 `source` + `updatedAt` | 职级成本是敏感主数据，要可追溯 |

### 2.7 胜任度 / 评分 —— 只留口，不实现（P1）

v2.1.1 **不实现**胜任度算法（那是 v2.2.0），但**预留结构化表形**，避免 v2.2.0 又动数据层：

```ts
// v2.1.1 只定义类型与 .orgproj 迁移占位，不实现算法、不接 UI
interface Assessment {
  uuid: string;
  employeeId: string;      // FK → Employee.uuid
  positionId?: string;     // FK → Position.uuid（岗位胜任度）或 employee 级（通用能力）
  dimension: string;       // 枚举预留：leadership | business | individual | level-gap ...
  score: number;           // 原始分
  scale: { min: number; max: number };  // 评分刻度（结构化，AI 才能归一化）
  assessorId?: string;     // FK → Employee.uuid（谁评的，可追溯）
  assessedAt: string;      // 评分时间（时态）
  source: 'import' | 'manual';
  createdAt: string; updatedAt: string;
}
```

- **为什么对 AI 有用**：`score + scale + assessor + assessedAt` 是「胜任度可追溯、可复算」的全部原料。v2.2.0 的灯号阈值是派生值，应运行时算、不落库。

---

## 3. 隐私与本地优先的 AI 边界（可分析但可控）

> 目标：**现在 0 云端依赖，未来接 AI 时有干净的「出口」**。所有能力都是「用户主动、显式、可脱敏」，默认仍 100% 本地。

### 3.1 结构化导出（为「喂给模型」留口）

- **固化导出 schema 版本**：`.orgproj` 已是 JSON，v2.1.1 起把「主数据导出」定为一等能力——一个**带版本号、外键完整、字段自解释**的 JSON（字段名用稳定 snake_case 英文，枚举值稳定不随 UI 文案变）。AI 读这个 JSON 即可，无需解析树内嵌结构。
- **导出 = 用户主动动作**：不自动上传、不后台同步、不遥测。导出的去向由用户决定（本地小模型读文件，或用户手动上传脱敏版到云端模型）。

### 3.2 脱敏（de-identification）

- **字段级敏感分级元数据**（P1，占位常量，不做运行时强制）：

```ts
// 敏感字段清单（元数据，非运行时 ACL）
type Sensitivity = 'pii' | 'compensation' | 'org-internal' | 'public';
const FIELD_SENSITIVITY: Record<string, Sensitivity> = {
  'employee.name': 'pii', 'employee.employeeId': 'pii',
  'employee.cost': 'compensation', 'levelConfig.cost': 'compensation',
  'employee.levelCode': 'org-internal', 'department.name': 'org-internal', ...
};
```

- **「导出脱敏版」能力**：一键把 PII 伪名化（姓名→假名/hash、工号→假名）、薪酬分档（成本→区间而非精确值），供云端模型使用。**默认导出完整版（本地），脱敏版是可选开关**。
- **为什么**：本地小模型无所谓脱敏；一旦用户想把数据交给云端 LLM，脱敏是「可分析但可控」的关键闸门。

### 3.3 字段级授权 / 敏感标记

- 现在**只做标记（元数据）**，**不做运行时访问控制**（那是 v3.0.0 治理项）。理由：本地单用户产品没有「多用户权限」场景，运行时 ACL 是过度设计。
- 标记的价值在**导出与 UI 展示**：导出时按敏感级别决定是否脱敏；未来接 AI 时，模型提示词可引用这份清单「哪些字段是敏感的、不得外泄」。

### 3.4 本地小模型路径（首选）

- 本地小模型**直接读本地 JSON**，因此**数据模型必须自解释**：稳定字段名、稳定枚举值、外键命名一致（`xxxId` 均指 `uuid`）。
- 不需要任何云端；这是「本地优先」产品接 AI 的**默认路径**，脱敏导出只是「用户想用云端模型时」的备选。

### 3.5 边界红线（与既有产品边界一致）

- ❌ 不引入云端同步、遥测、账号体系（沿用 v2.0.8 起边界）。
- ❌ 不自动上传任何数据；AI 能力触发必须是「用户显式导出」。
- ✅ 主数据模型**本身**不因「未来接 AI」而引入任何运行时依赖——AI 只是「读得懂这份数据」的潜在消费者。

---

## 4. 对当前数据模型的差距分析（AI 视角）

> 以 `src/types/index.ts` 现状为准，逐条指出「AI 视角下的薄弱点」与「v2.1.1 最低限度要补什么」。

| # | 现状（代码事实） | AI 视角的薄弱点 | v2.1.1 最低限度 |
| --- | --- | --- | --- |
| 1 | `Employee.id = emp-${index}-${Date.now()}`（`excel.ts` L191） | 导入即漂移，AI 无法跨导入/跨文件识别同一人 | 全实体 `uuid`（`Employee/Department/Position/LevelConfig`） |
| 2 | `Employee.employeeId` 可空（`cellString` 空串）；匹配靠姓名兜底（`analytics.ts` L606-619 `resolveLeader`） | 同名歧义 + 工号漂移，join 不可靠 | 明确「uuid=主键、employeeId=可空自然键」的语义分工 |
| 3 | `Employee.dept1..dept6` 每员工冗余一份字符串路径；真实归属在 `dept.employees[]`（`excel.ts` `buildDepartmentTree`） | 「员工在哪」有两处真相，路径字符串会与树脱节 | 路径降级为只读快照，唯一真相 = 外键（dept.employees / Assignment） |
| 4 | `Department.id = dept-${idx}-${level}`（`excel.ts` L270）；`scenarioDiff.ts` 需按名兜底匹配 id 漂移 | 部门 ID 不稳定，AI 无法稳定引用部门 | `Department.uuid` + `legacyId` |
| 5 | 无 Position 实体；`headcount` 是 `Department` 级（`types` L32） | 无法表达「末端岗位编制/人岗匹配」，V3 §3.2.3 的核心缺口 | Position 实体 + 岗位级 `headcount` |
| 6 | `leaderId/leaderName` 冗余双存、无类型（`types` L25-26）；leader→员工靠 fuzzy match | 无法区分正职/副职/挂名/外部（v2.0.9 已点名欠 `leaderType`） | `leaderPositionId`（FK）+ `leaderType` 枚举 |
| 7 | `Employee.level` 自由文本（`'NA'` 允许）；`LevelConfig` 是结构化 code+number（`types` L55-62） | 职级无外键，自由文本职级在配置外时静默 cost=0/灰 | `Employee.levelCode`（FK → LevelConfig.fullCode） |
| 8 | `Employee.title` 自由文本（`types` L18） | 岗位只是「人话文本」，不可结构化关联 | `Employee.positionId`（FK） |
| 9 | 无实体级时态/软删除；唯一时间轴是 Scenario 快照（`types` L80-93） | 无法表达「某岗位某时点的编制/负责人」「被裁撤的历史节点」 | 实体级 `createdAt/updatedAt/deletedAt` + 可空 `effectiveFrom/To` |
| 10 | 派生值（gap/gapCost/avgCost/灯号）运行时算、不落库（`analytics.ts`） | 这本身是**优点**，但无「原始 vs 派生」显式约定、无来源标记 | 固化「派生不落库」约定 + 关键原始字段加 `source` |
| 11 | `isVirtual` boolean 兼岗标记（`types` L12） | 兼岗无法区分「主岗/兼岗/多岗」，语义含糊 | `Assignment.isPrimary` 显式化 |
| 12 | 无胜任度/评分载体（v2.2.0 前置缺失） | v2.2.0 若再动数据层，等于推倒重来 | 预留 `Assessment` 表形（只定义不实现） |

---

## 5. 优先级建议（避免大而全）

### 5.1 现在必须纳入建模（P0 —— 进 v2.1.1 本体）

> 这些**同时是岗位化本身的地基**，不是「为 AI 加戏」，不做反而会让 v2.1.1 返工。

1. **全实体 `uuid` + `legacyId` 迁移**（Employee/Department/Position/LevelConfig）。旧 id 保留迁移，新写入用 uuid。
2. **Position 实体 + 显式外键**：`Position.deptId`、`Position.reportsToPositionId`、`Employee.positionId`、`Employee.managerId`、`Department.leaderPositionId`。
3. **岗位级 `headcount`**（编制从部门下沉到岗位）。
4. **结构化枚举**：`Position.type`、`Position.status`、`AssignmentStatus`、`Department.leaderType`。
5. **软删除 + `updatedAt`**：`deletedAt`（可空）、每实体 `createdAt/updatedAt`。
6. **原始值 vs 派生值约定**：派生指标永不落库；关键原始字段加 `source`。
7. **`Employee.levelCode`（FK）** 替换自由文本 `level`（`level` 保留只读兼容）。

### 5.2 预留字段即可、未来再填（P1 —— 占位，成本≈0）

1. **`Assessment` 表形**（§2.7）：只定义类型 + `.orgproj` 迁移占位，不实现算法/UI。
2. **`FIELD_SENSITIVITY` 敏感字段元数据**（§3.2）：常量占位，不做运行时 ACL。
3. **结构化导出 schema 版本**（§3.1）：定一个「导出 JSON 版本号 + 字段命名约定」，导出实现可随需。
4. **`effectiveFrom/effectiveTo`**（可空）：仅当岗位/分配需要表达「生效区间」时才填，默认 null = 至今。
5. **`source` 来源标记**：字段已加（P0），值在富字段导入落地时一并写入。

### 5.3 过度设计，应砍掉（P3 —— 现在不做）

1. **双时态 / 事件溯源（event sourcing）**：本地树状 JSON 不需要全量事件回放；Scenario 快照 + 实体 `updatedAt` + 可空 `effectiveFrom/To` 已够 AI 推理，全量溯源是大而全。
2. **全量审计日志（谁何时改了什么，可回放）**：v3.0.0「人工复核」可能需要，但 v2.1.1 只需「可追溯的当前事实 + 软删除」，完整审计留后。
3. **图数据库 / 规范化关系库**：`Department[]` 树 + 扁平 `Employee[]` + `Position[]` 的关系表即可表达全部外键；上关系库违背「本地优先、单文件 JSON」。
4. **岗位族 / 任职资格库 / 能力词典（competency model）**：v2.2.0 胜任度设计文档（`v220-competency-design.md`）才定，现在建是「定义债未清就上算法」。
5. **运行时字段级访问控制（RBAC/ACL）**：本地单用户无多用户权限场景；只做 `FIELD_SENSITIVITY` 元数据标记即可，运行时 ACL 是 v3.0.0 治理项。
6. **任何云端/遥测/自动上传**：直接违反产品边界，红线不变。

---

## 6. 落地检查清单（验收口径）

> 供 v2.1.1 数据模型评审用；逐条可勾选。

- [ ] 所有实体（Employee/Department/Position/LevelConfig）都有 `uuid`，旧 `id` 降级为 `legacyId`。
- [ ] 存在 `Position` 实体，`headcount` 落到岗位级；旧 `.orgproj` 无损迁移（部门级编制 = Σ 岗位编制）。
- [ ] 外键显式：`Position.deptId`、`Position.reportsToPositionId`、`Employee.positionId/managerId`、`Department.leaderPositionId/leaderType`。
- [ ] 枚举结构化：`Position.type/status`、`AssignmentStatus`、`leaderType`；`Employee.levelCode` 替换自由文本 `level`。
- [ ] 软删除：部门/岗位/员工 `deletedAt` 可空；删除不产生外键悬空。
- [ ] 每实体 `createdAt/updatedAt`；关键原始字段带 `source`（import/manual）。
- [ ] 派生指标（gap/gapCost/avgCost/灯号）确认**不落库**（固化约定，加守卫测试）。
- [ ] `Assessment` 类型已定义（占位），`.orgproj` 迁移容忍其存在（空数组）。
- [ ] `FIELD_SENSITIVITY` 元数据常量已定义（占位），无运行时依赖。
- [ ] 导出 JSON 有版本号 + 稳定字段命名约定（snake_case 英文 / 稳定枚举值）。

---

## 附：与本视角相关的既有事实（代码定位）

- 数据模型现状：`src/types/index.ts`（Employee/Department/LevelConfig/Scenario/ProjectFile）。
- 导入 id 生成与字符串路径匹配：`src/utils/excel.ts`（`mapEmployeeRows` L189-203、`buildDepartmentTree` L232-346）。
- 负责人 fuzzy 匹配：`src/utils/analytics.ts` `computeManagerBreakdown` L591-651。
- 职级结构化：`src/utils/level.ts`（`fullCode`）、`src/utils/levels.ts`（`DEFAULT_LEVELS`）。
- 场景差异已用「工号优先」作员工稳定键（佐证：稳定身份键是刚需）：`src/utils/scenarioDiff.ts` `empKey` L152-154。
- 迁移版本号：`src/utils/project.ts` `PROJECT_VERSION` L21（v2.1.1 应 bump + 写迁移函数）。
