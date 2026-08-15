import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DATA_ROOT } from './paths'
import { getSetting, setSetting } from './settings'
import type { PersonalizationField } from '../shared/types'

// ===== 个性化设置注册中心 =====
// 个性化设置是 schema 驱动的通用设置：字段声明在 registry 中，
// 渲染端按 schema 自动生成表单，读写走通用 API，新增设置无需改页面。
// 注册途径：
//   1. 代码注册：registerPersonalizationField()
//   2. 第三方 JSON 文件：<DATA_ROOT>/personalization/*.json（支持单字段或 {fields:[...]}）
//      文件格式示例见本文件末尾注释。放置后调用 POST /api/settings/personalization/reload
//      即可热加载（应用启动时也会自动扫描）。

const registry = new Map<string, PersonalizationField>()
// 第三方 schema 文件 → 该文件注册的字段 key 集合。
// 用于 reload 时移除已删除文件注册的字段（内置字段不在此记录中，不受影响）。
const fileFieldKeys = new Map<string, Set<string>>()

export function registerPersonalizationField(field: PersonalizationField): void {
  if (!field.key || !field.label || !field.type || !field.group) {
    throw new Error(`[personalization] 字段定义不完整: ${JSON.stringify(field)}`)
  }
  registry.set(field.key, field)
}

export function getPersonalizationFields(): PersonalizationField[] {
  return [...registry.values()]
}

export function getPersonalizationField(key: string): PersonalizationField | undefined {
  return registry.get(key)
}

// 按类型归一化第三方传入的值；非法值回退到 defaultValue（杜绝脏数据落库）
function normalizeValue(field: PersonalizationField, raw: unknown): unknown {
  switch (field.type) {
    case 'boolean':
      return !!raw
    case 'number': {
      const n = Number(raw)
      if (Number.isNaN(n)) return field.defaultValue
      if (typeof field.min === 'number' && n < field.min) return field.min
      if (typeof field.max === 'number' && n > field.max) return field.max
      return n
    }
    case 'select': {
      if (typeof raw === 'string' && field.options?.some((o) => o.value === raw)) return raw
      return field.defaultValue
    }
    case 'color': {
      // 空字符串 = 跟随主题（自定义颜色可随时清除还原）
      // 支持 #RRGGBB 与 #RRGGBBAA（8 位含透明度）
      if (raw === '') return ''
      if (typeof raw === 'string' && /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(raw)) return raw
      return field.defaultValue
    }
    case 'image': {
      // data URI（data:image/...;base64,...）或空字符串
      if (typeof raw === 'string' && (raw === '' || raw.startsWith('data:image/'))) return raw
      return field.defaultValue
    }
    case 'tags': {
      const list = Array.isArray(raw)
        ? raw.map((x) => String(x))
        : String(raw ?? '').split(/[,，\r\n]/)
      return list.map((s) => s.trim()).filter(Boolean)
    }
    default:
      // text / textarea
      return typeof raw === 'string' ? raw : field.defaultValue
  }
}

// 旧值迁移映射：字段类型演进时把历史存储值换算为新语义（如 wallpaperOpacity select→number）
const LEGACY_VALUE_MAP: Record<string, (raw: unknown) => unknown> = {
  wallpaperOpacity: (raw) => {
    if (typeof raw === 'number') return raw
    if (raw === 'light') return 15
    if (raw === 'strong') return 55
    return 35 // 'medium' 或非法值
  }
}

export function getPersonalizationValues(): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const f of registry.values()) {
    const raw = getSetting(f.key, f.defaultValue)
    const migrated = LEGACY_VALUE_MAP[f.key]?.(raw) ?? raw
    out[f.key] = normalizeValue(f, migrated)
  }
  return out
}

// 更新一批值（只接受已注册的 key），返回更新后的全量值
export function updatePersonalization(patch: Record<string, unknown>): Record<string, unknown> {
  for (const [key, raw] of Object.entries(patch)) {
    const field = registry.get(key)
    if (!field) continue
    setSetting(key, normalizeValue(field, raw))
  }
  return getPersonalizationValues()
}

// ---- 初始化 ----

export function initPersonalization(): void {
  registerBuiltinFields()
  loadPersonalizationSchemaFiles()
}

// ---- 内置个性化设置 ----

