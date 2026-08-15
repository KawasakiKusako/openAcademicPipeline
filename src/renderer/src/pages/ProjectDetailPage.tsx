import { useCallback, useEffect, useState } from 'react'
import type { JSX } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import TaskCreator from '../components/TaskCreator'
import FileBrowser from '../components/FileBrowser'
import NotesView from '../components/workspace/NotesView'
import LiteraturePanel from '../components/LiteraturePanel'
import { IconBack, IconChat, IconEdit, IconFile, IconLibrary, IconTask, IconTrash } from '../components/Icon'
import { api } from '../lib/api'
import { useProjectsStore } from '../store/projects'
import type { Library, Project, Session, SessionEngine, Task } from '@shared/types'

const TASK_STATUS_LABEL: Record<Task['status'], string> = {
  todo: '待办',
  in_progress: '进行中',
  done: '已完成'
}

const SESSION_STATUS_LABEL: Record<Session['status'], string> = {
  idle: '空闲',
  running: '运行中',
  done: '已完成',
  error: '出错'
}

type Tab = 'tasks' | 'sessions' | 'files' | 'library'

export default function ProjectDetailPage(): JSX.Element {
  const { projectId = '' } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { projectTypes, loadProjectTypes } = useProjectsStore()

  const [project, setProject] = useState<Project | null>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [sessions, setSessions] = useState<Session[]>([])
  const [libraries, setLibraries] = useState<Library[]>([])
  const [tab, setTab] = useState<Tab>(() => (searchParams.get('tab') as Tab) ?? 'tasks')
  const [libraryTab, setLibraryTab] = useState<'lit' | 'notes'>(
    () => (searchParams.get('lib') as 'lit' | 'notes') ?? 'lit'
  )
  const [error, setError] = useState<string | null>(null)
  const [newSessionEngine, setNewSessionEngine] = useState<SessionEngine>('cli')
  const [taskTypes, setTaskTypes] = useState<{ type: string; label: string }[]>([])
  const [arsSkills, setArsSkills] = useState<
    Record<string, { skill: string; mode: string; label: string; hint: string }>
  >({})

  const reload = useCallback(async () => {
    try {
      const [p, t, s, l] = await Promise.all([
        api.project(projectId),
        api.tasks(projectId),
        api.sessions(projectId),
        api.libraries(projectId)
      ])
      setProject(p)
      setTasks(t)
      setSessions(s)
      setLibraries(l)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [projectId])

  useEffect(() => {
    reload()
    loadProjectTypes()
    api.taskTypes().then(setTaskTypes).catch(() => undefined)
    api.arsSkills().then(setArsSkills).catch(() => undefined)
  }, [reload, loadProjectTypes])

  const typeLabel =
    projectTypes.find((t) => t.type === project?.type)?.label ?? project?.type ?? ''

  async function handleDeleteTask(id: string): Promise<void> {
    if (!window.confirm('确定删除该任务？')) return
    await api.deleteTask(id)
    setTasks((s) => s.filter((t) => t.id !== id))
  }

  async function handleCycleTaskStatus(task: Task): Promise<void> {
    const next: Task['status'] =
      task.status === 'todo' ? 'in_progress' : task.status === 'in_progress' ? 'done' : 'todo'
    const updated = await api.updateTask(task.id, { status: next })
    setTasks((s) => s.map((t) => (t.id === task.id ? updated : t)))
  }

  async function handleStartSession(task?: Task): Promise<void> {
    // 复用同作用域最近空闲会话（任务会话按任务、否则全局），避免重复会话堆积
    const sessions = await api.sessions(projectId)
    const existing = sessions.find(
      (s) => (task ? s.taskId === task.id : s.taskId === null) && s.status !== 'running'
    )
    const session =
      existing ??
      (await api.createSession(projectId, {
        taskId: task?.id ?? null,
        engine: newSessionEngine
      }))
    navigate(`/projects/${projectId}/sessions/${session.id}`)
  }

  async function handleDeleteSession(id: string): Promise<void> {
    if (!window.confirm('确定删除该会话？消息记录将一并删除。')) return
    await api.deleteSession(id)
    setSessions((s) => s.filter((x) => x.id !== id))
  }

  async function handleDeleteProject(): Promise<void> {
    if (!window.confirm('确定删除该项目？沙盒文件会保留在磁盘上。')) return
    const { deleteProject } = useProjectsStore.getState()
    await deleteProject(projectId)
    navigate('/projects')
  }

  if (error && !project) return <div className="error-box">{error}</div>
  if (!project) return <p className="muted">加载中…</p>

  return (
    <div className="page">
      <header className="page-head">
        <Link to="/projects" className="back-link">
          <IconBack size={14} />
          项目总览
        </Link>
        <div className="row gap" style={{ marginTop: 6 }}>
          <div>
            <div className="project-title-row">
              <h2>{project.name}</h2>
              <span className="badge">{typeLabel}</span>
            </div>
            <p className="muted">{project.description || '暂无描述'}</p>
          </div>
          <div className="row-actions" style={{ marginLeft: 'auto' }}>
            <Link to={`/projects/${project.id}/edit`} className="btn ghost small">
              <IconEdit size={13} />
              编辑
            </Link>
            <button className="btn ghost small danger" onClick={handleDeleteProject}>
              <IconTrash size={13} />
              删除
            </button>
          </div>
        </div>
      </header>

      <div className="tabs">
        <button className={tab === 'tasks' ? 'tab active' : 'tab'} onClick={() => setTab('tasks')}>
          <IconTask size={14} />
          任务
        </button>
        <button
          className={tab === 'sessions' ? 'tab active' : 'tab'}
          onClick={() => setTab('sessions')}
        >
          <IconChat size={14} />
          会话
        </button>
        <button className={tab === 'files' ? 'tab active' : 'tab'} onClick={() => setTab('files')}>
          <IconFile size={14} />
          文件
        </button>
        <button
          className={tab === 'library' ? 'tab active' : 'tab'}
          onClick={() => setTab('library')}
        >
          <IconLibrary size={14} />
          知识库
        </button>
      </div>

      {tab === 'tasks' && (
        <section>
          <TaskCreator
            projectId={projectId}
            onCreated={(task) => setTasks((s) => [...s, task])}
          />
          <div className="list">
            {tasks.map((task) => (
              <div
                key={task.id}
                className="list-item clickable"
                onClick={() => navigate(`/projects/${projectId}/tasks/${task.id}`)}
              >
                <div className="list-item-main">
                  <div className="list-item-title">
                    {task.name}
                    <span className="badge subtle">
                      {taskTypes.find((t) => t.type === task.type)?.label ?? task.type}
                    </span>
                    {(task.skill ? arsSkills[task.skill] : arsSkills[task.type]) && (
                      <span className="badge skill" title="会话将注入此 ARS 技能提示词">
                        {(task.skill ? arsSkills[task.skill] : arsSkills[task.type]).label}
                      </span>
                    )}
                  </div>
                  {task.prompt && <p className="muted small">{task.prompt}</p>}
                </div>
                <div className="list-item-actions" onClick={(e) => e.stopPropagation()}>
                  <button
                    className={`status-chip ${task.status}`}
                    onClick={() => handleCycleTaskStatus(task)}
                    title="点击切换状态"
                  >
                    {TASK_STATUS_LABEL[task.status]}
                  </button>
                  <button className="btn small" onClick={() => handleStartSession(task)}>
                    创建会话
                  </button>
                  <button className="btn small danger" onClick={() => handleDeleteTask(task.id)}>
                    删除
                  </button>
                </div>
              </div>
            ))}
            {tasks.length === 0 && <p className="muted">暂无任务，使用上方的任务创建器添加。</p>}
          </div>
        </section>
      )}

      {tab === 'sessions' && (
        <section>
          <div className="row gap">
            <select
              className="engine-select"
              value={newSessionEngine}
              onChange={(e) => setNewSessionEngine(e.target.value as SessionEngine)}
              title="cli：运行于项目沙盒（cc-switch 模型自动生效）；api：直连 Anthropic API 保底"
            >
              <option value="cli">引擎：Claude Code (CLI)</option>
              <option value="api">引擎：API 保底</option>
            </select>
            <button className="btn primary" onClick={() => handleStartSession()}>
              + 新建会话
            </button>
          </div>
          <div className="list">
            {sessions.map((session) => {
              const task = tasks.find((t) => t.id === session.taskId)
              return (
                <div key={session.id} className="list-item">
                  <div className="list-item-main">
                    <div className="list-item-title">
                      {session.title}
                      <span className="badge subtle">{SESSION_STATUS_LABEL[session.status]}</span>
                    </div>
                    <p className="muted small">
                      {task ? `关联任务：${task.name}` : '项目级会话'}
                      {' · '}
                      {new Date(session.updatedAt).toLocaleString('zh-CN')}
                    </p>
                  </div>
                  <div className="list-item-actions">
                    <span className="badge subtle">{session.engine === 'api' ? 'API' : 'CLI'}</span>
                    <button
                      className="btn small"
                      onClick={() =>
                        navigate(`/projects/${projectId}/sessions/${session.id}`)
                      }
                    >
                      打开
                    </button>
                    <button className="btn small danger" onClick={() => handleDeleteSession(session.id)}>
                      删除
                    </button>
                  </div>
                </div>
              )
            })}
            {sessions.length === 0 && (
              <p className="muted">暂无会话。可在任务中创建会话，由 AI 填写表单或执行任务操作。</p>
            )}
          </div>
        </section>
      )}

      {tab === 'files' && <FileBrowser projectId={projectId} />}

      {tab === 'library' && (
        <section>
          <div className="sub-tabs">
            <button
              className={libraryTab === 'lit' ? 'tab active' : 'tab'}
              onClick={() => setLibraryTab('lit')}
            >
              文献库
            </button>
            <button
              className={libraryTab === 'notes' ? 'tab active' : 'tab'}
              onClick={() => setLibraryTab('notes')}
            >
              笔记库
            </button>
          </div>
          {libraryTab === 'lit' ? (
            <LiteraturePanel />
          ) : (
            <NotesView projectId={projectId} libraries={libraries} onChanged={reload} />
          )}
        </section>
      )}
    </div>
  )
}
