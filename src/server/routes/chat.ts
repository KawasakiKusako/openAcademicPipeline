import { Router } from 'express'
import type { Response } from 'express'
import { readFileSync, writeFileSync, rmSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { getDb, mapMessage, mapSession, mapTask, newId, now } from '../db'
import { getSetting } from '../settings'
import { getPersonalizationFields } from '../personalization'
import { ensureStyleScript } from './style'
import { arsSkillCatalogue, buildTaskInjection } from '../ars-skills'
import { projectSandboxRoot } from '../sandbox'
import { DATA_ROOT } from '../paths'
import { CliEngine } from '../claude/cli-engine'
import { ApiEngine, apiKeyConfigured } from '../claude/api-engine'
// 权限 hook 脚本源码（构建期内嵌，?raw）——运行时写到 DATA_ROOT 磁盘路径。
// 旧实现用 `join(__dirname, '../../../scripts/perm-hook.js')` 相对路径：
// dev 下 __dirname=out/main 解析到项目外（E:\GeneralProject\scripts），
// 打包后 scripts/ 根本未进 asar —— 两种环境 hook 都启动失败、弹窗链路断开。
import permHookSource from '../../../scripts/perm-hook.js?raw'
import {
  cliAvailable,
  cliVersionAsync,
  configuredBaseUrl,
  configuredModel,
  cliTestSpawn,
  cliSpawnPrompt,
  killChildTree
} from '../claude/cli-engine'
import type { ClaudeStatus, ToolUse } from '../../shared/types'

export const chatRouter = Router()

const cliEngine = new CliEngine()
const apiEngine = new ApiEngine()

// 运行中会话注册表：供 /sessions/:id/stop 主动终止引擎（不依赖前端断连）。
// 值带请求代际 gen——registry 槽位即所有权令牌：
//  stop 端点删除条目 = 宣布旧代作废；新 POST 覆盖条目 = 新代接管。
// 旧 run 的任何迟到回调（5s 兜底 / res-close / 硬超时）发现 gen 不是当前代时，
// 不得写 DB、不得删 registry，避免污染新 run 的状态。
interface RunningRun {
  controller: AbortController
  gen: number
}
const runningSessions = new Map<string, RunningRun>()
let nextGen = 1
const isCurrent = (id: string, gen: number): boolean => runningSessions.get(id)?.gen === gen

// POST /api/sessions/:id/stop — 主动停止运行中的会话（停止按钮双保险）
chatRouter.post('/sessions/:id/stop', (req, res) => {
  const id = req.params.id
  const entry = runningSessions.get(id)
  if (entry) {
    entry.controller.abort()
    runningSessions.delete(id)
  }
  // 立即复位状态（无论引擎是否响应，保证停止后可立即重发）。
  // 同时清空 claude_session_id：被强杀的 CC 会话锁未释放（--resume 会报
  // "Session ID already in use"），下一次 run 必须开全新 CC 会话。
  getDb()
    .prepare(`UPDATE sessions SET status = 'idle', claude_session_id = NULL, updated_at = ? WHERE id = ?`)
    .run(now(), id)
  res.json({ ok: true, stopped: Boolean(entry) })
})

// 临时对话（托盘悬浮窗）：不绑定项目/会话，消息历史由前端随请求传递
chatRouter.post('/temp/chat', (req, res) => {
  const content = String(req.body?.content ?? '').trim()
  if (!content) {
    res.status(400).json({ error: '消息内容不能为空' })
    return
  }
  const history = (req.body?.history ?? []) as { role: 'user' | 'assistant'; content: string }[]

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive'
  })
  const abort = new AbortController()
  res.on('close', () => {
    if (!res.writableEnded) abort.abort()
  })

  // 将历史拼入提示词（无沙盒的临时对话）
  const prompt = [
    ...history.map((h) => `【${h.role === 'user' ? '用户' : 'AI'}】\n${h.content}`),
    `【用户】\n${content}`
  ].join('\n\n')

  const child = cliSpawnPrompt(prompt)
  if (abort.signal.aborted) killChildTree(child)
  else abort.signal.addEventListener('abort', () => killChildTree(child), { once: true })

  let lineBuffer = ''
  let sentDone = false
  child.stdout?.setEncoding('utf-8')
  child.stdout?.on('data', (chunk: string) => {
    lineBuffer += chunk
    let idx: number
    while ((idx = lineBuffer.indexOf('\n')) >= 0) {
      const line = lineBuffer.slice(0, idx).trim()
      lineBuffer = lineBuffer.slice(idx + 1)
      if (!line) continue
      try {
        const ev = JSON.parse(line) as { type?: string; message?: { content?: { type?: string; text?: string }[] } }
        if (ev.type === 'assistant' && ev.message?.content) {
          for (const block of ev.message.content) {
            if (block.type === 'text' && block.text) {
              if (!res.writableEnded) sseSend(res, 'text', { delta: block.text })
            }
          }
        }
      } catch {
        // skip
      }
    }
  })
  child.on('close', (code) => {
    if (sentDone) return
    sentDone = true
    if (code === 0) {
      if (!res.writableEnded) sseSend(res, 'done', {})
      if (!res.writableEnded) res.end()
    } else {
      if (!res.writableEnded) sseSend(res, 'error', { message: `CLI 退出码 ${code}` })
      if (!res.writableEnded) res.end()
    }
  })
  child.on('error', (err) => {
    if (sentDone) return
    sentDone = true
    if (!res.writableEnded) sseSend(res, 'error', { message: `无法启动 CLI：${err.message}` })
    if (!res.writableEnded) res.end()
  })
})

