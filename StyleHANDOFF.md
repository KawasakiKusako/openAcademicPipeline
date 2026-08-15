# StyleHANDOFF 文档 — OAP 样式体系（0.8.1 起）

> 面向接手样式/外观开发的开发者（人或 AI）。主架构/坑/流程见 HANDOFF.md。
> 最后更新：2026-08-15 · 版本 v0.8.1

---

## 1. 样式架构

```
src/renderer/src/assets/main.css   ← 设计令牌（CSS 变量）：双主题变量 + accent 变体 + 基础元素（约 190 行）
src/renderer/src/assets/App.css    ← 组件/页面样式（约 5900 行，32 个 section，全部消费 main.css 变量）
构建产物：Vite 合并为 out/renderer/assets/index-<hash>.css（单文件，link 引入）
运行时叠加层（由内到外，后者覆盖前者）：
  1. 打包 CSS（link）
  2. data-theme / data-accent / data-sidebar-tone 属性选择器（Layout.tsx + personalize.ts）
  3. 个性化颜色覆盖（personalize.ts setProperty 到 documentElement）
  4. 自定义 CSS（<style id="oap-custom-css"> append 到 head 末尾 —— 最高优先级）
```

### 设计 token 清单（main.css）

| 组 | 变量 | 说明 |
|---|---|---|
| 面 | `--bg` / `--bg-card` / `--bg-side` / `--bg-hover` / `--bg-input` / `--bg-active` | 底色族（dark: #1e1e1e 系） |
| 线 | `--border` / `--border-strong` | 边框 |
| 文字 | `--fg` / `--fg-dim` / `--fg-faint` | 主/次/微 |
| 强调 | `--accent` / `--accent-2` / `--accent-soft` / `--accent-grad` / `--on-accent` | 主题色族 |
| 状态 | `--success` / `--warn` / `--danger`（+ `-soft`） | 状态色 |
| 度量 | `--radius` / `--radius-sm` / `--radius-lg` / `--sidebar-w` / `--activity-w` / `--ui-scale` | 形状与缩放 |

- 主题切换：`document.documentElement.dataset['theme'] = 'dark'|'light'`
- accent 变体：`data-accent = 'blue'|'green'|'purple'|'orange'|'custom'`（custom 读 `--custom-accent`）
- 壁纸：`--app-bg-image` + `body.has-bg` + `--wallpaper-opacity`（0.15/0.35/0.55）

## 2. 个性化设置注册中心

- schema 驱动：`src/server/personalization.ts` 注册字段 → 表单自动渲染（`PersonalizationForm.tsx`）
- 值落 settings 表（JSON）；应用映射在 `src/renderer/src/lib/personalize.ts`
- 第三方字段：`<DATA_ROOT>/personalization/*.json`（`{"fields":[{key,label,type,group,defaultValue,...}]}`），POST `/api/settings/personalization/reload` 热加载（**删除文件会同步移除字段**）
- 0.8.1 新增内置字段：7 个衍生色（bgHoverColor/bgActiveColor/bgInputColor/fgDimColor/fgFaintColor/borderStrongColor/accentSoftColor，空=跟随主题）、radiusMode(rounded|sharp)、uiScale(0.9|1.0|1.1 → CSS zoom)、winOpacity(100|95|90|85 → IPC setOpacity)、editorTheme 新增 4 主题、editorCursor(line|block|underline)、editorIndentGuides
- 0.9.2 调整：**color 类型支持 #RRGGBBAA（8 位含透明度）**；wallpaperOpacity 改 0~100 数字滑块；新增 wallpaperFit(cover|contain|stretch)、bgBlur(0~50px 磨砂模糊)、winMaterial(none|acrylic|mica，Win11 系统材质)；number 字段在定义 min/max 时自动渲染为滑块+数值
- **editorTheme 枚举在两处维护**：server personalization.ts options 与 CodeEditor.tsx switch 必须配对

## 3. 自定义 CSS 接口

- 文件：`<DATA_ROOT>/custom-style/style.css`（首次保存自动生成带注释模板）
- 开关：settings 表 `customCssEnabled`
- 注入：渲染端 fetch `/api/style/css` 文本 → `<style id="oap-custom-css">` append head 末尾
- **CSP 要点**：index.html 的 `style-src 'self' 'unsafe-inline'` **不允许** `<link href="http://127.0.0.1:11455/...">`，只允许内联 `<style>` —— 自定义 CSS 必须走 fetch + textContent 注入
- 管理入口：个性化设置页「自定义样式」区块（开关/编辑/打开文件/重新加载/恢复默认/备份/导出）
- 变更感知：Layout 15s 轮询 style/status 的 mtime，变化才重注入

