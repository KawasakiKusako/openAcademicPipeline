import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import type { JSX } from 'react'
import { api } from '../../lib/api'
import { useWorkspaceStore, tabIdFor } from '../../store/workspace'
import { IconChat, IconPlus } from '../Icon'
import type { Task, TaskKind } from '@shared/types'

const KIND_LABEL: Record<TaskKind, string> = { chat: '会话', sandbox: '沙盒', form: '表单' }
const STATUS_LABEL: Record<Task['status'], string> = {
  todo: '待办',
  in_progress: '进行中',
  done: '已完成'
}

// 任务视图：项目任务列表，点击任务在工作台打开
export default function TasksView({ projectId }: { projectId: string }): JSX.Element {
  const { openTab, bumpSessions } = useWorkspaceStore()
  const [tasks, setTasks] = useState<Task[]>([])
  const [types, setTypes] = useState<Record<string, { label: string; kind: TaskKind }>>({})
  const [createOpen, setCreateOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState('research-consult')
  const chatBusy = useRef(false)

  const load = (): void => {
    api.tasks(projectId).then(setTasks).catch(() => undefined)
  }

  useEffect(() => {
    load()
    api
      .taskTypes()
      .then((ts) => setTypes(Object.fromEntries(ts.map((t) => [t.type, t]))))
      .catch(() => undefined)
  }, [projectId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleCreate(e: FormEvent): Promise<void> {
    e.preventDefault()
    if (!newName.trim()) return
    const t = await api.createTask(projectId, { name: newName.trim(), type: newType })
    setNewName('')
    setCreateOpen(false)
    load()
    openTab({ id: tabIdFor('task', t.id), kind: 'task', title: t.name, refId: t.id })
  }

  function openTask(task: Task): void {
    openTab({ id: tabIdFor('task', task.id), kind: 'task', title: task.name, refId: task.id })
  }

  async function cycleStatus(task: Task): Promise<void> {
    const next: Task['status'] =
      task.status === 'todo' ? 'in_progress' : task.status === 'in_progress' ? 'done' : 'todo'
    await api.updateTask(task.id, { status: next })
    load()
  }

  // 打开任务会话：防抖 + 复用该任务最近空闲会话（无则创建），避免重复会话堆积
  async function openTaskSession(task: Task): Promise<void> {
    if (chatBusy.current) return
    chatBusy.current = true
    try {
      const sessions = await api.sessions(projectId)
      const session =
        sessions.find((s) => s.taskId === task.id && s.status !== 'running') ??
        (await api.createSession(projectId, { taskId: task.id, title: task.name }))
      openTab({ id: tabIdFor('session', session.id), kind: 'session', title: session.title, refId: session.id })
      bumpSessions()
    } catch {
      // ignore
    } finally {
      setTimeout(() => (chatBusy.current = false), 500)
    }
  }

  return (
    <div className="ws-side">
      <div className="ws-side-head">
        <span>任务</span>
        <button className="icon-btn" title="新建任务" onClick={() => setCreateOpen((v) => !v)}>
          <IconPlus size={13} />
        </button>
      </div>
      {createOpen && (
        <form className="ws-new" onSubmit={handleCreate}>
          <input
            value={newName}
            autoFocus
            onChange={(e) => setNewName(e.target.value)}
            placeholder="任务名称"
            spellCheck={false}
          />
          <select value={newType} onChange={(e) => setNewType(e.target.value)} style={{ marginTop: 4, width: '100%' }}>
            {Object.keys(types).map((key) => {
              const def = types[key]
              return (
              <option key={key} value={key}>
                {def.label}
              </option>
              )
            })}
          </select>
          <button type="submit" className="btn small primary" style={{ marginTop: 4 }}>
            创建
          </button>
        </form>
      )}
      <div className="ws-side-body">
        {tasks.map((task) => {
          const type = types[task.type]
          return (
            <div key={task.id} className="ws-task" onClick={() => openTask(task)}>
              <div className="ws-task-title">
                <span>{task.name}</span>
                <span className="badge subtle">
                  {type?.label ?? task.type} · {type ? KIND_LABEL[type.kind] : ''}
                </span>
              </div>
              <div className="ws-task-meta">
                <button
                  className={`status-chip ${task.status}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    cycleStatus(task)
                  }}
                  title="切换状态"
                >
                  {STATUS_LABEL[task.status]}
                </button>
                <button
                  className="icon-btn"
                  title="打开任务会话（复用最近会话）"
                  onClick={(e) => {
                    e.stopPropagation()
                    void openTaskSession(task)
                  }}
                >
                  <IconChat size={13} />
                </button>
              </div>
            </div>
          )
        })}
        {tasks.length === 0 && <div className="ws-empty">暂无任务</div>}
      </div>
    </div>
  )
}
