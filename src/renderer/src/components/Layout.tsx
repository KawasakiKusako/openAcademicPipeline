import { useEffect, useMemo, useState } from 'react'
import type { JSX } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { useProjectsStore } from '../store/projects'
import { useWorkspaceStore } from '../store/workspace'
import TitleBar, { buildMenus } from './TitleBar'
import StatusBar from './StatusBar'
import GlobalSearch from './GlobalSearch'
import GlobalChatPopup from './GlobalChatPopup'
import TempChatPopup from './TempChatPopup'
import AboutModal from './AboutModal'
import {
  IconBook,
  IconChat,
  IconFolder,
  IconLibrary,
  IconMoon,
  IconPlus,
  IconProject,
  IconSearch,
  IconSettings,
  IconSun,
  IconTask
} from './Icon'
import type { ClaudeStatus, Project, ProjectTypeTemplate, Theme } from '@shared/types'
import appIcon from '../assets/app-icon.png'

function typeLabel(types: ProjectTypeTemplate[], type: string): string {
  return types.find((t) => t.type === type)?.label ?? type
}

export default function Layout(): JSX.Element {
  const { projects, projectTypes, loadProjects, loadProjectTypes } = useProjectsStore()
  const [query, setQuery] = useState('')
  const [claude, setClaude] = useState<ClaudeStatus | null>(null)
  const [currentProject, setCurrentProject] = useState<Project | null>(null)
  const [pythonEnv, setPythonEnv] = useState('系统 Python')
  const [totalCost, setTotalCost] = useState<number | null>(null)
  const {
    sidebarView,
    setSidebarView,
    wordWrap,
    setWordWrap,
    fontSize,
    setFontSize,
    requestSave,
    closeTab,
    activeTabId,
    toggleSidebar,
    togglePanel,
    toggleAux,
    openTab,
    theme,
    accent,
    customAccent,
    setTheme,
    setAccent,
    setCustomAccent
  } = useWorkspaceStore()
  const location = useLocation()
  const navigate = useNavigate()
  const inProject = /^\/projects\/[^/]+$/.test(location.pathname)

  // current project id from route /projects/:id
  const projectId = useMemo(() => {
    const m = location.pathname.match(/^\/projects\/([^/]+)/)
    return m ? m[1] : null
  }, [location.pathname])

  useEffect(() => {
    api
      .settings()
      .then((s) => {
        setTheme(s.theme)
        setAccent(s.accent)
        setCustomAccent(s.customAccent)
        setPythonEnv(
          s.pythonEnv.type === 'conda'
            ? `conda: ${s.pythonEnv.value}`
            : s.pythonEnv.type === 'uv'
              ? 'uv (.venv)'
              : '系统 Python'
        )
      })
      .catch(() => undefined)
  }, [])

  useEffect(() => {
    document.documentElement.dataset['theme'] = theme
    document.documentElement.dataset['accent'] = accent
    document.documentElement.style.setProperty('--custom-accent', customAccent)
  }, [theme, accent, customAccent])

  useEffect(() => {
    loadProjects()
    loadProjectTypes()
    api.claudeStatus().then(setClaude).catch(() => undefined)
  }, [loadProjects, loadProjectTypes])

  useEffect(() => {
    loadProjects()
  }, [location.pathname, loadProjects])

  // load the project under the current route (for title bar + status bar)
  useEffect(() => {
    if (!projectId) {
      setCurrentProject(null)
      setTotalCost(null)
      return
    }
    api
      .project(projectId)
      .then(setCurrentProject)
      .catch(() => setCurrentProject(null))
    api
      .projectStats(projectId)
      .then((s) => setTotalCost(s.totalCost))
      .catch(() => setTotalCost(null))
  }, [projectId])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return projects
    return projects.filter(
      (p) => p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q)
    )
  }, [projects, query])

  const engineDown = claude && !claude.cliAvailable && !claude.apiKeyConfigured

  function toggleTheme(): void {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    api.updateSettings({ theme: next }).catch(() => undefined)
  }

  const menus = buildMenus({
    navigate,
    projectId,
    sandboxPath: currentProject?.sandboxPath ?? null,
    theme,
    toggleTheme,
    wordWrap,
    setWordWrap,
    fontSize,
    setFontSize,
    requestSave,
    closeActiveTab: () => {
      if (activeTabId) closeTab(activeTabId)
    },
    toggleSidebar,
    togglePanel,
    toggleAux,
    onAbout: () => setAboutOpen(true),
    onTempChat: () => setTempChatOpen(true),
    onRecommend: () => {
      if (projectId) {
        openTab({ id: 'recommend:main', kind: 'recommend', title: '推荐阅读', refId: 'main' })
      } else {
        navigate('/recommendations')
      }
    },
    onCheckUpdate: () => {
      api
        .checkUpdate()
        .then((u) => {
          if (u.updateAvailable && u.latest) {
            window.alert(
              `发现新版本 v${u.latest}（当前 v${u.current}）。\n\n下载地址：\n${u.downloadPages.join('\n')}`
            )
          } else {
            window.alert(`当前已是最新版本 v${u.current}`)
          }
        })
        .catch(() => window.alert('检查更新失败，请检查网络'))
    },
    onExportProject: () => {
      if (!projectId) return
      api.exportProject(projectId).then((data) => {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${currentProject?.name ?? 'project'}-export.json`
        a.click()
        URL.revokeObjectURL(url)
      })
    },
    onImportProject: () => {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = '.json'
      input.onchange = async () => {
        const file = input.files?.[0]
        if (!file) return
        const text = await file.text()
        try {
          const data = JSON.parse(text)
          const r = await api.importProject(data)
          loadProjects()
          navigate(`/projects/${r.id}`)
        } catch (err) {
          window.alert(`导入失败：${err instanceof Error ? err.message : String(err)}`)
        }
      }
      input.click()
    }
  })

  const [chatIdea, setChatIdea] = useState<string>('')
  const [chatPopupOpen, setChatPopupOpen] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(false)
  const [tempChatOpen, setTempChatOpen] = useState(false)

  // 托盘菜单"开始临时对话"
  useEffect(() => {
    window.api.onTempChat(() => setTempChatOpen(true))
  }, [])

  // 启动时检查新版本
  useEffect(() => {
    api
      .checkUpdate()
      .then((u) => {
        if (u.updateAvailable && u.latest) {
          window.alert(
            `发现新版本 v${u.latest}（当前 v${u.current}）。\n\n下载地址：\n${u.downloadPages.join('\n')}`
          )
        }
      })
      .catch(() => undefined)
  }, [])

  return (
    <div className="app-frame">
      <TitleBar
        menus={menus}
        projectLabel={currentProject?.name ?? null}
        onChatIdea={
          projectId
            ? (text) => {
                setChatIdea(text)
                setChatPopupOpen(true)
              }
            : undefined
        }
        onChatOpen={
          projectId
            ? () => {
                setChatIdea('')
                setChatPopupOpen(true)
              }
            : undefined
        }
      />

      <div className="shell">
        {/* activity bar (VSCode style); inside a project it switches sidebar views */}
        <nav className="activity-bar">
          <div className="activity-group">
            {inProject ? (
              <>
                <button
                  className={`activity-btn${sidebarView === 'explorer' ? ' active' : ''}`}
                  title="资源管理器"
                  onClick={() => setSidebarView('explorer')}
                >
                  <IconFolder size={19} />
                </button>
                <button
                  className={`activity-btn${sidebarView === 'tasks' ? ' active' : ''}`}
                  title="任务"
                  onClick={() => setSidebarView('tasks')}
                >
                  <IconTask size={19} />
                </button>
                <button
                  className={`activity-btn${sidebarView === 'sessions' ? ' active' : ''}`}
                  title="会话"
                  onClick={() => setSidebarView('sessions')}
                >
                  <IconChat size={19} />
                </button>
                <button
                  className={`activity-btn${sidebarView === 'library' ? ' active' : ''}`}
                  title="知识库"
                  onClick={() => setSidebarView('library')}
                >
                  <IconLibrary size={19} />
                </button>
                <button
                  className="activity-btn"
                  title="推荐阅读"
                  onClick={() => navigate(`/projects/${projectId}/recommendations`)}
                >
                  <IconBook size={19} />
                </button>
              </>
            ) : (
              <>
                <button
                  className={`activity-btn${location.pathname.startsWith('/projects') ? ' active' : ''}`}
                  title="项目总览"
                  onClick={() => navigate('/projects')}
                >
                  <IconProject size={19} />
                </button>
                <button
                  className={`activity-btn${location.pathname === '/library' ? ' active' : ''}`}
                  title="知识库"
                  onClick={() => navigate('/library')}
                >
                  <IconLibrary size={19} />
                </button>
                <button
                  className={`activity-btn${location.pathname === '/recommendations' ? ' active' : ''}`}
                  title="推荐阅读"
                  onClick={() => navigate('/recommendations')}
                >
                  <IconBook size={19} />
                </button>
              </>
            )}
          </div>
          <div className="activity-group">
            <button
              className={`activity-btn${location.pathname === '/settings' ? ' active' : ''}`}
              title="设置"
              onClick={() => {
                if (inProject) {
                  openTab({ id: 'settings:main', kind: 'settings', title: '设置', refId: 'main' })
                } else {
                  navigate('/settings')
                }
              }}
            >
              <IconSettings size={19} />
            </button>
            <button className="activity-btn" title="切换主题" onClick={toggleTheme}>
              {theme === 'dark' ? <IconSun size={17} /> : <IconMoon size={17} />}
            </button>
          </div>
        </nav>

        {!inProject && <aside className="sidebar">
          <Link to="/projects" className="brand">
            <span className="brand-mark">
              <img src={appIcon} alt="" />
            </span>
            <div className="brand-text">
              <span className="brand-name">Open Academic Pipeline</span>
              <span className="brand-tag">Research · Write · Review · Revise</span>
            </div>
          </Link>
          <div className="sidebar-section-head">
            <span className="sidebar-section-title">
              <IconProject size={13} />
              项目
            </span>
            <button className="icon-btn" title="新建项目" onClick={() => navigate('/projects/new')}>
              <IconPlus size={15} />
            </button>
          </div>

          <div className="sidebar-search">
            <IconSearch size={14} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索项目…"
              spellCheck={false}
            />
          </div>

          <nav className="sidebar-list">
            {filtered.map((p) => (
              <NavLink
                key={p.id}
                to={`/projects/${p.id}`}
                className={({ isActive }) => `project-link${isActive ? ' active' : ''}`}
              >
                <span className="project-link-name">{p.name}</span>
                <span className="project-link-meta">
                  <span className="badge subtle">{typeLabel(projectTypes, p.type)}</span>
                  {p.taskCount > 0 && (
                    <span className="project-progress">
                      {p.taskDone}/{p.taskCount}
                    </span>
                  )}
                </span>
              </NavLink>
            ))}
            {filtered.length === 0 && (
              <div className="sidebar-empty">{query ? '无匹配项目' : '还没有项目，点击 + 创建'}</div>
            )}
          </nav>

          <footer className="sidebar-footer">
            {claude && (
              <div className="engine-status" title={engineDown ? 'CLI 与 API 均不可用' : '引擎就绪'}>
                <span className={`dot ${engineDown ? 'off' : 'on'}`} />
                <span className="engine-model">
                  {claude.model ?? (engineDown ? '引擎不可用' : 'Claude Code')}
                </span>
              </div>
            )}
            <div className="sidebar-footer-row">
              <span className="muted small">v{window.api.appVersion()}</span>
            </div>
          </footer>
          </aside>}

        <main className="main-area">
          <Outlet />
        </main>
      </div>

      <StatusBar
        projectPath={currentProject?.sandboxPath ?? null}
        model={claude?.model ?? null}
        pythonEnv={pythonEnv}
        totalCost={totalCost}
      />

      <GlobalSearch />
      {chatPopupOpen && projectId && (
        <GlobalChatPopup
          projectId={projectId}
          initialText={chatIdea}
          onClose={() => setChatPopupOpen(false)}
        />
      )}
      {aboutOpen && <AboutModal onClose={() => setAboutOpen(false)} />}
      {tempChatOpen && <TempChatPopup onClose={() => setTempChatOpen(false)} />}
    </div>
  )
}
