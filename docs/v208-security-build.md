# OrgCompass v2.0.8 — 安全 / 健壮 / 构建视角（security-build-expert）

> 作者：security-build-expert（团队 v208-roadmap）
> 定位：本文件只描述**技术实现 / 依赖决策 / 构建与 CI 硬化**。产品范围、验收、用户话术见 [v208-product-scope.md](v208-product-scope.md)；指标口径审计与 HR 价值优先级见 [v208-hr-value-audit.md](v208-hr-value-audit.md)。
> 基线事实（实测）：`package.json` v2.0.7；已安装 `xlsx@0.18.5`、`vite@6.4.1`、`tailwindcss@3.4.19`、`@vitejs/plugin-react@4.7.0`；CI 仅 `.github/workflows/build-tauri.yml`（tag push + workflow_dispatch，无 PR 触发器，无 build 步骤，无 Rust 缓存）。
> 运行态攻击面：`src/utils/excel.ts#readFirstSheet` 用 `XLSX.read(data,{type:'array'})` 直接解析用户上传的 `.xlsx/.xls`（Sidebar `accept=".xlsx,.xls"`）。

---

## A. P0 · xlsx 高危处置（结论：走官方 CDN 修复线，不必换库）

### A.1 问题定性
- `xlsx` 为 SheetJS 社区版。npm registry 上最后发布版本即 **0.18.5**（此后官方转移到 `cdn.sheetjs.com` 分发，npm 不再更新），所以 `npm audit` 报高危且 Dependabot 无法用 registry 版本直接修复。
- 两个高危 CVE 都命中本项目「上传即解析」的真实入口：
  - **CVE-2023-30533** 原型污染（Prototype Pollution），触发 `< 0.19.3`，0.19.3 修复。
  - **CVE-2024-22363** 正则 DoS（ReDoS），触发 `< 0.20.2`，0.20.2 修复。
- 修复版本**不在 npm registry 上**，但**官方修复线存在**：可直接以 **CDN tarball URL 作为依赖**装入 `package.json`。

### A.2 推荐路径（首选）：锁定官方 CDN 修复版
把 `dependencies` 里的 `xlsx` 改为 CDN tarball（以官方公告的最新 security 修复版为准）：

```json
"dependencies": {
  "xlsx": "https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz"
}
```

> 核对：`cdn.sheetjs.com/xlsx-0.20.2.tgz` 与 `0.20.3` 均可访问（HTTP 200）。落地前用 `npm view` / 官方 CDN 核对确切版本号；若已有更高 security 补丁，取最新公告版。

- **优点**：仍是官方同一 API 线，`src/utils/excel.ts` 及 `excel.test.ts` / `excel.integration.test.ts` 的调用（`XLSX.read`、`sheet_to_json`、`json_to_sheet`、`write`）**无需改代码**；仅 `package.json` + `package-lock.json` 变更。
- **代价**：供应链从「npm registry」变为「CDN tarball」。需在 SECURITY / README 记录该非标准来源及 CI 校验策略。
- **落地注意**：`resolved`/`integrity` 会写入 lockfile；确认 `npm ci` 在默认 registry 下能拉取该 tarball（CDN 可直连）。若企业内网/镜像无法访问 CDN，改为受控 fork。这是**单一、可回滚**的变更（改回 `^0.18.5` 即回滚），**不要与其它升级捆绑**。

### A.3 备选路径（当不想引用第三方 CDN 时）
- **受控 fork / 再发布**：`@datalens-tech/xlsx`（按 0.20.x 社区重发）、`weareu/xlsx`（0.18.5 fork 并修双 CVE）、`@e965/xlsx`、`@keep-lts/xlsx`。均为非官方发布，需评估供应链信任、活跃度与维护成本；适合「必须留在 npm registry」的场景。
- **换库 `exceljs`**：官方维护，可读写 xlsx，但**不支持旧 `.xls` 二进制**、API 不同、体积更大，会改动 `excel.ts` 解析/导出逻辑与测试。属更大改动，只在 fork/CDN 都不可行时采用，且应拆成独立任务。
- **明确的风险例外**：仅当上述均不可行（极罕见）才走“风险例外记录”——但基于 CDN 修复线存在，**不建议 v2.0.8 走例外**；且例外必须用户可见并披露残余风险。