// 临时对话（汇报助手/悬浮窗）：走原生 API 引擎（响应快，无需 spawn CLI）。
// 支持 system（导入文件上下文）与 effort（思考强度，按请求覆盖）。
chatRouter.post('/temp/chat-api', (req, res) => {
  if (!apiKeyConfigured()) {
    res.status(400).json({ error: '未配置 API Key，请到 设置 → API 直连 配置' })
    return
  }
  const content = String(req.body?.content ?? '').trim()
  if (!content) {
    res.status(400).json({ error: '消息内容不能为空' })
    return
  }
  const system = typeof req.body?.system === 'string' ? req.body.system : undefined
  const model = typeof req.body?.model === 'string' && req.body.model.trim() ? req.body.model.trim() : undefined
  const effort = (['low', 'medium', 'high', 'max'] as const).includes(req.body?.effort)
    ? (req.body.effort as 'low' | 'medium' | 'high' | 'max')
    : undefined
  const history = (req.body?.history ?? []) as { role: 'user' | 'assistant'; content: string }[]

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive'
  })
  const abort = new AbortController()
  res.on('close', () => {
    if (!res.writableEnded) abort.abort()
  })

  apiEngine
    .run({
      prompt: content,
      system,
      effort,
      model,
      history: history.map((h, i) => ({
        id: `tmp-${i}`,
        sessionId: '',
        role: h.role,
        content: h.content,
        toolUses: [],
        createdAt: ''
      })),
      signal: abort.signal,
      onError: (err) => {
        if (!res.writableEnded) sseSend(res, 'error', { message: err.message })
      },
      onText: (delta) => {
        if (!res.writableEnded) sseSend(res, 'text', { delta })
      }
    })
    .then(() => {
      if (!res.writableEnded) {
        sseSend(res, 'done', {})
        res.end()
      }
    })
    .catch((err: Error) => {
      if (!res.writableEnded) {
        sseSend(res, 'error', { message: err.message })
        res.end()
      }
    })
})

// ARS skill catalogue for the task creator / task badges
chatRouter.get('/ars-skills', (_req, res) => {
  res.json(arsSkillCatalogue())
})

