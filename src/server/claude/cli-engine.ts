import { execFileSync, spawn, spawnSync } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { readFileSync, existsSync } from 'node:fs'
import { delimiter, dirname, join } from 'node:path'
import { homedir } from 'node:os'
import { getCliModelOverride, getEffort, getPythonEnv, getSetting } from '../settings'
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

// CLI 版本探测：异步 + 缓存。旧实现用 spawnSync —— 会阻塞主进程事件循环
// （server 与 Electron 主进程同进程），冷启动时 `claude --version` 可达数秒，
// 期间所有 API（含会话加载）全部排队无响应 → 会话窗口长时间"加载中/灰禁"。
let cliVersionPromise: Promise<string | null> | null = null
export function cliVersionAsync(): Promise<string | null> {
  if (cliVersionPromise) return cliVersionPromise
  cliVersionPromise = new Promise((resolve) => {
    const path = resolveClaude()
    if (!path) {
      resolve(null)
      return
    }
    try {
      const child = spawn(path, ['--version'], {
        shell: process.platform === 'win32' && /\.(cmd|bat)$/i.test(path),
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe']
      })
      let out = ''
      const timer = setTimeout(() => {
        killChildTree(child)
        resolve(null)
      }, 10_000)
      child.stdout?.setEncoding('utf-8')
      child.stdout?.on('data', (c: string) => (out += c))
      child.on('close', (code) => {
        clearTimeout(timer)
        resolve(code === 0 && out.trim() ? out.trim() : null)
      })
      child.on('error', () => {
        clearTimeout(timer)
        resolve(null)
      })
    } catch {
      resolve(null)
    }
  })
  return cliVersionPromise
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

// 杀掉整个 CLI 进程树：Windows 下 kill 只杀 cmd 包装进程，CLI 子进程会残留导致
// close 不触发、会话状态卡 running —— 用 taskkill /T /F 杀进程树。
// 供引擎 abort / result 宽限收尾 / chat.ts 的 /temp/chat 复用。
export function killChildTree(child: ReturnType<typeof spawn>): void {
  try {
    if (process.platform === 'win32' && child.pid) {
      execFileSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], {
        windowsHide: true,
        stdio: 'ignore'
      })
    }
  } catch (err) {
    console.error('[cli] taskkill 失败:', err)
  }
  child.kill()
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

// 用户选择的 Python 环境（设置→系统设置→运行环境）的 PATH 前缀：
// 让沙盒里的 claude CLI 执行 `python` 时优先命中用户选择的 conda/system 环境，
// 而不是系统默认 python。返回 null 表示无自定义环境。
function pythonEnvPathPrefix(): string | null {
  try {
    const env = getPythonEnv()
    if (env.type === 'conda' && env.condaPath) {
      const condaRoot = join(env.condaPath, '..', '..')
      const name = (env.value ?? '').trim()
      if (name) {
        const envDir = join(condaRoot, 'envs', name)
        return `${envDir};${join(envDir, 'Scripts')}`
      }
      return `${condaRoot};${join(condaRoot, 'Scripts')}`
    }
    if (env.type === 'system' && env.value) {
      return dirname(env.value.trim())
    }
  } catch {
    // ignore
  }
  return null
}

function spawnCli(
  prompt: string,
  opts: { sessionId?: string; resume?: string; cwd?: string; interactive?: boolean }
): ReturnType<typeof spawn> {
  const path = resolveClaude()
  if (!path) throw new Error('未找到 claude 命令，请先安装 Claude Code（或使用 API 引擎）')

  // NOTE: `--output-format stream-json` with `-p` requires `--verbose` on
  // current Claude Code versions, otherwise the CLI exits with code 1.
  // The prompt is passed via STDIN (`-p` with no argument reads stdin) — this
  // avoids cmd.exe mangling special characters (| < > ") in the argument.
  const args: string[] = ['--output-format', 'stream-json', '--verbose']
  if (opts.interactive) {
    // 交互模式：stdin 持续会话，可接收 permission_request 并回写决策
    args.push('--input-format', 'stream-json')
  } else {
    args.push('-p')
  }
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
  // 权限模式：默认 acceptEdits（文件编辑免确认，Bash 走交互确认/白名单）；
  // 「完全信任模式」跳过所有权限确认（危险，仅用户显式开启）。
  const trusted = getSetting<boolean>('cliTrustedMode', false)
  if (trusted) {
    args.push('--dangerously-skip-permissions')
  } else {
    args.push('--permission-mode', 'acceptEdits')
  }

  // .cmd/.bat wrappers on Windows require a shell; Node quotes args safely.
  // Prompt travels via stdin so cmd.exe never mangles special characters.
  // env：把用户选择的 Python 环境前置到 PATH（沙盒内 `python` 优先命中用户环境）
  const envPrefix = pythonEnvPathPrefix()
  const child = spawn(path, args, {
    cwd: opts.cwd ?? process.cwd(),
    shell: process.platform === 'win32' && /\.(cmd|bat)$/i.test(path),
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: envPrefix ? { ...process.env, PATH: `${envPrefix}${delimiter}${process.env.PATH ?? ''}` } : process.env
  })
  child.stdin?.write(prompt)
  if (!opts.interactive) child.stdin?.end()
  return child
}

// 权限确认总线：CLI 的 permission_request → 主进程桥 → 渲染进程弹窗 → 决策回写
// server 与 main 同进程，用 EventEmitter 直连。
export interface PermissionRequest {
  requestId: string
  action: string // 如 Bash / Edit / Read
  command: string
  toolInput: string
}

export interface PermissionDecision {
  decision: 'allow' | 'deny'
  alwaysAllow?: boolean // 总是允许 → 写入沙盒白名单
}

export const permissionBus = new EventEmitter()