### A.4 输入加固（无论选哪条路径都必须做，属「健壮性」）
- **分块/大小上限**：`readFirstSheet` 目前整文件读入 `ArrayBuffer`，无上限。加文件大小上限（如 ≤ 10 MB）与崩溃兜底。
- **解析防护**：`XLSX.read` 用 `{ type:'array' }` 时建议加：`dense: true`（规避部分放大攻击/Ghost 单元格对象）；适当 `sheetRows` 限制（超大表只取前 N 行）；不暴露/忽略公式（默认不执行公式，明确不开启 `cellFormula` 计算）。
- **异常隔离 + 用户提示**：`readFirstSheet` try/catch 已 reject，UI 侧须把「解析失败/文件过大/格式不符」转成可读提示，不裸抛。
- **安全测试套件**（新增 `excel.security.test.ts`）：
  - 构造原型污染载荷 workbook（如含 `__proto__` 键的单元格/表名），断言解析结果**不污染** `Object.prototype`；
  - 构造超大/深嵌套/恶意正则触发文件，断言受控（限流/异常/超时），不阻塞主线程；
  - 断言解析入口只读取预期工作表、输出无外部副作用。
- **暴露面收敛**：导入仅在用户主动上传时按需 `import('xlsx')`（已有懒加载，保留）；不要把 xlsx 放进服务端路径。

### A.5 可验收出口
- [ ] `npm audit --omit=dev` 运行时高危项 = 0（xlsx 修复版落地后）。
- [ ] 恶意 / 超大 / 异常 workbook 的输入安全与健壮性测试全绿。
- [ ] `.xls` 与 `.xlsx` 两种导入在 v2.0.8 仍可用（CDN 修复版对 `.xls` 兼容若退化需在 README 说明或转 exceljs）。

---

## B. P1 · Tailwind 4 迁移（决策：正式迁移）

### B.1 现状与阻塞根因
现为 Tailwind 3.4.19，`postcss.config.js` 用 `tailwindcss:{}`（v3 插件方式），`src/index.css` 用 `@tailwind base/components/utilities;`。
PR #7 把 `tailwindcss` 升 4.3，但**未迁移 PostCSS 与 CSS 入口**，故 `npm run build` 报「Tailwind 4 不再允许直接作为 PostCSS 插件使用」。这是**配置不完整**所致，并非库不可用。

### B.2 迁移步骤（可执行）
- 安装：`npm i -D tailwindcss@^4 @tailwindcss/postcss postcss`
- `postcss.config.js`（ESM）改为：
  ```js
  export default { plugins: { '@tailwindcss/postcss': {} } }
  ```
- `src/index.css` 顶部改 `@import "tailwindcss";`，删除 `@tailwind base/components/utilities;` 三行；将 `tailwind.config.js` 的 `theme.extend` 对应项迁移进 CSS `@theme`（示例见下）：
  ```css
  @import "tailwindcss";
  @theme {
    --shadow-soft: 0 2px 15px -3px rgba(0,0,0,.07), 0 10px 20px -2px rgba(0,0,0,.04);
    --shadow-card: 0 1px 3px rgba(0,0,0,.06), 0 8px 24px rgba(99,102,241,.08);
    --shadow-tint: 0 12px 30px rgba(99,102,241,.12);
  }
  ```
- `tailwind.config.js` 的 `content` 数组在 v4 改为**自动内容探测**，一般可移除；若用到特殊 glob 再显式保留。
- **视觉回归**：对健康度面板、部门树、设置面板等关键页做升级前后截图对比。
- **Node 要求**：Tailwind v4 需要 Node ≥ 20（CI 已用 Node 22，满足）。

