# OrgCompass v2.1.1 开发路线图（详细版）

> 状态：候选路线图（团队 v211-roadmap 四视角产出，Captain 已裁决跨视角冲突）。
> 定位：**「岗位化」**——把组织树从「部门—员工」两级升级为「部门—岗位—员工」三级，交付「落位 / 套岗 / 看缺口 / 一次导全」。
> 一句话承诺：**HRBP 不再只能回答「哪个部门缺人」，而是精确到「哪个岗位缺人、什么职级、缺口多少钱」。**
> 本文件由四视角融合：产品 [v211-product-scope.md](v211-product-scope.md) · HR [v211-hr-value.md](v211-hr-value.md) · 工程/数据架构 [v211-dev-data-architecture.md](v211-dev-data-architecture.md) · AI 主数据 [v211-ai-data-analyzability.md](v211-ai-data-analyzability.md)。
> 前置文档：[v209-v300-version-plan.md](v209-v300-version-plan.md) §4（本版本范围来源）、[v300-requirements.md](v300-requirements.md)（V3 需求）。

---

## 0. 定位与范围原则

**v2.1.1 = 「岗位化」minor，V3 地基**，是通往「排兵布阵 + 人才胜任度看板」的**最大数据结构重构**版本。四条原则：

1. **数字不变**：老用户 `.orgproj` 迁移后，空岗率 / 缺口 / 成本**与迁移前完全一致**（迁移 = 数据重表达，不是数据篡改）。
2. **真值下沉、冗余保留**：编制真值从 `Department.headcount` 下沉到 `Position.headcount`，`Department.headcount` 降级为「部门直属岗位编制之和」的冗余派生字段（保向下兼容）。
3. **派生不落库**：所有派生指标（在岗数 / 缺口 / 灯号 / 匹配状态）**运行时计算**，不进持久化（沿用 v2.0.9「运行时派生」纪律）。
4. **AI 数据就绪（前瞻硬要求）**：从本版本起，主数据建模为未来 AI 分析岗位 / 组织 / 胜任度**预留**能力（稳定 ID、显式外键、结构化枚举、时态快照、原始/派生分离），但**本版本不实现任何 AI 功能、零 UI 暴露、不引入云端**。

---

## 1. 范围与优先级

### 1.1 做（本版本交付）

| # | 范围 | 归属 | 备注 |
| --- | --- | --- | --- |
| A | **Position（岗位）实体 + 岗位级编制** | 工程 | 岗位 = 编制名额的载体；部门编制 = Σ 岗位编制 |
| B | **人岗匹配状态机**（进图/未进图/超编） | 工程 × HR | 纯函数运行时派生；「不胜任」仅枚举预留 |
| C | **`.orgproj` v1→v2 迁移**（默认岗位派生 + 数字不变） | 工程 | 老用户无感 |
| D | **富字段导入**（岗位名/个人成本/目标职级/直接上级） | 工程 × HR | 替代逐人手录，HR 审计最大断点 |
| E | **`leaderType` 负责人类型**（副职/挂名精确剔除） | 工程 × HR | v2.0.9 遗留 |
| F | **招聘缺口与成本视图**（部门 + 岗位两级 + Excel 导出） | 产品 | 招聘 BP 第一步 |
| G | **AI 主数据就绪**（uuid/外键/枚举/时态/原始派生分离） | AI 数据 | 只建模留口，不做 AI 功能 |

### 1.2 推迟（进 v2.2.0 或后续）

| 范围 | 理由 |
| --- | --- |
| 胜任度引擎 + 「不胜任」自动判定 | v2.2.0；本版本仅预留 `not_competent` 枚举与 Assessment 表形 |
| 独立 `PositionAssignment` 时态关系表（startDate/endDate、多角色） | v2.2.0 与胜任度一起引入，避免 v2.1.1 过度设计 |
| 岗位级 N 场景对比矩阵 | 后置 |
| `jobFamily` 序列分组视图 / 岗位族层级 | 字段预留，视图后置 |
| AI 分析功能（智能诊断/岗位画像/编制建议/胜任度预警） | 数据就绪先行，功能后续 |
| `leaderPositionId`（负责人=岗位） | 字段预留；v2.1.1 用 `reportsToEmployeeId` 显式汇报线覆盖 AI 可追溯诉求 |

### 1.3 明确不做（边界约定）

