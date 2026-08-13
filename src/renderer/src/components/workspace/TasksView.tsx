import { useEffect, useState } from 'react'
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
  const { openTab } = useWorkspaceStore()
  const [tasks, setTasks] = useState<Task[]>([])
  const [types, setTypes] = useState<Record<string, { label: string; kind: TaskKind }>>({})
  const [createOpen, setCreateOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState('research-consult')

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
                  title="创建会话（打开副侧栏）"
                  onClick={(e) => {
                    e.stopPropagation()
                    api.createSession(projectId, { taskId: task.id, title: task.name }).then((s) => {
                      openTab({
                        id: tabIdFor('session', s.id),
                        kind: 'session',
                        title: s.title,
                        refId: s.id
                      })
                    })
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