### B.3 流程约束
- Tailwind 迁移**拆成独立、可回滚 commit**（不与 Vite 8 捆绑）。在配置迁移 + 视觉回归完成前，PR #7 不合并。
- `autoprefixer` 在 v4 中由内置 vendoring 承担（Lightning CSS），是否仍需保留以 build 实测为准。

### B.4 可验收出口
- [ ] `npm run build` 成功（Tailwind 4 + PostCSS 迁移后）。
- [ ] 关键页面视觉回归通过（无样式回退/丢失）。
- [ ] `npm run dev` / `preview` 下 Tailwind 类正常生效。
- [ ] 与 Vite 8 解耦：Tailwind commit 单独可回滚且独立冒烟通过。

---

## C. P1 · Vite 8 + @vitejs/plugin-react 6（工具链升级，重点是「打包验证」）

### C.1 前置条件
- **Node 最低版本**：`^20.19.0 || >=22.12.0`（Vite 7+ 已要求；Vite 8 同理）。  
  → `package.json` **补上 `engines`**：`"engines": { "node": "^20.19.0 || >=22.12.0" }`。CI 的 `node-version: 22` 满足；同时建议在 `.nvmrc` / README 注明，避免贡献者用旧 Node。
- **Vite 8 为 Rolldown 驱动**：确认 `vite.config.ts`（仅 `plugins:[react()]`）不依赖被移除的 API；检查 `build.target`、`server.port`（tauri `devUrl` 是 `http://localhost:5173`，Vite 默认 5173 保持一致）、`base`（Tauri 前端资源路径）未被破坏。

### C.2 @vitejs/plugin-react 6
- v6 移除了 Babel 主导路径（趋向 swc/oxc）。本项目 `App.tsx` / components 为常规 JSX，无自定义 Babel 需求，预期兼容。升级后跑 `npm run lint` + `npm run test`，关注 `react-refresh` / `react-hooks` 规则是否有新告警。

### C.3 Tauri 打包验证（本视角重点）
- `src-tauri/tauri.conf.json`：`beforeBuildCommand: "npm run build"`（即 Vite build）。Vite 8 升级后**必须**重验：
  - **macOS Apple Silicon（aarch64-apple-darwin）**：`npm run tauri:build -- --target aarch64-apple-darwin`
  - **Windows x64**：在 windows runner 构建
  - 确认 `tauri-action` Release 工作流产物命名与 `releaseBody` 正常（不因 bundle 输出变化而丢失 `.dmg/.msi/.exe`）。
- **版本匹配**：Tauri 2.11（Rust）、`@tauri-apps/cli` 2.11.4、`@tauri-apps/api` 2.11.1 与 Vite 8 无直接耦合；`npm run build` 产物作为 `frontendDist`，需确认 Vite 8 输出目录仍是 `dist/`（是）。
- **回滚**：Vite / plugin-react 升级单独 commit，`package-lock.json` 可整包回退；打包在升级前后各留一次验证记录。

### C.4 可验收出口
- [ ] `npm run build` / `lint` / `test` 通过。
- [ ] macOS aarch64 与 Windows x64 原生打包通过。
- [ ] `tauri-action` Release 工作流在目标版本上完成一次可追溯验证。
- [ ] `package.json` `engines` 与 README / CI 的 Node 版本一致。

---

## D. P1 · CI / 发布硬化（此前最大缺口）

### D.1 现状
- 仅 `.github/workflows/build-tauri.yml`（tag push + workflow_dispatch），**无 PR 触发器、无 build 步骤、无 Rust 缓存**。
- 无 Dependabot alerts / security updates（仓库门面清单已记录为待开启）。