- 不引入云端 / 遥测 / 账号；AI 路径 = 用户主动脱敏导出 或 本地小模型直读 JSON，默认 100% 本地。
- 不引入事件溯源 / 全量审计 / 图数据库 / 运行时 RBAC（AI 数据视角 P3 应砍）。
- 不替用户下结论、不引入黑盒评分（沿用既有红线）。
- 不引入「招聘 BP」显性角色名：视图命名中性「招聘缺口」，面向全体 HRBP/OD。

### 1.4 优先级

| 级别 | 事项 | 本质 |
| --- | --- | --- |
| P0 | A 岗位实体 / C 迁移 / B 状态机 | 岗位化地基，硬依赖不可裁剪 |
| P0 | E `leaderType` + D 富字段（成本/目标职级） | v2.0.9 遗留 + HR 最大断点 |
| P1 | F 招聘缺口视图 | 用户价值（依赖 P0 数据） |
| P1 | G AI 数据就绪（uuid/枚举/时态） | 前瞻，随 A 一并落地（成本≈0） |
| P2 | 岗位表 sheet / 汇报链可视化 / 岗位级 diff | 可选进阶，可裁剪 |

---

## 2. 数据模型（含 Captain 裁决）

> 完整类型定义见 [v211-dev-data-architecture.md](v211-dev-data-architecture.md) §1。此处为**定案字段**。

```typescript
// 岗位（编制名额的载体）
type PositionStatus = 'active' | 'frozen' | 'archived';
// active 正常 / frozen 冻结（headcount 不计待补缺口，单独显示「冻结 N」）/ archived 软删除
interface Position {
  id: string;              // 稳定 uuid（uid('pos')）
  departmentId: string;    // 显式外键 → Department.id
  name: string;            // 岗位名称（原始值保留）
  jobFamily?: string;      // 序列（技术/产品/设计/职能/管理/销售/运营；AI 分组用）
  levelBandMin?: string;   // 职级带宽下限（fullCode）
  levelBandMax?: string;
  headcount: number;       // 编制名额（>=0；frozen 时不计缺口）
  status: PositionStatus;
  createdAt: string; updatedAt: string;  // 时态/审计
}

type LeaderType = 'owner' | 'deputy' | 'acting' | 'external' | 'vacant';
// 正职 / 副职 / 代理 / 外部挂名 / 空缺

type MatchStatus = 'placed' | 'unassigned' | 'overstaffed' | 'not_competent';

interface Department {
  // ...existing
  positions: Position[];   // 本部门直属岗位（嵌套镜像）
  leaderType?: LeaderType; // 缺省 'owner'（向后兼容）
  headcount?: number;      // 降级为冗余派生：= Σ 直属岗位 headcount
}

interface Employee {
  // ...existing
  positionId?: string;          // 主岗外键 → Position.id；未套岗 = undefined
  assignmentType?: 'primary' | 'secondary';
  primaryEmployeeId?: string;   // 兼岗虚拟记录回指真人
  reportsToEmployeeId?: string; // 汇报线/直接上级（AI 分析汇报关系用）
  // level 保留字符串键，但为「受控词表键」：导入时规范化到 LevelConfig.fullCode
}

interface Scenario {
  // ...existing
  positions: Position[];   // 全量岗位扁平列表（analytics/AI/反查）
}
```

**Captain 裁决（跨视角）**：
1. **`PositionStatus` 增 `frozen`**：hr 决策「冻结编制不计缺口」+ dev 的 `active/archived` 合并 → 三值。
2. **`leaderType` 落地、`leaderPositionId` 预留**：本版本补 `leaderType`（解 v2.0.9 遗留）；`reportsToEmployeeId` 承担「显式汇报线」的 AI 可追溯诉求；`leaderPositionId`（负责人指向岗位）留字段、不强制迁移（等 v2.2.0 岗位稳定后升级）。
3. **`level` 不强 FK 化**：`Employee.level` 保留字符串键，但导入规范化到 `LevelConfig.fullCode`（已是受控词表键，满足 AI「结构化枚举」诉求），不引入 FK 迁移复杂度。
4. **兼岗建模**：虚拟副本 + `primaryEmployeeId` 显式回指 + `assignmentType` 区分主兼（等价 hr 的「多 Assignment + isPrimary」），**不引入独立 `PositionAssignment` 关系表**（延后 v2.2.0）。

