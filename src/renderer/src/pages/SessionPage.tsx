import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent, JSX } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, sendChat } from '../lib/api'
import type { ArsSkillEntry } from '../lib/api'
import { IconBack, IconLibrary, IconSend, IconStop, IconTrash } from '../components/Icon'
import type { ClaudeStatus, Message, Session, Task, ToolUse } from '@shared/types'

const ENGINE_LABEL: Record<Session['engine'], string> = {
  cli: 'Claude Code',
  api: 'API 保底'
}

interface Streaming {
  content: string
  toolUses: ToolUse[]
}

export default function SessionPage(): JSX.Element {
  const { projectId = '', sessionId = '' } = useParams()
  const navigate = useNavigate()
  const [session, setSession] = useState<Session | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [linkedTask, setLinkedTask] = useState<Task | null>(null)
  const [arsSkills, setArsSkills] = useState<Record<string, ArsSkillEntry>>({})
  const [status, setStatus] = useState<ClaudeStatus | null>(null)
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState<Streaming | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const reload = useCallback(async () => {
    const [s, msgs] = await Promise.all([api.session(sessionId), api.sessionMessages(sessionId)])
    setSession(s)
    setMessages(msgs)
  }, [sessionId])

  useEffect(() => {
    reload().catch((err: unknown) =>
      setError(err instanceof Error ? err.message : String(err))
    )
    api.claudeStatus().then(setStatus).catch(() => undefined)
    api.arsSkills().then(setArsSkills).catch(() => undefined)
  }, [reload])

  // Find the linked task (session -> task) to show its ARS skill badge
  useEffect(() => {
    if (!session?.taskId) {
      setLinkedTask(null)
      return
    }
    api
      .tasks(session.projectId)
      .then((tasks) => setLinkedTask(tasks.find((t) => t.id === session.taskId) ?? null))
      .catch(() => undefined)
  }, [session])

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [messages, streaming])

  async function handleSend(e: FormEvent): Promise<void> {
    e.preventDefault()
    const content = input.trim()
    if (!content || sending || !session) return
    setInput('')
    setSending(true)
    setError(null)
    const controller = new AbortController()
    abortRef.current = controller

    // optimistic user bubble; it is persisted server-side too
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
    setStreaming({ content: '', toolUses: [] })

    try {
      await sendChat(
        sessionId,
        content,
        {
          onText: (delta) => setStreaming((s) => (s ? { ...s, content: s.content + delta } : s)),
          onToolUse: (tool) =>
            setStreaming((s) => (s ? { ...s, toolUses: [...s.toolUses, tool] } : s)),
          onDone: async () => {
            setStreaming(null)
            await reload()
          },
          onError: (message) => {
            setStreaming(null)
            setError(message)
          }
        },
        controller.signal
      )
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        setStreaming(null)
        await reload()
      } else {
        setStreaming(null)
        setError(err instanceof Error ? err.message : String(err))
        await reload()
      }
    } finally {
      setSending(false)
      abortRef.current = null
    }
  }

  function handleStop(): void {
    abortRef.current?.abort()
  }

  if (error && !session) return <div className="error-box">{error}</div>
  if (!session) return <p className="muted">加载中…</p>

  const taskTitle = session.title

  return (
    <div className="session-page">
      <header className="session-head">
        <div className="session-head-left">
          <Link to={`/projects/${projectId}`} className="back-link">
            <IconBack size={13} />
            返回项目
          </Link>
          <h2>{taskTitle}</h2>
        </div>
        <div className="row gap small">
          <span className={`badge ${session.engine}`}>{ENGINE_LABEL[session.engine]}</span>
          {linkedTask &&
            (linkedTask.skill ? arsSkills[linkedTask.skill] : arsSkills[linkedTask.type]) && (
              <span
                className="badge skill"
                title={`已注入技能提示词：${(linkedTask.skill ? arsSkills[linkedTask.skill] : arsSkills[linkedTask.type]).hint}`}
              >
                {(linkedTask.skill ? arsSkills[linkedTask.skill] : arsSkills[linkedTask.type]).label}
              </span>
            )}
          {status?.model && <span className="muted">模型：{status.model}</span>}
          {status && !status.cliAvailable && session.engine === 'cli' && (
            <span className="warn-text">未检测到 claude CLI</span>
          )}
          {status && !status.apiKeyConfigured && session.engine === 'api' && (
            <span className="warn-text">未配置 ANTHROPIC_API_KEY</span>
          )}
          <button
            className="icon-btn"
            title="知识库（文献库）"
            onClick={() => navigate(`/projects/${projectId}?tab=library&lib=lit`)}
          >
            <IconLibrary size={15} />
          </button>
          <button
            className="icon-btn"
            title="删除会话"
            onClick={async () => {
              if (window.confirm('删除该会话？')) {
                await api.deleteSession(sessionId)
                window.location.hash = `#/projects/${projectId}`
              }
            }}
          >
            <IconTrash size={15} />
          </button>
        </div>
      </header>

      <div className="session-list" ref={listRef}>
        <div className="session-list-inner">
          {messages.map((m) => (
            <MessageBubble key={m.id} message={m} />
          ))}
          {streaming && (
            <div className="bubble assistant streaming">
              {streaming.toolUses.length > 0 && (
                <div className="tool-uses">
                  {streaming.toolUses.map((t, i) => (
                    <span key={i} className="tool-chip">
                      {t.name}
                    </span>
                  ))}
                </div>
              )}
              {streaming.content || <span className="typing">思考中</span>}
            </div>
          )}
          {sending && !streaming && <span className="typing">等待响应</span>}
        </div>
      </div>

      {error && <div className="error-box" style={{ margin: '0 24px' }}>{error}</div>}

      <form className="composer" onSubmit={handleSend}>
        <div className="composer-inner">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="输入消息，Enter 发送，Shift+Enter 换行"
            rows={3}
            disabled={sending}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSend(e)
              }
            }}
          />
          <div className="composer-actions">
            <span className="muted small">
              {session.engine === 'cli' ? '运行于项目沙盒 · CLAUDE.md 已加载' : 'API 直连 · 无沙盒上下文'}
            </span>
            {sending ? (
              <button type="button" className="btn danger" onClick={handleStop}>
                <IconStop size={14} />
                停止
              </button>
            ) : (
              <button type="submit" className="btn primary" disabled={!input.trim()}>
                <IconSend size={14} />
                发送
              </button>
            )}
          </div>
        </div>
      </form>
    </div>
  )
}

function MessageBubble({ message }: { message: Message; key?: string }): JSX.Element {
  return (
    <div className={`bubble ${message.role}`}>
      {message.toolUses.length > 0 && (
        <div className="tool-uses">
          {message.toolUses.map((t, i) => (
            <span key={i} className="tool-chip" title={JSON.stringify(t.input)}>
              🛠 {t.name}
            </span>
          ))}
        </div>
      )}
      <div className="bubble-text">{message.content || '（无文本回复）'}</div>
    </div>
  )
}
