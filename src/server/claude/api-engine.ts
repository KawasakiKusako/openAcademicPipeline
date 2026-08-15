import type { ChatEngine, EngineResult, RunChatOptions } from './engine'
import type { Message } from '../../shared/types'
import { getActiveApiProvider, getApiBaseUrl, getApiKey, getApiModel, getEffort, getSetting, getSkillsPath } from '../settings'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// Direct Anthropic API engine — fallback when the claude CLI is unavailable.
// Text-only conversation (no tool calls); the CLI engine is the full-featured path.
export class ApiEngine implements ChatEngine {
  readonly name = 'api' as const

  get model(): string {
    return getApiModel()
  }

  // 已启用注入的本地技能（SKILL.md 指令拼入 system，让 API 直连也能调用技能）
  private buildSkillSystem(): string {
    const enabled = getSetting<string[]>('apiSkills', [])
    if (enabled.length === 0) return ''
    const root = getSkillsPath()
    const parts: string[] = []
    for (const name of enabled) {
      const md = join(root, name, 'SKILL.md')
      try {
        if (existsSync(md)) {
          const text = readFileSync(md, 'utf-8')
          parts.push(`【技能 ${name}】\n${text.slice(0, 4000)}`)
        }
      } catch {
        // ignore
      }
    }
    return parts.join('\n\n')
  }

  async run(opts: RunChatOptions): Promise<EngineResult> {
    const { prompt, system, signal, onText, onError } = opts
    // 技能注入：用户启用的技能指令拼入 system（本地 API 也能调用 skill）
    const skillSystem = this.buildSkillSystem()
    const fullSystem = [system, skillSystem].filter(Boolean).join('\n\n') || undefined
    // 激活的 API Provider（类 cc-switch）：优先于旧式全局设置
    const provider = getActiveApiProvider()
    const model = opts.model ?? (provider?.model || this.model)
    const baseUrl = (provider?.baseUrl || getApiBaseUrl()).replace(/\/$/, '')
    const apiKey = (provider?.apiKey || getApiKey()).trim()
    if (!apiKey) {
      const err = new Error('未配置 API Key：请到 设置 → API 设置 配置 Provider，或设置 ANTHROPIC_API_KEY')
      onError(err)
      throw err
    }
    const isOpenAI = provider?.type === 'openai'
    const messages = [...(opts.history ?? []), { role: 'user', content: prompt }]

    const controller = new AbortController()
    if (signal) {
      if (signal.aborted) controller.abort()
      else signal.addEventListener('abort', () => controller.abort(), { once: true })
    }

    let text = ''
    let streamed = false

    const effort = opts.effort ?? getEffort()
    const thinkingBudget = { low: 4000, medium: 8000, high: 16000, max: 32000 }[effort] ?? 8000

    // OpenAI 兼容端点（DeepSeek / Kimi / 通义 / 智谱 / OpenAI …）
    const doOpenAIFetch = async (): Promise<Response> => {
      const body: Record<string, unknown> = {
        model,
        messages,
        stream: true,
        max_tokens: 8192
      }
      if (fullSystem) body['system'] = fullSystem
      const url = baseUrl.endsWith('/v1') ? `${baseUrl}/chat/completions` : `${baseUrl}/chat/completions`
      return fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify(body),
        signal: controller.signal
      })
    }

    // Anthropic 原生端点
    const doAnthropicFetch = async (withThinking: boolean): Promise<Response> => {
      const body: Record<string, unknown> = {
        model,
        max_tokens: 8192,
        system: fullSystem ?? undefined,
        messages,
        stream: true
      }
      if (withThinking) {
        body['thinking'] = { type: 'enabled', budget_tokens: thinkingBudget }
      }
      const url = baseUrl.endsWith('/v1') ? `${baseUrl}/messages` : `${baseUrl}/v1/messages`
      return fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify(body),
        signal: controller.signal
      })
    }

    try {
      let res: Response
      if (isOpenAI) {
        res = await doOpenAIFetch()
      } else {
        // try with thinking; fall back to plain request if the endpoint rejects it
        res = await doAnthropicFetch(true)
        if (res.status === 400 || res.status === 422) {
          const body = await res.text().catch(() => '')
          if (/thinking|budget_tokens|parameter/i.test(body)) {
            res = await doAnthropicFetch(false)
          } else {
            throw new Error(`API 请求失败 (${res.status})：${body.slice(0, 500)}`)
          }
        }
      }
      if (!res.ok || !res.body) {
        const body = await res.text().catch(() => '')
        throw new Error(`API 请求失败 (${res.status})：${body.slice(0, 500)}`)
      }

      streamed = true
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const events = buffer.split('\n\n')
        buffer = events.pop() ?? ''
        for (const evt of events) {
          for (const line of evt.split('\n')) {
            if (!line.startsWith('data:')) continue
            const data = line.slice(5).trim()
            if (!data || data === '[DONE]') continue
            let json: {
              type?: string
              delta?: { type?: string; text?: string; content?: string }
              choices?: { delta?: { content?: string } }[]
            }
            try {
              json = JSON.parse(data)
            } catch {
              continue
            }
            let deltaText: string | undefined
            if (isOpenAI) {
              deltaText = json.choices?.[0]?.delta?.content
            } else if (json.type === 'content_block_delta' && json.delta?.type === 'text_delta') {
              deltaText = json.delta.text
            }
            if (deltaText) {
              text += deltaText
              onText(deltaText)
            }
          }
        }
      }
    } catch (err) {
      const aborted = signal?.aborted || controller.signal.aborted
      const wrapped = new Error(
        aborted ? '已中断' : err instanceof Error ? err.message : String(err),
        { cause: err }
      )
      onError(wrapped)
      throw wrapped
    }

    if (!streamed) {
      const err = new Error('API 未返回流式响应')
      onError(err)
      throw err
    }
    return { text, toolUses: [] }
  }
}

export function apiKeyConfigured(): boolean {
  const provider = getActiveApiProvider()
  if (provider?.apiKey?.trim()) return true
  return Boolean(getApiKey().trim())
}

// History for API calls: user/assistant alternation required by the API.
export function buildApiHistory(messages: Message[]): { role: 'user' | 'assistant'; content: string }[] {
  const history: { role: 'user' | 'assistant'; content: string }[] = []
  for (const m of messages) {
    if (m.role === 'user' && m.content.trim()) {
      history.push({ role: 'user', content: m.content })
    } else if (m.role === 'assistant' && m.content.trim()) {
      history.push({ role: 'assistant', content: m.content })
    }
  }
  return history
}
