# 组织架构设计工具 (Org Structure Designer)

> **v1.1.0** — 一个现代化的组织架构设计与管理工具，支持拖拽操作、虚拟员工（兼岗）、导出 PNG/Excel。

## 技术栈

- **前端框架**: React 18 + TypeScript (strict)
- **构建工具**: Vite 6
- **样式**: Tailwind CSS
- **拖拽**: @dnd-kit
- **Excel 处理**: xlsx（按需加载）
- **图片导出**: html2canvas（按需加载）
- **图标**: Lucide React
- **测试**: Vitest

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

# 开发模式
npm run dev

# 构建生产版本
npm run build

# 预览生产版本
npm run preview

# 代码检查（ESLint）
npm run lint

# 单元测试（Vitest）
npm run test
```

> **注意**：本仓库已配置 `.npmrc` 相关的 `allowScripts` 白名单（见 `package.json`），
> 若使用 npm 11+ 遇到 `EALLOWSCRIPTS` 错误，请检查用户级 `~/.npmrc` 中是否存在
> 旧的 `allow-scripts=true` 配置（npm 11 已将其改为包名白名单语义），删除该行后重启终端即可。

## 质量保障

- **单元测试**: Vitest + 9 个用例，覆盖部门树构建、员工归属匹配、负责人设置、导出过滤等核心逻辑
- **代码检查**: ESLint 9 (typescript-eslint + react-hooks)，`npm run lint` 零错误零警告
- **类型安全**: TypeScript strict 模式，`tsc -b` 全量类型检查
- **性能**: html2canvas/xlsx 动态导入，主包体积 852KB → 223KB（-74%）

## 版本历史

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
│   │   └── excel.test.ts      # 单元测试（Vitest）
│   ├── types/
│   │   └── index.ts           # 类型定义
│   ├── App.tsx                # 主应用组件
│   ├── main.tsx               # 入口文件
│   └── index.css              # 全局样式
├── index.html
├── package.json
├── eslint.config.js           # ESLint 9 flat config
├── tsconfig.json
├── tailwind.config.js
├── vite.config.ts
└── .gitignore
```

## 许可证

MIT License
