# 组织架构设计工具 (Org Structure Designer)

> **v2.0.3** — 组织架构设计与管理工具：本地 Web/Tauri 双端。支持**批量选择移动、Ctrl+F 搜索、组织健康度分析（含自动优化建议）、内置行业模板**，及数据自动保存/项目文件、拖拽操作、虚拟员工、导出 PNG/Excel/诊断报告。

## 技术栈

- **前端框架**: React 18 + TypeScript (strict)
- **构建工具**: Vite 6
- **桌面框架**: Tauri 2（Rust 内核，本地安装运行）
- **样式**: Tailwind CSS
- **拖拽**: @dnd-kit
- **Excel 处理**: xlsx（按需加载）
- **图片导出**: html2canvas（按需加载）
- **图标**: Lucide React
- **测试**: Vitest

## 运行形态

本工具支持两种运行方式：

| 形态 | 适用场景 | 运行方式 |
|------|---------|---------|
| **🌐 Web 版** | 浏览器直接使用 / 部署到静态托管（如 GitHub Pages） | `npm run dev` 或部署 `dist/` |
| **🖥️ Tauri 桌面版** | 本地安装运行，无需服务器，适合分发给同事 | `npm run tauri:build` 产出安装包 |

> 选择桌面版的原因：无需服务器资源即可让用户在本地运行，安装包体积约 5-10MB（Tauri 内核，远小于 Electron）。

## 功能特性

### 文件管理
- 上传员工信息 Excel 模板
- 上传组织架构模板
- 导出组织架构图为 PNG
- 导出更新后的 Excel 文件

### 组织架构图
- 树状结构展示一到多级部门
- 部门卡片展示：部门名称、负责人、员工列表
- 展开/折叠功能
- 缩放功能 (50%-150%)

### 交互功能
- 拖拽员工到不同部门
- 拖拽部门调整层级关系
- 双击编辑部门名称
- 点击负责人可搜索选择员工
- 右键菜单：调整层级归属、创建虚拟员工

### 虚拟员工（兼岗）
- 支持创建虚拟员工，表示员工在另一部门兼岗
- PNG 导出时显示虚拟员工
- Excel 导出时排除虚拟员工（不影响人数统计）

### 手动创建
- 左侧菜单支持手动创建部门
- 可指定部门层级 (L1-L6)
- 可指定父部门

## 部门层级颜色

| 层级 | 颜色 |
|------|------|
| L1 (一级部门) | 靛蓝色 |
| L2 (二级部门) | 翠绿色 |
| L3 (三级部门) | 琥珀色 |
| L4-L6 | 灰色 |

## 员工职级颜色

- L0: #FF9999
- L1.1: #FFCC99
- L1.2: #FFFF99
- L2.1: #CCFF99
- L2.2: #99FF99
- L3.1: #99FFCC
- E3.1: #99CCFF
- L3.2: #9999FF
- E3.2: #CC99FF
- L4.1: #FF99CC
- E4.1: #FF99FF
- L4.2: #CCCCCC
- L5: #999999

## 快速开始

```bash
# 安装依赖
npm install

# Web 版开发模式
npm run dev

# 构建 Web 生产版本（dist/）
npm run build

# 预览 Web 生产版本
npm run preview

# 代码检查（ESLint）
npm run lint

# 单元测试（Vitest）
npm run test
```

## Tauri 桌面版开发与构建

