import { Router } from 'express'
import { app, net } from 'electron'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

export const updateRouter = Router()

const UPDATE_XML = 'https://kawasakikusako.github.io/generalExp/kawasakiApps/oap.xml'
// jsDelivr 镜像（同一 GitHub 仓库的 raw 内容，国内通常可直连）
const UPDATE_XML_MIRROR = 'https://cdn.jsdelivr.net/gh/KawasakiKusako/generalExp@main/kawasakiApps/oap.xml'
const FALLBACK_PAGES = [
  'https://github.com/KawasakiKusako/openAcademicPipeline/releases',
  'https://kawasakikusako.github.io/generalExp/oap/'
]

interface Version {
  main: number
  sub: number
  dev: number
}

export interface UpdateCheckResult {
  current: string
  latest: string | null
  updateAvailable: boolean
  updateType: string
  updateLog: string[]
  downloadUrl: string | null // 全量安装包（updateSite）
  incrementalUrl: string | null // 增量更新包（updatePack / blockmap）
  standbySite: string | null
  officialWebsite: string | null
  fallbackPages: string[]
}

function currentVersion(): Version {
  try {
    const v = app.getVersion()
    const [main, sub, dev] = v.split('.').map((n) => Number(n))
    return { main: main ?? 0, sub: sub ?? 0, dev: dev ?? 0 }
  } catch {
    try {
      const pkg = JSON.parse(readFileSync(join(__dirname, '../../package.json'), 'utf-8')) as {
        version?: string
      }
      const [main, sub, dev] = (pkg.version ?? '0.0.0').split('.').map((n) => Number(n))
      return { main: main ?? 0, sub: sub ?? 0, dev: dev ?? 0 }
    } catch {
      return { main: 0, sub: 0, dev: 0 }
    }
  }
}

function versionStr(v: Version): string {
  return `${v.main}.${v.sub}.${v.dev}`
}

// 版本比较：a > b → 正数；a === b → 0
function compareVersion(a: Version, b: Version): number {
  return a.main - b.main || a.sub - b.sub || a.dev - b.dev
}

// XML 单字段提取（含子级容错：<main>0</main>）
function field(xml: string, name: string): string {
  const m = xml.match(new RegExp(`<${name}>\\s*([^<]*?)\\s*</${name}>`))
  return m ? m[1].trim() : ''
}

// XML 列表项提取：<item>...</item>（跨行容错）
function items(xml: string, name: string): string[] {
  const out: string[] = []
  const re = new RegExp(`<${name}>([\\s\\S]*?)</${name}>`, 'g')
  let m: RegExpExecArray | null
  while ((m = re.exec(xml)) !== null) {
    const text = m[1].trim()
    if (text && text !== 'null') out.push(text)
  }
  return out
}

// 按序尝试候选源，全部失败返回 null。net.fetch 走 Chromium 网络栈（尊重系统代理）。
async function fetchXml(candidates: string[]): Promise<string | null> {
  for (const url of candidates) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await net.fetch(url, { signal: AbortSignal.timeout(10_000) })
        if (res.ok) return await res.text()
      } catch (err) {
        console.warn(`[update] fetch ${url} failed (attempt ${attempt + 1}):`, (err as Error)?.message ?? err)
      }
    }
  }
  return null
}

// GET /api/update-check — 解析 oap.xml 返回完整更新信息
updateRouter.get('/update-check', async (_req, res) => {
  const current = currentVersion()
  const xml = await fetchXml([UPDATE_XML, UPDATE_XML_MIRROR])
  if (!xml) {
    console.warn('[update] all sources failed, check skipped')
    res.json({
      current: versionStr(current),
      latest: null,
      updateAvailable: false,
      updateType: '',
      updateLog: [],
      downloadUrl: null,
      incrementalUrl: null,
      standbySite: null,
      officialWebsite: null,
      fallbackPages: FALLBACK_PAGES
    } satisfies UpdateCheckResult)
    return
  }

  const latest: Version = {
    main: Number(field(xml, 'main')) || 0,
    sub: Number(field(xml, 'sub')) || 0,
    dev: Number(field(xml, 'dev')) || 0
  }
  const newer = compareVersion(latest, current) > 0

  res.json({
    current: versionStr(current),
    latest: versionStr(latest),
    updateAvailable: newer,
    updateType: field(xml, 'updateType') || 'normal',
    updateLog: items(xml, 'item'),
    downloadUrl: field(xml, 'updateSite') || null,
    incrementalUrl: field(xml, 'updatePack') || null,
    standbySite: field(xml, 'standbySite') || null,
    officialWebsite: field(xml, 'officialWebsite') || null,
    fallbackPages: FALLBACK_PAGES
  } satisfies UpdateCheckResult)
})
