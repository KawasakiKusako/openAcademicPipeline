import type { EffortLevel, Message, ToolUse } from '../../shared/types'

// Unified streaming interface for both engines (CLI and direct API fallback).

export interface ChatEvents {
  onText: (delta: string) => void
  onToolUse?: (tool: ToolUse) => void
}

export interface EngineResult {
  text: string
  toolUses: ToolUse[]
  claudeSessionId?: string // populated by the CLI engine for resume
  cost?: number // USD from the CLI result event (total_cost_usd)
}

export interface RunChatOptions extends ChatEvents {
  prompt: string
  system?: string // optional system prompt (API engine; CLI loads CLAUDE.md itself)
  cwd?: string // working directory (CLI engine: the project sandbox)
  sessionId?: string // our session id (CLI engine: first message)
  resume?: string // claude CLI session id to resume (CLI engine)
  history?: Message[] // prior messages (API engine builds the conversation from these)
  signal?: AbortSignal
  effort?: EffortLevel // per-request thinking strength override (API engine)
  model?: string // per-request model override (API engine)
  onPermissionGranted?: (action: string, command: string) => void // 「总是允许」→ 写沙盒白名单
  onError: (err: Error) => void
}

export interface ChatEngine {
  readonly name: 'cli' | 'api'
  run(opts: RunChatOptions): Promise<EngineResult>
}
