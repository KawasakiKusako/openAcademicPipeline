# HANDOFF 文档 — Open Academic Pipeline (OAP)

> 本文档面向接手本项目的开发者（人或 AI），事无巨细地记录架构、决策、坑与流程。
> 最后更新：2026-08-15 · 版本 v0.8.x（开发中，0.7.4 已发布）

---

## 1. 项目是什么

**Open Academic Pipeline (OAP)**：VSCode 风格的学术研究桌面应用（Electron）。
以"项目"为容器组织任务、会话、文件、知识库，将 Claude Code CLI 与 ARS 学术技能整合为完整研究管线：研究咨询 → 准备写作 → 论文写作 → 论文审核 → 论文修改 → 演示与汇报。

**核心用户流**：创建项目（绑定文件夹）→ 项目内自动生成任务集（按项目类型模板）→ 任务以表单/会话形式执行（AI 按 ARS/技能流程工作）→ 产物写入项目沙盒 → 知识库沉淀文献/笔记/随记。

**悬浮窗体系**：托盘可打开「临时对话」与「汇报助手」两个独立悬浮窗（不加载应用壳）。
- 临时对话：无项目随手提问，可保存到随记
- 汇报助手：多文件导入（pptx/docx/pdf/txt/md）+ 原生 API 对话（模型/思考强度可调、记录 localStorage 持久化、导出为 md 存入随记、项目状态导入）
- 活动栏「汇报」按钮与资源管理器右键均直开汇报助手悬浮窗

**权限确认体系**：CLI 会话执行 Bash 命令时，通过 PreToolUse Hook 弹出桌面确认框（允许/拒绝/总是允许），详见 §6 坑 #10k 与 §12。

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
| 学术技能 | ARS 插件（academic-research-skills） | 3.10.0 实测，已可内置化 |
| Office 解析 | mammoth(docx) / SheetJS(xlsx) / pdf-parse(pdf) / jszip(pptx) | — |
| 文档生成 | docx（导出 Word）/ turndown+marked（MD WYSIWYG） | — |
| 自动更新 | electron-updater（增量差分，读 GitHub latest.yml） | 6.8.x |

**端口约定**：前端 dev server **11454**（strictPort），后端 API **11455**（127.0.0.1 only）。

**重要版本约束（升级前必读）**：
- `@vitejs/plugin-react@6` 要求 Vite 8，与 electron-vite 5 冲突 → 锁 `vite@^7` + `plugin-react@^5`
- TypeScript 7 移除了 `baseUrl`（paths 必须用相对前缀 `./`），且 `React.xxx` 全局命名空间不可用（必须显式 `import type { FormEvent, JSX, MouseEvent ... } from 'react'`）
- Electron 43 内置 Node 24.18 → `node:sqlite`（DatabaseSync）可用，**不要引入 better-sqlite3**

---

## 3. 架构总览

```
┌───────────────────────────── Electron 主进程 ─────────────────────────────┐
│  main/index.ts                                                           │
│  ├─ 窗口（frameless 1440x900）│ 托盘 │ 临时对话悬浮窗 │ 汇报助手悬浮窗 │ IPC │
│  ├─ autoUpdater（electron-updater 增量更新）                             │
│  ├─ CLI 权限确认桥（permissionBus → 窗口广播 → 决策回写）                 │
│  └─ 动态 import('../server') → Express 监听 127.0.0.1:11455            │
│                                                                          │
│  server/（与主进程同进程，动态 import，因 OAP_DATA_DIR 必须先设置）        │
│  ├─ db.ts: node:sqlite 单连接 + migrate + mapXxx 行映射                  │
│  ├─ routes/: projects/tasks/sessions/literature/libraries/files/run/    │
│  │           chat/claude/ccswitch/envs/settings/skills/scratch/         │
│  │           recommendations/update/personalization/present-assist/     │
│  │           office/api-providers/ars                                    │
│  ├─ claude/: cli-engine（spawn CLI + 权限总线）+ api-engine（双格式）     │
│  └─ personalization.ts（个性化设置注册中心，schema 驱动）                 │
│                                                                          │
│  preload/: contextBridge 暴露 window.api（含 IPC 转发）                  │
│                                                                          │
│  renderer/（React，Vite dev 11454 / 打包后 file://）                     │
│  ├─ Layout（标题栏+活动栏+侧栏+状态栏+全局弹窗：更新/权限/关于）           │
│  ├─ pages: Projects/Workspace/Settings×4/Api/Skill/Library/             │
│  │         Recommendations/Session/TaskDetail/FloatingChat/             │
│  │         PresentAssist/Help/Audience                                    │
│  ├─ components/workspace: Explorer/Tasks/Sessions/Library/Workbench/    │
│  │         AuxPanel/ChatPanel/CodeEditor/Resizer/Notes/Scratch/         │
│  │         MarkdownEditor（三模式 + WYSIWYG + 导出 Word）                 │
│  └─ store: projects.ts + workspace.ts（zustand，含大量 UI 状态）          │
└──────────────────────────────────────────────────────────────────────────┘
        ▲ HTTP fetch（渲染进程直接调 11455，CSP 已放行）                   
        │ IPC（目录选择/窗口控制/托盘事件/悬浮窗转发/权限决策/自动更新）     
        └─ spawn claude.cmd（cwd=项目沙盒，stdin=prompt）                  
```