### D.2 新增 PR 专用 CI（建议 `ci.yml`）
- 触发：`pull_request`（含 `dependabot/*` 分支）+ `push` 到 `main`。
- 步骤：`npm ci` → `npm run lint` → `npm run test` → `npm run build` → `npm audit --omit=dev`（或在 `npm ci` 后加 `npm audit --omit=dev` 门禁）。
- 加 `timeout-minutes`、上传 build 产物、`permissions: contents: read`。
- 静态分析作为后续项（CodeQL）延后评估。

### D.3 依赖安全扫描
- 引入 `actions/dependency-review-action@v4`（PR 时对依赖变更做审查）+ `npm audit` 门禁，与 `SECURITY.md` 私密漏洞报告策略一致。
- 保持 Dependabot security updates 开启（为 direct 依赖升级/降级提供自动化入口）。

### D.4 发布链路硬化（build-tauri.yml）
- `permissions` 最小化：`contents: write` 仅在 tag 触发时给；普通 `workflow_dispatch` 只读（用 `jobs.<id>.permissions` 或拆分 release job）。
- 加 `concurrency`：`group: ${{ github.workflow }}-${{ github.ref }}`、`cancel-in-progress: true`。
- 加 Rust 缓存：`Swatinem/rust-cache@v2`（当前 Tauri 构建无缓存，重复下载/编译慢）。
- 加 `fetch-depth`，避免浅克隆影响 `tauri-action` 版本推断。
- 三级 Action 固定到**经审查的版本 ref / 提交 SHA**（`actions/checkout@v4`、`actions/setup-node@v4`、`dtolnay/rust-toolchain@stable`、`tauri-apps/tauri-action@v0`），至少加注释说明，防供应链漂移。

### D.5 一致性
- README「技术与质量」与最终依赖（vite/tailwind/plugin-react/xlsx）保持一致。
- README 增补「开发者前置：Node ≥ 20.19」；贡献指南 / 发布前检查同步。
- `SECURITY.md` 可新增「依赖与供应链安全」小节，说明 CDN tarball 来源与 `npm audit` 门禁。

### D.6 可验收出口
- [ ] PR 打开即触发 `ci.yml`（lint/test/build/audit），且为**合并必需**（branch protection required status check）。
- [ ] `npm audit --omit=dev` 高危 = 0 通过门禁。
- [ ] 发布 job 仅在 tag 上写权限；CI 全程 `contents: read`。
- [ ] Tauri 构建有 Rust 缓存，重复构建显著加速。

---

## E. 增量出口标准（本视角补充的可量化项）

在既有出口标准之外补充：
- [ ] `npm audit --omit=dev` 高危 = 0，且有形成记录的决策（见 A）。
- [ ] 恶意 / 超大 / 异常 workbook 输入安全与健壮性测试通过（A.4）。
- [ ] `.xls` 与 `.xlsx` 导入回归通过（A.5）。
- [ ] Tailwind 4 迁移为**独立可回滚** commit，且关键页面视觉回归通过（B）。
- [ ] `package.json` `engines` 与 README / CI 的 Node 版本一致（C.1）。
- [ ] Vite 8 / plugin-react 6 为**独立** commit，macOS + Windows 原生打包通过（C）。
- [ ] 新增 PR CI（lint/test/build/audit）+ 依赖审查 + Rust 缓存 + 最小权限（D）。

## F. 风险与回滚
- **xlsx**：切 CDN tarball 属可回滚单点变更；若企业网络无法访问 `cdn.sheetjs.com`，降级为受控 fork，或作为风险例外（不建议）。
- **Tailwind 4**：最大风险是样式回退 → 视觉回归 + 独立 commit 缓解；`autoprefixer` 是否保留以 build 实测为准。
- **Vite 8**：跨大版本工具链 → 独立 commit + 原生打包验证；在打包验证完成前不合并 PR #4。
- **所有升级**：坚持「每项独立、可回滚、有验证记录」，不把 P0 / P1 捆绑到同一个提交。