// 想法 → 项目建议（项目总览页的对话创建项目）
chatRouter.post('/chat-idea', (req, res) => {
  const text = String(req.body?.text ?? '').trim()
  if (!text) {
    res.status(400).json({ error: '请输入你的想法' })
    return
  }
  const prompt =
    '根据以下研究想法，生成一个项目建议。只输出一个 JSON 对象，不要任何其他文字：' +
    '{"name":"<项目名称，10字以内>","type":"<paper-research|data-analysis|paper-check|group-meeting|research-report|presentation>","description":"<一句话描述研究目标>"}\n\n' +
    `研究想法：${text}`

  let child
  try {
    child = cliSpawnPrompt(prompt)
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : '无法启动 CLI' })
    return
  }

  let out = ''
  const timer = setTimeout(() => child.kill(), 60_000)
  child.stdout?.setEncoding('utf-8')
  child.stderr?.setEncoding('utf-8')
  child.stdout?.on('data', (c: string) => (out += c))

  child.on('close', (code) => {
    clearTimeout(timer)
    if (code !== 0) {
      res.status(500).json({ error: '生成失败，请稍后重试' })
      return
    }
    // collect assistant text from stream-json events, then extract the JSON object
    const textParts: string[] = []
    for (const line of out.split(/\r?\n/)) {
      try {
        const ev = JSON.parse(line) as { type?: string; message?: { content?: { type?: string; text?: string }[] } }
        if (ev.type === 'assistant' && ev.message?.content) {
          for (const block of ev.message.content) {
            if (block.type === 'text' && block.text) textParts.push(block.text)
          }
        }
      } catch {
        // skip non-json lines
      }
    }
    const combined = textParts.join('')
    let suggestion: { name?: string; type?: string; description?: string } | null = null
    try {
      const parsed = extractJsonObject(combined) as { name?: string; type?: string; description?: string } | null
      suggestion = parsed
    } catch {
      suggestion = null
    }
    res.json({ suggestion })
  })
})

// Claude Code link test: real end-to-end probe with a minimal prompt
chatRouter.post('/claude/test', (_req, res) => {
  const start = Date.now()
  const child = cliTestSpawn()
  let out = ''
  let err = ''
  const timer = setTimeout(() => child.kill(), 30_000)
  child.stdout?.on('data', (c: string) => (out += c))
  child.stderr?.on('data', (c: string) => (err += c))
  child.on('error', (e) => {
    clearTimeout(timer)
    res.json({ ok: false, latencyMs: Date.now() - start, detail: `无法启动 CLI：${e.message}` })
  })
  child.on('close', (code) => {
    clearTimeout(timer)
    if (code === 0 && out.trim()) {
      res.json({ ok: true, latencyMs: Date.now() - start, detail: out.trim().slice(0, 120) })
    } else {
      res.json({
        ok: false,
        latencyMs: Date.now() - start,
        detail: (err.trim() || `退出码 ${code}`).slice(0, 300)
      })
    }
  })
})

// Claude Code / API environment status (for the UI footer and engine fallback)
// async：版本探测走异步 spawn（见 cliVersionAsync），绝不阻塞主进程事件循环
chatRouter.get('/claude/status', async (_req, res) => {
  const status: ClaudeStatus = {
    cliAvailable: cliAvailable(),
    cliVersion: await cliVersionAsync(),
    model: configuredModel(),
    apiKeyConfigured: apiKeyConfigured(),
    baseUrl: configuredBaseUrl()
  }
  res.json(status)
})

function sseSend(res: Response, event: string, data: unknown): void {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
}

// 信任沙盒工作区：未信任的工作区会被 Claude Code 忽略 .claude/settings.json 的
// permissions.allow 白名单 → 每个 Bash 命令都触发权限弹窗（遮罩层挡住全部输入，
// 表现为"开新对话整个 OAP 卡住"）。OAP 自己 spawn 的 CLI 等同于用户交互式确认，
// 因此写入 ~/.claude.json 的 projects[key].hasTrustDialogAccepted = true（合并式，不动其他配置）。
function trustSandbox(sandbox: string): void {
  try {
    const cfgPath = join(homedir(), '.claude.json')
    let cfg: Record<string, unknown> = {}
    try {
      cfg = JSON.parse(readFileSync(cfgPath, 'utf-8')) as Record<string, unknown>
    } catch {
      cfg = {}
    }
    const projects = (typeof cfg['projects'] === 'object' && cfg['projects'] !== null
      ? cfg['projects']
      : {}) as Record<string, unknown>
    const key = sandbox.replace(/\\/g, '/')
    const entry = (projects[key] ?? {}) as Record<string, unknown>
    if (entry['hasTrustDialogAccepted'] !== true) {
      projects[key] = { ...entry, hasTrustDialogAccepted: true }
      writeFileSync(cfgPath, JSON.stringify({ ...cfg, projects }, null, 2), 'utf-8')
      console.log('[chat] sandbox trusted:', key)
    }
  } catch {
    // 信任写入失败不阻断会话（退化为逐命令弹窗确认）
  }
}