export function requestPermission(req: PermissionRequest): Promise<PermissionDecision> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ decision: 'deny' }), 5 * 60 * 1000)
    permissionBus.once(`decision:${req.requestId}`, (d: PermissionDecision) => {
      clearTimeout(timer)
      resolve(d)
    })
    permissionBus.emit('request', req)
  })
}

export class CliEngine implements ChatEngine {
  readonly name = 'cli' as const

  async run(opts: RunChatOptions): Promise<EngineResult> {
    const { prompt, signal, onText, onToolUse, onError } = opts
    // 一次性 -p 模式（CLI 2.1.x 的 input-format stream-json 仅支持 --print）。
    // 逐命令权限确认走 PreToolUse Hook（沙盒 settings.json 配置，见 chat.ts），
    // 弹窗决策后返回 allow/deny —— 不依赖 CLI 交互协议。
    //
    // 会话 id：resume 沿用上次的 CC 会话；否则生成全新随机 id——
    // 被强制中止的 CC 会话会残留锁/状态（--resume 报 "Session ID already in use"，
    // 锁要数分钟才释放），绝不复用旧 id（chat.ts 在中止路径会清空 claude_session_id，
    // 下一次 run 拿到的 resume 必为 null）。
    const ccSessionId = opts.resume ?? crypto.randomUUID()
    const child = spawnCli(prompt, {
      cwd: opts.cwd,
      resume: opts.resume,
      sessionId: ccSessionId
    })

    return new Promise<EngineResult>((resolvePromise, rejectPromise) => {
      let text = ''
      let errorOutput = ''
      let cost: number | undefined
      const toolUses: ToolUse[] = []
      const textBlocks = new Map<number, string>()
      const toolBlocks = new Map<number, { name: string; input: string }>()
      let settled = false
      let resultGraceArmed = false
      let resultGrace: ReturnType<typeof setTimeout> | null = null

      const finish = (fn: () => void): void => {
        if (settled) return
        settled = true
        if (resultGrace) clearTimeout(resultGrace)
        fn()
      }

      // 中断处理：Windows 下 kill 只杀 cmd 包装进程，CLI 子进程会残留导致
      // close 不触发、会话状态卡 running —— 用 killChildTree 杀整个进程树 + 兜底强制结束。
      const abortCli = (): void => {
        killChildTree(child)
        // 兜底：5 秒后仍未 close 则强制结束（防残留进程挂起会话）
        setTimeout(() => {
          finish(() => {
            const err = new Error('已中断')
            onError(err)
            rejectPromise(err)
          })
        }, 5000)
      }
      if (signal) {
        if (signal.aborted) abortCli()
        else signal.addEventListener('abort', abortCli, { once: true })
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
            case 'permission_request': {
              // 交互式权限确认：弹窗等待用户决策后回写
              const pr = ev as unknown as {
                request_id?: string
                action?: unknown
                tool_name?: string
                tool_input?: unknown
                command?: string
              }
              const requestId = String(pr.request_id ?? '')
              const actionRaw = pr.action as
                | { kind?: string; command?: string; tool_input?: unknown }
                | string
                | undefined
              const action =
                typeof actionRaw === 'string'
                  ? actionRaw
                  : (actionRaw?.kind ?? pr.tool_name ?? 'Bash')
              const command =
                typeof actionRaw === 'object' && actionRaw !== null
                  ? String(actionRaw.command ?? '')
                  : String(pr.command ?? '')
              const toolInput =
                typeof actionRaw === 'object' && actionRaw !== null && actionRaw.tool_input
                  ? JSON.stringify(actionRaw.tool_input, null, 2)
                  : pr.tool_input
                    ? JSON.stringify(pr.tool_input, null, 2)
                    : ''
              void requestPermission({ requestId, action, command, toolInput }).then((d) => {
                if (!child.stdin?.writable) return
                child.stdin.write(
                  JSON.stringify({
                    type: 'permission_response',
                    request_id: requestId,
                    decision: d.decision
                  }) + '\n'
                )
                if (d.alwaysAllow) {
                  // 总是允许：写入沙盒 .claude/settings.json 白名单（由调用方处理）
                  opts.onPermissionGranted?.(action, command)
                }
              })
              break
            }
            case 'result': {
              // CLI 成功运行的最后一条事件（携带 total_cost_usd）。
              // 注意：绝不可在此调用 finish 门闩——close 事件才是 promise 的唯一
              // settle 点（此前在此消耗 settled 导致每次成功对话 promise 永久挂起、
              // 会话状态卡 running，只能等 10 分钟硬超时兜底）。
              const total = (ev as { total_cost_usd?: number }).total_cost_usd
              if (typeof total === 'number' && Number.isFinite(total)) {
                cost = total
              }
              if (!resultGraceArmed) {
                resultGraceArmed = true
                if (!child.stdin?.writableEnded) child.stdin?.end()
                // 输出已完整；若进程不退出（Bash 孙进程持管道 / perm-hook 挂起 /
                // 沙盒锁等待），15s 宽限后强制收尾，保证会话状态收敛（不依赖 close）。
                resultGrace = setTimeout(() => {
                  console.log('[cli] result 后进程未退出，强制收尾')
                  killChildTree(child)
                  // taskkill 后给 close 5s 机会，仍不触发则强制 resolve
                  setTimeout(() => {
                    finish(() => {
                      if (signal?.aborted) {
                        const err = new Error('已中断')
                        onError(err)
                        rejectPromise(err)
                        return
                      }
                      resolvePromise({ text, toolUses, claudeSessionId: ccSessionId, cost })
                    })
                  }, 5000)
                }, 15_000)
              }
              break
            }
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
          resolvePromise({ text, toolUses, claudeSessionId: ccSessionId, cost })
        })
      })
    })
  }
}
