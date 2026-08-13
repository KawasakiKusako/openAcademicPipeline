import { Router } from 'express'
import type { Response } from 'express'
import { readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { getDb, mapMessage, mapSession, mapTask, newId, now } from '../db'
import { arsSkillCatalogue, buildTaskInjection } from '../ars-skills'
import { projectSandboxRoot } from '../sandbox'
import { CliEngine } from '../claude/cli-engine'
import { ApiEngine, apiKeyConfigured } from '../claude/api-engine'
import {
  cliAvailable,
  cliVersion,
  configuredBaseUrl,
  configuredModel,
  cliTestSpawn,
  cliSpawnPrompt
} from '../claude/cli-engine'
import type { ClaudeStatus, ToolUse } from '../../shared/types'

export const chatRouter = Router()

const cliEngine = new CliEngine()
const apiEngine = new ApiEngine()

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
  if (abort.signal.aborted) child.kill()
  else abort.signal.addEventListener('abort', () => child.kill(), { once: true })

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
    '{"name":"<项目名称，10字以内>","type":"<paper-research|data-analysis|paper-check|group-meeting|research-report>","description":"<一句话描述研究目标>"}\n\n' +
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
chatRouter.get('/claude/status', (_req, res) => {
  const status: ClaudeStatus = {
    cliAvailable: cliAvailable(),
    cliVersion: cliVersion(),
    model: configuredModel(),
    apiKeyConfigured: apiKeyConfigured(),
    baseUrl: configuredBaseUrl()
  }
  res.json(status)
})

function sseSend(res: Response, event: string, data: unknown): void {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
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
  res.on('close', () => {
    if (!res.writableEnded) {
      console.log('[chat] client disconnected mid-stream, aborting engine')
      abort.abort()
    }
  })

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

  const finish = (status: 'idle' | 'error', extra: Record<string, unknown> = {}): void => {
    const end = now()
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
  }

  const onError = (err: Error): void => {
    if (!res.writableEnded) sseSend(res, 'error', { message: err.message })
    finish('error', { model: session.model })
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

      if (session.engine === 'cli') {
        const sandbox = String(project.sandbox_path ?? projectSandboxRoot(session.projectId))
        // Task skill injection: write CLAUDE.local.md (auto-loaded by the CLI
        // as supplemental system prompt). Avoids command-line length/escaping
        // limits entirely — the CLI reads it from the sandbox at startup.
        const localMdPath = join(sandbox, 'CLAUDE.local.md')
        if (injection) {
          writeFileSync(localMdPath, injection.text, 'utf-8')
        } else if (existsSync(localMdPath)) {
          rmSync(localMdPath, { force: true })
        }
        const result = await cliEngine.run({
          prompt: content,
          cwd: sandbox,
          sessionId: session.id,
          resume: session.claudeSessionId ?? undefined,
          signal: abort.signal,
          onError,
          onText: (delta) => {
            if (!res.writableEnded) sseSend(res, 'text', { delta })
          },
          onToolUse: (tool: ToolUse) => {
            if (!res.writableEnded) sseSend(res, 'tool_use', tool)
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
        })
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
        finish('idle', { model: apiEngine.model })
        autoTitleSession(id)
      }
    } catch (err) {
      // onError already handled engine failures; this catches unexpected ones
      if (err instanceof Error && !abort.signal.aborted) {
        onError(err)
      } else {
        finish('idle')
        if (!res.writableEnded) res.end()
      }
    }
  }

  run()
})
