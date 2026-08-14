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

  // 颜色自定义覆盖（空 = 跟随主题）
  const overrides: [string, unknown][] = [
    ['--bg', values['bgColor']],
    ['--bg-card', values['cardBgColor']],
    ['--bg-side', values['sideBgColor']],
    ['--border', values['borderColor']],
    ['--fg', values['textColor']]
  ]
  for (const [prop, raw] of overrides) {
    if (typeof raw === 'string' && /^#[0-9a-fA-F]{6}$/.test(raw)) {
      document.documentElement.style.setProperty(prop, raw)
    } else {
      document.documentElement.style.removeProperty(prop)
    }
  }

  // 壁纸浓度
  const wp = typeof values['wallpaperOpacity'] === 'string' ? values['wallpaperOpacity'] : 'medium'
  const wpMap: Record<string, string> = { light: '0.15', medium: '0.35', strong: '0.55' }
  document.documentElement.style.setProperty('--wallpaper-opacity', wpMap[wp] ?? '0.35')
}