### 数据流要点

- **渲染进程 → 后端**：直接 `fetch('http://127.0.0.1:11455/api/...')`（CORS 白名单 11454 + file://）
- **聊天**：`POST /api/sessions/:id/chat` → SSE 流（event: text / tool_use / done / error），客户端 AbortController 中断；停止时同时调 `POST /api/sessions/:id/stop`（后端主动终止，见 §12 会话状态机）
- **CLI 调用**：`spawn(claude.cmd, [...args, '-p'], { cwd: 沙盒, stdio: ['pipe','pipe','pipe'] })`，**prompt 写入 stdin**（见 §6 坑 #2）
- **文件**：项目沙盒 = 用户选择的文件夹；所有文件接口按 projectId 解析路径（`resolveInSandbox` 防逃逸）
- **权限确认链路**：CLI 执行 Bash → 沙盒 `.claude/settings.json` 的 PreToolUse hook → `scripts/perm-hook.js` POST 11455 → permissionBus（server↔main 同进程 EventEmitter）→ 窗口广播 → 桌面弹窗 → 决策回写 → hook 返回 `permissionDecision`（详见 §6 坑 #10k）
- **设置体系**：系统设置（强类型 AppSettings）/ API 设置（Provider 多配置）/ Skill 设置 / 个性化设置（schema 注册中心），左下角 ⚙ 菜单四项入口

---

## 4. 数据库 Schema（SQLite，node:sqlite 同步 API）

所有表见 `src/server/db.ts` 的 `migrate()`；**列变更**用 `PRAGMA table_info` 检查后 `ALTER TABLE`。

| 表 | 关键列 | 说明 |
|---|---|---|
| projects | id, name, type, description, main_prompt, **sandbox_path**, status | 沙盒路径=用户选的项目文件夹 |
| tasks | id, project_id, name, type, prompt, **skill**, status, position | type ∈ 6 种任务类型；skill=自定义技能覆盖 |
| sessions | id, project_id, **task_id(可空=全局会话)**, claude_session_id, engine(cli/api), title, status, **cost** | cost 从 CLI result 事件累计 |
| messages | id, session_id, role, content, **tool_uses(JSON)** | toolUses 解析自 assistant 事件 |
| libraries | id, project_id(可空=全局), name, path, description | 笔记库（本地目录） |
| literature | id, **project_id(可空=全局)**, title, authors(JSON), year, venue, doi, url, abstract, notes | 文献库 |
| scratch_notes | id, content, summary, **project_id(可空=全局)**, created_at | 随记；**0.8 迁移新增 project_id**（项目随记） |
| settings | key, value(JSON) | 所有设置（见 settings.ts DEFAULTS + 扩展键） |

**settings 表扩展键**（除 AppSettings 外）：
- `apiProviders` / `activeApiProviderId`：API Provider 多配置（类 cc-switch）
- `apiSkills`：API 引擎技能注入启用列表（string[]）
- `cliTrustedMode`：CLI 完全信任模式（boolean，危险开关）
- 个性化字段（schema 驱动，见 personalization.ts）：theme/accent/customAccent/appBackground/wallpaperOpacity/bgColor/cardBgColor/sideBgColor/borderColor/textColor/editorFontFamily/editorFontSize/editorLineHeight/editorWordWrap/editorTheme/sidebarTone/username/recKeywords/recCategories/rssFeeds

