import { useEffect, useRef, useState } from 'react'
import type { JSX } from 'react'
import { api } from '../../lib/api'
import { useWorkspaceStore } from '../../store/workspace'
import ChatPanel from './ChatPanel'
import { IconChat, IconPlus, IconTask, IconTrash } from '../Icon'
import type { Session } from '@shared/types'

const STATUS_DOT: Record<Session['status'], string> = {
  idle: '',
  running: 'running',
  done: 'done',
  error: 'error'
}

// 副侧栏：分组会话（全局会话 / 任务会话）+ 内嵌对话（不占工作区）
export default function AuxPanel({
  projectId,
  taskIdFilter
}: {
  projectId: string
  taskIdFilter?: string | null
}): JSX.Element {
  const [sessions, setSessions] = useState<Session[]>([])
  const [tasks, setTasks] = useState<Record<string, string>>({})
  const [activeId, setActiveId] = useState<string | null>(null)
  const sessionsVersion = useWorkspaceStore((s) => s.sessionsVersion)
  const bumpSessions = useWorkspaceStore((s) => s.bumpSessions)
  // 用户显式选择/新建的会话：load() 不得把它弹回 filtered[0]。
  // 只在 projectId / taskIdFilter 变化时重置（切换过滤范围才重新自动选择）。
  const chosenRef = useRef<string | null>(null)
  const loadSeqRef = useRef(0)

  const load = (): void => {
    const seq = ++loadSeqRef.current
    api.sessions(projectId).then((all) => {
      if (seq !== loadSeqRef.current) return // 过期快照丢弃（10s 轮询与新建/删除竞速）
      const filtered = taskIdFilter ? all.filter((s) => s.taskId === taskIdFilter) : all
      // 显式选择的会话即使被当前过滤排除（如在任务过滤下新建了全局会话）也并入列表，保持可见
      const chosen = chosenRef.current ? all.find((s) => s.id === chosenRef.current) : undefined
      const list = chosen && !filtered.some((s) => s.id === chosen.id) ? [chosen, ...filtered] : filtered
      setSessions(list)
      setActiveId((cur) => {
        if (cur && list.some((s) => s.id === cur)) return cur
        return list[0]?.id ?? null
      })
    })
    api.tasks(projectId).then((ts) => setTasks(Object.fromEntries(ts.map((t) => [t.id, t.name]))))
  }

  // 过滤范围变化（项目/任务 tab 切换）：重置选择并加载
  useEffect(() => {
    chosenRef.current = null
    setActiveId(null)
    load()
    const timer = setInterval(load, 10_000)
    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, taskIdFilter])

  // 会话版本变化（聊天完成/新建/删除）：仅刷新列表，不重置选择
  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionsVersion])

  const [creating, setCreating] = useState(false)

  async function handleNew(taskScoped: boolean): Promise<void> {
    if (creating) return // 防抖：避免连点创建多条重复会话
    setCreating(true)
    const activeAtSend = activeId
    try {
      const s = await api.createSession(projectId, {
        taskId: taskScoped ? (taskIdFilter ?? null) : null,
        title: taskScoped ? (taskIdFilter ? (tasks[taskIdFilter] ?? '任务会话') : '任务会话') : '全局会话'
      })
      chosenRef.current = s.id
      // create 在途时用户若点了别的会话，则不覆盖其选择
      setActiveId((cur) => (cur === activeAtSend ? s.id : cur))
      bumpSessions()
    } finally {
      setCreating(false)
    }
  }

  async function handleDelete(id: string): Promise<void> {
    if (!window.confirm('删除该会话？')) return
    await api.deleteSession(id)
    if (activeId === id) setActiveId(null)
    if (chosenRef.current === id) chosenRef.current = null
    load()
  }

  const globalSessions = sessions.filter((s) => s.taskId === null)
  const taskSessions = sessions.filter((s) => s.taskId !== null)

  return (
    <div className="aux-panel">
      <div className="ws-aux-head">
        <span>会话</span>
        <div className="row gap">
          <button
            className="icon-btn"
            title={taskIdFilter ? '新建任务会话' : '请先打开一个任务选项卡'}
            disabled={creating || !taskIdFilter}
            onClick={() => handleNew(true)}
          >
            <IconTask size={13} />
          </button>
          <button
            className="icon-btn"
            title="新建全局会话"
            disabled={creating}
            onClick={() => handleNew(false)}
          >
            <IconPlus size={13} />
          </button>
        </div>
      </div>

      <div className="aux-list">
        <Group
          title={`全局会话（${globalSessions.length}）`}
          sessions={globalSessions}
          tasks={tasks}
          activeId={activeId}
          onSelect={(id) => {
            chosenRef.current = id
            setActiveId(id)
          }}
          onDelete={handleDelete}
          global
        />
        <Group
          title={`任务会话（${taskSessions.length}）`}
          sessions={taskSessions}
          tasks={tasks}
          activeId={activeId}
          onSelect={(id) => {
            chosenRef.current = id
            setActiveId(id)
          }}
          onDelete={handleDelete}
        />
      </div>

      {activeId && (
        <div className="aux-chat">
          <ChatPanel key={activeId} sessionId={activeId} />
        </div>
      )}
    </div>
  )
}

function Group({
  title,
  sessions,
  tasks,
  activeId,
  onSelect,
  onDelete,
  global
}: {
  title: string
  sessions: Session[]
  tasks: Record<string, string>
  activeId: string | null
  onSelect: (id: string) => void
  onDelete: (id: string) => void
  global?: boolean
}): JSX.Element {
  if (sessions.length === 0) return <></>
  return (
    <div className="aux-group">
      <div className="aux-group-title">{title}</div>
      {sessions.map((s) => (
        <div
          key={s.id}
          className={`aux-item${s.id === activeId ? ' active' : ''}`}
          onClick={() => onSelect(s.id)}
        >
          {global ? <IconChat size={11} /> : <IconTask size={11} />}
          <span className="aux-item-title">
            {['新会话', '全局会话', '任务会话', '文件讨论'].includes(s.title)
              ? `${s.title} · ${new Date(s.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`
              : s.title}
          </span>
          <span className={`ws-dot ${STATUS_DOT[s.status]}`} />
          <span className="aux-item-task">{global ? '' : tasks[s.taskId ?? ''] ?? ''}</span>
          <button
            className="icon-btn aux-item-del"
            title="删除"
            onClick={(e) => {
              e.stopPropagation()
              onDelete(s.id)
            }}
          >
            <IconTrash size={11} />
          </button>
        </div>
      ))}
    </div>
  )
}