function registerBuiltinFields(): void {
  registerPersonalizationField({
    key: 'theme',
    label: '主题',
    type: 'select',
    group: '外观',
    defaultValue: 'dark',
    options: [
      { value: 'dark', label: '深色' },
      { value: 'light', label: '浅色' }
    ],
    description: '全局主题，即时生效'
  })
  registerPersonalizationField({
    key: 'accent',
    label: '强调色',
    type: 'select',
    group: '外观',
    defaultValue: 'blue',
    options: [
      { value: 'blue', label: '蓝色' },
      { value: 'green', label: '绿色' },
      { value: 'purple', label: '紫色' },
      { value: 'orange', label: '橙色' },
      { value: 'custom', label: '自定义…' }
    ],
    description: '界面强调色，即时生效'
  })
  registerPersonalizationField({
    key: 'customAccent',
    label: '自定义强调色',
    type: 'color',
    group: '外观',
    defaultValue: '#3794ff',
    showWhen: { key: 'accent', equals: 'custom' },
    description: '选择「自定义…」后生效'
  })
  registerPersonalizationField({
    key: 'bgHoverColor',
    label: '悬停背景色',
    type: 'color',
    group: '外观',
    defaultValue: '',
    description: '列表项/按钮悬停背景（清空=跟随主题）'
  })
  registerPersonalizationField({
    key: 'bgActiveColor',
    label: '激活背景色',
    type: 'color',
    group: '外观',
    defaultValue: '',
    description: '选中项/激活面板背景（清空=跟随主题）'
  })
  registerPersonalizationField({
    key: 'bgInputColor',
    label: '输入框背景色',
    type: 'color',
    group: '外观',
    defaultValue: '',
    description: '输入框/搜索框背景（清空=跟随主题）'
  })
  registerPersonalizationField({
    key: 'fgDimColor',
    label: '次级文字色',
    type: 'color',
    group: '外观',
    defaultValue: '',
    description: '次要说明文字（清空=跟随主题）'
  })
  registerPersonalizationField({
    key: 'fgFaintColor',
    label: '微弱文字色',
    type: 'color',
    group: '外观',
    defaultValue: '',
    description: '占位符/禁用文字（清空=跟随主题）'
  })
  registerPersonalizationField({
    key: 'borderStrongColor',
    label: '强边框色',
    type: 'color',
    group: '外观',
    defaultValue: '',
    description: '强调边框（清空=跟随主题）'
  })
  registerPersonalizationField({
    key: 'accentSoftColor',
    label: '强调浅色',
    type: 'color',
    group: '外观',
    defaultValue: '',
    description: '强调色的浅底（原为半透明色，选深色调 hex 观感更佳；清空=跟随主题）'
  })
  registerPersonalizationField({
    key: 'radiusMode',
    label: '圆角风格',
    type: 'select',
    group: '外观',
    defaultValue: 'rounded',
    options: [
      { value: 'rounded', label: '圆角（默认）' },
      { value: 'sharp', label: '直角' }
    ],
    description: '全局控件圆角风格，即时生效'
  })
  registerPersonalizationField({
    key: 'uiScale',
    label: '界面缩放',
    type: 'select',
    group: '外观',
    defaultValue: '1.0',
    options: [
      { value: '0.9', label: '紧凑 (90%)' },
      { value: '1.0', label: '标准 (100%)' },
      { value: '1.1', label: '宽松 (110%)' }
    ],
    description: '整体界面缩放（CSS zoom，即时生效）'
  })
  registerPersonalizationField({
    key: 'winOpacity',
    label: '窗口不透明度',
    type: 'number',
    group: '窗口',
    defaultValue: 100,
    min: 80,
    max: 100,
    step: 5,
    description: '主窗口不透明度 %（窗口最大化时系统可能忽略此设置）'
  })
  registerPersonalizationField({
    key: 'winMaterial',
    label: '窗口磨砂材质',
    type: 'select',
    group: '窗口',
    defaultValue: 'none',
    options: [
      { value: 'none', label: '无（默认）' },
      { value: 'acrylic', label: '亚克力（Windows 11）' },
      { value: 'mica', label: '云母（Windows 11）' }
    ],
    description: '窗口背景系统材质；仅 Windows 11 生效，不满足时退化为半透明'
  })
  registerPersonalizationField({
    key: 'wallpaperFit',
    label: '背景图适配',
    type: 'select',
    group: '外观',
    defaultValue: 'cover',
    options: [
      { value: 'cover', label: '填充裁剪（默认）' },
      { value: 'contain', label: '完整显示' },
      { value: 'stretch', label: '拉伸铺满' }
    ],
    description: '背景图如何铺满屏幕（完整显示不会裁剪，两侧留白）'
  })
  registerPersonalizationField({
    key: 'bgBlur',
    label: '背景图模糊',
    type: 'number',
    group: '外观',
    defaultValue: 0,
    min: 0,
    max: 50,
    step: 2,
    description: '背景图磨砂模糊半径（0=清晰，50=最强）'
  })
  registerPersonalizationField({
    key: 'username',
    label: '昵称',
    type: 'text',
    group: '用户信息',
    defaultValue: '研究员',
    placeholder: '研究员',
    description: '显示在项目总览页的问候语中'
  })
  registerPersonalizationField({
    key: 'editorFontFamily',
    label: '编辑器字体',
    type: 'select',
    group: '编辑器',
    defaultValue: 'ui-monospace',
    options: [
      { value: 'ui-monospace', label: '系统等宽（默认）' },
      { value: "'Cascadia Code', Consolas, monospace", label: 'Cascadia Code' },
      { value: 'Consolas, monospace', label: 'Consolas' },
      { value: "'JetBrains Mono', monospace", label: 'JetBrains Mono' },
      { value: "'Fira Code', monospace", label: 'Fira Code' },
      { value: "'Source Code Pro', monospace", label: 'Source Code Pro' }
    ],
    description: '代码编辑器 / Markdown 编辑器的等宽字体，即时生效'
  })
  registerPersonalizationField({
    key: 'editorFontSize',
    label: '编辑器字号',
    type: 'number',
    group: '编辑器',
    defaultValue: 13,
    min: 10,
    max: 24,
    step: 1,
    description: '代码编辑器字号（px），即时生效'
  })
  registerPersonalizationField({
    key: 'editorLineHeight',
    label: '编辑器行高',
    type: 'select',
    group: '编辑器',
    defaultValue: '1.7',
    options: [
      { value: '1.4', label: '紧凑 (1.4)' },
      { value: '1.6', label: '常规 (1.6)' },
      { value: '1.7', label: '舒适 (1.7)' },
      { value: '1.9', label: '宽松 (1.9)' },
      { value: '2.0', label: '很宽 (2.0)' }
    ],
    description: '代码行高，即时生效'
  })
  registerPersonalizationField({
    key: 'editorWordWrap',
    label: '自动换行',
    type: 'boolean',
    group: '编辑器',
    defaultValue: false,
    description: '代码编辑器长行自动换行（视图菜单也可切换）'
  })
  registerPersonalizationField({
    key: 'editorTheme',
    label: '代码高亮风格',
    type: 'select',
    group: '编辑器',
    defaultValue: 'follow',
    options: [
      { value: 'follow', label: '跟随主题（默认）' },
      { value: 'vscode-dark', label: 'VS Code 深色' },
      { value: 'vscode-light', label: 'VS Code 浅色' },
      { value: 'one-dark', label: 'One Dark' },
      { value: 'monokai', label: 'Monokai' },
      { value: 'solarized-dark', label: 'Solarized 深色' },
      { value: 'solarized-light', label: 'Solarized 浅色' },
      { value: 'github-dark', label: 'GitHub 深色' },
      { value: 'github-light', label: 'GitHub 浅色' }
    ],
    description: '代码编辑器的语法高亮配色，即时生效'
  })
  registerPersonalizationField({
    key: 'editorCursor',
    label: '光标样式',
    type: 'select',
    group: '编辑器',
    defaultValue: 'line',
    options: [
      { value: 'line', label: '竖线（默认）' },
      { value: 'block', label: '方块' },
      { value: 'underline', label: '下划线' }
    ],
    description: '代码编辑器光标外观，即时生效'
  })
  registerPersonalizationField({
    key: 'editorIndentGuides',
    label: '缩进参考线',
    type: 'boolean',
    group: '编辑器',
    defaultValue: false,
    description: '代码缩进层级显示参考线，即时生效'
  })
  registerPersonalizationField({
    key: 'appBackground',
    label: '应用背景图',
    type: 'image',
    group: '外观',
    defaultValue: '',
    description: '主窗口背景图片（建议暗色系，避免影响阅读）'
  })
  registerPersonalizationField({
    key: 'sidebarTone',
    label: '侧栏色调',
    type: 'select',
    group: '外观',
    defaultValue: 'auto',
    options: [
      { value: 'auto', label: '跟随主题' },
      { value: 'darker', label: '更深' },
      { value: 'lighter', label: '更浅' }
    ],
    description: '侧栏/活动栏的背景明暗，即时生效'
  })
  registerPersonalizationField({
    key: 'bgColor',
    label: '主背景色',
    type: 'color',
    group: '外观',
    defaultValue: '',
    description: '窗口主背景（留空跟随主题）'
  })
  registerPersonalizationField({
    key: 'cardBgColor',
    label: '卡片背景色',
    type: 'color',
    group: '外观',
    defaultValue: '',
    description: '卡片/面板背景（留空跟随主题）'
  })
  registerPersonalizationField({
    key: 'sideBgColor',
    label: '侧栏背景色',
    type: 'color',
    group: '外观',
    defaultValue: '',
    description: '侧栏/活动栏/标题栏背景（留空跟随主题）'
  })
  registerPersonalizationField({
    key: 'borderColor',
    label: '边框颜色',
    type: 'color',
    group: '外观',
    defaultValue: '',
    description: '全局边框与分割线（留空跟随主题）'
  })
  registerPersonalizationField({
    key: 'textColor',
    label: '文字颜色',
    type: 'color',
    group: '外观',
    defaultValue: '',
    description: '主文字颜色（留空跟随主题）'
  })
  registerPersonalizationField({
    key: 'wallpaperOpacity',
    label: '壁纸浓度',
    type: 'number',
    group: '外观',
    defaultValue: 35,
    min: 0,
    max: 100,
    step: 5,
    description: '设置背景图后的显示浓度（0~100%，滑块调整）'
  })
  registerPersonalizationField({
    key: 'recKeywords',
    label: '推荐关键词',
    type: 'tags',
    group: '内容偏好',
    defaultValue: [],
    tagsMode: 'comma',
    placeholder: 'remote sensing, vision transformer',
    description: '逗号分隔，优先于文献库自动提取'
  })
  registerPersonalizationField({
    key: 'recCategories',
    label: 'arXiv 分类',
    type: 'tags',
    group: '内容偏好',
    defaultValue: [],
    tagsMode: 'comma',
    placeholder: 'cs.CV, cs.LG',
    description: '逗号分隔，留空不限'
  })
  registerPersonalizationField({
    key: 'rssFeeds',
    label: 'RSS 订阅源',
    type: 'tags',
    group: '内容偏好',
    defaultValue: [],
    tagsMode: 'line',
    rows: 3,
    placeholder: 'https://example.com/feed.xml\nhttps://arxiv.org/rss/cs.CV',
    description: '每行一个 URL'
  })
}

