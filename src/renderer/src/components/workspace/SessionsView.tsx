import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import { api } from '../../lib/api'
import { useWorkspaceStore, tabIdFor } from '../../store/workspace'
import { IconChat, IconPlus, IconTrash } from '../Icon'
import type { Session } from '@shared/types'

const STATUS_DOT: Record<Session['status'], string> = {
  idle: '',
  running: 'running',
  done: 'done',
  error: 'error'
}

// 会话列表：主侧栏（全部会话）与副侧栏（当前任务会话）共用
export default function SessionsView({
  projectId,
  taskIdFilter
}: {
  projectId: string
  taskIdFilter?: string | null
}): JSX.Element {
  const { openTab } = useWorkspaceStore()
  const [sessions, setSessions] = useState<Session[]>([])
  const [tasks, setTasks] = useState<Record<string, string>>({})

  const load = (): void => {
    api.sessions(projectId).then((all) => {
      setSessions(taskIdFilter ? all.filter((s) => s.taskId === taskIdFilter) : all)
    })
    api.tasks(projectId).then((ts) => setTasks(Object.fromEntries(ts.map((t) => [t.id, t.name]))))
  }

  useEffect(() => {
    load()
  }, [projectId, taskIdFilter]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleNew(): Promise<void> {
    const s = await api.createSession(projectId, { taskId: taskIdFilter ?? null })
    openTab({ id: tabIdFor('session', s.id), kind: 'session', title: s.title, refId: s.id })
    load()
  }

  async function handleDelete(id: string): Promise<void> {
    if (!window.confirm('删除该会话？')) return
    await api.deleteSession(id)
    load()
  }

  return (
    <div className="ws-side">
      <div className="ws-side-head">
        <span>会话</span>
        <button className="icon-btn" title="新建会话" onClick={handleNew}>
          <IconPlus size={13} />
        </button>
      </div>
      <div className="ws-side-body">
        {renderGroup(sessions.filter((s) => s.taskId === null), '全局会话')}
        {renderGroup(sessions.filter((s) => s.taskId !== null), '任务会话')}
        {sessions.length === 0 && <div className="ws-empty">暂无会话</div>}
      </div>
    </div>
  )

  function renderGroup(group: Session[], title: string): JSX.Element {
    if (group.length === 0) return <></>
    return (
      <div key={title}>
        <div className="aux-group-title">{title}（{group.length}）</div>
        {group.map((s) => (
          <div
            key={s.id}
            className="ws-session"
            onClick={() =>
              openTab({ id: tabIdFor('session', s.id), kind: 'session', title: s.title, refId: s.id })
            }
          >
            <div className="ws-session-title">
              <IconChat size={12} />
              <span>{s.title}</span>
              <span className={`ws-dot ${STATUS_DOT[s.status]}`} />
            </div>
            <div className="ws-session-meta">
              {s.taskId ? (tasks[s.taskId] ?? '任务会话') : '全局会话'}
              <button
                className="icon-btn ws-session-del"
                title="删除"
                onClick={(e) => {
                  e.stopPropagation()
                  handleDelete(s.id)
                }}
              >
                <IconTrash size={12} />
              </button>
            </div>
          </div>
        ))}
      </div>
    )
  }
}