**数据位置**：开发 = 项目根 `data/`（main/index.ts 设置 `OAP_DATA_DIR`）；生产 = `app.getPath('userData')/oap`。
- `data/ars/`：内置 ARS 学术技能 + ppt-slides（easyslides）+ ars-meta.json
- `data/personalization/*.json`：第三方个性化字段（schema 注册）
- 沙盒 `_oap_preview/`：Office 高保真转换的 PDF 缓存（**不能用点开头目录**，见坑 #10e）

---

## 5. 任务系统（6 类型 + 表单 Schema）

定义在 `src/server/project-templates.ts`：

| type | kind | 表单字段（formSchema） | 技能映射 |
|---|---|---|---|
| research-consult | chat | 无（直接对话） | academic-paper/plan |
| writing-prep | form | goal*/materials/structure/constraints | academic-paper/plan |
| paper-writing | form | goal*/materials/structure/journal/constraints | academic-paper/outline |
| paper-review | form | paperText*/journal/focus(select)/constraints | academic-paper-reviewer/full |
| paper-revision | form | paperText*/reviewerComments*/focus(select)/constraints | academic-paper/revision-coach |
| presentation-slide | form | topic*/materials/structure/style(select)/constraints | ppt-slides（easyslides） |

**项目类型（6 种）**：paper-research / data-analysis / paper-check / group-meeting / research-report / **presentation（演示与汇报，0.8 新增）**。
`presentation` 默认任务：演示方案咨询 + 演示文稿制作 + 汇报讲稿撰写。

**执行链**：TaskFormView → 组装 prompt → **ARS 技能注入**（`ars-skills.ts`：TYPE_SKILLS 映射 → 找 SKILL.md → 写沙盒 `CLAUDE.local.md`）→ 复用任务最近空闲会话 → SSE 流式。
演示文稿任务额外把**项目状态**（任务清单 + 文献）附入注入文本（chat.ts 内联组装，让 AI 基于项目上下文生成）。

**技能查找优先级**（`findSkillFile`）：内置 `DATA_ROOT/ars/<skill>/SKILL.md` → 插件缓存 → marketplace。热插拔：每次注入实时扫描。

---

## 6. 踩过的坑（必读！接手后别再踩）

