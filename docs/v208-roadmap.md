# OrgCompass v2.0.8 开发路线图

> 状态：候选路线图，版本范围与发布日期待后续确认。
>
> 目标：在继续扩展组织诊断能力之前，先完成依赖安全、构建工具链和桌面发布链路的稳定性收口。

## 1. P0 安全前置：xlsx 运行时高危依赖

当前直接依赖 `xlsx@0.18.5`。运行时审计仍报告高危问题：

- 原型污染（Prototype Pollution）
- 正则表达式拒绝服务（ReDoS）

项目会读取用户上传的 Excel 文件，因此该风险与真实产品入口直接相关。npm registry 当前没有高于 0.18.5 的可直接升级版本，不能用普通 Dependabot PR 解决。

### v2.0.8 需要考虑

- 评估可维护的替代 Excel 解析库
- 评估受控 fork / 补丁版本的供应链与维护成本
- 在替换前增加恶意工作簿、超大工作簿和异常公式的输入测试
- 明确本地优先场景下的风险边界与用户提示
- 在发布前将运行时 `npm audit --omit=dev` 的高危项降为 0，或形成经过确认的风险例外记录

## 2. P1 构建阻塞：Tailwind 4 迁移

关联记录：[Issue #9](https://github.com/MaxHou-infinity/orgcompass/issues/9)

关联 PR：[PR #7](https://github.com/MaxHou-infinity/orgcompass/pull/7)

PR #7 将 Tailwind CSS 从 3.4 升级到 4.3，但没有同步迁移 PostCSS、CSS 入口和 Tailwind 配置。当前复现结果是：

- `npm ci`：通过
- `npm run lint`：通过（仅原有 2 条 warning）
- `npm run test`：167/167 通过
- `npm run build`：失败，Tailwind 4 不再允许直接作为 PostCSS 插件使用

### v2.0.8 需要考虑

- 决定继续使用 Tailwind 3，或正式完成 Tailwind 4 迁移
- 如迁移，加入 `@tailwindcss/postcss` 并更新 PostCSS 配置
- 更新 CSS 入口和 Tailwind 配置
- 完成关键页面视觉回归
- 完成 Web 构建与 macOS / Windows Tauri 打包验证
- 将 Tailwind 迁移拆成独立、可回滚的变更，不与 Vite 8 升级捆绑

在配置迁移和视觉回归完成前，PR #7 不应合并。

## 3. P1 工具链评估：Vite 8 与 React 插件 6

关联记录：[Issue #8](https://github.com/MaxHou-infinity/orgcompass/issues/8)

关联 PR：[PR #4](https://github.com/MaxHou-infinity/orgcompass/pull/4)

PR #4 将 Vite 从 6.4.1 升级到 8.2.2，将 `@vitejs/plugin-react` 从 4.7.0 升级到 6.1.0。临时工作树验证显示 Web 构建、lint 和测试均通过，但这是跨大版本的开发工具链升级。

### v2.0.8 需要考虑

- 确认 Node 最低版本：`^20.19.0 || >=22.12.0`
- 验证 `@vitejs/plugin-react` 6 移除 Babel 相关能力后对现有配置的影响
- 完成 macOS Apple Silicon 原生打包
- 完成 Windows 原生打包
- 确认 `tauri-action` Release 工作流使用新产物正常
- 更新开发环境、贡献指南和发布前检查中的 Node / Vite 版本说明

在原生打包和 Release 工作流验证完成前，PR #4 保持独立，不与 Tailwind 迁移合并。

## 4. v2.0.8 出口标准

- [ ] P0 运行时高危依赖有明确处置结果
- [ ] `npm ci` 成功
- [ ] `npm run lint` 无新增错误
- [ ] `npm run test` 全部通过
- [ ] `npm run build` 成功
- [ ] macOS Apple Silicon Tauri 打包成功
- [ ] Windows Tauri 打包成功
- [ ] Release 工作流在目标版本上完成一次可追溯验证
- [ ] README 的技术栈和安装说明与最终依赖版本一致
- [ ] 所有重大依赖升级均有可回滚路径和验证记录

## 5. 当前已完成基线

- Dependabot PR #1、#2、#3 已合并
- PR #4、#7 已建立独立问题记录并保持 open
- 仓库当前没有 PR 专用 CI 检查；合并前验证不能只依赖 GitHub 的 `MERGEABLE` 状态
