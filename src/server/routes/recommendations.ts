import { Router } from 'express'
import { getDb } from '../db'
import { readFileSync } from 'node:fs'
import { getAppSettings } from '../settings'

export const recommendationsRouter = Router()

const ARXIV_API = 'http://export.arxiv.org/api/query'
// 10-minute cache to avoid hammering arXiv / RSS sources
let cache: { at: number; data: unknown; key?: string } | null = null

export interface RecItem {
  title: string
  link: string
  summary: string
  source: string // 'arxiv' | RSS feed url
  published: string
}

interface RecResponse {
  keywords: string[]
  items: RecItem[]
}

// Extract top keywords from the literature library (project + global)
function extractKeywords(projectId?: string): string[] {
  const db = getDb()
  const rows = (
    projectId
      ? db
          .prepare(
            'SELECT title, abstract, venue FROM literature WHERE project_id = ? OR project_id IS NULL'
          )
          .all(projectId)
      : db.prepare('SELECT title, abstract, venue FROM literature').all()
  ) as { title: string; abstract: string; venue: string }[]

  const freq = new Map<string, number>()
  const stop = new Set([
    'the', 'a', 'an', 'of', 'for', 'and', 'or', 'in', 'on', 'with', 'using', 'based',
    'study', 'research', 'analysis', 'method', 'model', 'learning', 'deep', 'paper',
    'approach', 'towards', 'via', 'from', 'to', 'is', 'are', 'by', 'as'
  ])
  for (const row of rows) {
    const text = `${row.title} ${row.abstract} ${row.venue}`.toLowerCase()
    const words = text.match(/[a-z][a-z-]{3,}/g) ?? []
    for (const w of words) {
      if (stop.has(w) || /^\d+$/.test(w)) continue
      freq.set(w, (freq.get(w) ?? 0) + 1)
    }
  }
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([w]) => w)
}

// Minimal Atom XML parsing (arxiv api returns Atom)
function parseAtom(xml: string): RecItem[] {
  const items: RecItem[] = []
  const entryRe = /<entry>([\s\S]*?)<\/entry>/g
  let m: RegExpExecArray | null
  while ((m = entryRe.exec(xml)) !== null) {
    const block = m[1]
    const field = (tag: string): string => {
      const fm = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'))
      return fm ? decodeEntities(fm[1]).trim() : ''
    }
    const title = field('title')
    if (!title) continue
    items.push({
      title,
      link: field('id') || '',
      summary: field('summary').slice(0, 400),
      source: 'arxiv',
      published: field('published')
    })
  }
  return items
}

function parseRss(xml: string, source: string): RecItem[] {
  const items: RecItem[] = []
  const itemRe = /<item[^>]*>([\s\S]*?)<\/item>/g
  let m: RegExpExecArray | null
  while ((m = itemRe.exec(xml)) !== null) {
    const block = m[1]
    const field = (tag: string): string => {
      const fm = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'))
      return fm ? decodeEntities(fm[1]).trim() : ''
    }
    const title = field('title')
    if (!title) continue
    items.push({
      title,
      link: field('link'),
      summary: field('description').replace(/<[^>]+>/g, '').slice(0, 400),
      source,
      published: field('pubDate')
    })
  }
  return items
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\\n/g, ' ')
}

// GET /api/recommendations?projectId=... — keywords from the library,
// recommendations from arXiv + user-configured RSS feeds.
recommendationsRouter.get('/recommendations', async (req, res) => {
  const projectId = req.query.projectId as string | undefined

  const settings = getAppSettings()
  const settingsKey = JSON.stringify([settings.recKeywords, settings.recCategories, settings.rssFeeds])
  if (cache && Date.now() - cache.at < 10 * 60_000 && cache.key === settingsKey) {
    res.json(cache.data)
    return
  }
  // 关键词 = 用户自定义（优先）+ 文献库自动提取
  const keywords = [...settings.recKeywords, ...extractKeywords(projectId)]
    .filter((k, i, arr) => arr.indexOf(k) === i)
    .slice(0, 8)
  const items: RecItem[] = []

  if (keywords.length > 0) {
    const terms = keywords.map((k) => `all:"${k}"`).join('+OR+')
    // arXiv 分类过滤（用户设置，如 cs.CV/cs.LG）
    const catQuery =
      settings.recCategories.length > 0
        ? `+AND+(${settings.recCategories.map((c) => `cat:${c}`).join('+OR+')})`
        : ''
    const query = `${terms}${catQuery}`
    try {
      const arxivRes = await fetch(
        `${ARXIV_API}?search_query=${encodeURIComponent(query)}&start=0&max_results=15&sortBy=submittedDate&sortOrder=descending`,
        { signal: AbortSignal.timeout(15_000) }
      )
      if (arxivRes.ok) {
        items.push(...parseAtom(await arxivRes.text()))
      }
    } catch (err) {
      console.error('[recommendations] arxiv fetch failed:', err)
    }
  }

  for (const feedUrl of settings.rssFeeds ?? []) {
    try {
      if (/^https?:\/\//i.test(feedUrl)) {
        const rssRes = await fetch(feedUrl, { signal: AbortSignal.timeout(12_000) })
        if (rssRes.ok) {
          items.push(...parseRss(await rssRes.text(), feedUrl))
        }
      } else {
        const local = readFileSync(feedUrl, 'utf-8')
        items.push(...parseRss(local, feedUrl))
      }
    } catch (err) {
      console.error('[recommendations] rss fetch failed:', feedUrl, err)
    }
  }

  const data: RecResponse = { keywords, items }
  cache = { at: Date.now(), data, key: settingsKey }
  res.json(data)
})