// AI 改样式工具说明（仅全局会话注入 CLAUDE.local.md）：
// 让 AI 通过 oap-style.js 用自然语言帮用户修改个性化设置。
let styleToolBlockCache: string | null = null
function buildStyleToolBlock(): string {
  if (styleToolBlockCache) return styleToolBlockCache
  const script = ensureStyleScript().replace(/\\/g, '/')
  const fields = getPersonalizationFields()
    .map((f) => {
      const opts =
        f.type === 'select' && f.options
          ? `，可选：${f.options.map((o) => o.value).join(' | ')}`
          : ''
      return `- ${f.key}（${f.type}${opts}）：${f.label}`
    })
    .join('\n')
  styleToolBlockCache = [
    '【个性化设置工具】',
    '用户可能用自然语言要求修改本应用的界面样式/个性化设置。你可以通过 Bash 执行以下命令完成修改（修改后立即生效）：',
    `node "${script}" --list   # 查看全部字段与当前值`,
    `node "${script}" theme=light bgColor=#222831 radiusMode=sharp   # 批量修改`,
    '可用字段：',
    fields,
    '禁止修改列表之外的字段 key；布尔字段取值 true/false。'
  ].join('\n')
  return styleToolBlockCache
}

// 权限 hook 脚本：内容变化时写入 DATA_ROOT，返回可被 `node` 执行的绝对路径。
// dev 与打包产物都保证指向磁盘上真实存在的文件。
let permHookPath: string | null = null
function ensurePermHook(): string {
  if (permHookPath) return permHookPath
  const target = join(DATA_ROOT, 'perm-hook.js')
  mkdirSync(DATA_ROOT, { recursive: true })
  try {
    if (readFileSync(target, 'utf-8') !== permHookSource) {
      writeFileSync(target, permHookSource, 'utf-8')
    }
  } catch {
    writeFileSync(target, permHookSource, 'utf-8')
  }
  permHookPath = target
  return target
}

