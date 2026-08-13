import { useEffect, useMemo, useState } from 'react'
import type { JSX, ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { useWorkspaceStore, tabIdFor } from '../store/workspace'
import { IconClose, IconSearch } from './Icon'
import type { Literature, Project, Session, Task } from '@shared/types'

// 悬浮全局搜索（托盘菜单 / Ctrl+Shift+P 触发）：搜索项目 / 任务 / 会话 / 文件 / 文献
export default function GlobalSearch(): JSX.Element {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const navigate = useNavigate()
  const { openTab } = useWorkspaceStore()
  const [projects, setProjects] = useState<Project[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [sessions, setSessions] = useState<Session[]>([])
  const [literature, setLiterature] = useState<Literature[]>([])
  const [files, setFiles] = useState<{ name: string; project: string; projectId: string }[]>([])

  useEffect(() => {
    const onGlobal = (): void => setOpen(true)
    window.api.onGlobalSearch(onGlobal)
    const onKey = (e: KeyboardEvent): void => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'p') {
        e.preventDefault()
        setOpen((v) => !v)
      }
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  // load indexes once
  useEffect(() => {
    if (!open) return
    setQ('')
    api.projects().then(setProjects).catch(() => undefined)
    api.literature().then(setLiterature).catch(() => undefined)
    Promise.all(
      projects.length === 0
        ? []
        : projects.map(async (p) => {
            const [ts, ss, tree] = await Promise.all([
              api.tasks(p.id).catch(() => [] as Task[]),
              api.sessions(p.id).catch(() => [] as Session[]),
              api.tree(p.id).catch(() => [])
            ])
            const flatFiles: { name: string; project: string; projectId: string }[] = []
            const walk = (nodes: { name: string; path: string; children?: unknown[] }[]): void => {
              for (const n of nodes) {
                if (n.children) walk(n.children as never)
                else flatFiles.push({ name: `${p.name}/${n.path}`, project: p.name, projectId: p.id })
              }
            }
            walk(tree)
            return { ts, ss, files: flatFiles }
          })
    )
      .then((all) => {
        setTasks(all.flatMap((a) => a.ts))
        setSessions(all.flatMap((a) => a.ss))
        setFiles(all.flatMap((a) => a.files))
      })
      .catch(() => undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const results = useMemo(() => {
    const query = q.trim().toLowerCase()
    if (!query) return null
    const match = (s: string): boolean => s.toLowerCase().includes(query)
    return {
      projects: projects.filter((p) => match(p.name) || match(p.description)).slice(0, 5),
      tasks: tasks.filter((t) => match(t.name)).slice(0, 8),
      sessions: sessions.filter((s) => match(s.title)).slice(0, 8),
      files: files.filter((f) => match(f.name)).slice(0, 8),
      literature: literature.filter((l) => match(l.title) || match(l.venue)).slice(0, 5)
    }
  }, [q, projects, tasks, sessions, files, literature])

  if (!open) return <></>

  function go(
    projectId: string,
    tab?: { kind: 'file' | 'task' | 'session'; refId: string; title: string }
  ): void {
    setOpen(false)
    navigate(`/projects/${projectId}`)
    if (tab) {
      // open in the workspace after navigation
      setTimeout(() => {
        openTab({ id: tabIdFor(tab.kind, tab.refId), kind: tab.kind, title: tab.title, refId: tab.refId })
      }, 150)
    }
  }

  return (
    <div className="global-search-overlay" onMouseDown={() => setOpen(false)}>
      <div className="global-search" onMouseDown={(e) => e.stopPropagation()}>
        <div className="global-search-input">
          <IconSearch size={15} />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜索项目、任务、会话、文件、文献…"
            spellCheck={false}
          />
          <button className="icon-btn" onClick={() => setOpen(false)}>
            <IconClose size={14} />
          </button>
        </div>
        {results && (
          <div className="global-search-results">
            {results.projects.length > 0 && (
              <Group title="项目" children={results.projects.map((p) => (
                  <button key={p.id} className="gs-item" onClick={() => go(p.id)}>
                    {p.name}
                    <span className="gs-hint">{p.type}</span>
                  </button>
                ))} />
            )}
            {results.tasks.length > 0 && (
              <Group title="任务" children={results.tasks.map((t) => (
                  <button key={t.id} className="gs-item" onClick={() => go(t.projectId, { kind: 'task', refId: t.id, title: t.name })}>
                    {t.name}
                    <span className="gs-hint">{t.projectId.slice(0, 6)}</span>
                  </button>
                ))} />
            )}
            {results.sessions.length > 0 && (
              <Group title="会话" children={results.sessions.map((s) => (
                  <button key={s.id} className="gs-item" onClick={() => go(s.projectId, { kind: 'session', refId: s.id, title: s.title })}>
                    {s.title}
                  </button>
                ))} />
            )}
            {results.files.length > 0 && (
              <Group title="文件" children={results.files.map((f, i) => (
                  <button key={i} className="gs-item" onClick={() => go(f.projectId, { kind: 'file', refId: f.name.slice(f.project.length + 1), title: f.name.split('/').pop() ?? f.name })}>
                    {f.name}
                  </button>
                ))} />
            )}
            {results.literature.length > 0 && (
              <Group title="文献" children={results.literature.map((l) => (
                  <button key={l.id} className="gs-item" onClick={() => setOpen(false)}>
                    {l.title}
                    <span className="gs-hint">{l.venue}</span>
                  </button>
                ))} />
            )}
            {(Object.values(results) as { length: number }[]).every((r) => r.length === 0) && (
              <div className="gs-empty">无匹配结果</div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function Group({ title, children }: { title: string; children: ReactNode }): JSX.Element {
  return (
    <div className="gs-group">
      <div className="gs-group-title">{title}</div>
      {children}
    </div>
  )
}
