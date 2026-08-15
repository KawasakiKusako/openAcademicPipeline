import { Router } from 'express'
import { cpSync, readdirSync, readFileSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { getSkillsPath, getSetting, setSetting } from '../settings'

export const skillsRouter = Router()

// 精选技能仓库（skill.sh 生态中的知名公开仓库）
const FEATURED_REPOS = [
  { repo: 'anthropics/skills', label: 'Anthropic 官方' },
  { repo: 'secondsky/claude-skills', label: 'Claude Skills（139+ 技能）' },
  { repo: 'expo/skills', label: 'Expo 移动开发' },
  { repo: 'coreyhaines31/marketingskills', label: '营销技能包（23 个）' },
  { repo: 'jimliu/baoyu-skills', label: '宝玉技能包（PPT/图片）' }
]

// 解析 SKILL.md 的 YAML frontmatter（name / description）
function parseSkillMd(text: string): { name?: string; description?: string } {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!m) return {}
  const fm = m[1]
  const get = (key: string): string | undefined => {
    const line = fm.match(new RegExp(`^${key}\\s*:\\s*(.+)$`, 'm'))
    return line ? line[1].trim().replace(/^["']|["']$/g, '') : undefined
  }
  return { name: get('name'), description: get('description') }
}

// 已安装技能：扫描技能目录（含描述）
skillsRouter.get('/skills', (_req, res) => {
  const root = getSkillsPath()
  if (!existsSync(root)) {
    res.json({ path: root, skills: [] })
    return
  }
  const skills: { name: string; description: string }[] = []
  try {
    for (const entry of readdirSync(root)) {
      if (entry.startsWith('.')) continue
      const full = join(root, entry)
      const md = join(full, 'SKILL.md')
      if (!existsSync(md)) continue
      const meta = parseSkillMd(readFileSync(md, 'utf-8'))
      skills.push({ name: entry, description: meta.description ?? '' })
    }
  } catch {
    // ignore unreadable dir
  }
  res.json({ path: root, skills })
})

// 市场：从 GitHub 仓库拉取 skills/ 目录下的技能列表（免认证 trees + raw）
// GET /api/skills/market?repo=owner/repo
skillsRouter.get('/skills/market', async (req, res) => {
  const repo = String(req.query.repo ?? '').trim().replace(/^https?:\/\/github\.com\//, '')
  if (!repo || !/^[\w.-]+\/[\w.-]+$/.test(repo)) {
    res.status(400).json({ error: '无效的仓库格式（owner/repo）' })
    return
  }
  try {
    const r = await fetch(`https://api.github.com/repos/${repo}`, {
      headers: { 'user-agent': 'oap', accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(10_000)
    })
    if (!r.ok) {
      res.status(404).json({ error: `仓库不存在或不可访问（${r.status}）` })
      return
    }
    const meta = (await r.json()) as { default_branch?: string; description?: string }
    const branch = meta.default_branch ?? 'main'
    const treeRes = await fetch(
      `https://api.github.com/repos/${repo}/git/trees/${branch}?recursive=1`,
      { headers: { 'user-agent': 'oap' }, signal: AbortSignal.timeout(15_000) }
    )
    if (!treeRes.ok) {
      res.status(500).json({ error: `获取文件树失败（${treeRes.status}）` })
      return
    }
    const tree = (await treeRes.json()) as { tree?: { path: string; type: string }[] }
    const skills: {
      name: string
      description: string
      repo: string
      path: string
      files: string[]
    }[] = []
    for (const t of tree.tree ?? []) {
      const m = t.path.match(/^(?:skills|\.agents\/skills)\/([^/]+)\/SKILL\.md$/)
      if (!m) continue
      const dir = t.path.slice(0, t.path.lastIndexOf('/'))
      const files = (tree.tree ?? [])
        .filter((f) => f.path.startsWith(dir + '/'))
        .map((f) => f.path)
      const mdRes = await fetch(
        `https://raw.githubusercontent.com/${repo}/${branch}/${dir}/SKILL.md`,
        { signal: AbortSignal.timeout(10_000) }
      )
      const md = mdRes.ok ? await mdRes.text() : ''
      const meta2 = parseSkillMd(md)
      skills.push({
        name: meta2.name ?? m[1],
        description: meta2.description ?? '',
        repo,
        path: dir,
        files
      })
    }
    res.json({ repo, branch, repoDescription: meta.description ?? '', skills })
  } catch (err) {
    res.status(500).json({ error: `市场查询失败：${err instanceof Error ? err.message : String(err)}` })
  }
})

// 安装技能：从 GitHub 下载 skills/<name>/ 全部文件到技能目录
// POST /api/skills/install { repo, path, name }
skillsRouter.post('/skills/install', async (req, res) => {
  const repo = String(req.body?.repo ?? '')
  const path = String(req.body?.path ?? '')
  const name = String(req.body?.name ?? '')
  if (!repo || !path || !name || !/^[\w.-]+\/[\w.-]+$/.test(repo)) {
    res.status(400).json({ error: '缺少安装参数' })
    return
  }
  try {
    const branch = String(req.body?.branch ?? 'main')
    const root = getSkillsPath()
    mkdirSync(root, { recursive: true })
    const dest = join(root, name)
    if (existsSync(dest)) {
      res.status(409).json({ error: `技能「${name}」已存在` })
      return
    }
    mkdirSync(dest, { recursive: true })

    // 获取目录文件清单（复用 trees）
    const treeRes = await fetch(
      `https://api.github.com/repos/${repo}/git/trees/${branch}?recursive=1`,
      { headers: { 'user-agent': 'oap' }, signal: AbortSignal.timeout(15_000) }
    )
    if (!treeRes.ok) throw new Error(`获取文件树失败（${treeRes.status}）`)
    const tree = (await treeRes.json()) as { tree?: { path: string; type: string }[] }
    const files = (tree.tree ?? []).filter(
      (f) => f.type === 'blob' && f.path.startsWith(path + '/')
    )
    if (files.length === 0) {
      rmSync(dest, { recursive: true, force: true })
      throw new Error('未找到技能文件')
    }
    let count = 0
    for (const f of files) {
      const rel = f.path.slice(path.length + 1)
      const target = join(dest, rel)
      mkdirSync(target.slice(0, target.lastIndexOf('/')), { recursive: true })
      const rawRes = await fetch(
        `https://raw.githubusercontent.com/${repo}/${branch}/${f.path}`,
        { signal: AbortSignal.timeout(15_000) }
      )
      if (rawRes.ok) {
        const buf = Buffer.from(await rawRes.arrayBuffer())
        // 跳过二进制（技能目录基本是 md/文本）
        if (buf.includes(0)) continue
        require('node:fs').writeFileSync(target, buf)
        count++
      }
    }
    if (count === 0) {
      rmSync(dest, { recursive: true, force: true })
      throw new Error('技能文件下载失败')
    }
    res.json({ ok: true, name, files: count })
  } catch (err) {
    res.status(500).json({ error: `安装失败：${err instanceof Error ? err.message : String(err)}` })
  }
})

// 部署技能到指定 agent 目录（类似 cc-switch 的一键部署）
skillsRouter.post('/skills/deploy', (req, res) => {
  const name = String(req.body?.name ?? '')
  const target = String(req.body?.target ?? '')
  if (!name || !['claude', 'codex', 'deepseek'].includes(target)) {
    res.status(400).json({ error: '缺少部署参数' })
    return
  }
  const src = join(getSkillsPath(), name)
  if (!existsSync(src)) {
    res.status(404).json({ error: `技能「${name}」不存在` })
    return
  }
  const dest = join(homedir(), `.${target}`, 'skills', name)
  try {
    if (existsSync(dest)) rmSync(dest, { recursive: true, force: true })
    mkdirSync(dest, { recursive: true })
    cpSync(src, dest, { recursive: true })
    res.json({ ok: true, dest })
  } catch (err) {
    res.status(500).json({ error: `部署失败：${err instanceof Error ? err.message : String(err)}` })
  }
})

// API 引擎技能注入：启用列表（技能 SKILL.md 作为 system 提示）
skillsRouter.get('/skills/api-enabled', (_req, res) => {
  res.json({ enabled: getSetting<string[]>('apiSkills', []) })
})

skillsRouter.put('/skills/api-enabled', (req, res) => {
  const enabled = Array.isArray(req.body?.enabled)
    ? (req.body.enabled as unknown[]).map(String).filter(Boolean)
    : []
  setSetting('apiSkills', enabled)
  res.json({ ok: true })
})

// 删除已安装技能
skillsRouter.delete('/skills/:name', (req, res) => {
  const root = getSkillsPath()
  const target = join(root, req.params.name)
  if (!target.startsWith(root) || !existsSync(target)) {
    res.status(404).json({ error: '技能不存在' })
    return
  }
  rmSync(target, { recursive: true, force: true })
  res.status(204).end()
})

export { FEATURED_REPOS }