## 4. 默认样式备份与恢复

- 启动时（`initStyleModule`）版本变化自动备份到 `<DATA_ROOT>/style-backup/default-<版本>.css`（settings 表 `styleBackupVersion` 记录）
- 备份内容：打包版读 `app.asar/out/renderer/assets/*.css`（asar 补丁可读）；dev 版读源码 `src/renderer/src/assets/main.css + App.css`（**out/renderer 可能是陈旧 build 产物，不可信**）
- 恢复默认 = 清空自定义样式为模板（内置样式始终在 bundle 里，无需从备份恢复）

## 5. 导出 tar 格式

`POST /api/style/export` → `<DATA_ROOT>/exports/style-export-<ts>.tar`（staging 目录打包后删除）：

```
style.css                自定义样式（导入：粘贴到自定义样式编辑框保存）
default-<版本>.css       最近一份默认样式备份（参考用）
personalization.json     个性化设置值（导入：个性化设置 → 导入设置…）
README.txt               说明与恢复指引
```

依赖：`tar@^7.5.22`（dependencies，externalizeDeps 下运行时 require 自动进 asar）

## 6. oap-style.js —— AI 全局对话改样式

- 部署：`scripts/oap-style.js` 是唯一源码，构建期 `?raw` 内嵌 → 运行时写 `<DATA_ROOT>/oap-style.js`（ensureStyleScript，与 perm-hook 同构）
- 用法：
  ```bash
  node "<DATA_ROOT>/oap-style.js" --list            # 字段表
  node "<DATA_ROOT>/oap-style.js" theme=light bgColor=#222831 radiusMode=sharp
  node "<DATA_ROOT>/oap-style.js" --reset           # 恢复默认
  ```
- 注入：**仅全局会话**（`!session.taskId`）写入沙盒 `CLAUDE.local.md` 的「个性化设置工具」段落（chat.ts buildStyleToolBlock，进程内缓存）
- 安全：key 白名单校验（脚本侧 + 注入文案双保险）；执行走 PreToolUse hook 弹窗确认
- 生效：脚本 PUT `/api/settings/personalization` → Layout 15s 轮询 diff → applyPersonalization
- 限制：API 引擎会话不注入（v1）

## 7. 图标体系（Fluent System Icons）

- `src/renderer/src/components/Icon.tsx`：51 个图标，Fluent 24px regular fill 风格（`fill="currentColor"`、无 stroke）；props `{size=16, className}`
- **生成脚本**：`node scripts/fetch-fluent-icons.mjs`（拉微软 MIT 官方仓库 fluentui-system-icons 的 SVG 重新生成整个文件，**会整体覆盖，勿手工改 path**）
- 特殊映射：IconTask→Task List Square LTR（与 IconCheck=CheckmarkCircle 区分）；IconPanel→Panel Bottom 20px；IconType→Text 16px（个别图标无 24px 尺寸，viewBox 按源文件保留）
- FileTypeIcon（文件类型彩色图标）是独立体系，未替换
- 新增图标：改 fetch 脚本 MAPPING 表 → 重跑 → typecheck

## 8. 已知坑

1. **Windows 最大化窗口 setOpacity 无效**（Electron 已知行为）——透明度设置窗口化时生效
1b. **winMaterial（acrylic/mica）需要透明窗口**：IPC 侧 setBackgroundColor('#00000000') + setBackgroundMaterial；渲染端 `body[data-material]` 半透明 .app-frame；仅 Win11 生效，否则退化为半透明
2. **App.css 194 处 px 硬编码字号、0 处 rem** —— UI 缩放用 CSS `zoom`（`.app-frame { zoom: var(--ui-scale) }`），不要尝试改 html font-size
3. **accentSoftColor 等衍生色是 hex 覆盖 rgba 软色**，会丢透明度（建议选深色调）
4. **dev 备份读源码、打包读 asar**，用 `app.isPackaged` 分流（out/renderer 在 dev 可能是陈旧产物）
5. editorTheme 枚举双处维护（server options + CodeEditor switch）
6. 个性化第三方 registry 只增不删已修复（fileFieldKeys 追踪归属）；内置字段不参与
7. 自定义 CSS 从后端加载必须 fetch + `<style>` 注入，`<link>` 会被 CSP 拦
8. 图标默认 16px 对 Fluent 24 网格偏小——活动栏 19px 是显式传参不受影响；如需整体调大改 base 默认值会波及全部消费者

---

**Happy styling!** 🎨
