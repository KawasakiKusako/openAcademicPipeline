import type { ChatEngine, EngineResult, RunChatOptions } from './engine'
import type { Message } from '../../shared/types'
import { getApiBaseUrl, getApiKey, getApiModel, getEffort } from '../settings'

// Direct Anthropic API engine — fallback when the claude CLI is unavailable.
// Text-only conversation (no tool calls); the CLI engine is the full-featured path.
export class ApiEngine implements ChatEngine {
  readonly name = 'api' as const

  private get apiKey(): string {
    const key = getApiKey().trim()
    if (!key) {
      throw new Error('未配置 API Key：请在 设置 中填写，或设置 ANTHROPIC_API_KEY 环境变量')
    }
    return key
  }

  get model(): string {
    return getApiModel()
  }

  private get baseUrl(): string {
    return getApiBaseUrl().replace(/\/$/, '')
  }

  async run(opts: RunChatOptions): Promise<EngineResult> {
    const { prompt, system, signal, onText, onError } = opts
    const messages: { role: string; content: string }[] = [
      ...(opts.history ?? []),
      { role: 'user', content: prompt }
    ]

    const controller = new AbortController()
    if (signal) {
      if (signal.aborted) controller.abort()
      else signal.addEventListener('abort', () => controller.abort(), { once: true })
    }

    let text = ''
    let streamed = false

    // thinking budget from the effort setting (API direct mode)
    const effort = getEffort()
    const thinkingBudget = { low: 4000, medium: 8000, high: 16000, max: 32000 }[effort] ?? 8000

    const doFetch = async (withThinking: boolean): Promise<Response> => {
      const body: Record<string, unknown> = {
        model: this.model,
        max_tokens: 8192,
        system: system ?? undefined,
        messages,
        stream: true
      }
      if (withThinking) {
        body['thinking'] = { type: 'enabled', budget_tokens: thinkingBudget }
      }
      return fetch(`${this.baseUrl}/v1/messages`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify(body),
        signal: controller.signal
      })
    }

    try {
      // try with thinking; fall back to plain request if the endpoint rejects it
      let res = await doFetch(true)
      if (res.status === 400 || res.status === 422) {
        const body = await res.text().catch(() => '')
        if (/thinking|budget_tokens|parameter/i.test(body)) {
          res = await doFetch(false)
        } else {
          throw new Error(`API 请求失败 (${res.status})：${body.slice(0, 500)}`)
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
            if (!data) continue
            let json: { type?: string; delta?: { type?: string; text?: string } }
            try {
              json = JSON.parse(data)
            } catch {
              continue
            }
            if (json.type === 'content_block_delta' && json.delta?.type === 'text_delta' && json.delta.text) {
              text += json.delta.text
              onText(json.delta.text)
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
