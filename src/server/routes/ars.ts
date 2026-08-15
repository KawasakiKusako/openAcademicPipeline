import { Router } from 'express'
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { DATA_ROOT } from '../paths'
import { permissionBus } from '../claude/cli-engine'
import type { PermissionRequest } from '../claude/cli-engine'

export const arsRouter = Router()

// ===== CLI 权限确认 Hook 端点 =====
// PreToolUse hook 脚本(scripts/perm-hook.js) POST 到这里，等待用户弹窗决策。
// 「总是允许」规则记录在内存 + 由 main 侧写沙盒白名单。
const alwaysAllowRules = new Set<string>()
export function isAlwaysAllowed(command: string): boolean {
  return alwaysAllowRules.has(command.trim().split(/\s+/)[0] ?? '')
}

// 沙盒 settings.json 的 permissions.allow 白名单匹配：
// CC 的 PreToolUse hook 先于白名单检查触发（即使工作区已信任），
// 白名单内的命令必须由端点直接放行，否则每个常见命令都会弹窗打断。
function commandFirstWord(command: string): string | null {
  const w = command.trim().split(/\s+/)[0]
  return w || null
}

function isSandboxAllowed(command: string, cwd: string): boolean {
  const cmd = commandFirstWord(command)
  if (!cmd) return false
  try {
    const settingsPath = join(cwd, '.claude', 'settings.json')
    if (!existsSync(settingsPath)) return false
    const s = JSON.parse(readFileSync(settingsPath, 'utf-8')) as {
      permissions?: { allow?: string[] }
    }
    const allow = s?.permissions?.allow ?? []
    return allow.includes(`Bash(${cmd}:*)`) || allow.includes('Bash(*)')
  } catch {
    return false
  }
}