// 非任务会话：第一条回复完成后自动生成标题（异步，不阻塞响应）
let titling: Promise<void> = Promise.resolve()
function autoTitleSession(sessionId: string): void {
  const db = getDb()
  const sessionRow = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId) as
    | Record<string, unknown>
    | undefined
  if (!sessionRow) return
  const session = mapSession(sessionRow)
  if (session.taskId) return // 任务会话保留任务名
  if (!/^(新会话|全局会话|文件讨论)$/.test(session.title)) return // 已有自定义标题

  const messages = (db
    .prepare('SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC LIMIT 3')
    .all(sessionId) as Record<string, unknown>[])
    .map(mapMessage)
  const summary = messages
    .map((m) => `${m.role === 'user' ? '问' : '答'}: ${m.content.slice(0, 120)}`)
    .join('\n')
  if (!summary.trim()) return

  // 串行排队，避免多个会话同时 spawn 标题生成
  titling = titling.then(() => {
    return new Promise<void>((resolve) => {
      try {
        const child = cliSpawnPrompt(
          `根据以下对话内容，生成一个不超过12个字的会话标题（只输出标题本身，不要引号）：\n\n${summary}`
        )
        let out = ''
        let settled = false
        const timer = setTimeout(() => {
          if (!settled) {
            settled = true
            child.kill()
            resolve()
          }
        }, 30_000)
        child.stdout?.setEncoding('utf-8')
        child.stdout?.on('data', (c: string) => (out += c))
        child.on('close', () => {
          clearTimeout(timer)
          if (settled) return
          settled = true
          // 从 stream-json 提取文本
          let title = ''
          for (const line of out.split(/\r?\n/)) {
            try {
              const ev = JSON.parse(line) as {
                type?: string
                message?: { content?: { type?: string; text?: string }[] }
              }
              if (ev.type === 'assistant' && ev.message?.content) {
                for (const b of ev.message.content) {
                  if (b.type === 'text' && b.text) title += b.text
                }
              }
            } catch {
              // skip
            }
          }
          title = title.trim().replace(/["']/g, '').slice(0, 20)
          if (title && !/^(新会话|全局会话|文件讨论)$/.test(title)) {
            getDb()
              .prepare('UPDATE sessions SET title = ?, updated_at = ? WHERE id = ?')
              .run(title, now(), sessionId)
          }
          resolve()
        })
      } catch {
        resolve()
      }
    })
  })
}

// Balance-brace JSON extractor: finds the first top-level {...} object in text
function extractJsonObject(text: string): unknown | null {
  const start = text.indexOf('{')
  if (start < 0) return null
  let depth = 0
  let inStr = false
  let escape = false
  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (inStr) {
      if (escape) escape = false
      else if (ch === '\\') escape = true
      else if (ch === '"') inStr = false
      continue
    }
    if (ch === '"') inStr = true
    else if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start, i + 1))
        } catch {
          return null
        }
      }
    }
  }
  return null
}

// Mirror every message into <sandbox>/.chat_cache.json (project-visible chat log)
function appendChatCache(sandbox: string, entry: { role: string; content: string; sessionId: string; createdAt: string }): void {
  try {
    const file = join(sandbox, '.chat_cache.json')
    let arr: unknown[] = []
    try {
      arr = JSON.parse(readFileSync(file, 'utf-8')) as unknown[]
    } catch {
      arr = []
    }
    arr.push(entry)
    writeFileSync(file, JSON.stringify(arr, null, 2), 'utf-8')
  } catch {
    // never break the chat flow for a cache write failure
  }
}

