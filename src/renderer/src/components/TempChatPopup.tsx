import { useEffect, useRef, useState } from 'react'
import type { FormEvent, JSX } from 'react'
import { api } from '../lib/api'
import { IconClose, IconSave, IconSend, IconStop } from './Icon'

interface LocalMsg {
  role: 'user' | 'assistant'
  content: string
}

// 临时对话悬浮窗（托盘菜单开启）：不绑定项目，对话结束后可存入知识库"随记"
export default function TempChatPopup({ onClose }: { onClose: () => void }): JSX.Element {
  const [messages, setMessages] = useState<LocalMsg[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [messages, streaming])

  async function handleSend(e: FormEvent): Promise<void> {
    e.preventDefault()
    const content = input.trim()
    if (!content || sending) return
    setInput('')
    setSending(true)
    setError(null)
    setSaved(false)
    const controller = new AbortController()
    abortRef.current = controller
    const history = [...messages]
    setMessages((m) => [...m, { role: 'user', content }])
    setStreaming('')

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
      if (!res.ok || !res.body) {
        throw new Error(`请求失败 (${res.status})`)
      }
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
            } else if (json.message) {
              setError(json.message)
            }
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
      abortRef.current = null
    }
  }

  async function handleSaveToLibrary(): Promise<void> {
    if (messages.length === 0) return
    const content = messages.map((m) => `【${m.role === 'user' ? '用户' : 'AI'}】\n${m.content}`).join('\n\n')
    const firstUser = messages.find((m) => m.role === 'user')
    try {
      await api.createScratch({
        content,
        summary: firstUser ? firstUser.content.slice(0, 80) : ''
      })
      setSaved(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div className="chat-popup-overlay" onMouseDown={onClose}>
      <div className="chat-popup" onMouseDown={(e) => e.stopPropagation()}>
        <div className="chat-popup-head">
          <span>临时对话</span>
          <div className="row gap">
            {saved && <span className="muted small">已存入随记</span>}
            <button
              className="btn small"
              onClick={handleSaveToLibrary}
              disabled={messages.length === 0}
              title="对话内容存入知识库随记"
            >
              <IconSave size={12} />
              存入随记
            </button>
            <button className="icon-btn" onClick={onClose}>
              <IconClose size={14} />
            </button>
          </div>
        </div>
        <div className="chat-popup-list" ref={listRef}>
          {messages.map((m, i) => (
            <div key={i} className={`bubble ${m.role}`}>
              <div className="bubble-text">{m.content}</div>
            </div>
          ))}
          {streaming && (
            <div className="bubble assistant streaming">
              {streaming}
            </div>
          )}
          {sending && !streaming && <span className="typing">思考中</span>}
        </div>
        {error && <div className="error-box" style={{ margin: '0 14px' }}>{error}</div>}
        <form className="chat-popup-composer" onSubmit={handleSend}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="临时提问…（Enter 发送）"
            spellCheck={false}
          />
          {sending ? (
            <button type="button" className="btn danger" onClick={() => abortRef.current?.abort()}>
              <IconStop size={14} />
            </button>
          ) : (
            <button type="submit" className="btn primary" disabled={!input.trim()}>
              <IconSend size={14} />
            </button>
          )}
        </form>
      </div>
    </div>
  )
}