arsRouter.post('/cli-permission/request', (req, res) => {
  const body = (req.body ?? {}) as { action?: string; command?: string; toolInput?: string; cwd?: string }
  const command = String(body.command ?? '')
  const reqPayload: PermissionRequest = {
    requestId: `hook-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    action: String(body.action ?? 'Bash'),
    command,
    toolInput: String(body.toolInput ?? '')
  }
  // 已「总是允许」或沙盒白名单内的命令直接放行（不弹窗）
  if (command && (isAlwaysAllowed(command) || isSandboxAllowed(command, String(body.cwd ?? '')))) {
    res.json({ decision: 'allow' })
    return
  }
  console.log('[perm] hook request → 等待弹窗决策:', reqPayload.action, command.slice(0, 120))
  permissionBus.once(`decision:${reqPayload.requestId}`, (d: { decision: string; alwaysAllow?: boolean }) => {
    if (d.alwaysAllow && command) {
      const cmd = command.trim().split(/\s+/)[0] ?? ''
      alwaysAllowRules.add(cmd)
      // 持久化到该沙盒的 .claude/settings.json 白名单
      try {
        const cwd = String(body.cwd ?? '')
        if (cwd) {
          const claudeDir = join(cwd, '.claude')
          mkdirSync(claudeDir, { recursive: true })
          const settingsPath = join(claudeDir, 'settings.json')
          let current: { permissions?: { allow?: string[] } } = {}
          try {
            current = JSON.parse(readFileSync(settingsPath, 'utf-8')) as { permissions?: { allow?: string[] } }
          } catch {
            current = {}
          }
          const rules = new Set(current.permissions?.allow ?? [])
          rules.add(`Bash(${cmd}:*)`)
          writeFileSync(
            settingsPath,
            JSON.stringify({ ...current, permissions: { ...(current.permissions ?? {}), allow: [...rules] } }, null, 2),
            'utf-8'
          )
        }
      } catch {
        // 持久化失败不影响本次放行
      }
    }
    res.json({ decision: d.decision === 'allow' ? 'allow' : 'deny' })
  })
  permissionBus.emit('request', reqPayload)
  // 兜底超时：60s 无决策自动拒绝（前端超时保护）
  setTimeout(() => {
    if (!res.writableEnded) {
      res.json({ decision: 'deny' })
    }
  }, 60_000)
})

const ARS_ROOT = join(DATA_ROOT, 'ars')
const ARS_META = join(ARS_ROOT, 'ars-meta.json')
const CACHE_ROOTS = [
  join(homedir(), '.claude', 'plugins', 'cache', 'academic-research-skills', 'academic-research-skills'),
  join(homedir(), '.claude', 'plugins', 'marketplaces', 'academic-research-skills')
]

interface ArsMeta {
  version: string
  source: string
  installedAt: string
  skills: string[]
}

function readMeta(): ArsMeta | null {
  try {
    return JSON.parse(readFileSync(ARS_META, 'utf-8')) as ArsMeta
  } catch {
    return null
  }
}

function writeMeta(meta: ArsMeta): void {
  writeFileSync(ARS_META, JSON.stringify(meta, null, 2), 'utf-8')
}

function listSkills(root: string): string[] {
  try {
    return readdirSync(root).filter((e) => !e.startsWith('.') && existsSync(join(root, e, 'SKILL.md')))
  } catch {
    return []
  }
}

// 从插件缓存找最新版本目录（如 3.10.0）
function findCacheVersionDir(): { dir: string; version: string } | null {
  for (const root of CACHE_ROOTS) {
    if (!existsSync(root)) continue
    // 顶层即技能目录（marketplace 形态）
    if (existsSync(join(root, 'academic-paper', 'SKILL.md'))) {
      return { dir: root, version: 'marketplace' }
    }
    // 版本目录形态
    try {
      const versions = readdirSync(root)
        .filter((v) => /^\d+(\.\d+)*$/.test(v))
        .sort((a, b) => {
          const pa = a.split('.').map(Number)
          const pb = b.split('.').map(Number)
          for (let i = 0; i < 3; i++) {
            if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0)
          }
          return 0
        })
      if (versions.length > 0) {
        const v = versions[versions.length - 1]
        if (existsSync(join(root, v, 'academic-paper', 'SKILL.md'))) {
          return { dir: join(root, v), version: v }
        }
      }
    } catch {
      // ignore
    }
  }
  return null
}

// 探测 marketplace 的 git remote（得到 ARS GitHub 仓库地址）
function findMarketplaceRemote(): string | null {
  const mp = join(homedir(), '.claude', 'plugins', 'marketplaces', 'academic-research-skills')
  if (!existsSync(join(mp, '.git'))) return null
  try {
    const out = execFileSync('git', ['-C', mp, 'remote', 'get-url', 'origin'], {
      timeout: 5000,
      windowsHide: true
    })
    const url = String(out).trim()
    if (!url) return null
    const m = url.match(/github\.com[:/]([\w.-]+\/[\w.-]+?)(?:\.git)?$/)
    return m ? m[1] : null
  } catch {
    return null
  }
}

// 复制来源目录到 ARS_ROOT（排除隐藏文件与版本目录的多余层级）
function copyArs(srcDir: string, version: string, source: string): ArsMeta {
  rmSync(ARS_ROOT, { recursive: true, force: true })
  mkdirSync(ARS_ROOT, { recursive: true })
  for (const entry of readdirSync(srcDir)) {
    if (entry.startsWith('.')) continue
    cpSync(join(srcDir, entry), join(ARS_ROOT, entry), { recursive: true })
  }
  const meta: ArsMeta = {
    version,
    source,
    installedAt: new Date().toISOString(),
    skills: listSkills(ARS_ROOT)
  }
  writeMeta(meta)
  return meta
}

// GET /api/ars/status — 内置 ARS 状态
arsRouter.get('/ars/status', (_req, res) => { // eslint-disable-line @typescript-eslint/no-unused-vars
  const meta = readMeta()
  const installed = Boolean(meta) && meta!.skills.length > 0
  const cacheVersion = findCacheVersionDir()
  res.json({
    installed,
    meta,
    // 可供更新的来源信息
    availableSource: cacheVersion ? { version: cacheVersion.version } : null,
    cacheFound: Boolean(cacheVersion),
    remote: findMarketplaceRemote()
  })
})

// POST /api/ars/install — 从插件缓存复制安装（离线）；无缓存时探测 marketplace remote 走 GitHub
arsRouter.post('/ars/install', async (_req, res) => {
  try {
    const cache = findCacheVersionDir()
    if (cache) {
      const meta = copyArs(cache.dir, cache.version, 'plugin-cache')
      res.json({ ok: true, ...meta })
      return
    }
    const remote = findMarketplaceRemote()
    if (!remote) {
      res.status(404).json({ error: '未找到 ARS 插件缓存，也无法定位其 GitHub 仓库（~/.claude/plugins/marketplaces/academic-research-skills 非 git 仓库）' })
      return
    }
    // 通过 GitHub 拉取（复用 skills.ts 的 trees+raw 模式）
    const r = await fetch(`https://api.github.com/repos/${remote}`, {
      headers: { 'user-agent': 'oap', accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(10_000)
    })
    if (!r.ok) {
      res.status(404).json({ error: `无法访问 ${remote}（${r.status}）` })
      return
    }
    const meta = await r.json() as { default_branch?: string }
    const branch = meta.default_branch ?? 'main'
    const treeRes = await fetch(`https://api.github.com/repos/${remote}/git/trees/${branch}?recursive=1`, {
      headers: { 'user-agent': 'oap' },
      signal: AbortSignal.timeout(15_000)
    })
    if (!treeRes.ok) {
      res.status(500).json({ error: `获取文件树失败（${treeRes.status}）` })
      return
    }
    const tree = (await treeRes.json()) as { tree?: { path: string; type: string }[] }
    const files = (tree.tree ?? []).filter((f) => f.type === 'blob')
    rmSync(ARS_ROOT, { recursive: true, force: true })
    mkdirSync(ARS_ROOT, { recursive: true })
    let count = 0
    for (const f of files) {
      const rel = f.path
      const target = join(ARS_ROOT, rel)
      mkdirSync(target.slice(0, Math.max(target.lastIndexOf('/'), target.lastIndexOf('\\'))), { recursive: true })
      const rawRes = await fetch(`https://raw.githubusercontent.com/${remote}/${branch}/${f.path}`, {
        signal: AbortSignal.timeout(15_000)
      })
      if (rawRes.ok) {
        const buf = Buffer.from(await rawRes.arrayBuffer())
        if (buf.includes(0)) continue
        writeFileSync(target, buf)
        count++
      }
    }
    const meta2: ArsMeta = {
      version: branch,
      source: `github:${remote}`,
      installedAt: new Date().toISOString(),
      skills: listSkills(ARS_ROOT)
    }
    writeMeta(meta2)
    res.json({ ok: true, ...meta2, files: count })
  } catch (err) {
    res.status(500).json({ error: `安装失败：${err instanceof Error ? err.message : String(err)}` })
  }
})