// POST /api/sessions/:id/chat — stream one user message through the session's engine
chatRouter.post('/sessions/:id/chat', (req, res) => {
  const { id } = req.params
  const content = String(req.body?.content ?? '').trim()
  if (!content) {
    res.status(400).json({ error: '消息内容不能为空' })
    return
  }

  const db = getDb()
  const row = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id)
  if (!row) {
    res.status(404).json({ error: '会话不存在' })
    return
  }
  const session = mapSession(row as Record<string, unknown>)
  if (session.status === 'running') {
    res.status(409).json({ error: '会话正在运行中，请等待完成' })
    return
  }

  const project = db
    .prepare('SELECT * FROM projects WHERE id = ?')
    .get(session.projectId) as Record<string, unknown> | undefined
  if (!project) {
    res.status(404).json({ error: '项目不存在' })
    return
  }

  // Persist the user message immediately
  const userMsgId = newId()
  const ts = now()
  db.prepare(
    `INSERT INTO messages (id, session_id, role, content, tool_uses, created_at)
     VALUES (?, ?, 'user', ?, '[]', ?)`
  ).run(userMsgId, id, content, ts)
  db.prepare(`UPDATE sessions SET status = 'running', updated_at = ? WHERE id = ?`).run(ts, id)

  // mirror to the project chat cache file (for any tool that reads the sandbox)
  try {
    const sandbox = String(project.sandbox_path ?? projectSandboxRoot(session.projectId))
    appendChatCache(sandbox, { role: 'user', content, sessionId: id, createdAt: ts })
  } catch {
    // ignore
  }

  // Stream setup; abort on client disconnect.
  // NOTE: `req` close fires as soon as the request body is consumed (Node 22+),
  // so we watch `res` close instead — it fires when the response stream ends,
  // and writableEnded=false means the client went away mid-stream.
  const abort = new AbortController()
  // 本次请求的代际号：先于所有 setTimeout 回调捕获（规避 TDZ），
  // finish 通过 isCurrent(id, gen) 校验自己仍是当前代才允许写状态。
  const gen = nextGen++
  res.on('close', () => {
    if (!res.writableEnded) {
      console.log('[chat] client disconnected mid-stream, aborting engine')
      abort.abort()
      // 立即复位会话状态（finish 定义在后面，用 setTimeout 规避 TDZ）：
      // 防止 CLI 子进程残留导致 run 挂起、状态卡 running（下次输入 409）。
      // 断连=中止：清空 claude_session_id（CC 会话锁未释放，下次开全新会话）。
      setTimeout(() => finish('idle', { claude_session_id: null }, gen), 0)
    }
  })
  runningSessions.set(id, { controller: abort, gen })
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive'
  })
  // Client may disconnect mid-stream; writes to a dead socket must not crash
  res.on('error', (e) => {
    console.log('[chat] res error:', (e as Error).message)
    if (!abort.signal.aborted) abort.abort()
  })

  // 硬超时（活动感知）：大型任务（论文写作/长分析）可能持续数十分钟，
  // 固定时限会误杀——改为"10 分钟无任何输出才强制收敛"（真死锁兜底）。
  // 每次 SSE 输出（text/tool_use）都重新计时。
  let hardTimeout: ReturnType<typeof setTimeout>
  const armHardTimeout = (): void => {
    clearTimeout(hardTimeout)
    hardTimeout = setTimeout(() => {
      console.log('[chat] session hard timeout, forcing idle')
      abort.abort()
      setTimeout(() => finish('error', { claude_session_id: null }, gen), 0)
    }, 10 * 60 * 1000)
  }
  armHardTimeout()

  // finish 幂等：onError / catch / 断连复位 / 超时 多条路径可能触发，只生效一次。
  // 代际校验：stop 端点删除 registry（旧代作废，且已写 idle）或新 POST 覆盖 registry
  // （新代接管）后，本请求的任何迟到回调一律 skip——不覆盖 stop 的复位、不污染新 run。
  let finished = false
  const finish = (status: 'idle' | 'error', extra: Record<string, unknown> = {}, gen: number): void => {
    if (finished) return
    finished = true
    clearTimeout(hardTimeout)
    if (!isCurrent(id, gen)) return
    runningSessions.delete(id)
    const end = now()
    try {
      const entries = Object.entries(extra)
      const setFields = entries.length > 0 ? `, ${entries.map(([k]) => `${k} = ?`).join(', ')}` : ''
      const values: (string | number | null)[] = entries.map(([, v]) => v as string | number | null)
      db.prepare(
        `UPDATE sessions SET status = ?, updated_at = ?${setFields} WHERE id = ?`
      ).run(status, end, ...values, id)

      // Handover: a completed session flips its linked task to in_progress
      if (status === 'idle' && session.taskId) {
        db.prepare(
          `UPDATE tasks SET status = 'in_progress', updated_at = ? WHERE id = ? AND status = 'todo'`
        ).run(end, session.taskId)
      }
    } catch (err) {
      // 状态写失败不能逃逸（否则 unhandled rejection 且卡 running）；
      // registry 已删，stop 端点仍可自愈复位。
      console.error('[chat] finish db error:', err)
    }
  }

  const onError = (err: Error): void => {
    if (!res.writableEnded) sseSend(res, 'error', { message: err.message })
    finish('error', { model: session.model }, gen)
    if (!res.writableEnded) res.end()
  }

  const run = async (): Promise<void> => {
    try {
      // Task-linked sessions inject the task prompt and its ARS skill
      // (SKILL.md from the local plugin) as extra system context.
      const taskRow = session.taskId
        ? (db.prepare('SELECT * FROM tasks WHERE id = ?').get(session.taskId) as
            | Record<string, unknown>
            | undefined)
        : undefined
      const task = taskRow ? mapTask(taskRow) : undefined
      const injection = task ? buildTaskInjection(task) : null
      // 演示文稿任务：把项目状态（任务/会话/文献概览）附入注入文本，让 AI 基于项目-任务上下文生成
      if (injection && task?.type === 'presentation-slide') {
        const tasks = (db
          .prepare('SELECT name, type, status FROM tasks WHERE project_id = ? AND id != ? ORDER BY position')
          .all(session.projectId, task.id) as { name: string; type: string; status: string }[])
          .slice(0, 20)
        const lits = (db
          .prepare('SELECT title, year FROM literature WHERE project_id = ? ORDER BY created_at DESC LIMIT 15')
          .all(session.projectId) as { title: string; year: number | null }[])
        const ctx = [
          `【项目状态（供演示内容取材）】`,
          `项目：${project.name ?? ''}`,
          `描述：${project.description ?? ''}`,
          '',
          '【项目任务】',
          ...(tasks.length ? tasks.map((x) => `- [${x.status}] ${x.name}（${x.type}）`) : ['（无）']),
          '',
          '【知识库文献】',
          ...(lits.length ? lits.map((l) => `- ${l.title}${l.year ? `（${l.year}）` : ''}`) : ['（无）'])
        ].join('\n')
        injection.text = `${injection.text}\n\n${ctx}\n`
      }

      if (session.engine === 'cli') {
        const sandbox = String(project.sandbox_path ?? projectSandboxRoot(session.projectId))
        // 信任沙盒：未信任的 CLI 会忽略 permissions.allow 白名单 → 逐命令弹窗
        trustSandbox(sandbox)
        // Task skill injection: write CLAUDE.local.md (auto-loaded by the CLI
        // as supplemental system prompt). Avoids command-line length/escaping
        // limits entirely — the CLI reads it from the sandbox at startup.
        const localMdPath = join(sandbox, 'CLAUDE.local.md')
        // 全局会话（无任务）注入"AI 改样式工具"说明；任务会话保持纯技能上下文
        const styleBlock = session.taskId ? null : buildStyleToolBlock()
        if (injection || styleBlock) {
          writeFileSync(localMdPath, [injection?.text, styleBlock].filter(Boolean).join('\n\n'), 'utf-8')
        } else if (existsSync(localMdPath)) {
          rmSync(localMdPath, { force: true })
        }
        // 权限确认 Hook：无交互模式下 CLI 的授权弹窗无法送达用户，
        // 配置 PreToolUse hook → perm-hook.js（DATA_ROOT 磁盘路径）→ OAP 桌面弹窗逐命令确认。
        // 「完全信任模式」开启时跳过（见 cli-engine）。
        if (!getSetting<boolean>('cliTrustedMode', false)) {
          try {
            const claudeDir = join(sandbox, '.claude')
            mkdirSync(claudeDir, { recursive: true })
            const settingsPath = join(claudeDir, 'settings.json')
            const hookCommand = `node "${ensurePermHook()}"`
            let current: {
              permissions?: { allow?: string[] }
              hooks?: Record<string, { matcher?: string; hooks: { type: string; command: string }[] }[]>
            } = {}
            try {
              current = JSON.parse(readFileSync(settingsPath, 'utf-8')) as typeof current
            } catch {
              current = {}
            }
            // 注入 PreToolUse(Bash) hook（不覆盖用户已有 hook 配置）。
            // 注意：先清掉历史写入的旧 perm-hook 条目（早期版本路径解析错误），
            // 再追加当前正确路径的条目——旧条目会短路新条目，必须替换。
            const hooks = current.hooks ?? {}
            const preTool = (hooks['PreToolUse'] ?? [])
              .map((h) =>
                h.matcher === 'Bash'
                  ? { ...h, hooks: h.hooks.filter((x) => !x.command.includes('perm-hook.js')) }
                  : h
              )
              .filter((h) => !(h.matcher === 'Bash' && h.hooks.length === 0))
            preTool.push({
              matcher: 'Bash',
              hooks: [{ type: 'command', command: hookCommand }]
            })
            hooks['PreToolUse'] = preTool
            const next = JSON.stringify({ ...current, hooks }, null, 2)
            let prev = ''
            try {
              prev = readFileSync(settingsPath, 'utf-8')
            } catch {
              // 文件不存在
            }
            if (next !== prev) writeFileSync(settingsPath, next, 'utf-8')
          } catch {
            // hook 配置写入失败不阻断会话
          }
        }
        const result = await cliEngine.run({
          prompt: content,
          cwd: sandbox,
          sessionId: session.id,
          resume: session.claudeSessionId ?? undefined,
          signal: abort.signal,
          onError,
          onText: (delta) => {
            armHardTimeout()
            if (!res.writableEnded) sseSend(res, 'text', { delta })
          },
          onToolUse: (tool: ToolUse) => {
            armHardTimeout()
            if (!res.writableEnded) sseSend(res, 'tool_use', tool)
          },
          // 「总是允许」→ 把命令加入沙盒白名单（下次自动放行）
          onPermissionGranted: (_action, command) => {
            try {
              const cmd = command.trim().split(/\s+/)[0]
              if (!cmd) return
              const claudeDir = join(sandbox, '.claude')
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
            } catch {
              // 白名单写入失败不阻断
            }
          }
        })
        const msgId = newId()
        const msgTs = now()
        db.prepare(
          `INSERT INTO messages (id, session_id, role, content, tool_uses, created_at)
           VALUES (?, ?, 'assistant', ?, ?, ?)`
        ).run(msgId, id, result.text, JSON.stringify(result.toolUses), msgTs)
        appendChatCache(sandbox, { role: 'assistant', content: result.text, sessionId: id, createdAt: msgTs })
        if (!res.writableEnded) {
          sseSend(res, 'done', { messageId: msgId, claudeSessionId: result.claudeSessionId })
          res.end()
        }
        finish('idle', {
          claude_session_id: result.claudeSessionId ?? session.claudeSessionId,
          model: session.model,
          cost: result.cost ?? session.cost
        }, gen)
        autoTitleSession(id)
      } else {
        // API fallback engine: read the sandbox CLAUDE.md as the system prompt,
        // and rebuild conversation history from persisted messages.
        const sandbox = String(project.sandbox_path ?? projectSandboxRoot(session.projectId))
        const claudeMdPath = join(sandbox, 'CLAUDE.md')
        const baseSystem = existsSync(claudeMdPath) ? readFileSync(claudeMdPath, 'utf-8') : ''
        const system = injection ? `${baseSystem}\n\n${injection.text}` : baseSystem || undefined
        const history = (db
          .prepare('SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC')
          .all(id) as Record<string, unknown>[])
          .map(mapMessage)

        const result = await apiEngine.run({
          prompt: content,
          system,
          history,
          signal: abort.signal,
          onError,
          onText: (delta) => {
            armHardTimeout()
            if (!res.writableEnded) sseSend(res, 'text', { delta })
          }
        })
        const msgId = newId()
        db.prepare(
          `INSERT INTO messages (id, session_id, role, content, tool_uses, created_at)
           VALUES (?, ?, 'assistant', ?, '[]', ?)`
        ).run(msgId, id, result.text, now())
        if (!res.writableEnded) {
          sseSend(res, 'done', { messageId: msgId })
          res.end()
        }
        finish('idle', { model: apiEngine.model }, gen)
        autoTitleSession(id)
      }
    } catch (err) {
      // onError already handled engine failures; this catches unexpected ones
      if (err instanceof Error && !abort.signal.aborted) {
        onError(err)
      } else {
        // 中止路径：清空 claude_session_id（CC 会话锁未释放，下次开全新会话）
        finish('idle', { claude_session_id: null }, gen)
        if (!res.writableEnded) res.end()
      }
    }
  }

  run().catch((err) => {
    // 兜底：run 内未捕获的同步/异步异常也必须收敛会话状态，
    // 否则 status 卡 running 导致后续输入 409。
    console.error('[chat] run unexpected error:', err)
    if (!finished) {
      onError(err instanceof Error ? err : new Error(String(err)))
    }
    if (!res.writableEnded) res.end()
  })
})
