import { useEffect, useRef, useState } from 'react'
import type { FormEvent, JSX } from 'react'
import { api, sendChat } from '../../lib/api'
import { useWorkspaceStore } from '../../store/workspace'
import { IconSend, IconStop } from '../Icon'
import { MdText } from './MarkdownEditor'
import type { Message, ToolUse } from '@shared/types'

// 会话面板：消息流 + 输入（工作台会话选项卡 / 独立会话页共用）
export default function ChatPanel({
  sessionId
}: {
  sessionId: string
  key?: string
}): JSX.Element {
  const [messages, setMessages] = useState<Message[]>([])
  const bumpSessions = useWorkspaceStore((s) => s.bumpSessions)
  const [input, setInput] = useState('')
  const pendingChatText = useWorkspaceStore((s) => s.pendingChatText)
  const setPendingChatText = useWorkspaceStore((s) => s.setPendingChatText)

  // consume injected text (e.g. "send file to session" from the explorer)
  useEffect(() => {
    if (pendingChatText) {
      setInput(pendingChatText)
      setPendingChatText(null)
    }
  }, [pendingChatText, setPendingChatText])

  const [streaming, setStreaming] = useState<string>('')
  const [toolUses, setToolUses] = useState<ToolUse[]>([])
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const reload = async (): Promise<void> => {
    try {
      setMessages(await api.sessionMessages(sessionId))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  useEffect(() => {
    reload()
  }, [sessionId]) // eslint-disable-line react-hooks/exhaustive-deps

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
    const controller = new AbortController()
    abortRef.current = controller
    setStreaming('')
    setToolUses([])
    setMessages((m) => [
      ...m,
      {
        id: `local-${Date.now()}`,
        sessionId,
        role: 'user',
        content,
        toolUses: [],
        createdAt: new Date().toISOString()
      }
    ])
    try {
      await sendChat(
        sessionId,
        content,
        {
          onText: (delta) => setStreaming((v) => v + delta),
          onToolUse: (tool) => setToolUses((v) => [...v, tool]),
          onDone: async () => {
            setStreaming('')
            setToolUses([])
            await reload()
            bumpSessions()
          },
          onError: (message) => {
            setError(message)
            bumpSessions()
          }
        },
        controller.signal
      )
    } catch (err) {
      if (!(err instanceof Error && err.name === 'AbortError')) {
        setError(err instanceof Error ? err.message : String(err))
        await reload()
      }
    } finally {
      setSending(false)
      abortRef.current = null
    }
  }

  return (
    <div className="chat-panel">
      <div className="chat-panel-list" ref={listRef}>
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
            {m.role === 'assistant' ? (
              <MdText text={m.content} />
            ) : (
              <div className="bubble-text">{m.content}</div>
            )}
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
            {streaming ? <MdText text={streaming} /> : <span className="typing">思考中</span>}
          </div>
        )}
      </div>
      {error && <div className="error-box">{error}</div>}
      <form className="chat-panel-composer" onSubmit={handleSend}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="输入消息…（Enter 发送，Shift+Enter 换行）"
          rows={2}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleSend(e)
            }
          }}
        />
        {sending ? (
          <button type="button" className="btn danger" onClick={() => abortRef.current?.abort()}>
            <IconStop size={14} />
            停止
          </button>
        ) : (
          <button type="submit" className="btn primary" disabled={!input.trim()}>
            <IconSend size={14} />
            发送
          </button>
        )}
      </form>
    </div>
  )
}