// POST /api/ars/update — 动态更新：对比来源版本，有更新则备份旧版后重装
arsRouter.post('/ars/update', async (_req, res) => {
  const current = readMeta()
  const cache = findCacheVersionDir()
  if (!cache) {
    res.status(404).json({ error: '未找到可更新的来源（插件缓存）' })
    return
  }
  if (current && current.source === 'plugin-cache' && current.version === cache.version) {
    res.json({ ok: true, updated: false, version: current.version, message: '已是最新版本' })
    return
  }
  // 备份旧版
  if (current && existsSync(ARS_ROOT)) {
    const bak = join(DATA_ROOT, 'ars', `.bak-${Date.now()}`)
    cpSync(ARS_ROOT, bak, { recursive: true })
  }
  const meta = copyArs(cache.dir, cache.version, 'plugin-cache')
  res.json({ ok: true, updated: true, ...meta })
})

// POST /api/ars/deploy — 本地给 agent 安装（复制到检测到的 agent 技能目录）
arsRouter.post('/ars/deploy', (req, res) => {
  const target = String(req.body?.target ?? '')
  if (!['claude', 'codex', 'gemini', 'opencode', 'cline', 'deepseek'].includes(target)) {
    res.status(400).json({ error: '无效的 agent' })
    return
  }
  if (!existsSync(ARS_ROOT) || !existsSync(join(ARS_ROOT, 'academic-paper', 'SKILL.md'))) {
    res.status(404).json({ error: 'ARS 尚未内置，请先安装' })
    return
  }
  const dest = join(homedir(), `.${target}`, 'skills', 'ars')
  try {
    if (existsSync(dest)) rmSync(dest, { recursive: true, force: true })
    mkdirSync(dest, { recursive: true })
    cpSync(ARS_ROOT, dest, { recursive: true })
    res.json({ ok: true, dest })
  } catch (err) {
    res.status(500).json({ error: `部署失败：${err instanceof Error ? err.message : String(err)}` })
  }
})

