import { Router } from 'express'
import { app } from 'electron'
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { join } from 'node:path'
import * as tar from 'tar'
import { DATA_ROOT } from '../paths'
import { getSetting, setSetting } from '../settings'
import { getPersonalizationValues } from '../personalization'
// oap-style.js 源码（构建期 ?raw 内嵌）——运行时写到 DATA_ROOT 供沙盒内 AI 调用
import oapStyleSource from '../../../scripts/oap-style.js?raw'

export const styleRouter = Router()

const CUSTOM_DIR = join(DATA_ROOT, 'custom-style')
const CUSTOM_FILE = join(CUSTOM_DIR, 'style.css')
const BACKUP_DIR = join(DATA_ROOT, 'style-backup')
const EXPORT_DIR = join(DATA_ROOT, 'exports')

const TEMPLATE = `/* Open Academic Pipeline 自定义样式
 * 在此写入任意 CSS，保存后点击「重新加载」即时生效（覆盖内置样式）。
 * 推荐优先覆盖设计 token（CSS 变量），例如：
 *   :root { --accent: #ff6b81; --radius: 12px; }
 * 完整 token 清单见 StyleHANDOFF.md。
 */
`

// 构建产物 CSS（默认样式备份用）：
// 打包版读 app.asar/out/renderer/assets/*.css；dev 版读源码（out/renderer 可能是陈旧 build 产物）
function latestBuiltCss(): string {
  if (app.isPackaged) {
    const dir = join(__dirname, '../renderer/assets')
    return readdirSync(dir)
      .filter((f) => f.endsWith('.css'))
      .sort()
      .map((f) => readFileSync(join(dir, f), 'utf-8'))
      .join('\n')
  }
  return (
    readFileSync(join(__dirname, '../../src/renderer/src/assets/main.css'), 'utf-8') +
    '\n' +
    readFileSync(join(__dirname, '../../src/renderer/src/App.css'), 'utf-8')
  )
}

// 启动初始化：创建目录 + 版本变化时自动备份默认样式
export function initStyleModule(): void {
  mkdirSync(CUSTOM_DIR, { recursive: true })
  mkdirSync(BACKUP_DIR, { recursive: true })
  if (getSetting('styleBackupVersion', '') !== app.getVersion()) {
    try {
      writeFileSync(join(BACKUP_DIR, `default-${app.getVersion()}.css`), latestBuiltCss(), 'utf-8')
      setSetting('styleBackupVersion', app.getVersion())
      console.log('[style] 默认样式已备份:', app.getVersion())
    } catch (err) {
      console.error('[style] 备份默认样式失败:', err)
    }
  }
}

// oap-style.js 部署（与 ensurePermHook 同构）：内容比对写 DATA_ROOT，返回绝对路径
let styleScriptPath: string | null = null
export function ensureStyleScript(): string {
  if (styleScriptPath) return styleScriptPath
  const target = join(DATA_ROOT, 'oap-style.js')
  mkdirSync(DATA_ROOT, { recursive: true })
  try {
    if (readFileSync(target, 'utf-8') !== oapStyleSource) {
      writeFileSync(target, oapStyleSource, 'utf-8')
    }
  } catch {
    writeFileSync(target, oapStyleSource, 'utf-8')
  }
  styleScriptPath = target
  return target
}

// GET /style/status — 开关状态与文件信息
styleRouter.get('/style/status', (_req, res) => {
  const exists = existsSync(CUSTOM_FILE)
  let mtime = 0
  try {
    mtime = exists ? statSync(CUSTOM_FILE).mtimeMs : 0
  } catch {
    mtime = 0
  }
  res.json({
    enabled: getSetting<boolean>('customCssEnabled', false),
    exists,
    mtime,
    cssPath: CUSTOM_FILE,
    backupDir: BACKUP_DIR,
    exportDir: EXPORT_DIR
  })
})

// GET /style/css — 自定义 CSS 文本（渲染端 fetch 后注入 <style>）
styleRouter.get('/style/css', (_req, res) => {
  if (!existsSync(CUSTOM_FILE)) {
    res.json({ content: '' })
    return
  }
  res.json({ content: readFileSync(CUSTOM_FILE, 'utf-8') })
})