---

## 3. 人岗匹配状态机

**两段式（与 product 决策 #3 对齐）**：
- 第一层「未入架构」= 连部门都没挂（现状 `computeUnassignedEmployees`，语义不变）。
- 第二层「未进图（未套岗）」= 挂了部门但没套岗位（新增 `computeMatchStates`）。

**MatchStatus 四态**（判定纯函数，运行时派生，不进持久化）：

| 状态 | 含义 | 判定 |
| --- | --- | --- |
| `unassigned` 未进图 | 名册员工未套任何岗位 | `!emp.positionId`（未挂任何 active 岗位） |
| `placed` 进图 | 已套岗，岗位未超编 | `emp.positionId` 有效且 `assignedCount(pos) ≤ pos.headcount` |
| `overstaffed` 超编 | 岗位实际 > 编制名额，后进者标记 | `assignedCount(pos) > pos.headcount`，按套岗序后进者标 |
| `not_competent` 不胜任 | 胜任度不足 | **v2.1.1 仅预留枚举，不产出**（v2.2.0） |

> **Captain 澄清（hr vs ai-data 表述冲突）**：「未进图」的判定 = **无 positionId（无 assignment 事实）**，不是某个 `AssignmentStatus` 枚举值——dev 的实现（`unassigned = !emp.positionId`）与 hr「无 Assignment 记录」语义**完全一致**。岗位视角的「空岗/满编/超编/冻结」是 Position 的**派生展示状态**（运行时算，不入 MatchStatus 枚举）。

---

## 4. `.orgproj` 迁移（version 1 → 2）

> 完整伪代码见 [v211-dev-data-architecture.md](v211-dev-data-architecture.md) §3。核心规则：

1. `PROJECT_VERSION = 2` + 显式 `MIGRATIONS` 迁移链（`parseProject` 先迁移再 sanitize，**只读不改原文件**）。
2. v1 `Department.headcount > 0` → 派生该部门「默认岗位」`Position{name:'默认岗位', headcount: 原值}`；`Department.headcount` 保留原值（冗余）。
3. 部门内**非虚拟**员工无 `positionId` → 自动套岗到默认岗位 → **迁移后进图人数 = 原部门人数，空岗率/缺口/成本数字完全一致**（product 决策 #2）。
4. 无编制（`headcount` 未配置）的部门不建岗，员工 `positionId` 留 undefined。
5. 幂等（重复迁移不重复建岗）；迁移失败 → `parseProject` 返回 null、原文件不动（回滚点）。

**兼容**：向上兼容（v2 读 v1 自动迁移无损）；向下兼容（v1 读 v2 仍能读 headcount 冗余 → 编制数字可见，岗位信息不可见，属预期）。

---

## 5. 富字段导入

**主路径**（员工表内嵌可选列，必填仍为「姓名/一级部门」）：

| 列 | 映射 | 缺省降级 |
| --- | --- | --- |
| 岗位名称 | 部门下 find-or-create 岗位 + 套岗 | 无 → 未套岗 |
| 个人成本 | `Employee.cost` | 无 → 职级成本映射（现状） |
| 目标职级 | `Employee.targetLevel` | 无 → undefined（替代逐人 `window.prompt`） |
| 直接上级工号/姓名 | `Employee.reportsToEmployeeId` | 无 → undefined |

**进阶**（岗位表 sheet）：`部门路径/岗位名称/序列/职级带宽下限/上限/编制数` → `parsePositionExcel`。**同名岗位去重，冲突报错（不静默吞）**（hr 决策 2 吸收）。

---

## 6. 健康度 / 画布联动

- **`analytics.ts`**：新增统一入口 `deptHeadcount(dept)`（优先聚合 `positions[].headcount`，回退 `headcount`）；新增 `computePositionSummary`（岗位级 headcount/assignedCount/gap/gapCost）；`computeManagerBreakdown` 改用 `leaderType`（分子只计 `owner`）；`computeMatchStates` 新增、`computeUnassignedEmployees` 保留。
- **组件**：`DepartmentCard` 向下钻岗位 + 员工套岗状态点；`HealthDrawer` L3 支持部门→岗位展开；`UnassignedEmployeesDrawer` 升级两段式；`DiagnosticReport`/`ManagementReport` 增加岗位级缺口表；`App` 新增岗位 CRUD + 套岗 handler。完整清单见 [v211-dev-data-architecture.md](v211-dev-data-architecture.md) §5.2。

