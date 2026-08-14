# HANDOFF 文档 — Open Academic Pipeline (OAP)

> 本文档面向接手本项目的开发者（人或 AI），事无巨细地记录架构、决策、坑与流程。
> 最后更新：2026-08-14 · 版本 v0.7.4

---

## 1. 项目是什么

**Open Academic Pipeline (OAP)**：VSCode 风格的学术研究桌面应用（Electron）。
以"项目"为容器组织任务、会话、文件、知识库，将 Claude Code CLI 与 ARS 学术技能整合为完整研究管线：研究咨询 → 准备写作 → 论文写作 → 论文审核 → 论文修改。

**核心用户流**：创建项目（绑定文件夹）→ 项目内自动生成任务集（按项目类型模板）→ 任务以表单/会话形式执行（AI 按 ARS 技能流程工作）→ 产物写入项目沙盒 → 知识库沉淀文献/笔记/随记。

**悬浮窗体系**：托盘可打开「临时对话」与「汇报助手」两个独立悬浮窗（不加载应用壳）。
汇报助手 = 多文件导入（pptx/docx/pdf/txt/md，后端解析文本）+ 原生 API 对话（模型/思考强度可调、
记录 localStorage 持久化、可导出为 md 存入知识库随记）。活动栏「汇报」按钮与资源管理器右键均直开悬浮窗。

---

## 2. 技术栈与关键版本

| 层 | 技术 | 版本（锁定） |
|---|---|---|
| 桌面 | Electron | 43.x |
| 构建 | electron-vite | 5.x |
| 打包 | electron-builder | 26.x |
| 前端构建 | Vite | **^7（勿升 8）** |
| React 插件 | @vitejs/plugin-react | **^5（勿升 6）** |
| 前端 | React + TS + Zustand + react-router-dom | 19 / 5.x(TS7) / 5 / 7 |
| 编辑器 | CodeMirror 6（@uiw/react-codemirror）+ marked | — |
| 后端 | Express（进程内，本机 11455）+ node:sqlite | 5 / 内置 |
| AI | Claude Code CLI（spawn）+ Anthropic API 保底 | CLI 2.1.x 实测 |
| 学术技能 | ARS 插件（academic-research-skills） | 3.10.0 实测 |

**端口约定**：前端 dev server **11454**（strictPort），后端 API **11455**（127.0.0.1 only）。

**重要版本约束（升级前必读）**：
- `@vitejs/plugin-react@6` 要求 Vite 8，与 electron-vite 5 冲突 → 锁 `vite@^7` + `plugin-react@^5`
- TypeScript 7 移除了 `baseUrl`（paths 必须用相对前缀 `./`），且 `React.xxx` 全局命名空间不可用（必须显式 `import type { FormEvent, JSX, MouseEvent ... } from 'react'`）
- Electron 43 内置 Node 24.18 → `node:sqlite`（DatabaseSync）可用，**不要引入 better-sqlite3**（省去原生编译地狱）

---

## 3. 架构总览

```
┌───────────────────────────── Electron 主进程 ─────────────────────────────┐
│  main/index.ts                                                           │
│  ├─ 窗口（frameless 1440x900）│ 托盘 │ 悬浮窗（第二 BrowserWindow）│ IPC │
│  └─ 动态 import('../server') → Express 监听 127.0.0.1:11455            │
│                                                                          │
│  server/（与主进程同进程，动态 import，因 OAP_DATA_DIR 必须先设置）        │
│  ├─ db.ts: node:sqlite 单连接 + migrate + mapXxx 行映射                  │
│  ├─ routes/: projects/tasks/sessions/literature/libraries/files/run/    │
│  │           chat/claude/ccswitch/envs/settings/skills/scratch/         │
│  │           recommendations/update                                       │
│  └─ claude/: cli-engine（spawn CLI，prompt 走 stdin）+ api-engine       │
│                                                                          │
│  preload/: contextBridge 暴露 window.api（含 IPC 转发）                  │
│                                                                          │
│  renderer/（React，Vite dev 11454 / 打包后 file://）                     │
│  ├─ Layout（标题栏+活动栏+侧栏+状态栏框架）                               │
│  ├─ pages: Projects(OpenAI式)/Workspace(VSCode式)/Settings/Library/      │
│  │         Recommendations/Session/TaskDetail/FloatingChat               │
│  ├─ components/workspace: ExplorerView/TasksView/SessionsView/           │
│  │         LibraryView(文献/笔记/随记)/Workbench/AuxPanel/ChatPanel/     │
│  │         CodeEditor/Resizer/NotesView/ScratchView                      │
│  └─ store: projects.ts + workspace.ts（zustand，含大量 UI 状态）          │
└──────────────────────────────────────────────────────────────────────────┘
        ▲ HTTP fetch（渲染进程直接调 11455，CSP 已放行）                   
        │ IPC（目录选择/窗口控制/托盘事件/悬浮窗转发）                      
        └─ spawn claude.cmd（cwd=项目沙盒，stdin=prompt）                  
```