1. **npm 11 改写下划线配置**：`.npmrc` 的 `electron_mirror` 会被转成 `electron-mirror` → postinstall 钩子 `scripts/ensure-electron-binary.mjs` 显式设 `ELECTRON_MIRROR`。**不要删这个钩子**。
2. **cmd.exe 参数破坏**：prompt 里的 `| < > "` 经 spawn args 会被 cmd 解释截断 → **prompt 一律走 stdin**（`-p` 无参数 + `child.stdin.write`）。cliSpawnPrompt/spawnCli 均已处理。
3. **CLI stream-json 需要 `--verbose`**：`-p` + `--output-format stream-json` 不加 `--verbose` 退出码 1。
4. **CLI 2.1.x 事件模型**：无逐 token delta；每回合输出完整 `assistant` 事件（content 数组含 thinking/text/tool_use）。解析按 content 块类型提取（cli-engine.ts 兼容新旧两种格式）。
5. **`--effort-level` 参数不存在**：思考强度用环境变量 `CLAUDE_CODE_EFFORT_LEVEL`。
6. **`--session-id` 必须 UUID**；续接用 `--resume <claudeSessionId>`。
7. **Node 22+ 的 `req.on('close')`**：请求体读完即触发 → SSE 中断检测用 `res.on('close') + !res.writableEnded`。
8. **Electron 新版禁用 `window.prompt/confirm`**：交互用内联输入框/自定义模态。`window.confirm` 仍可用但不要新增 prompt。
9. **CSP**：`index.html` 的 CSP 必须含 `connect-src` 11454/11455、`frame-src` 11455 + `about: blob:`（webview/srcdoc 预览）、`img-src` data: + 11455。新增跨源资源记得同步。
10. **Windows 文件锁**：cc-switch 的 DB 被占用 → 读取时**复制到临时文件**再打开（ccswitch.ts）。
10b. **版本号别用 `process.env.npm_package_version`**：只有 `npm run` 启动才有 → 用主进程 `app.getVersion()`（IPC `app:getVersion`）。
10c. **Node 全局 fetch 不走系统代理**：更新检查等用 `net.fetch`（走系统代理）+ 镜像回退（jsDelivr）。
10d. **`-webkit-app-region: drag` 区域内控件不可点击**：交互元素必须显式 `no-drag`（悬浮窗头部下拉曾失效）。
10e. **Express `sendFile` 拒绝点开头隐藏目录**（`.oap-preview` → 404）：Office 转换输出用 `_oap_preview`。
10f. **pptx 高保真渲染三级**：系统 PowerPoint COM（PowerShell `SaveAs(path, 32)`；`ExportAsFixedFormat` 枚举参数在 PS 会失败）→ 系统 LibreOffice（`soffice --headless -env:UserInstallation=<OAP专属profile>`）→ 版面自研渲染（SlideCanvas）。曾尝试捆绑 LibreOffice（1.6GB）后按用户要求移除。
10g. **pdf-parse v2 是 `PDFParse` 类**：`new PDFParse({data}).getText()`，不是默认导出函数。
10h. **Electron 类型无 Windows `vibrancy: 'acrylic'`**：需 `'acrylic' as never`；透明窗口在部分系统渲染失败 → 汇报助手最终用**暗色渐变 + 面板半透明**方案（不依赖系统亚克力）。
10i. **汇报助手置顶**：`setAlwaysOnTop(true, 'screen-saver')`（最高级别，可盖过全屏）+ `setVisibleOnAllWorkspaces({visibleOnFullScreen:true})`。
10j. **electron-builder 图标**：`win.icon` 指向 `resources/icon.ico`（PIL 多尺寸生成）；png 转换报 `WebAssembly.Memory` 错误。图标源 ≤512×512。换图标：改 `inputResoureces/icon.png` → 512 → 生成 ico + 同步 `assets/app-icon.png`。
10k. **CLI 权限确认——交互协议不可用，用 PreToolUse Hook**：`--input-format stream-json` 只支持 `--print`（2.1.x），无交互确认 → 会话前写沙盒 `.claude/settings.json` 的 `hooks.PreToolUse(Bash)` 指向 `scripts/perm-hook.js` → POST 11455 → 弹窗 → 返回 `permissionDecision`。**「总是允许」**持久化到沙盒白名单。hook 异常默认 deny（安全优先）。
10l. **CLI 进程残留**：Windows 下 `child.kill()` 只杀 cmd 包装，CLI 子进程残留 → close 不触发 → 会话卡 running → **abort 时 `taskkill /pid <pid> /t /f` 杀进程树 + 5s 兜底强制落定**。
10m. **会话状态机收敛**（chat.ts）：`finish()` 必须幂等（finished 标志）；`run()` 必须 `.catch()` 兜底；断连立即 `setTimeout(finish('idle'),0)`（TDZ 规避）；10 分钟硬超时。任何路径都必须让 status 收敛，否则 409 卡死。
10n. **自绘下拉**：原生 select 在 Windows 无背景样式不可控 → CustomSelect（按钮+弹出列表，见 PresentAssistPage）。类似弹层都要实色背景（`background-color`）防透明。
10o. **TS7 TDZ**：`const` 定义前的回调引用报错——signal/abort 处理要放在 Promise executor 内 finish 定义之后。
10p. **`run()` 无 catch 的 unhandled rejection**：异步路由入口必须 `.catch()`，否则状态/响应不收敛。
10q. **easyslides 仓库 1.4 万文件/41MB**：zip 全量下载在慢网络下超时 → trees API 过滤核心目录（根+references+scripts+skills+projects）并发 6 路下载；templates 按需 `includeTemplates`。

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
- 权限 hook 调试：直接 POST `http://127.0.0.1:11455/api/cli-permission/request`（会弹窗，10s 内决策可测链路）

**测试模式**：所有 API 均可用 curl/Node fetch 直接测（CORS 只拦浏览器）。

**环境/数据清理**：设置 → 缓存与存储 →「清除缓存」（Chromium 缓存 + 各沙盒 `_oap_preview`）。

