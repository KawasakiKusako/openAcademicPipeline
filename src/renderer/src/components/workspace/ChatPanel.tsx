import { useEffect, useRef, useState } from 'react'
import type { FormEvent, JSX } from 'react'
import { api } from '../../lib/api'
import { useChatStream } from '../../lib/useChatStream'
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
  const listRef = useRef<HTMLDivElement>(null)

  const reload = async (): Promise<void> => {
    try {
      setMessages(await api.sessionMessages(sessionId))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  // 流控制统一走 useChatStream（同步发送锁 / runId 守卫 / 计时器真停止 / stop await）
  const { sending, error, setError, start, stop } = useChatStream({
    getSessionId: () => sessionId,
    onDone: () => {
      setStreaming('')
      setToolUses([])
      void reload()
      bumpSessions()
    },
    onIncomplete: () => {
      setStreaming('')
      setToolUses([])
      void reload()
      bumpSessions()
    }
  })

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
    void start(content, {
      onText: (delta) => setStreaming((v) => v + delta),
      onToolUse: (tool) => setToolUses((v) => [...v, tool])
    })
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
            {/* 流式期间渲染纯文本（markdown 解析每增量重跑会拖垮渲染线程，
                完整消息在落库后由 MdText 渲染） */}
            {streaming ? <div className="bubble-text">{streaming}</div> : <span className="typing">思考中</span>}
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
          <button type="button" className="btn danger" onClick={() => void stop()}>
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