### 数据流要点

- **渲染进程 → 后端**：直接 `fetch('http://127.0.0.1:11455/api/...')`（CORS 白名单 11454 + file://）
- **聊天**：`POST /api/sessions/:id/chat` → SSE 流（event: text / tool_use / done / error），客户端 AbortController 中断
- **CLI 调用**：`spawn(claude.cmd, [...args, '-p'], { cwd: 沙盒, stdio: ['pipe','pipe','pipe'] })`，**prompt 写入 stdin**（见 §6 坑 #2）
- **设置拆分**：系统设置（引擎/环境/API，强类型 `AppSettings`）与个性化设置（外观/昵称/内容偏好）分离。个性化设置是 schema 驱动的通用接口：字段在 `personalization.ts` 注册（内置或第三方 JSON 文件 `<DATA_ROOT>/personalization/*.json`，支持热重载），渲染端 `PersonalizationForm` 按 schema 自动生成表单，读写走 `GET/PUT /api/settings/personalization`。新增个性化字段无需改页面
- **文件**：项目沙盒 = 用户选择的文件夹；所有文件接口按 projectId 解析路径（`resolveInSandbox` 防逃逸）

---

## 4. 数据库 Schema（SQLite，node:sqlite 同步 API）

所有表见 `src/server/db.ts` 的 `migrate()`；**列变更**用 `PRAGMA table_info` 检查后 `ALTER TABLE`（见 engine/cost/skill/project_id 等迁移示例）。

| 表 | 关键列 | 说明 |
|---|---|---|
| projects | id, name, type, description, main_prompt, **sandbox_path**, status | 沙盒路径=用户选的项目文件夹 |
| tasks | id, project_id, name, type, prompt, **skill**, status, position | type ∈ 5 种任务类型；skill=自定义技能覆盖 |
| sessions | id, project_id, **task_id(可空=全局会话)**, claude_session_id, engine(cli/api), title, status, **cost** | cost 从 CLI result 事件 total_cost_usd 累计 |
| messages | id, session_id, role, content, **tool_uses(JSON)** | toolUses 解析自 assistant 事件的 tool_use block |
| libraries | id, project_id(可空=全局), name, path, description | 笔记库（本地目录） |
| literature | id, **project_id(可空=全局)**, title, authors(JSON), year, venue, doi, url, abstract, notes | 文献库 |
| scratch_notes | id, content, summary, created_at | 随记（临时对话沉淀） |
| settings | key, value(JSON) | 所有设置（见 settings.ts DEFAULTS） |

**数据位置**：开发 = 项目根 `data/`（main/index.ts 设置 `OAP_DATA_DIR`）；生产 = `app.getPath('userData')/oap`。

---

## 5. 任务系统（5 类型 + 表单 Schema）

定义在 `src/server/project-templates.ts`：

| type | kind | 表单字段（formSchema） |
|---|---|---|
| research-consult | chat | 无（直接对话） |
| writing-prep | form | goal*/materials/structure/constraints |
| paper-writing | form | goal*/materials/structure/journal/constraints |
| paper-review | form | paperText*/journal/focus(select)/constraints |
| paper-revision | form | paperText*/reviewerComments*/focus(select)/constraints |

**执行链**：TaskFormView（`pages/TaskDetailPage.tsx`）按 schema 渲染表单 → 组装 prompt（任务名+说明+各字段+关联文献+技能提示）→ 复用任务最近空闲会话 → SSE 流式 → 结果区展示。

**ARS 技能注入**：`server/ars-skills.ts` 按任务 type 映射技能（见 TYPE_SKILLS）→ 找 SKILL.md（插件缓存 `~/.claude/plugins/cache/academic-research-skills/academic-research-skills/<版本>/<技能名>/SKILL.md`）→ **写入沙盒 `CLAUDE.local.md`**（CLI 自动加载，绕开命令行参数限制）→ 对话前写入、会话结束后不清理（下次覆盖）。