> 前置要求：macOS 需安装 [Xcode Command Line Tools](https://developer.apple.com/xcode/) 与 [Rust](https://rustup.rs/)；Windows 需安装 [WebView2](https://developer.microsoft.com/microsoft-edge/webview2/)（Win11 自带）与 Rust。

```bash
# 桌面版开发（热重载，自动打开桌面窗口）
npm run tauri:dev

# 构建桌面安装包（产出 .dmg / .exe / .AppImage 等）
npm run tauri:build

# 产物位于 src-tauri/target/release/bundle/
```

桌面版与 Web 版共用同一套前端代码：运行时自动检测 Tauri 环境，导出文件走原生"另存为"对话框（浏览器环境回退为下载）。

> **注意**：本仓库已配置 `.npmrc` 相关的 `allowScripts` 白名单（见 `package.json`），
> 若使用 npm 11+ 遇到 `EALLOWSCRIPTS` 错误，请检查用户级 `~/.npmrc` 中是否存在
> 旧的 `allow-scripts=true` 配置（npm 11 已将其改为包名白名单语义），删除该行后重启终端即可。

## 质量保障

- **单元测试**: Vitest + 35 个用例，覆盖部门树构建、员工归属匹配、职级自定义校验、模板下载、负责人设置、导出过滤等核心逻辑
- **代码检查**: ESLint 9 (typescript-eslint + react-hooks)，`npm run lint` 零错误零警告
- **类型安全**: TypeScript strict 模式，`tsc -b` 全量类型检查 + Rust `cargo check`
- **性能**: html2canvas/xlsx 动态导入，主包体积 852KB → 223KB（-74%）；Tauri 安装包仅 5-10MB

## 版本历史

### v2.0.3 (2026-08-23)
- **新增**: 批量选择+批量移动（框选/多选，一次移动到目标部门，可撤销）
- **新增**: Ctrl+F 搜索员工/部门并高亮定位
- **新增**: 健康度自动优化建议（基于指标生成 20+ 条部门级建议，从"画图"到"决策"）
- **新增**: 内置行业模板（互联网/制造/零售/医院科层，一键载入）
- **新增**: 新手引导三步 + 空状态增强、健康度阈值可配置化
- **工程**: 版本号 2.0.2 → 2.0.3；145 单测全绿

### v2.0.2 (2026-08-23)
- **新增**: 数据自动保存 + 项目文件（.orgproj）保存/打开（刷新不丢、可备份/换机）
- **新增**: 撤销/重做（Ctrl+Z / Ctrl+Shift+Z）
- **新增**: 组织健康度分析中心（L1 部门概览 / L2 健康度指标：管理幅度·层级深度·管理者比·空岗率，红黄绿阈值+判读 / L3 编制 vs 实际 vs 缺口含成本）
- **新增**: 一键诊断报告页（指标卡 + 组织图 + 明细表 + 诊断建议，打印/导出 PDF/PNG）
- **新增**: 项目/场景管理（工作区 → 场景快照，多版组织演练）
- **新增**: 部门编制数(headcount)、职级成本(cost) 字段
- **工程**: 版本号 2.0.1 → 2.0.2

### v2.0.1 (2026-08-22)
- **新增**: 画布滚轮缩放（以光标为中心，50-200%，拖拽中抑制）
- **新增**: 顶部菜单栏【工具模板】→ 员工信息/组织架构模板下载（Tauri 原生另存为 + 浏览器回退）
- **新增**: 职级自定义管理（序列码大写字母、编号整数或一位小数、中文标签、自动配色，localStorage 持久化）
- **新增**: 2026 视觉优化（玻璃拟态、aurora 渐变、圆角层级、阴影、8px 栅格）
- **新增**: 职级 loadFromStorage 归一化防御（code 大写 + 编号规范化 + 标签 trim）
- **修复**: 空状态 Hero 排版错乱（移出 transform:scale 容器，固定居中）
- **修复**: 滚轮缩放手感过快（改为增量累积+阈值衰减，43 用例全绿）
- **工程**: 版本号 2.0.0 → 2.0.1

### v2.0.0 (2026-08-22)
- **新增**: GitHub Actions 自动构建多平台安装包（macOS / Windows / Linux），打 tag 自动发布到 GitHub Release
- **新增**: 许可证更换为 Apache-2.0（保留署名与版权声明）
- **工程**: 版本号 1.2.0 → 2.0.0

### v1.2.0 (2026-08-22)
- **新增**: Tauri 2 桌面版（Rust 内核，本地安装运行，无需服务器）
- **新增**: 导出走原生"另存为"对话框（Tauri 环境自动检测，浏览器回退下载）
- **工程**: 新增 src-tauri（Rust 主进程 + dialog/fs 插件 + capability 权限）

### v1.1.0 (2026-08-22)
- **修复**: 部门树父子关系丢失 bug（员工全部归到一级部门），新增 idMap 反查
- **优化**: 员工归属匹配改为沿树路径精确匹配（O(n²) → O(路径长度)）
- **新增**: Vitest 单元测试体系（9 个用例）
- **新增**: ESLint 9 flat config，`npm run lint` 可用
- **性能**: html2canvas/xlsx 动态导入，主包 852KB → 223KB
- **功能**: 缩放改为真正的 CSS transform scale（替代伪缩放）
- **工程**: 添加 .gitignore，移除 node_modules/dist 跟踪；清理死代码

### v1.0.0 (2026-03-07)
- React + TypeScript 重构首版（从 Flask 迁移）

## Excel 模板格式

### 员工信息模板
| 姓名 | 工号 | 职级 | 一级部门 | 二级部门 | 三级部门 | ... |
|------|------|------|----------|----------|----------|-----|
| 张三 | E001 | L1.1 | 技术部 | 研发组 | 后端 | ... |

### 组织架构模板
| 一级部门 | 二级部门 | 三级部门 | 部门级别 | 部门负责人工号 | 部门负责人 |
|----------|----------|----------|----------|----------------|------------|
| 技术部 | 研发组 | 后端 | 1 | E001 | 张三 |

## 项目结构

```
├── src/
│   ├── components/
│   │   ├── DepartmentCard.tsx  # 部门卡片组件
│   │   ├── OrgChart.tsx       # 组织架构图组件
│   │   └── Sidebar.tsx        # 侧边栏组件
│   ├── utils/
│   │   ├── excel.ts           # Excel 处理工具
│   │   ├── excel.test.ts      # 单元测试（Vitest）
│   │   └── tauri.ts           # Tauri 环境适配（保存文件对话框）
│   ├── types/
│   │   └── index.ts           # 类型定义
│   ├── App.tsx                # 主应用组件
│   ├── main.tsx               # 入口文件
│   └── index.css              # 全局样式
├── src-tauri/                 # Tauri 桌面端（Rust）
│   ├── src/                   # 主进程代码（main.rs / lib.rs）
│   ├── capabilities/          # 权限配置
│   ├── icons/                 # 应用图标
│   ├── Cargo.toml
│   └── tauri.conf.json
├── index.html
├── package.json
├── eslint.config.js           # ESLint 9 flat config
├── tsconfig.json
├── tailwind.config.js
├── vite.config.ts
└── .gitignore
```

## 许可证

**Apache License 2.0** © 2026 [Max Hou (MaxHou-infinity)](https://github.com/MaxHou-infinity)

本项目采用 Apache License 2.0。使用、修改或分发本项目（含衍生作品）时，**必须保留原作者版权声明与署名，并在修改文件上注明变更**（详见 [LICENSE](LICENSE)）。

- 允许：商用、修改、分发、专利授权
- 要求：保留版权声明、注明修改、附上许可证副本
- 禁止：使用作者名义进行背书或推广
