import { useWorkspaceStore } from '../store/workspace'

// 把个性化设置的值应用到 workspace store 与全局样式
export function applyPersonalization(values: Record<string, unknown>): void {
  const s = useWorkspaceStore.getState()
  if (typeof values['theme'] === 'string') s.setTheme(values['theme'] as never)
  if (typeof values['accent'] === 'string') s.setAccent(values['accent'] as never)
  if (typeof values['customAccent'] === 'string') s.setCustomAccent(values['customAccent'] as never)
  if (typeof values['editorFontSize'] === 'number') s.setFontSize(values['editorFontSize'])
  if (typeof values['editorFontFamily'] === 'string') s.setEditorFontFamily(values['editorFontFamily'])
  if (typeof values['editorLineHeight'] === 'string') s.setEditorLineHeight(values['editorLineHeight'])
  if (typeof values['editorWordWrap'] === 'boolean') s.setWordWrap(values['editorWordWrap'])
  if (typeof values['editorTheme'] === 'string') s.setEditorTheme(values['editorTheme'])
  if (typeof values['editorCursor'] === 'string') s.setEditorCursor(values['editorCursor'])
  if (typeof values['editorIndentGuides'] === 'boolean') s.setEditorIndentGuides(values['editorIndentGuides'])

  // 应用背景图（data URI，经 CSS 变量注入淡显）
  const bg = typeof values['appBackground'] === 'string' ? values['appBackground'] : ''
  if (bg) {
    document.documentElement.style.setProperty('--app-bg-image', `url("${bg}")`)
    document.body.classList.add('has-bg')
  } else {
    document.documentElement.style.removeProperty('--app-bg-image')
    document.body.classList.remove('has-bg')
  }

  // 侧栏明暗
  const tone = typeof values['sidebarTone'] === 'string' ? values['sidebarTone'] : 'auto'
  document.documentElement.dataset['sidebarTone'] = tone

  // 颜色自定义覆盖（空 = 跟随主题）；支持 #RRGGBB 与 #RRGGBBAA（含透明度）
  const overrides: [string, unknown][] = [
    ['--bg', values['bgColor']],
    ['--bg-card', values['cardBgColor']],
    ['--bg-side', values['sideBgColor']],
    ['--border', values['borderColor']],
    ['--fg', values['textColor']],
    // 衍生色（0.8.1 新增）
    ['--bg-hover', values['bgHoverColor']],
    ['--bg-active', values['bgActiveColor']],
    ['--bg-input', values['bgInputColor']],
    ['--fg-dim', values['fgDimColor']],
    ['--fg-faint', values['fgFaintColor']],
    ['--border-strong', values['borderStrongColor']],
    ['--accent-soft', values['accentSoftColor']]
  ]
  for (const [prop, raw] of overrides) {
    if (typeof raw === 'string' && /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(raw)) {
      document.documentElement.style.setProperty(prop, raw)
    } else {
      document.documentElement.style.removeProperty(prop)
    }
  }

  // 壁纸浓度（0~100% 滑块）
  const wp = typeof values['wallpaperOpacity'] === 'number' ? values['wallpaperOpacity'] : 35
  document.documentElement.style.setProperty('--wallpaper-opacity', String(Math.min(1, Math.max(0, wp / 100))))

  // 背景图适配模式（cover 裁剪 / contain 完整 / stretch 拉伸）
  const fit = typeof values['wallpaperFit'] === 'string' ? values['wallpaperFit'] : 'cover'
  document.documentElement.style.setProperty('--wallpaper-fit', fit)

  // 背景图磨砂模糊（0~50px）
  const blur = typeof values['bgBlur'] === 'number' ? values['bgBlur'] : 0
  document.documentElement.style.setProperty('--wallpaper-blur', `${Math.min(50, Math.max(0, blur))}px`)

  // 圆角风格（sharp → 2px，否则还原主题默认）
  if (values['radiusMode'] === 'sharp') {
    document.documentElement.style.setProperty('--radius', '2px')
    document.documentElement.style.setProperty('--radius-sm', '2px')
    document.documentElement.style.setProperty('--radius-lg', '4px')
  } else {
    document.documentElement.style.removeProperty('--radius')
    document.documentElement.style.removeProperty('--radius-sm')
    document.documentElement.style.removeProperty('--radius-lg')
  }

  // 界面缩放（CSS zoom，App.css 的 .app-frame 读取）
  const scale = typeof values['uiScale'] === 'string' ? values['uiScale'] : '1.0'
  document.documentElement.style.setProperty('--ui-scale', scale)

  // 窗口不透明度（主进程 IPC；最大化时系统可能忽略）
  const op = typeof values['winOpacity'] === 'number' ? values['winOpacity'] : 100
  if (typeof window.api?.setWindowOpacity === 'function' && Number.isFinite(op)) {
    window.api.setWindowOpacity(op)
  }

  // 窗口磨砂材质（Win11 亚克力/云母；不满足条件时 CSS 层退化为半透明）
  const material = typeof values['winMaterial'] === 'string' ? values['winMaterial'] : 'none'
  document.body.dataset['material'] = material
  if (typeof window.api?.setWindowMaterial === 'function') {
    window.api.setWindowMaterial(material)
  }
}
