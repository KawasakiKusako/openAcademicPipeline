import { spawn, spawnSync } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { getCliModelOverride, getEffort } from '../settings'
import type { ChatEngine, EngineResult, RunChatOptions } from './engine'
import type { ToolUse } from '../../shared/types'

// Resolve the `claude` executable (npm global installs `claude.cmd` on Windows).
let claudePath: string | null | undefined

function resolveClaude(): string | null {
  if (claudePath !== undefined) return claudePath
  try {
    const where = spawnSync(
      process.platform === 'win32' ? 'where' : 'which',
      [process.platform === 'win32' ? 'claude.cmd' : 'claude'],
      { encoding: 'utf-8' }
    )
    if (where.status === 0 && where.stdout.trim()) {
      claudePath = where.stdout.trim().split(/\r?\n/)[0]
    } else {
      claudePath = null
    }
  } catch {
    claudePath = null
  }
  return claudePath
}

export function cliAvailable(): boolean {
  return resolveClaude() !== null
}

export function cliVersion(): string | null {
  const path = resolveClaude()
  if (!path) return null
  try {
    const v = spawnSync(path, ['--version'], {
      encoding: 'utf-8',
      timeout: 10_000,
      shell: process.platform === 'win32' && /\.(cmd|bat)$/i.test(path)
    })
    return v.status === 0 ? v.stdout.trim() || null : null
  } catch {
    return null
  }
}

// Model as configured by cc-switch / user settings (settings.json env).
export function configuredModel(): string | null {
  const settingsPath = join(homedir(), '.claude', 'settings.json')
  try {
    if (existsSync(settingsPath)) {
      const settings = JSON.parse(readFileSync(settingsPath, 'utf-8')) as {
        env?: Record<string, string>
      }
      const model = settings.env?.ANTHROPIC_MODEL
      if (model) return model
    }
  } catch {
    // ignore unreadable settings
  }
  return process.env['ANTHROPIC_MODEL'] ?? null
}

// Generic one-shot prompt via the CLI (stream-json). Returns the child process.
export function cliSpawnPrompt(prompt: string): ReturnType<typeof spawn> {
  const path = resolveClaude()
  if (!path) throw new Error('未找到 claude 命令')
  const args = ['--output-format', 'stream-json', '--verbose', '-p']
  const effort = getEffort()
  if (effort && effort !== 'medium') {
    process.env['CLAUDE_CODE_EFFORT_LEVEL'] = effort
  }
  // The prompt goes via stdin so cmd.exe never sees its special characters.
  const child = spawn(path, args, {
    shell: process.platform === 'win32' && /\.(cmd|bat)$/i.test(path),
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe']
  })
  child.stdin?.write(prompt)
  child.stdin?.end()
  return child
}

// Minimal probe spawn for the "test Claude Code link" feature
export function cliTestSpawn(): ReturnType<typeof spawn> {
  const path = resolveClaude()
  if (!path) throw new Error('未找到 claude 命令')
  const args = ['--output-format', 'stream-json', '--verbose', '-p']
  const effort = getEffort()
  if (effort && effort !== 'medium') {
    process.env['CLAUDE_CODE_EFFORT_LEVEL'] = effort
  }
  const child = spawn(path, args, {
    shell: process.platform === 'win32' && /\.(cmd|bat)$/i.test(path),
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe']
  })
  child.stdin?.write('只回复：OK')
  child.stdin?.end()
  return child
}

export function configuredBaseUrl(): string | null {
  const settingsPath = join(homedir(), '.claude', 'settings.json')
  try {
    if (existsSync(settingsPath)) {
      const settings = JSON.parse(readFileSync(settingsPath, 'utf-8')) as {
        env?: Record<string, string>
      }
      const url = settings.env?.ANTHROPIC_BASE_URL
      if (url) return url
    }
  } catch {
    // ignore
  }
  return process.env['ANTHROPIC_BASE_URL'] ?? null
}

interface StreamJsonEvent {
  type: string
  subtype?: string
  [key: string]: unknown
}

function spawnCli(
  prompt: string,
  opts: { sessionId?: string; resume?: string; cwd?: string }
): ReturnType<typeof spawn> {
  const path = resolveClaude()
  if (!path) throw new Error('未找到 claude 命令，请先安装 Claude Code（或使用 API 引擎）')

  // NOTE: `--output-format stream-json` with `-p` requires `--verbose` on
  // current Claude Code versions, otherwise the CLI exits with code 1.
  // The prompt is passed via STDIN (`-p` with no argument reads stdin) — this
  // avoids cmd.exe mangling special characters (| < > ") in the argument.
  const args: string[] = ['--output-format', 'stream-json', '--verbose', '-p']
  if (opts.resume) {
    args.push('--resume', opts.resume)
  } else {
    args.push('--session-id', opts.sessionId ?? crypto.randomUUID())
  }
  // Model override from settings; empty means inherit cc-switch config
  const modelOverride = getCliModelOverride()
  if (modelOverride) {
    args.push('--model', modelOverride)
  }
  // Thinking effort via env var (some CLI versions reject --effort-level)
  const effort = getEffort()
  if (effort && effort !== 'medium') {
    process.env['CLAUDE_CODE_EFFORT_LEVEL'] = effort
  }
  // Allow file edits (Read/Glob/Grep are available read-only by default);
  // the sandbox cwd constrains what the session can touch.
  args.push('--permission-mode', 'acceptEdits')

  // .cmd/.bat wrappers on Windows require a shell; Node quotes args safely.
  // Prompt travels via stdin so cmd.exe never mangles special characters.
  const child = spawn(path, args, {
    cwd: opts.cwd ?? process.cwd(),
    shell: process.platform === 'win32' && /\.(cmd|bat)$/i.test(path),
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe']
  })
  child.stdin?.write(prompt)
  child.stdin?.end()
  return child
}