---

## 8. 发布流程

1. `package.json` 改 version
2. 更新 README（中英文版）+ HANDOFF
3. `git commit -m "release vX.Y.Z"` + `git push origin main`（注意远程可能被改，rebase 时保留本地 HANDOFF）
4. `npm run dist` → `release/open_Academic_Pipeline_v_X.Y.Z_beta_x64.exe`
5. GitHub → Releases → 新建 tag `vX.Y.Z-beta` → 拖拽 exe **+ latest.yml + blockmap** 上传（electron-updater 增量更新依赖）
6. 更新 `oap.xml` 的 main/sub/dev + updateSite/updatePack/updateInfo（应用内"检查更新"读取）

**发布记录**：v0.7.4（2026-08-14）已推送；0.8.x 开发中。
**打包注意**：`win.icon` 用 `resources/icon.ico`（坑 #10j）；提交前确认 `release/` 未被跟踪（gitignore 时序坑——曾误提交 121MB 安装包，git rm --cached 修复）。

---

## 9. 已知问题 / TODO

- [ ] 打包后全链路回归（0.8.x 新功能：权限弹窗/webview/汇报助手/API 设置/ARS 内置 需安装版验证）
- [ ] `window.confirm` 在部分 Electron 版本被弃用——建议逐步替换为应用内确认模态
- [ ] 会话列表大数据量无虚拟滚动
- [ ] 工作台选项卡不支持拖拽排序
- [ ] 文献编辑（PUT）接口存在但 UI 未接编辑入口
- [ ] API 引擎无工具调用（纯文本，无法操作沙盒文件）
- [ ] 悬浮窗/汇报助手历史存 localStorage（各窗口独立），未做跨窗口同步
- [ ] 汇报助手自绘下拉组件可抽成通用组件
- [ ] `DEP0190 shell option true` 警告偶现（排查 spawn shell 来源）
- [ ] 权限 hook 弹窗：AI 多窗口同时请求时弹多个（应做合并/去重）
- [ ] 演讲者视图（audience 窗口）代码保留但入口已弃用（汇报助手取代）

---

## 10. 资源与图标

| 文件 | 用途 |
|---|---|
| `inputResoureces/icon.png` | 应用图标源图（≤512×512） |
| `resources/icon.png` | 512 副本（渲染头像/悬浮窗图标） |
| `resources/icon.ico` | **打包用图标**（PIL 多尺寸生成，见坑 #10j） |
| `inputResoureces/grayBack.png` | 侧栏背景花纹 + 标题栏 logo |
| `inputResoureces/banner.png` / `banner0_7_4.png` | 发布横幅 |
| `inputResoureces/README_EN.md` | 英文版 README |
| `scripts/perm-hook.js` | **CLI 权限确认 hook**（沙盒 settings.json 引用） |

更换图标：改 `inputResoureces/icon.png` → 缩到 512 → 覆盖 `resources/icon.png` + `assets/app-icon.png` → PIL 生成 `resources/icon.ico`（256/128/64/48/32/16）。

---

## 11. 关键文件索引（快速定位）