---

## 7. AI 主数据可分析性（前瞻硬要求）

> 完整字段级要求见 [v211-ai-data-analyzability.md](v211-ai-data-analyzability.md)。此处为**定案分层**。

**P0 现在落地（也是岗位化地基，非为 AI 加戏）**：
- 全实体稳定 `uuid`（新实体）+ `legacyId`（存量 id 保留兼容，迁移不强改）；
- `Position` 实体 + 岗位级 headcount；
- 人岗匹配 Assignment 状态机（本版本前三态）；
- `leaderType` + `reportsToEmployeeId`（显式汇报线）；
- `Employee.level` 规范化到受控词表键（对齐 `LevelConfig.fullCode`）；
- 软删除 `archived` + `createdAt/updatedAt` 时态；
- 原始值 vs 派生值分离（派生指标不落库）。

**P1 只留口（成本≈0）**：`Assessment` 胜任度表形、`FIELD_SENSITIVITY` 字段级敏感元数据、结构化导出 schema 版本、可空 `effectiveFrom/To`。

**P3 应砍（避免过度设计）**：事件溯源、全量审计、图数据库、岗位族/能力词典、运行时 RBAC、任何云端。

**隐私边界**：所有建议均为本地 JSON 建模/导出约定；AI 走「用户主动脱敏导出」或「本地小模型直读 JSON」，默认 100% 本地零云端，不与「本地优先」冲突。

---

## 8. Captain 裁决记录（跨视角冲突）

| # | 冲突 | 各方主张 | 裁决 |
| --- | --- | --- | --- |
| 1 | 「未进图」表达 | hr：无 Assignment 记录（非枚举值）；ai-data：AssignmentStatus 枚举 | 一致化：`unassigned = !positionId`（无套岗事实）；岗位视角空岗/满编/超编为派生展示，不入 MatchStatus |
| 2 | 负责人建模 | ai-data：leaderType+leaderPositionId；dev：leaderType；hr：managerId 汇报 | leaderType 落地 + reportsToEmployeeId 显式汇报线；leaderPositionId 留字段预留 |
| 3 | 编制列归属 | hr：优先岗位表 sheet；product/dev：员工表内嵌为主 | 员工表内嵌岗位列为主、岗位表 sheet 进阶；吸收 hr「同名去重冲突报错」 |
| 4 | 缺口成本口径 | hr：目标职级成本优先 | 采纳：目标职级成本优先，无则回退平均 |
| 5 | 冻结编制 | hr：frozen 不计缺口 | PositionStatus 增 `frozen`，不计待补缺口、单独显示 |
| 6 | 兼岗建模 | hr：多 Assignment+isPrimary；dev：虚拟副本+primaryEmployeeId | 虚拟副本+primaryEmployeeId+assignmentType（等价 isPrimary），不引入关系表 |
| 7 | Department.headcount | dev：降级冗余派生 | 采纳：= Σ 岗位编制，迁移数字不变 |
| 8 | level 是否 FK | ai-data：levelCode FK | level 保留字符串键，导入规范化到 fullCode（受控词表键已满足 AI 诉求） |
| 9 | 招聘 BP 角色名 | product：是否引入显性角色名 | 不引入，视图命名中性「招聘缺口」 |

---

## 9. 分阶段落地 + 测试 + 回滚

| 阶段 | 内容 | 回滚点 |
| --- | --- | --- |
| P0 数据层 | types 增 Position/LeaderType/MatchStatus + project.ts 迁移链 | 迁移测试 + PROJECT_VERSION 常量 |
| P1 导入链路 | 富字段列 + 岗位表 sheet + 建岗/套岗 | 新旧模板兼容测试 |
| P2 健康度联动 | analytics 岗位级编制/缺口/成本 + 状态机 | 岗位级单测 + 数字一致性断言 |
| P3 画布/抽屉/报告 | 岗位视图 + 套岗交互 + 报告联动 | 组件级回归 |
| P4 招聘缺口视图 | 岗位缺口汇总卡/表 + 导出 | 纯视图层，独立回退 |
| P5 Tauri 回归 | 桌面端读旧 .orgproj 迁移验证 + 全量回归 | 版本号注入不变 |