export class CliEngine implements ChatEngine {
  readonly name = 'cli' as const

  async run(opts: RunChatOptions): Promise<EngineResult> {
    const { prompt, signal, onText, onToolUse, onError } = opts
    const child = spawnCli(prompt, {
      cwd: opts.cwd,
      resume: opts.resume,
      sessionId: opts.sessionId
    })

    if (signal) {
      const abort = (): void => {
        child.kill()
      }
      if (signal.aborted) abort()
      else signal.addEventListener('abort', abort, { once: true })
    }

    return new Promise<EngineResult>((resolvePromise, rejectPromise) => {
      let text = ''
      let errorOutput = ''
      let cost: number | undefined
      const toolUses: ToolUse[] = []
      const textBlocks = new Map<number, string>()
      const toolBlocks = new Map<number, { name: string; input: string }>()
      let settled = false

      const finish = (fn: () => void): void => {
        if (settled) return
        settled = true
        fn()
      }

      // Line buffering: JSON events can be split across chunk boundaries.
      let lineBuffer = ''
      const handleLine = (raw: string): void => {
        const line = raw.trim()
        if (!line) return
        let ev: StreamJsonEvent
        try {
          ev = JSON.parse(line) as StreamJsonEvent
        } catch {
          return // malformed line (rare); skip rather than abort the stream
        }

          switch (ev.type) {
            case 'content_block_start': {
              const cb = ev.content_block as { type?: string; name?: string }
              const index = Number(ev.index ?? 0)
              if (cb?.type === 'text') textBlocks.set(index, '')
              if (cb?.type === 'tool_use') toolBlocks.set(index, { name: String(cb.name ?? ''), input: '' })
              break
            }
            case 'content_block_delta': {
              const delta = ev.delta as { type?: string; text?: string; partial_json?: string }
              const index = Number(ev.index ?? 0)
              if (delta?.type === 'text_delta' && delta.text) {
                const block = textBlocks.get(index) ?? ''
                textBlocks.set(index, block + delta.text)
                onText(delta.text)
              }
              if (delta?.type === 'input_json_delta' && delta.partial_json) {
                const block = toolBlocks.get(index)
                if (block) block.input += delta.partial_json
              }
              break
            }
            case 'content_block_stop': {
              const index = Number(ev.index ?? 0)
              const tool = toolBlocks.get(index)
              if (tool) {
                let input: unknown = {}
                try {
                  input = JSON.parse(tool.input || '{}')
                } catch {
                  input = { raw: tool.input }
                }
                const use = { name: tool.name, input }
                toolUses.push(use)
                onToolUse?.(use)
              }
              break
            }
            case 'assistant': {
              // Current CLI versions (2.1.x) emit one complete assistant message
              // per turn (thinking/text/tool_use as content blocks) instead of
              // content_block_delta increments. Append text blocks and collect
              // tool_use blocks; multi-turn results accumulate across events.
              const msg = ev.message as
                | {
                    content?: {
                      type?: string
                      text?: string
                      name?: string
                      input?: unknown
                    }[]
                  }
                | undefined
              if (msg?.content) {
                for (const block of msg.content) {
                  if (block.type === 'text' && block.text) {
                    text += block.text
                    onText(block.text)
                  }
                  if (block.type === 'tool_use' && block.name) {
                    const use = { name: block.name, input: block.input ?? {} }
                    toolUses.push(use)
                    onToolUse?.(use)
                  }
                }
              }
              break
            }
            case 'result': {
              const total = (ev as { total_cost_usd?: number }).total_cost_usd
              if (typeof total === 'number' && Number.isFinite(total)) {
                cost = total
              }
              break
            }
            case 'error': {
              const err = ev.error as { message?: string } | undefined
              errorOutput += err?.message ?? JSON.stringify(ev.error)
              break
            }
          }
      }

      // Accumulate chunks, dispatch only complete lines
      child.stdout!.setEncoding('utf-8')
      child.stdout!.on('data', (chunk: string) => {
        lineBuffer += chunk
        let idx: number
        while ((idx = lineBuffer.indexOf('\n')) >= 0) {
          const line = lineBuffer.slice(0, idx)
          lineBuffer = lineBuffer.slice(idx + 1)
          handleLine(line)
        }
      })
      child.on('close', () => {
        if (lineBuffer.trim()) handleLine(lineBuffer)
      })

      child.stderr!.setEncoding('utf-8')
      child.stderr!.on('data', (chunk: string) => {
        errorOutput += chunk
      })

      child.on('error', (err) => {
        finish(() => {
          const wrapped = new Error(`无法启动 claude CLI：${err.message}`, { cause: err })
          onError(wrapped)
          rejectPromise(wrapped)
        })
      })

      child.on('close', (code) => {
        finish(() => {
          console.log('[cli] close code:', code, 'aborted:', signal?.aborted ?? false)
          const finalText = [...textBlocks.entries()]
            .sort((a, b) => a[0] - b[0])
            .map(([, v]) => v)
            .join('')
          if (finalText) text = finalText

          if (signal?.aborted) {
            const err = new Error('已中断')
            onError(err)
            rejectPromise(err)
            return
          }
          if (code !== 0) {
            const err = new Error(errorOutput.trim() || `claude CLI 退出码 ${code}`)
            onError(err)
            rejectPromise(err)
            return
          }
          resolvePromise({ text, toolUses, claudeSessionId: opts.sessionId, cost })
        })
      })
    })
  }
}
