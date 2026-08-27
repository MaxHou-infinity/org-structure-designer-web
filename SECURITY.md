# 安全与隐私报告

OrgCompass 会处理组织、岗位、编制和人员信息。这类数据可能具有敏感性，请不要在公开 Issue、截图或附件中提交真实员工数据。

## 报告安全问题

如果问题可能涉及以下情况，请使用 GitHub 的私密安全报告渠道：

- 本地文件、Excel 或 `.orgproj` 数据意外泄露
- 任意文件读取 / 写入、路径穿越或权限绕过
- 依赖漏洞对 OrgCompass 的实际影响
- 安装包、Release 资产或更新链路完整性问题
- 其他不适合公开披露的安全或隐私风险

请前往仓库的 Security 页面，并选择 **Report a vulnerability**：

<https://github.com/MaxHou-infinity/orgcompass/security>

仓库上线本文件时，应同步开启 GitHub Private vulnerability reporting；如果页面暂未显示私密报告入口，请不要把漏洞细节提交到公开 Issue。

报告时建议包含：

1. 受影响版本与操作系统
2. 最小复现步骤
3. 预期影响与实际影响
4. 已匿名化的日志或示例数据

## 依赖与供应链安全

- `xlsx`（SheetJS 社区版）通过官方 CDN tarball 锁定修复版（`https://cdn.sheetjs.com/xlsx-0.20.x/xlsx-0.20.x.tgz`），以命中原型污染与正则 DoS 两个已公开高危 CVE。该来源非 npm registry，CI 已用 `npm audit --omit=dev --audit-level=high` 作为门禁。
- 若目标环境无法访问该 CDN，需评估受控 fork 或替代方案，并在发布说明中披露供应链来源。
- Dependabot alerts / security updates 保持开启，PR 专用 CI 对运行时依赖高危项做零容忍。

### 已知并登记的依赖告警（暂缓处理，非隐藏）

- **`glib`（Rust，`src-tauri/Cargo.lock`，中危）** — “glib::VariantStrIter 的 `Iterator`/`DoubleEndedIterator` 实现存在 Unsoundness”。
  - **为何暂缓**：`glib` 属于 **Linux / GObject 依赖链**（经 Tauri 的 gtk / webkit2gtk），而本项目发布目标为 **macOS(Apple Silicon) + Windows**，这两端 Tauri 使用原生 WKWebView / WebView2，**不链接 glib**，故该告警不影响已发布安装包；且为**中危 + 极窄使用面**的缺陷。
  - **处置**：登记为已知项，待未来做 Rust 依赖整体升级或重新引入 Linux 目标时，用一次受控的 `cargo update` 将 `glib` 提升到 ≥0.20.0 一并解决。
  - **结论**：该风险当前不构成 v2.0.8 发布阻塞，登记不掩盖。

## 数据最小化

- 不要上传真实姓名、邮箱、工号、薪酬、评价或组织机密。
- 如需提供复现文件，请使用虚构人员和最小字段集。
- 请先移除截图中的个人信息、文件路径和公司名称。

公开的普通 Bug 和功能建议请使用 [Issue 模板](https://github.com/MaxHou-infinity/orgcompass/issues/new/choose)。
