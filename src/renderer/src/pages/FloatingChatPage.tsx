import { useEffect, useRef, useState } from 'react'
import type { FormEvent, JSX } from 'react'
import { api } from '../lib/api'
import { IconClose, IconSave, IconSend, IconStop } from '../components/Icon'

interface LocalMsg {
  role: 'user' | 'assistant'
  content: string
}

const STORAGE_KEY = 'oap-floating-chat-history'

// 系统级悬浮窗（重构版）：纯对话 + 存入随记。
// 修复点：注入监听器只注册一次（用 ref 持有最新 send，避免闭包竞态），
// 发送串行化（上一轮未完成时不接受新发送）。
export default function FloatingChatPage(): JSX.Element {
  const [messages, setMessages] = useState<LocalMsg[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as LocalMsg[]
    } catch {
      return []
    }
  })
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState('')
  const [sending, setSending] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const sendingRef = useRef(false)
  const messagesRef = useRef<LocalMsg[]>(messages)
  messagesRef.current = messages

  // 注入监听器：注册一次，通过 ref 读取最新状态
  useEffect(() => {
    const handler = (text: string): void => {
      if (text?.trim() && !sendingRef.current) {
        const content = text.trim()
        setMessages((m) => [...m, { role: 'user', content }])
        void sendNow(content)
      }
    }
    window.api.onFloatingInject(handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-60)))
  }, [messages])

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [messages, streaming])

  async function sendNow(content: string): Promise<void> {
    if (sendingRef.current) return
    sendingRef.current = true
    setSending(true)
    setError(null)
    setSaved(false)
    const controller = new AbortController()
    abortRef.current = controller
    setStreaming('')
    const history = messagesRef.current.filter((m) => m.content !== content).slice(-20)

    try {
      const res = await fetch('http://127.0.0.1:11455/api/temp/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content,
          history: history.map((h) => ({ role: h.role, content: h.content }))
        }),
        signal: controller.signal
      })
      if (!res.ok || !res.body) throw new Error(`请求失败 (${res.status})`)
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let reply = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        let sep: number
        while ((sep = buffer.indexOf('\n\n')) >= 0) {
          const raw = buffer.slice(0, sep)
          buffer = buffer.slice(sep + 2)
          const dataLine = raw.split('\n').find((l) => l.startsWith('data:'))
          if (!dataLine) continue
          try {
            const json = JSON.parse(dataLine.slice(5).trim()) as { delta?: string; message?: string }
            if (json.delta) {
              reply += json.delta
              setStreaming(reply)
            } else if (json.message) setError(json.message)
          } catch {
            // skip
          }
        }
      }
      setStreaming('')
      if (reply) setMessages((m) => [...m, { role: 'assistant', content: reply }])
    } catch (err) {
      if (!(err instanceof Error && err.name === 'AbortError')) {
        setError(err instanceof Error ? err.message : String(err))
      }
      setStreaming('')
    } finally {
      setSending(false)
      sendingRef.current = false
      abortRef.current = null
    }
  }

  function handleSend(e: FormEvent): void {
    e.preventDefault()
    const content = input.trim()
    if (!content || sendingRef.current) return
    setInput('')
    setMessages((m) => [...m, { role: 'user', content }])
    void sendNow(content)
  }

  async function handleSave(): Promise<void> {
    if (messages.length === 0) return
    const content = messages
      .map((m) => `【${m.role === 'user' ? '用户' : 'AI'}】\n${m.content}`)
      .join('\n\n')
    const firstUser = messages.find((m) => m.role === 'user')
    try {
      await api.createScratch({
        content,
        summary: firstUser ? firstUser.content.slice(0, 60) : ''
      })
      setSaved(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div className="floating-chat">
      <div className="floating-head">
        <span>临时对话</span>
        <div className="row gap">
          <button
            className="icon-btn"
            title="存入随记"
            onClick={handleSave}
            disabled={messages.length === 0}
          >
            <IconSave size={12} />
          </button>
          <button className="icon-btn" title="关闭" onClick={() => window.api.closeFloatingChat()}>
            <IconClose size={13} />
          </button>
        </div>
      </div>
      <div className="floating-list" ref={listRef}>
        {messages.map((m, i) => (
          <div key={i} className={`bubble ${m.role}`}>
            <div className="bubble-text">{m.content}</div>
          </div>
        ))}
        {streaming && <div className="bubble assistant streaming">{streaming}</div>}
        {sending && !streaming && <span className="typing">思考中</span>}
        {messages.length === 0 && !sending && (
          <p className="muted small" style={{ textAlign: 'center' }}>
            输入问题开始临时对话
          </p>
        )}
      </div>
      {saved && <span className="muted small" style={{ padding: '0 12px' }}>已存入随记</span>}
      {error && <div className="error-box" style={{ margin: '0 10px' }}>{error}</div>}
      <form className="floating-composer" onSubmit={handleSend}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="临时提问…（Enter 发送）"
          spellCheck={false}
          disabled={sending}
        />
        {sending ? (
          <button type="button" className="btn danger" onClick={() => abortRef.current?.abort()}>
            <IconStop size={13} />
          </button>
        ) : (
          <button type="submit" className="btn primary" disabled={!input.trim()}>
            <IconSend size={13} />
          </button>
        )}
      </form>
    </div>
  )
}