**项目类型模板**：5 种（paper-research/data-analysis/paper-check/group-meeting/research-report），创建项目时自动种子化默认任务（按模板 defaultTasks）。

---

## 6. 踩过的坑（必读！接手后别再踩）

1. **npm 11 改写下划线配置**：`.npmrc` 的 `electron_mirror` 会被转成 `electron-mirror`（electron 安装脚本读不到）→ `scripts/ensure-electron-binary.mjs` postinstall 钩子显式设 `ELECTRON_MIRROR` 环境变量下载。**不要删这个钩子**。
2. **cmd.exe 参数破坏**：prompt 里的 `| < > "` 通过 spawn args 传递时被 cmd 解释截断（症状：AI 回复"消息没附上"/退出码 0 但无输出）→ **prompt 一律走 stdin**（`-p` 无参数 + `child.stdin.write`）。cliSpawnPrompt/spawnCli/cliTestSpawn 均已处理，新增 spawn 调用必须遵守。
3. **CLI stream-json 需要 `--verbose`**：`-p` + `--output-format stream-json` 不加 `--verbose` 会退出码 1。
4. **CLI 2.1.x 事件模型**：无逐 token 的 `content_block_delta`；每个回合输出完整 `assistant` 事件（content 数组含 thinking/text/tool_use 块）。解析时按 content 块类型提取（cli-engine.ts 已兼容新旧两种格式）。
5. **`--effort-level` 参数不存在**（当前 CLI 版本）：思考强度通过环境变量 `CLAUDE_CODE_EFFORT_LEVEL` 传递。
6. **`--session-id` 必须 UUID**；续接用 `--resume <claudeSessionId>`（存 sessions.claude_session_id）。
7. **Node 22+ 的 `req.on('close')`**：请求体读完即触发（不是连接断开）→ SSE 中断检测用 `res.on('close') + !res.writableEnded`。
8. **Electron 新版禁用 `window.prompt/confirm`**：重命名等交互必须内联输入框/自定义模态（ExplorerView 已改内联重命名；`window.confirm` 在 Electron 43 仍可用但不要新增 prompt）。
9. **CSP**：`index.html` 的 CSP 必须包含 `connect-src` 11454/11455 + `img-src/media-src/frame-src` 11455（二进制预览用）。新增跨源资源记得同步改。
10. **Windows 文件锁**：cc-switch 的 DB 被占用 → 读取时**复制到临时文件**再打开（ccswitch.ts）。
10b. **版本号别用 `process.env.npm_package_version`**：只有 `npm run` 启动才有，打包后为 undefined → 显示 v0.0.0。用主进程 `app.getVersion()`（IPC `app:getVersion`，preload 暴露 `window.api.appVersion()` 返回 Promise）。
10c. **Node 全局 fetch 不走系统代理**：更新检查等对外请求用 `net.fetch`（Electron，走 Chromium 网络栈尊重系统代理），并加镜像回退（jsDelivr）与重试（见 update.ts）。
10d. **`-webkit-app-region: drag` 区域内的控件不可点击**（下拉/按钮失效）：所有交互元素必须显式 `-webkit-app-region: no-drag`（悬浮窗头部踩过坑）。
10e. **Express `sendFile` 拒绝点开头的隐藏目录**（如 `.oap-preview`）→ 404。Office 转换输出目录用 `_oap_preview`（下划线开头）。
10f. **pptx 高保真渲染**：优先系统 PowerPoint COM（PowerShell 调用 `SaveAs(path, 32)`，`ExportAsFixedFormat` 枚举参数在 PS 会转换失败）→ 系统 LibreOffice（`soffice --headless -env:UserInstallation=<OAP专属profile>`，避免污染用户配置）→ 版面级自研渲染（文本位置+图片，`SlideCanvas`）回退。曾尝试捆绑 LibreOffice（1.6GB）后按用户要求移除。
10g. **pdf-parse v2 是 `PDFParse` 类**（`new PDFParse({data}).getText()`），不是默认导出函数。
10h. **Electron 类型无 Windows `vibrancy: 'acrylic'`**：需 `'acrylic' as never` 断言；透明窗口需 `transparent: true` + `backgroundColor: '#00000000'` + 页面 body 背景透明（PresentAssistPage 挂载时设置）。
10i. **汇报助手置顶**：`win.setAlwaysOnTop(true, 'screen-saver')`（最高级别，可盖过全屏放映）+ `setVisibleOnAllWorkspaces`。
10j. **electron-builder 图标**：`win.icon` 直接指向 `resources/icon.ico`（PIL 生成多尺寸），不要用 png——icon-tool 的 wasm 转换在本机报 `WebAssembly.Memory(): could not allocate memory`。图标源图 ≤512×512（778×778 也会触发）。换图标：改 `inputResoureces/icon.png` → 缩到 512 → 生成 `resources/icon.ico` + 同步 `assets/app-icon.png`。
11. **conda 检测**：不要依赖 PATH；用 PowerShell 注册表（HKLM/HKCU PythonCore）+ 全盘扫描（`where /r`）+ `conda env list --json`（经 base python `-m conda`）。运行脚本直接用环境 `python.exe` 绝对路径（`<root>/envs/<name>/python.exe`），**不要用 `conda run`**（PATH 上可能没有 conda）。
12. **bash heredoc/模板字符串**：本项目大量代码经 node -e 脚本写入，`\n` 与模板字符串会被 bash 转义破坏——修完**必须跑 typecheck**。
13. **React 19 + TS7**：JSX 组件 props 里 `key` 需要显式声明；`React.FormEvent` 等命名空间类型必须从 react 显式导入。