// ---- 第三方 JSON 文件加载 ----
// 目录：<DATA_ROOT>/personalization/（开发时为项目根 data/personalization）
// 文件：*.json，内容为单个字段对象或 { fields: [...] }：
//   { "key": "myTool.option", "label": "选项", "type": "select", "group": "我的插件",
//     "defaultValue": "a", "options": [{"value":"a","label":"A"},{"value":"b","label":"B"}] }

export function loadPersonalizationSchemaFiles(): { count: number; removed: number } {
  const dir = join(DATA_ROOT, 'personalization')
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
    return { count: 0, removed: 0 }
  }
  // 1) 移除已消失的第三方文件注册的字段（修复"只增不删"）：
  //    内置字段不进 fileFieldKeys，不受影响。
  const present = new Set(readdirSync(dir).filter((f) => f.endsWith('.json')))
  let removed = 0
  for (const [file, keys] of fileFieldKeys) {
    if (!present.has(file)) {
      for (const key of keys) {
        registry.delete(key)
        removed++
      }
      fileFieldKeys.delete(file)
    }
  }
  // 2) 注册本次扫描到的字段（同名覆盖 + 重建归属记录）
  let count = 0
  for (const file of present) {
    try {
      const parsed = JSON.parse(readFileSync(join(dir, file), 'utf-8')) as
        | PersonalizationField
        | { fields: PersonalizationField[] }
      const list = Array.isArray((parsed as { fields?: PersonalizationField[] }).fields)
        ? (parsed as { fields: PersonalizationField[] }).fields
        : [parsed as PersonalizationField]
      const keys = new Set<string>()
      for (const field of list) {
        registerPersonalizationField(field)
        keys.add(field.key)
        count++
      }
      fileFieldKeys.set(file, keys)
    } catch (err) {
      console.warn(`[personalization] 跳过无效 schema 文件 ${file}:`, (err as Error)?.message ?? err)
    }
  }
  return { count, removed }
}