**测试**：新增 `project.migration.test.ts`（v1 fixture → 数字一致 / 幂等 / 非法回退）、`match.test.ts`（进图/未进图/超编/编制0/虚拟/archived 边界）、岗位级编制单测、富字段导入回归、端到端（导入→画布→健康度→导出→重导入）。

**统一出口标准**：
- [ ] v1 `.orgproj` 迁移后空岗率/缺口/成本与迁移前**完全一致**（可复算）。
- [ ] 岗位级编制单测全绿；状态机边界用例全绿；富字段导入 + 缺省降级回归全绿。
- [ ] `leaderType` 使管理者比精确剔除副职/挂名/外部（v2.0.9 遗留闭环）。
- [ ] `npm run lint`（0 新增错误）/ `test`（全过）/ `build` 通过；`npm audit --omit=dev` 0 漏洞。
- [ ] 主数据满足 AI 就绪 P0 清单（uuid/外键/枚举/时态/原始派生分离），无云端依赖。
- [ ] 桌面端 Tauri 读旧文件迁移验证 + 关键页视觉零漂移。

---

## 10. 关联记录与后续

- 版本切分总规划：[v209-v300-version-plan.md](v209-v300-version-plan.md)（v2.1.1 为岗位化切片；§9 已指向 `v211-position-model-design.md`）。
- 本版本实现前需补：`docs/v211-position-model-design.md`（岗位实体 + 迁移方案的**设计评审**，本路线图为范围，设计文档为落地依据）。
- v2.2.0 前置：胜任度引擎 + `PositionAssignment` 时态关系表 + `not_competent` 判定（本版本已预留字段与枚举）。

## 11. v209 推迟清单复核（合并考虑）

> 逐条复核 [v209-roadmap.md](v209-roadmap.md) §1.2「推迟（进 v2.1.0 或后续）」清单，判断是否纳入 v2.1.1（Captain 裁决，2026-08）。

| v209 推迟项 | v2.1.1 处置 | 理由 |
| --- | --- | --- |
| 副职/挂名负责人**精确**剔除（需 `leaderType` 字段） | ✅ **纳入**（§1.1 E） | 本版本落地 `leaderType`，闭环 v2.0.9 遗留 |
| N 场景自由组合对比矩阵 | ❌ 仍推迟 | 与岗位化无依赖，是场景数量扩展；岗位化本已是大重构，避免范围膨胀，等岗位化稳定后单独做 |
| 场景合并 / 归档 | ❌ 仍推迟 | 属场景管理，状态管理复杂度高，与岗位化无耦合，后置 |
| 差异「优劣自动评判 / 方案推荐」 | ❌ **永不纳入**（红线） | 违反「只陈述事实、不黑盒评分、不替用户下结论」既有红线 |
| 人员级「岗位 / 胜任度」维度差异 | ⚠️ 拆分 | 「岗位级 diff」列为 P2 可裁剪（§1.2 已有「岗位级 N 场景对比矩阵→后置」），不纳入核心；「胜任度差异」依赖 v2.2.0 胜任度引擎，推迟 |
| 行业基准引擎 | ❌ 长期挂起 | 需跨企业样本标定，HR 已判定「先做阶段，行业留后」，维持挂起 |

**结论**：v209 推迟清单中，**仅 1 项（`leaderType`）正式纳入 v2.1.1**；其余维持推迟或明确不做——岗位化本身已是最大数据重构，避免把「推迟项」一并塞入导致范围失控。v2.1.1 严守「岗位化地基 + AI 数据就绪」边界。

---

## 附：四视角 companion 文档

| 视角 | 文档 | 内容 |
| --- | --- | --- |
| 产品 | [v211-product-scope.md](v211-product-scope.md) | 定位/形态/6 组验收/边界/AI 愿景/话术 |
| HR | [v211-hr-value.md](v211-hr-value.md) | 三张表语义/状态机/富字段口径/招聘缺口/优先级/风险 |
| 工程/数据架构 | [v211-dev-data-architecture.md](v211-dev-data-architecture.md) | Position 实体/迁移/导入/健康度联动/分阶段/测试 |
| AI 主数据 | [v211-ai-data-analyzability.md](v211-ai-data-analyzability.md) | AI 四要素/字段级要求 P0-P3/隐私边界/差距分析 |
