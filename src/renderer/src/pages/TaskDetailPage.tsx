import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent, JSX } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, sendChat } from '../lib/api'
import TaskSandboxView from '../components/TaskSandboxView'
import { IconBack, IconSend, IconStop, IconTrash } from '../components/Icon'
import type {
  Literature,
  Message,
  Session,
  Task,
  TaskFormField,
  TaskKind,
  ToolUse
} from '@shared/types'

const KIND_LABEL: Record<TaskKind, string> = {
  chat: '会话',
  sandbox: '沙盒',
  form: '表单'
}

export default function TaskDetailPage(): JSX.Element {
  const { projectId = '', taskId = '' } = useParams()
  const navigate = useNavigate()
  const [task, setTask] = useState<Task | null>(null)
  const [taskType, setTaskType] = useState<{ label: string; kind: TaskKind } | null>(null)
  const [arsSkills, setArsSkills] = useState<Record<string, { label: string; hint: string }>>({})

  useEffect(() => {
    api.task(taskId).then(setTask).catch(() => undefined)
    api
      .taskTypes()
      .then((types) => {
        api.task(taskId).then((t) => {
          setTaskType(types.find((x) => x.type === t.type) ?? null)
        })
      })
      .catch(() => undefined)
    api.arsSkills().then(setArsSkills).catch(() => undefined)
  }, [taskId])

  async function handleDelete(): Promise<void> {
    if (!window.confirm('确定删除该任务？')) return
    await api.deleteTask(taskId)
    navigate(`/projects/${projectId}`)
  }

  if (!task) return <p className="muted">加载中…</p>

  const skill = (task.skill ? arsSkills[task.skill] : arsSkills[task.type]) ?? null
  const kind = taskType?.kind ?? 'chat'

  return (
    <div className="task-page">
      <header className="task-head">
        <div className="task-head-left">
          <Link to={`/projects/${projectId}`} className="back-link">
            <IconBack size={13} />
            返回项目
          </Link>
          <div className="row gap" style={{ marginTop: 4 }}>
            <h2>{task.name}</h2>
            <span className="badge subtle">
              {taskType?.label ?? task.type} · {KIND_LABEL[kind]}
            </span>
            {skill && (
              <span className="badge skill" title={skill.hint}>
                {skill.label}
              </span>
            )}
          </div>
        </div>
        <button className="icon-btn" title="删除任务" onClick={handleDelete}>
          <IconTrash size={15} />
        </button>
      </header>

      {kind === 'form' && <TaskFormView task={task} skillLabel={skill?.label ?? null} />}
      {kind === 'chat' && <TaskChatView task={task} />}
      {kind === 'sandbox' && <TaskSandboxView task={task} projectId={projectId} />}
    </div>
  )
}

/* ---------- form-driven task: fill the form, run, see the result ---------- */

const FALLBACK_SCHEMA: TaskFormField[] = [
  { key: 'goal', label: '任务目标', type: 'textarea', required: true },
  { key: 'materials', label: '输入材料', type: 'textarea' },
  { key: 'outputs', label: '产出要求', type: 'textarea' },
  { key: 'constraints', label: '约束与要求', type: 'textarea' }
]

