# Open Academic Pipeline (OAP)

<p align="center">
  <img src="resources/icon.png" alt="OAP 图标" width="128" height="128" />
</p>

> 开源的学术研究助手工作台 —— 以项目为容器，将 Claude Code 与学术技能（ARS）整合为完整的研究管线。

![Version](https://img.shields.io/badge/version-0.7.4-blue)
![License](https://img.shields.io/badge/license-MIT%20%2B%20GPLv3-green)

[官方网站](https://kawasakikusako.github.io/generalExp/oap/) · [GitHub 仓库](https://github.com/KawasakiKusako/openAcademicPipeline) · [English README](inputResoureces/README_EN.md)

---

## ✨ 功能特性

### 项目工作区（VSCode 风格）

- **完整工作区布局**：活动栏（工具切换）→ 主侧栏（可拖拽）→ 工作台（可拖拽、选项卡）→ 副侧栏（可拖拽）
- **选项卡系统**：文件 / 任务 / 会话 / 设置 / 推荐阅读以选项卡形式打开，**未保存草稿不丢失**（草稿进内存缓存，切换选项卡秒开）
- **文件编辑器**：CodeMirror 6 全语言语法高亮、自动补全、Markdown 双栏预览、图片/视频/音频/PDF 预览
- **文件树**：右键菜单（新建/复制/剪切/粘贴/删除/重命名/运行/发送到会话）、拖拽移动、自动刷新
- **底部输出面板**：可调高度、输出/问题双视图（Python 脚本错误自动提取）
- **主题系统**：深色/浅色切换 + 强调色（蓝/绿/紫/橙/自定义 HEX）

### 项目管理

- **5 种项目类型模板**：论文研究 / 数据分析 / 论文核查 / 组会汇报 / 研究报告（每种自动生成默认任务集）
- **项目沙盒**：项目绑定本地文件夹，`CLAUDE.md` 主线提示词自动生成，Claude Code 会话运行于沙盒内
- **项目导入/导出**：完整 JSON 往返（元数据 + 任务 + 会话 + 消息 + 文献）
- **AI 创建项目**：项目总览输入研究想法 → AI 生成项目建议 → 一键创建

### 任务系统（5 类，表单驱动）

| 任务类型 | 交互形式 | ARS 技能 |
|---|---|---|
| 研究咨询 | 会话式 | `/ars-plan` |
| 准备写作 | 表单式（目标/材料/结构） | `/ars-plan` |
| 论文写作 | 表单式（目标/章节/期刊） | `/ars-outline` |
| 论文审核 | 表单式（论文/审核重点） | `/ars-reviewer` |
| 论文修改 | 表单式（论文/审稿意见/修改重点） | `/ars-revision-coach` |

- 表单提交自动组装任务指令 + 注入 ARS 技能 SKILL.md 到会话
- 任务可自定义关联技能（含 `~/.claude/skills` 自定义技能）

### 会话系统

- **双引擎**：Claude Code CLI（默认，运行于沙盒，cc-switch 模型自动生效）+ Anthropic API 直连（保底）
- **全局会话 vs 任务会话**：明确分组，副侧栏内嵌对话（不占工作区）
- **会话自动标题**：非任务会话首轮对话后 AI 自动生成标题
- **消息落盘**：所有对话实时写入项目文件夹 `.chat_cache.json`
- **思考强度**：低/中/高/最大（thinking budget 映射）

### 知识库

- **文献库**：结构化条目管理 + 批量导入（**BibTeX / RIS（Zotero·EndNote）/ JSON / 自由文本**），支持粘贴或文件导入、自动去重、项目/全局归属
- **笔记库**：本地目录注册（支持 Obsidian vault）、递归浏览、模态编辑
- **随记**：临时对话沉淀、快速想法记录

### 推荐阅读

- 基于项目文献 + 知识库文献关键词自动推荐 **arXiv** 论文
- 自定义 **RSS 订阅源**（URL 或本地 .rss/.xml 文件）
- 自定义关键词与 arXiv 分类过滤（如 `cs.CV`）
- 按源分组标签卡展示，一键导入文献库/随记

### 悬浮窗与快捷入口

- **系统级悬浮窗**（托盘菜单开启）：置顶独立小窗临时对话，主窗口选中文字右键可"发送到悬浮窗"
- **全局搜索**（`Ctrl+Shift+P` 或托盘菜单）：跨项目/任务/会话/文件/文献搜索
- **托盘**：显示主窗口 / 快速搜索 / 临时对话 / 退出

### 环境与模型管理

- **Python 环境**：PowerShell 注册表枚举 + conda 环境直扫（`conda env list`），支持 conda/uv/系统 Python 及具体版本切换，运行脚本直接使用环境 `python.exe`
- **模型管理**：读取 cc-switch 配置 + Claude Code 模型家族，设置页下拉切换（留空跟随 cc-switch）
- **链接测试**：一键测试 Claude Code 连接

---

## 🛠 技术栈

| 层 | 技术 |
|---|---|
| 桌面框架 | Electron 43 |
| 构建 | electron-vite 5 · Vite 7 |
| 前端 | React 19 · TypeScript · Zustand · CodeMirror 6 · marked |
| 后端 | Express（本机 11455 端口）· node:sqlite |
| AI 引擎 | Claude Code CLI + Anthropic API |
| 学术技能 | ARS（academic-research-skills 插件）|

---

## 🚀 快速开始

```bash
# 安装依赖（首次安装会自动下载 Electron 二进制，走 npmmirror 镜像）
npm install

# 启动开发模式（前端 11454 / 后端 11455）
npm run dev

# 类型检查
npm run typecheck

# 生产构建
npm run build

# 预览生产构建
npm run start
```

**前置要求**：

- Node.js ≥ 20（开发时推荐 24）
- [Claude Code CLI](https://claude.com/claude-code)（CLI 引擎必需；API 保底引擎可替代）
- 可选：[cc-switch](https://github.com/farion1231/cc-switch)（多模型切换）
- 可选：ARS 学术技能插件（`academic-research-skills`）

---

## 📖 使用指南

### 1. 创建项目

项目总览 → 输入研究想法让 AI 生成建议，或直接"新建项目"填写表单：
- **项目名称**（必填）
- **项目类型**（决定默认任务集）
- **项目文件夹**（必填，成为沙盒：所有文件、会话运行于此）
- 项目描述、主线提示词（写入沙盒 `CLAUDE.md`）

### 2. 进入工作区

进入项目后是完整 VSCode 界面：
- **活动栏**切换主侧栏视图：资源管理器 / 任务 / 会话 / 知识库 / 推荐阅读
- **工作台**选项卡式打开文件、任务、会话
- **副侧栏**内嵌对话（全局会话 + 任务会话分组）
- 标题栏**中央输入框**：点击展开悬浮全局会话

### 3. 执行任务

- 会话式任务（研究咨询）：直接对话
- 表单式任务：填写表单（目标/材料/约束…）→ 提交 → AI 按 ARS 技能流程执行 → 结果实时流式显示
- 表单提交自动复用任务会话（连续对话），首次完成自动生成会话标题

### 4. 知识库

- 添加文献：手动或批量导入（BibTeX/RIS/JSON/文本）
- 笔记库：注册本地目录（可选 Obsidian vault），浏览编辑 markdown
- 随记：临时对话"存入随记"沉淀

### 5. 快捷键

| 快捷键 | 功能 |
|---|---|
| `Ctrl+S` | 保存当前文件 |
| `Ctrl+B` | 开关主侧栏 |
| `Ctrl+J` | 开关输出面板 |
| `Ctrl+Shift+B` | 开关副侧栏 |
| `Ctrl+W` | 关闭当前选项卡 |
| `Ctrl+Tab` | 切换选项卡 |
| `Ctrl+Shift+P` | 全局搜索 |
| `Ctrl+= / Ctrl+-` | 编辑器字体大小 |

---

## 📁 项目结构

```
├─ src/
│  ├─ main/          # Electron 主进程（窗口/托盘/悬浮窗/IPC）
│  ├─ preload/       # contextBridge 安全桥
│  ├─ server/        # Express 后端（11455）：SQLite、路由、CLI/API 引擎
│  │  ├─ claude/     # 双引擎（cli-engine / api-engine）
│  │  └─ routes/     # projects/tasks/sessions/literature/libraries/
│  │                 # recommendations/scratch/ccswitch/envs/update…
│  ├─ shared/        # 前后端共享类型
│  └─ renderer/      # React 前端
│     ├─ components/ # 工作区组件（Explorer/Workbench/AuxPanel…）
│     └─ pages/      # 页面（Projects/Workspace/Settings/Library…）
├─ resources/        # 应用图标
├─ scripts/          # 开发工具（Electron 二进制保障、图标生成）
└─ data/             # 开发模式数据（SQLite + 沙盒），生产在 userData
```

---

## ⚙️ 配置说明

所有配置在 **设置** 页（活动栏左下角 ⚙）：

- **引擎与模型**：默认引擎、模型选择（跟随 cc-switch 或指定）、思考强度、链接测试
- **沙盒环境**：运行环境（系统 Python / conda 各环境 / uv）、conda 路径手动指定、全盘搜索
- **自定义技能**：技能目录（默认 `~/.claude/skills`）
- **推荐阅读**：自定义关键词、arXiv 分类、RSS 订阅源（也直接在推荐页配置）
- **API 保底**：API Key、Base URL
- **外观**：主题、强调色（含自定义 HEX）、用户名

---

## ❓ 常见问题

**Q: conda 环境检测不到？**
设置 → 沙盒环境 → "全盘搜索 conda"（遍历所有盘符）；或手动指定 conda 根目录/conda.exe 路径。找到后环境列表自动刷新。

**Q: Claude Code 连接失败？**
设置 → "测试 Claude Code 链接"。确认 CLI 已安装且 `claude --version` 可用；模型切换依赖 cc-switch（留空模型 = 跟随 cc-switch 当前配置）。

**Q: 切换选项卡后编辑内容丢失？**
不会。未保存草稿保存在内存中（选项卡保持挂载），保存（`Ctrl+S`）后写入磁盘。

**Q: 如何导入 EndNote/Zotero 文献？**
知识库 → 文献 → 导入按钮 → 选择 `.ris`/`.bib` 文件（或粘贴导出内容），自动解析去重。

**Q: 端口冲突？**
前端固定 11454，后端固定 11455。启动失败请检查端口占用。

---

## 📄 许可

MIT + GPLv3 双许可。详见 [官方网站](https://kawasakikusako.github.io/generalExp/oap/)。

---

**Powered by Claude Code** · 研究咨询 → 数据沙盒 → 准备写作 → 论文写作 → 论文审核 → 论文修改
