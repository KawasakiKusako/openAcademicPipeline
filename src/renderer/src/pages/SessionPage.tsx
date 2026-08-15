import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent, JSX } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../lib/api'
import { useChatStream } from '../lib/useChatStream'
import type { ArsSkillEntry } from '../lib/api'
import { IconBack, IconLibrary, IconSend, IconStop, IconTask, IconTrash } from '../components/Icon'
import { MdText } from '../components/workspace/MarkdownEditor'
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
  const listRef = useRef<HTMLDivElement>(null)

  const reload = useCallback(async () => {
    const [s, msgs] = await Promise.all([api.session(sessionId), api.sessionMessages(sessionId)])
    setSession(s)
    setMessages(msgs)
  }, [sessionId])

  // 流控制统一走 useChatStream（同步发送锁 / runId 守卫 / 计时器真停止 / stop await）
  const { sending, error, setError, start, stop } = useChatStream({
    getSessionId: () => sessionId,
    onDone: () => {
      setStreaming(null)
      void reload()
    },
    onIncomplete: () => {
      setStreaming(null)
      void reload()
    }
  })

  useEffect(() => {
    reload().catch((err: unknown) =>
      setError(err instanceof Error ? err.message : String(err))
    )
    api.claudeStatus().then(setStatus).catch(() => undefined)
    api.arsSkills().then(setArsSkills).catch(() => undefined)
  }, [reload])

  // 会话切换重置：同一路由下 sessionId 变化不会重挂载组件，
  // 必须主动停止旧会话的在途请求并清空流式/草稿状态，
  // 否则新会话输入框会残留 sending=true 灰禁（Bug 2）。
  useEffect(() => {
    void stop() // stop 的会话 id 是 start 时捕获的旧会话 → 正确收敛旧 run
    setInput('')
    setStreaming(null)
    setError(null)
  }, [sessionId, stop])

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
    setError(null)

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

    void start(content, {
      onText: (delta) => setStreaming((s) => (s ? { ...s, content: s.content + delta } : s)),
      onToolUse: (tool) =>
        setStreaming((s) => (s ? { ...s, toolUses: [...s.toolUses, tool] } : s))
    })
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
              <IconTask size={11} />
              {t.name}
            </span>
          ))}
        </div>
      )}
      {message.role === 'assistant' ? (
        <MdText text={message.content || '（无文本回复）'} />
      ) : (
        <div className="bubble-text">{message.content}</div>
      )}
    </div>
  )
}