| 需求 | 位置 |
|---|---|
| 窗口/托盘/悬浮窗/IPC/权限桥/自动更新 | `src/main/index.ts` |
| preload API 面 | `src/preload/index.ts` + `index.d.ts` |
| 后端入口/路由挂载 | `src/server/index.ts` |
| DB schema/迁移 | `src/server/db.ts` |
| 系统设置（默认值/存取/Provider） | `src/server/settings.ts` + `routes/settings.ts` |
| 个性化设置注册中心（schema 驱动） | `src/server/personalization.ts` + `routes/personalization.ts` |
| API Provider 管理（模板/测速/导入导出/工具检测） | `src/server/routes/api-providers.ts` |
| ARS 内置（安装/更新/部署/PPT 技能/权限端点） | `src/server/routes/ars.ts` |
| CLI 引擎（spawn/解析/权限总线） | `src/server/claude/cli-engine.ts` |
| API 引擎（双格式/Provider/技能注入） | `src/server/claude/api-engine.ts` |
| 聊天路由（SSE/注入/会话状态机/stop 端点） | `src/server/routes/chat.ts` |
| ARS 技能映射/注入 | `src/server/ars-skills.ts` |
| 任务/项目类型模板 | `src/server/project-templates.ts` |
| Office 预览/高保真（mammoth/SheetJS/COM/LibreOffice） | `src/server/routes/office.ts` |
| 汇报助手文件提取/项目状态 | `src/server/routes/present-assist.ts` |
| 文献解析 | `src/server/literature-parser.ts` |
| 推荐（arXiv/RSS） | `src/server/routes/recommendations.ts` |
| 环境检测（注册表/conda/uv） | `src/server/routes/envs.ts` |
| 技能管理（市场/安装/部署/API 注入） | `src/server/routes/skills.ts` |
| 随记（项目/全局） | `src/server/routes/scratch.ts` |
| 布局框架 + 全局弹窗（更新/权限/关于） | `src/renderer/src/components/Layout.tsx` |
| 工作台（选项卡/面板/右键） | `src/renderer/src/components/workspace/Workbench.tsx` |
| 资源管理器（树/右键/重命名） | `src/renderer/src/components/workspace/ExplorerView.tsx` |
| 副侧栏（分组会话+内嵌对话） | `src/renderer/src/components/workspace/AuxPanel.tsx` |
| 会话列表 | `src/renderer/src/components/workspace/SessionsView.tsx` |
| 会话面板（工作台） | `src/renderer/src/components/workspace/ChatPanel.tsx` |
| 独立会话页 | `src/renderer/src/pages/SessionPage.tsx` |
| Markdown 编辑器（三模式/WYSIWYG/导出 Word） | `src/renderer/src/components/workspace/MarkdownEditor.tsx` |
| 编辑器（CodeMirror 封装/主题） | `src/renderer/src/components/workspace/CodeEditor.tsx` |
| 汇报助手（纯对话悬浮窗） | `src/renderer/src/pages/PresentAssistPage.tsx` |
| 临时对话悬浮窗 | `src/renderer/src/pages/FloatingChatPage.tsx` |
| 权限确认弹窗 | `src/renderer/src/components/PermissionModal.tsx` |
| 更新弹窗（三态/增量） | `src/renderer/src/components/UpdateModal.tsx` |
| API 设置页 | `src/renderer/src/pages/ApiSettingsPage.tsx` |
| Skill 设置页（网格/市场/ARS 管理） | `src/renderer/src/pages/SkillSettingsPage.tsx` |
| 个性化设置页 | `src/renderer/src/pages/PersonalSettingsPage.tsx` + `components/settings/PersonalizationForm.tsx` |
| 技能市场模态 | `src/renderer/src/components/settings/SkillMarketModal.tsx` |
| 帮助文档页/内容 | `src/renderer/src/pages/HelpPage.tsx` + `lib/help-content.ts` |
| 版面渲染（pptx 轻量放映） | `src/renderer/src/components/present/SlideCanvas.tsx` |
| 工作区状态（tabs/草稿/主题/编辑器偏好） | `src/renderer/src/store/workspace.ts` |
| 个性化应用（颜色/背景图/壁纸） | `src/renderer/src/lib/personalize.ts` |
| 文件类型图标 | `src/renderer/src/components/FileTypeIcon.tsx` + `Icon.tsx`（53+ 图标） |
| 共享类型 | `src/shared/types.ts` |
| 设计系统（主题变量/Fluent 圆角） | `src/renderer/src/assets/main.css` + `App.css` |

---

## 12. 会话状态机（0.8 重构，重要）

**目标**：任何路径（正常/错误/中断/超时/断连）都必须让 session.status 收敛到 idle/error，绝不卡 running。

**后端（chat.ts）**：
- 请求入口：status=running → 409；通过 → 落库 user 消息 + `runningSessions.set(id, abort)` 注册
- `finish(status, extra)`：**幂等**（`finished` 标志 + `clearTimeout(hardTimeout)` + 注册表删除）；完成落库 + 任务翻转 + autoTitle
- 收敛路径：
  1. 正常完成 → sseSend done → finish('idle')
  2. 引擎错误 → onError → finish('error')
  3. 客户端断连 → `res.on('close')` → abort + `setTimeout(finish('idle'),0)`（TDZ）
  4. 手动停止 → `POST /api/sessions/:id/stop` → abort 注册表控制器 + **立即**复位 idle（不依赖断连）
  5. 硬超时 10 分钟 → abort + finish('error')
  6. run() 内未捕获异常 → `.catch()` 兜底 → onError