---

## 7. 开发流程

```bash
npm install        # 含 Electron 二进制（npmmirror）
npm run dev        # 前后端同启（11454/11455），主进程改动需重启
npm run typecheck  # node + web 双目标
npm run build      # typecheck + 三端产物到 out/
npm run dist       # build + electron-builder Windows x64 NSIS → release/
```

**调试**：
- 后端日志在 dev 终端（`[server]` / `[chat]` / `[cli]` 前缀）
- 渲染进程 console：`ELECTRON_ENABLE_LOGGING=1 npm run dev`
- API 冒烟：`curl http://127.0.0.1:11455/api/health`
- CLI 手工复现：`claude.cmd --output-format stream-json --verbose -p`（stdin 输入 prompt）

**测试模式**：所有 API 均可用 curl/Node fetch 直接测（CORS 只拦浏览器）。会话聊天实测模板见会话历史（创建项目→会话→chat SSE→查 messages 落库→清理）。

---

## 8. 发布流程

1. `package.json` 改 version
2. 更新 README（中英文版）+ HANDOFF
3. `git commit -m "release vX.Y.Z"` + `git push origin main`
4. `npm run dist` → `release/open_Academic_Pipeline_v_X.Y.Z_beta_x64.exe`
5. GitHub → Releases → 新建 tag `vX.Y.Z-beta` → 拖拽 exe 上传 → Publish
6. 更新 `https://kawasakikusako.github.io/generalExp/kawasakiApps/oap.xml` 的 main/sub/dev（应用内"检查更新"读此文件）

**版本检查**：`server/routes/update.ts` 抓取 oap.xml 解析 `<main>/<sub>/<dev>` 与 package.json 比较；有新版弹窗提示下载页（GitHub + 官网）。

---

## 9. 已知问题 / TODO

- [ ] **打包后未实测**：dev 模式全链路验证过，安装包（NSIS）安装后的运行未完整回归
- [ ] `window.confirm` 在部分 Electron 版本被弃用——建议逐步替换为应用内确认模态
- [ ] 启动日志偶现 `DEP0190 DeprecationWarning: shell option true`（某处 spawn 带 shell:true + args 数组），排查来源并移除
- [ ] 汇报助手磨砂透明（vibrancy acrylic）在部分 Win10 无效果（Win11 亚克力正常），可接受
- [ ] 汇报助手/悬浮窗历史存 localStorage（各窗口独立），未做跨窗口同步
- [ ] 会话列表大数据量无虚拟滚动
- [ ] 工作台选项卡不支持拖拽排序
- [ ] 文献编辑（PUT）接口存在但 UI 未接编辑入口（仅删除）
- [ ] API 引擎无工具调用（纯文本），无法操作沙盒文件
- [ ] 悬浮窗（floating-chat 窗口）与主窗口数据不互通（localStorage 隔离）——历史仅存浮窗侧
- [ ] `AAAAA.MD` 为 CLI 调试产生的垃圾文件，已 gitignore（可手动删除）
- [ ] update.xml 的 GitHub Pages 部署后需实测更新提示链路

---

## 10. 资源与图标