// PUT /style/css — 保存自定义 CSS
styleRouter.put('/style/css', (req, res) => {
  const content = (req.body ?? {}) as { content?: unknown }
  if (typeof content.content !== 'string') {
    res.status(400).json({ error: 'content 需为字符串' })
    return
  }
  if (content.content.length > 1024 * 1024) {
    res.status(400).json({ error: '样式内容超过 1MB 上限' })
    return
  }
  mkdirSync(CUSTOM_DIR, { recursive: true })
  if (!existsSync(CUSTOM_FILE)) {
    writeFileSync(CUSTOM_FILE, TEMPLATE + content.content, 'utf-8')
  } else {
    writeFileSync(CUSTOM_FILE, content.content, 'utf-8')
  }
  res.json({ ok: true })
})

// PUT /style/enable — 开关自定义样式
styleRouter.put('/style/enable', (req, res) => {
  const body = (req.body ?? {}) as { enabled?: unknown }
  setSetting('customCssEnabled', !!body.enabled)
  res.json({ ok: true, enabled: !!body.enabled })
})

// POST /style/reset — 恢复默认（清空自定义样式为模板）
styleRouter.post('/style/reset', (_req, res) => {
  mkdirSync(CUSTOM_DIR, { recursive: true })
  writeFileSync(CUSTOM_FILE, TEMPLATE, 'utf-8')
  res.json({ ok: true })
})

// POST /style/backup — 备份当前默认样式（构建产物 CSS）
styleRouter.post('/style/backup', (_req, res) => {
  mkdirSync(BACKUP_DIR, { recursive: true })
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const file = join(BACKUP_DIR, `default-${app.getVersion()}-${ts}.css`)
  try {
    writeFileSync(file, latestBuiltCss(), 'utf-8')
    res.json({ ok: true, path: file })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) })
  }
})

// POST /style/export — 导出样式包 tar（自定义 css + 默认样式备份 + 个性化 JSON + README）
styleRouter.post('/style/export', (_req, res) => {
  mkdirSync(EXPORT_DIR, { recursive: true })
  const ts = Date.now()
  const staging = join(EXPORT_DIR, `.stage-${ts}`)
  const tarFile = join(EXPORT_DIR, `style-export-${ts}.tar`)
  try {
    mkdirSync(staging, { recursive: true })
    // 1) 自定义样式
    if (existsSync(CUSTOM_FILE)) {
      cpSync(CUSTOM_FILE, join(staging, 'style.css'))
    }
    // 2) 最近一份默认样式备份
    try {
      const backups = readdirSync(BACKUP_DIR).filter((f) => f.endsWith('.css')).sort()
      const latest = backups[backups.length - 1]
      if (latest) cpSync(join(BACKUP_DIR, latest), join(staging, latest))
    } catch {
      // 无备份则跳过
    }
    // 3) 当前个性化设置
    writeFileSync(
      join(staging, 'personalization.json'),
      JSON.stringify({ exportedAt: new Date().toISOString(), version: app.getVersion(), values: getPersonalizationValues() }, null, 2),
      'utf-8'
    )
    // 4) 说明
    writeFileSync(
      join(staging, 'README.txt'),
      [
        'Open Academic Pipeline 样式导出包',
        `导出时间：${new Date().toISOString()}`,
        `应用版本：${app.getVersion()}`,
        '',
        '文件说明：',
        '  style.css            自定义样式（导入方式：个性化设置 → 自定义样式 → 粘贴内容并保存）',
        '  default-*.css        默认样式备份（仅参考/恢复用）',
        '  personalization.json 个性化设置值（导入方式：个性化设置 → 导出/导入 JSON）',
        '',
        '详见项目内 StyleHANDOFF.md'
      ].join('\n'),
      'utf-8'
    )
    // tar v7 是 Promise API；sync:true 同步打包（路由处理器内同步完成）
    tar.c({ gzip: false, file: tarFile, cwd: staging, sync: true }, ['.'])
    rmSync(staging, { recursive: true, force: true })
    res.json({ ok: true, path: tarFile })
  } catch (err) {
    rmSync(staging, { recursive: true, force: true })
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) })
  }
})
