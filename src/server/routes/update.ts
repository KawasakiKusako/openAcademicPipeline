import { Router } from 'express'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

export const updateRouter = Router()

const UPDATE_XML = 'https://kawasakikusako.github.io/generalExp/kawasakiApps/oap.xml'
const DOWNLOAD_PAGES = [
  'https://github.com/KawasakiKusako/openAcademicPipeline',
  'https://kawasakikusako.github.io/generalExp/oap/'
]

function currentVersion(): { main: number; sub: number; dev: number } {
  // dev 时 __dirname = src/server/routes；打包后 = out/server
  let pkg: { version: string }
  try {
    pkg = JSON.parse(readFileSync(join(__dirname, '../../../package.json'), 'utf-8')) as { version: string }
  } catch {
    pkg = { version: '0.5.1' }
  }
  if (!pkg.version) pkg.version = '0.5.1'
  const [main, sub, dev] = pkg.version.split('.').map((n) => Number(n))
  return { main: main ?? 0, sub: sub ?? 0, dev: dev ?? 0 }
}

// GET /api/update-check — 从 oap.xml 检查最新版本
updateRouter.get('/update-check', async (_req, res) => {
  const current = currentVersion()
  try {
    const xmlRes = await fetch(UPDATE_XML, { signal: AbortSignal.timeout(10_000) })
    if (!xmlRes.ok) {
      res.json({ current: `${current.main}.${current.sub}.${current.dev}`, latest: null, updateAvailable: false })
      return
    }
    const xml = await xmlRes.text()
    const field = (name: string): number => {
      const m = xml.match(new RegExp(`<${name}>\\s*(\\d+)\\s*</${name}>`))
      return m ? Number(m[1]) : 0
    }
    const latest = { main: field('main'), sub: field('sub'), dev: field('dev') }
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
  } catch (err) {
    console.error('[update] check failed:', err)
    res.json({ current: `${current.main}.${current.sub}.${current.dev}`, latest: null, updateAvailable: false })
  }
})
