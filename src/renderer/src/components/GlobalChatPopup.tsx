import { useEffect, useRef, useState } from 'react'
import type { FormEvent, JSX } from 'react'
import { api } from '../lib/api'
import { useChatStream } from '../lib/useChatStream'
import { IconClose, IconSend, IconStop } from './Icon'
import type { Message, Session, ToolUse } from '@shared/types'

interface Props {
  projectId: string
  initialText: string
  onClose: () => void
}

// 悬浮全局会话：标题栏输入框触发，浮层内直接对话（历史见 … 按钮 → 工作台）
export default function GlobalChatPopup({ projectId, initialText, onClose }: Props): JSX.Element {
  const [session, setSession] = useState<Session | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState('')
  const [toolUses, setToolUses] = useState<ToolUse[]>([])
  const listRef = useRef<HTMLDivElement>(null)
  const sentInitial = useRef(false)

  const ensureSession = async (): Promise<Session> => {
    if (session) return session
    const all = await api.sessions(projectId)
    // 优先复用空闲全局会话；全 running 时复用最近一条（preCheck 会自动停止），
    // 绝不新建，避免重复会话堆积。
    const existing = all.find((s) => !s.taskId && s.status !== 'running') ?? all.find((s) => !s.taskId)
    const s = existing ?? (await api.createSession(projectId, { title: '全局会话' }))
    setSession(s)
    setMessages(await api.sessionMessages(s.id))
    return s
  }

  // 流控制统一走 useChatStream
  const { sending, error, start, stop } = useChatStream({
    getSessionId: async () => (await ensureSession()).id,
    onDone: async () => {
      setStreaming('')
      setToolUses([])
      const s = await ensureSession()
      setMessages(await api.sessionMessages(s.id))
    }
  })

  // auto-send the initial text from the title bar input
  useEffect(() => {
    if (initialText && !sentInitial.current) {
      sentInitial.current = true
      setTimeout(() => send(initialText), 100)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialText])

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [messages, streaming])

  function send(text: string): void {
    const content = text.trim()
    if (!content || sending) return
    setStreaming('')
    setToolUses([])
    setMessages((m) => [
      ...m,
      {
        id: `local-${Date.now()}`,
        sessionId: session?.id ?? '',
        role: 'user',
        content,
        toolUses: [],
        createdAt: new Date().toISOString()
      }
    ])
    void start(content, {
      onText: (delta) => setStreaming((v) => v + delta),
      onToolUse: (tool) => setToolUses((v) => [...v, tool])
    })
  }

  function handleSubmit(e: FormEvent): void {
    e.preventDefault()
    send(input)
    setInput('')
  }

  return (
    <div className="chat-popup-overlay" onMouseDown={onClose}>
      <div className="chat-popup" onMouseDown={(e) => e.stopPropagation()}>
        <div className="chat-popup-head">
          <span>全局会话</span>
          <button className="icon-btn" onClick={onClose}>
            <IconClose size={14} />
          </button>
        </div>
        <div className="chat-popup-list" ref={listRef}>
          {messages.map((m) => (
            <div key={m.id} className={`bubble ${m.role}`}>
              {m.toolUses.length > 0 && (
                <div className="tool-uses">
                  {m.toolUses.map((t, i) => (
                    <span key={i} className="tool-chip">
                      {t.name}
                    </span>
                  ))}
                </div>
              )}
              <div className="bubble-text">{m.content}</div>
            </div>
          ))}
          {(streaming || sending) && (
            <div className="bubble assistant streaming">
              {toolUses.length > 0 && (
                <div className="tool-uses">
                  {toolUses.map((t, i) => (
                    <span key={i} className="tool-chip">
                      {t.name}
                    </span>
                  ))}
                </div>
              )}
              {streaming || <span className="typing">思考中</span>}
            </div>
          )}
        </div>
        {error && <div className="error-box">{error}</div>}
        <form className="chat-popup-composer" onSubmit={handleSubmit}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="继续对话…（Enter 发送）"
            spellCheck={false}
          />
          {sending ? (
            <button type="button" className="btn danger" onClick={() => void stop()}>
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