// POST /api/ars/install-ppt — 安装 PPT 生成技能（easyslides 到 ARS_ROOT/ppt-slides）。
// 默认只装核心（根 SKILL.md + references/scripts/skills/projects，templates 模板库 13k+ 文件按需下载）。
arsRouter.post('/ars/install-ppt', async (req, res) => {
  const REPO = 'Rimagination/easyslides'
  const includeTemplates = req.body?.includeTemplates === true
  try {
    const r = await fetch(`https://api.github.com/repos/${REPO}`, {
      headers: { 'user-agent': 'oap', accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(10_000)
    })
    if (!r.ok) {
      res.status(404).json({ error: `无法访问 ${REPO}（${r.status}）` })
      return
    }
    const meta = (await r.json()) as { default_branch?: string }
    const branch = meta.default_branch ?? 'main'
    const treeRes = await fetch(`https://api.github.com/repos/${REPO}/git/trees/${branch}?recursive=1`, {
      headers: { 'user-agent': 'oap' },
      signal: AbortSignal.timeout(20_000)
    })
    if (!treeRes.ok) {
      res.status(500).json({ error: `获取文件树失败（${treeRes.status}）` })
      return
    }
    const tree = (await treeRes.json()) as { tree?: { path: string; type: string }[] }
    // 核心目录：根文件 + references/scripts/skills/projects；templates 默认排除（13k 文件/40MB）
    const files = (tree.tree ?? []).filter((f) => {
      if (f.type !== 'blob') return false
      if (includeTemplates) return true
      const top = f.path.split('/')[0]
      return top === 'references' || top === 'scripts' || top === 'skills' || top === 'projects' || !f.path.includes('/')
    })
    const dest = join(ARS_ROOT, 'ppt-slides')
    rmSync(dest, { recursive: true, force: true })
    mkdirSync(dest, { recursive: true })
    let count = 0
    let skipped = 0
    // 并发下载（6 路），显著加快大量小文件
    const CONCURRENCY = 6
    let cursor = 0
    const worker = async (): Promise<void> => {
      while (true) {
        const i = cursor++
        if (i >= files.length) return
        const f = files[i]
        const target = join(dest, f.path)
        const idx = Math.max(target.lastIndexOf('/'), target.lastIndexOf('\\'))
        mkdirSync(target.slice(0, idx), { recursive: true })
        const rawRes = await fetch(`https://raw.githubusercontent.com/${REPO}/${branch}/${f.path}`, {
          signal: AbortSignal.timeout(30_000)
        })
        if (rawRes.ok) {
          const buf = Buffer.from(await rawRes.arrayBuffer())
          if (buf.includes(0)) {
            skipped++
            continue
          }
          writeFileSync(target, buf)
          count++
        }
      }
    }
    await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()))
    // 更新 meta 中的 skills
    const meta2 = readMeta() ?? { version: '', source: '', installedAt: '', skills: [] }
    meta2.skills = listSkills(ARS_ROOT)
    writeMeta(meta2)
    res.json({
      ok: true,
      repo: REPO,
      branch,
      files: count,
      skipped,
      hasSkillMd: existsSync(join(dest, 'SKILL.md')),
      templatesInstalled: includeTemplates
    })
  } catch (err) {
    res.status(500).json({ error: `安装失败：${err instanceof Error ? err.message : String(err)}` })
  }
})
