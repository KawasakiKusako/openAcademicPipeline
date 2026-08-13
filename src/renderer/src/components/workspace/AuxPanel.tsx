import { useEffect, useState } from 'react'
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

  const load = (): void => {
    api.sessions(projectId).then((all) => {
      const filtered = taskIdFilter ? all.filter((s) => s.taskId === taskIdFilter) : all
      setSessions(filtered)
      setActiveId((cur) => (cur && filtered.some((s) => s.id === cur) ? cur : filtered[0]?.id ?? null))
    })
    api.tasks(projectId).then((ts) => setTasks(Object.fromEntries(ts.map((t) => [t.id, t.name]))))
  }

  // 实时更新：会话版本变化（聊天完成/新建/删除）或轮询兜底（10s）
  useEffect(() => {
    load()
  }, [projectId, taskIdFilter, sessionsVersion]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const timer = setInterval(load, 10_000)
    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, taskIdFilter])

  async function handleNew(taskScoped: boolean): Promise<void> {
    const s = await api.createSession(projectId, {
      taskId: taskScoped ? (taskIdFilter ?? null) : null,
      title: taskScoped ? (taskIdFilter ? (tasks[taskIdFilter] ?? '任务会话') : '任务会话') : '全局会话'
    })
    setActiveId(s.id)
    load()
  }

  async function handleDelete(id: string): Promise<void> {
    if (!window.confirm('删除该会话？')) return
    await api.deleteSession(id)
    if (activeId === id) setActiveId(null)
    load()
  }

  const globalSessions = sessions.filter((s) => s.taskId === null)
  const taskSessions = sessions.filter((s) => s.taskId !== null)

  return (
    <div className="aux-panel">
      <div className="ws-aux-head">
        <span>会话</span>
        <div className="row gap">
          <button className="icon-btn" title="新建任务会话" onClick={() => handleNew(true)}>
            <IconTask size={13} />
          </button>
          <button className="icon-btn" title="新建全局会话" onClick={() => handleNew(false)}>
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
          onSelect={setActiveId}
          onDelete={handleDelete}
          global
        />
        <Group
          title={`任务会话（${taskSessions.length}）`}
          sessions={taskSessions}
          tasks={tasks}
          activeId={activeId}
          onSelect={setActiveId}
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
          <span className="aux-item-title">{s.title}</span>
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