| 文件 | 用途 |
|---|---|
| `inputResoureces/icon.png` | 应用图标（窗口/任务栏/托盘/打包） |
| `inputResoureces/grayBack.png` | 侧栏背景花纹 + 标题栏 logo |
| `resources/icon.png` | 上述 icon.png 的副本（electron-vite/打包引用） |
| `src/renderer/src/assets/app-icon.png` / `app-back.png` | 渲染进程内引用副本 |
| `inputResoureces/README_EN.md` | 英文版 README |

更换图标：替换 `inputResoureces/` 原图后同步覆盖 `resources/` 与 `assets/` 两份副本。

---

## 11. 关键文件索引（快速定位）

| 需求 | 位置 |
|---|---|
| 窗口/托盘/悬浮窗/IPC | `src/main/index.ts` |
| preload API 面 | `src/preload/index.ts` + `index.d.ts` |
| 后端入口/路由挂载 | `src/server/index.ts` |
| DB schema/迁移 | `src/server/db.ts` |
| 设置（默认值/存取） | `src/server/settings.ts` + `routes/settings.ts` |
| 个性化设置注册中心（schema 驱动） | `src/server/personalization.ts` + `routes/personalization.ts` |
| 个性化设置通用表单 | `src/renderer/src/components/settings/PersonalizationForm.tsx` |
| 汇报助手（悬浮窗纯对话） | `src/renderer/src/pages/PresentAssistPage.tsx` + `routes/present-assist.ts`（文件文本提取） |
| 临时对话悬浮窗 | `src/renderer/src/pages/FloatingChatPage.tsx` + chat.ts 的 `/temp/chat`（CLI）与 `/temp/chat-api`（API 引擎） |
| Office 预览/高保真渲染 | `src/server/routes/office.ts`（mammoth/SheetJS/COM/LibreOffice）+ `Workbench.tsx` 的 OfficePreview |
| 版面渲染（pptx 轻量放映） | `src/renderer/src/components/present/SlideCanvas.tsx` + `shared/types.ts` 的 SlideDetail |
| CLI 引擎（spawn/解析/标题生成） | `src/server/claude/cli-engine.ts` |
| API 引擎（thinking/流式） | `src/server/claude/api-engine.ts` |
| 聊天路由（SSE/注入/落盘/自动标题） | `src/server/routes/chat.ts` |
| ARS 技能映射/注入 | `src/server/ars-skills.ts` |
| 任务/项目类型模板 | `src/server/project-templates.ts` |
| 文献解析（BibTeX/RIS/JSON/文本） | `src/server/literature-parser.ts` |
| 推荐（arXiv/RSS/关键词） | `src/server/routes/recommendations.ts` |
| 环境检测（注册表/conda/uv） | `src/server/routes/envs.ts` |
| 模型列表（cc-switch） | `src/server/routes/ccswitch.ts` |
| 工作区状态（tabs/草稿/主题） | `src/renderer/src/store/workspace.ts` |
| 布局框架（标题栏/活动栏/状态栏） | `src/renderer/src/components/Layout.tsx` |
| 工作台（选项卡/面板/右键） | `src/renderer/src/components/workspace/Workbench.tsx` |
| 资源管理器（树/右键/拖拽/重命名） | `src/renderer/src/components/workspace/ExplorerView.tsx` |
| 副侧栏（分组会话+内嵌对话） | `src/renderer/src/components/workspace/AuxPanel.tsx` |
| 编辑器（CodeMirror 封装） | `src/renderer/src/components/workspace/CodeEditor.tsx` |
| 悬浮窗页面 | `src/renderer/src/pages/FloatingChatPage.tsx` |
| 设计系统（主题变量） | `src/renderer/src/assets/main.css` |
| 组件样式 | `src/renderer/src/App.css` |
| 共享类型 | `src/shared/types.ts` |

---

## 12. 给接手者的建议

1. **先跑通 dev 再改代码**：`npm run dev` + 创建测试项目走一遍全流程（创建→任务→会话→文件→知识库）
2. **改后端必须重启**（动态 import 但无热重载）；改渲染进程 Vite HMR 自动生效
3. **所有新 API**：先在 `server/index.ts` 挂载 → `lib/api.ts` 封装 → 页面调用；类型放 `shared/types.ts`
4. **所有 spawn CLI 的调用**：遵守 §6 坑 #2（stdin）与 #3（--verbose）
5. **Windows 特殊字符**（`| < > "`）在 prompt/文件名中常见——任何传递路径或文本的地方都要考虑转义与编码（UTF-8 全链路）
6. 提交信息用中文 + `Co-Authored-By: Claude <noreply@anthropic.com>`

---

**Happy hacking!** 🎓
