import { Router } from 'express'
import { app, net } from 'electron'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

export const updateRouter = Router()

const UPDATE_XML = 'https://kawasakikusako.github.io/generalExp/kawasakiApps/oap.xml'
// jsDelivr 镜像（同一 GitHub 仓库的 raw 内容，国内通常可直连）
const UPDATE_XML_MIRROR = 'https://cdn.jsdelivr.net/gh/KawasakiKusako/generalExp@main/kawasakiApps/oap.xml'
const DOWNLOAD_PAGES = [
  'https://github.com/KawasakiKusako/openAcademicPipeline',
  'https://kawasakikusako.github.io/generalExp/oap/'
]

function currentVersion(): { main: number; sub: number; dev: number } {
  const fallback = { main: 0, sub: 0, dev: 0 }
  try {
    // app.getVersion() 在 dev（项目根 package.json）与打包（asar 内 package.json）都可靠
    const v = app.getVersion()
    const [main, sub, dev] = v.split('.').map((n) => Number(n))
    return { main: main ?? 0, sub: sub ?? 0, dev: dev ?? 0 }
  } catch {
    // 极少数情况下 app 未就绪；退回读 package.json（旧逻辑，作为兜底）
    try {
      const pkg = JSON.parse(readFileSync(join(__dirname, '../../../package.json'), 'utf-8')) as {
        version?: string
      }
      const [main, sub, dev] = (pkg.version ?? '0.0.0').split('.').map((n) => Number(n))
      return { main: main ?? 0, sub: sub ?? 0, dev: dev ?? 0 }
    } catch {
      return fallback
    }
  }
}

interface UpdateInfo {
  main: number
  sub: number
  dev: number
}

// 按序尝试候选源，全部失败返回 null。net.fetch 走 Chromium 网络栈（尊重系统代理），
// 对国内代理/VPN 用户友好；Node 全局 fetch 不走系统代理，作为回退。
async function fetchXml(candidates: string[]): Promise<UpdateInfo | null> {
  for (const url of candidates) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await net.fetch(url, { signal: AbortSignal.timeout(10_000) })
        if (res.ok) {
          const xml = await res.text()
          const field = (name: string): number => {
            const m = xml.match(new RegExp(`<${name}>\\s*(\\d+)\\s*</${name}>`))
            return m ? Number(m[1]) : 0
          }
          return { main: field('main'), sub: field('sub'), dev: field('dev') }
        }
      } catch (err) {
        console.warn(`[update] fetch ${url} failed (attempt ${attempt + 1}):`, (err as Error)?.message ?? err)
      }
    }
  }
  return null
}

// GET /api/update-check — 从 oap.xml 检查最新版本
updateRouter.get('/update-check', async (_req, res) => {
  const current = currentVersion()
  const latest = await fetchXml([UPDATE_XML, UPDATE_XML_MIRROR])
  if (!latest) {
    console.warn('[update] all sources failed, check skipped')
    res.json({ current: `${current.main}.${current.sub}.${current.dev}`, latest: null, updateAvailable: false })
    return
  }
  const latestStr = `${latest.main}.${latest.sub}.${latest.dev}`
  const currentStr = `${current.main}.${current.sub}.${current.dev}`
  const newer =
    latest.main > current.main ||
    (latest.main === current.main && latest.sub > current.sub) ||
    (latest.main === current.main && latest.sub === current.sub && latest.dev > current.dev)

  res.json({
    current: currentStr,
    latest: latestStr,
    updateAvailable: newer,
    downloadPages: newer ? DOWNLOAD_PAGES : []
  })
})