export function TaskFormView({ task, skillLabel }: { task: Task; skillLabel: string | null }): JSX.Element {
  const { projectId = '' } = useParams()
  const [schema, setSchema] = useState<TaskFormField[]>(FALLBACK_SCHEMA)
  const [values, setValues] = useState<Record<string, string>>({})
  const [literature, setLiterature] = useState<Literature[]>([])
  const [selectedRefs, setSelectedRefs] = useState<Set<string>>(new Set())
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [streaming, setStreaming] = useState<string>('')
  const [toolUses, setToolUses] = useState<ToolUse[]>([])
  const abortRef = useRef<AbortController | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    api.literature().then(setLiterature).catch(() => undefined)
    api
      .taskTypes()
      .then((types) => {
        const def = types.find((t) => t.type === task.type)
        if (def?.formSchema) setSchema(def.formSchema)
      })
      .catch(() => undefined)
  }, [task.type])

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [messages, streaming])

  const canSubmit =
    !submitting &&
    schema.filter((f) => f.required).every((f) => (values[f.key] ?? '').trim().length > 0)

  async function handleSubmit(e: FormEvent): Promise<void> {
    e.preventDefault()
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    try {
      const refs = literature.filter((l) => selectedRefs.has(l.id))
      const parts = [
        `【任务】${task.name}`,
        task.prompt ? `【任务说明】\n${task.prompt}` : null,
        ...schema.map((field) => {
          const v = (values[field.key] ?? '').trim()
          return v ? `【${field.label}】\n${v}` : null
        }),
        refs.length > 0
          ? `【关联文献】\n${refs
              .map((r, i) => `${i + 1}. ${r.authors.join(', ')} (${r.year ?? 'n.d.'}). ${r.title}. ${r.venue}`)
              .join('\n')}`
          : null,
        skillLabel ? `请按 ${skillLabel} 技能的流程执行本任务。` : null
      ].filter(Boolean)
      const prompt = parts.join('\n\n')

      // Session reuse rule: form submissions continue the task's most recent
      // session (conversation continuity) instead of creating a new one.
      const sessions = await api.sessions(projectId)
      const existing = sessions.find((x) => x.taskId === task.id && x.status !== 'running')
      const s = existing ?? (await api.createSession(projectId, { taskId: task.id, title: task.name }))
      setSession(s)
      const history = await api.sessionMessages(s.id)
      setMessages(history)

      const controller = new AbortController()
      abortRef.current = controller
      setStreaming('')
      setToolUses([])

      await sendChat(
        s.id,
        prompt,
        {
          onText: (delta) => setStreaming((v) => v + delta),
          onToolUse: (tool) => setToolUses((v) => [...v, tool]),
          onDone: async () => {
            setStreaming('')
            setToolUses([])
            setMessages(await api.sessionMessages(s.id))
          },
          onError: (message) => setError(message)
        },
        controller.signal
      )
    } catch (err) {
      if (!(err instanceof Error && err.name === 'AbortError')) {
        setError(err instanceof Error ? err.message : String(err))
      }
    } finally {
      setSubmitting(false)
      abortRef.current = null
    }
  }

  function toggleRef(id: string): void {
    setSelectedRefs((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="task-form-layout">
      <form className="task-form" onSubmit={handleSubmit}>
        <div className="task-form-fields">
          {schema.map((field) => (
            <label key={field.key} className="field">
              <span className="field-label">
                {field.label}
                {field.required && <b className="required"> *</b>}
              </span>
              {field.type === 'select' ? (
                <select
                  value={values[field.key] ?? ''}
                  onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
                >
                  <option value="">请选择…</option>
                  {field.options?.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              ) : field.type === 'text' ? (
                <input
                  value={values[field.key] ?? ''}
                  onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
                  placeholder={field.placeholder ?? ''}
                />
              ) : (
                <textarea
                  value={values[field.key] ?? ''}
                  onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
                  placeholder={field.placeholder ?? ''}
                  rows={4}
                />
              )}
              {field.description && <span className="muted small">{field.description}</span>}
            </label>
          ))}
        </div>

        <div className="task-form-side">
          <div className="ref-panel">
            <span className="field-label">关联文献（从个人知识库）</span>
            <div className="ref-list">
              {literature.map((l) => (
                <label key={l.id} className={`ref-item${selectedRefs.has(l.id) ? ' selected' : ''}`}>
                  <input
                    type="checkbox"
                    checked={selectedRefs.has(l.id)}
                    onChange={() => toggleRef(l.id)}
                  />
                  <span className="ref-title">{l.title}</span>
                  <span className="ref-meta">
                    {l.authors[0] ?? ''}
                    {l.year ? ` (${l.year})` : ''}
                  </span>
                </label>
              ))}
              {literature.length === 0 && (
                <span className="muted small">知识库为空，可在 知识库 中添加文献</span>
              )}
            </div>
          </div>

          {error && <div className="error-box">{error}</div>}

          <div className="form-actions">
            {submitting ? (
              <button
                type="button"
                className="btn danger"
                onClick={() => abortRef.current?.abort()}
              >
                <IconStop size={14} />
                停止
              </button>
            ) : (
              <button type="submit" className="btn primary" disabled={!canSubmit}>
                <IconSend size={14} />
                提交任务
              </button>
            )}
          </div>
        </div>
      </form>

      {(session || streaming || messages.length > 0) && (
        <div className="task-result">
          <div className="task-result-head">
            <span>执行结果</span>
            {session && (
              <Link to={`/projects/${projectId}/sessions/${session.id}`} className="btn small ghost">
                在会话中打开
              </Link>
            )}
          </div>
          <div className="task-result-body" ref={listRef}>
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
            {(streaming || submitting) && (
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
                {streaming || <span className="typing">执行中</span>}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/* ---------- chat-driven task: direct conversation with the linked session ---------- */

export function TaskChatView({ task }: { task: Task }): JSX.Element {
  const { projectId = '' } = useParams()
  const [session, setSession] = useState<Session | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const ensureSession = useCallback(async (): Promise<Session> => {
    if (session) return session
    const list = await api.sessions(projectId)
    const existing = list.find((s) => s.taskId === task.id)
    if (existing) {
      setSession(existing)
      setMessages(await api.sessionMessages(existing.id))
      return existing
    }
    const created = await api.createSession(projectId, { taskId: task.id, title: task.name })
    setSession(created)
    return created
  }, [session, projectId, task])

  useEffect(() => {
    ensureSession().catch((err: unknown) =>
      setError(err instanceof Error ? err.message : String(err))
    )
  }, [ensureSession])

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
    try {
      const s = await ensureSession()
      await sendChat(
        s.id,
        content,
        {
          onText: (delta) => setStreaming((v) => v + delta),
          onDone: async () => {
            setStreaming('')
            setMessages(await api.sessionMessages(s.id))
          },
          onError: (message) => setError(message)
        },
        controller.signal
      )
    } catch (err) {
      if (!(err instanceof Error && err.name === 'AbortError')) {
        setError(err instanceof Error ? err.message : String(err))
      }
    } finally {
      setSending(false)
      abortRef.current = null
    }
  }

  return (
    <div className="task-chat">
      <div className="task-chat-list" ref={listRef}>
        {messages.map((m) => (
          <div key={m.id} className={`bubble ${m.role}`}>
            <div className="bubble-text">{m.content}</div>
          </div>
        ))}
        {streaming && (
          <div className="bubble assistant streaming">
            {streaming || <span className="typing">思考中</span>}
          </div>
        )}
      </div>
      {error && <div className="error-box">{error}</div>}
      <form className="task-chat-composer" onSubmit={handleSend}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="与 AI 对话…（Enter 发送，Shift+Enter 换行）"
          rows={3}
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