- **CLI 中断**：cli-engine abort 时 `taskkill /T /F` 杀进程树 + 5s 兜底强制 settle

**前端**：
- 停止按钮 = `abortRef.abort()` + `api.stopSession(id)` **双保险** + 立即复位 sending/streaming + reload
- 发送前检查 `session.status === 'running'` → 自动先 stop（不再 409 卡死）
- sending 3 分钟无响应自动复位（保险）
- 会话列表：sessionsVersion 依赖 + 10s 轮询（状态实时同步）

**权限确认（PreToolUse Hook 链路）**：
```
CLI 执行 Bash → 沙盒 .claude/settings.json hooks.PreToolUse(Bash)
  → node scripts/perm-hook.js（CLI 子进程，stdin 收 hook JSON）
  → POST /api/cli-permission/request（11455，60s 超时自动 deny）
  → permissionBus（EventEmitter，server↔main 同进程）
  → main 广播所有窗口 → PermissionModal 弹窗（允许/拒绝/总是允许）
  → 决策 IPC → bus → 端点响应 → hook 输出 permissionDecision → CLI 继续/跳过
「总是允许」→ 写入该沙盒 .claude/settings.json 白名单 + 内存规则（下次直接放行不弹窗）
「完全信任模式」（设置→沙盒环境）→ CLI 加 --dangerously-skip-permissions，跳过 hook
```

**API Provider（类 cc-switch）**：
- settings 表 `apiProviders`（多配置：name/type(anthropic|openai)/baseUrl/apiKey/model/note）+ `activeApiProviderId`
- api-engine：active provider 优先（OpenAI 兼容 `/chat/completions` + Bearer 或 Anthropic `/v1/messages`）；无 provider 回退全局 apiKey/baseUrl（API 设置页"保底直连"）
- 模板 12 家一键导入（DeepSeek/Kimi/通义/智谱/OpenAI/Claude/MiniMax/阶跃/硅基流动/豆包/零一/…）
- 从 cc-switch 导入（`~/.cc-switch/cc-switch.db` 临时复制读库）；导出/导入 JSON；测速（最小请求）
- 工具检测：6 agent（claude/codex/gemini/opencode/cline/deepseek）三级检测（where → 配置目录 → 常见路径）

**ARS 内置化**：
- 存储 `DATA_ROOT/ars/`（含 ars-meta.json：版本/来源/技能清单）
- 安装：插件缓存复制（离线）→ marketplace git remote 探测 → GitHub trees+raw
- 更新：版本对比 + 旧版 `.bak-<ts>` 备份
- 部署：复制到检测到的 agent 技能目录（`~/.<agent>/skills/ars`）
- PPT 技能：easyslides 安装到 `DATA_ROOT/ars/ppt-slides/`（核心目录并发下载，templates 按需）
- 任务注入：`findSkillFile` 优先内置目录（热插拔，实时扫描）

---

## 13. 给接手者的建议

1. **先跑通 dev 再改代码**：`npm run dev` + 创建测试项目走一遍全流程（创建→任务→会话→文件→知识库→汇报助手）
2. **改后端必须重启**（动态 import 但无热重载）；改渲染进程 Vite HMR 自动生效
3. **所有新 API**：先在 `server/index.ts` 挂载 → `lib/api.ts` 封装 → 页面调用；类型放 `shared/types.ts`
4. **所有 spawn CLI 的调用**：遵守 §6 坑 #2（stdin）与 #3（--verbose）
5. **Windows 特殊字符**（`| < > "`）在 prompt/文件名中常见——传递路径与文本都要考虑转义与编码（UTF-8 全链路）
6. **会话状态机**：新增引擎/路由路径时，必须保证 finish 收敛（§12）
7. **权限确认**：新增需要弹窗的命令类别时，扩展 perm-hook 与端点即可；「总是允许」走白名单持久化
8. 提交信息用中文 + `Co-Authored-By: Claude <noreply@anthropic.com>`

---

**Happy hacking!** 🎓
