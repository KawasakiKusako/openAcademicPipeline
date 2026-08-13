import { useEffect, useState } from 'react'
import type { FormEvent, JSX } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { useProjectsStore } from '../store/projects'
import { IconSearch, IconSend, IconSettings } from '../components/Icon'

function typeLabel(types: { type: string; label: string }[], type: string): string {
  return types.find((t) => t.type === type)?.label ?? type
}

interface ChatMsg {
  role: 'user' | 'assistant'
  content: string
}

// 项目总览（OpenAI 式）：上方对话区（问候 + 想法 → 项目建议），
// 下方项目搜索与选择（平铺 / 列表切换）。
export default function ProjectsPage(): JSX.Element {
  const navigate = useNavigate()
  const { projects, projectTypes, loading, error, loadProjects, loadProjectTypes } =
    useProjectsStore()
  const [query, setQuery] = useState('')
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<ChatMsg[]>([])
  const [thinking, setThinking] = useState(false)
  const [suggestion, setSuggestion] = useState<{
    name: string
    type: string
    description: string
  } | null>(null)
  const [username, setUsername] = useState('研究员')
  const [ideaError, setIdeaError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')

  useEffect(() => {
    loadProjects()
    loadProjectTypes()
    api.settings().then((s) => setUsername(s.username)).catch(() => undefined)
  }, [loadProjects, loadProjectTypes])

  const filtered = projects.filter(
    (p) =>
      !query.trim() ||
      p.name.toLowerCase().includes(query.trim().toLowerCase()) ||
      p.description.toLowerCase().includes(query.trim().toLowerCase())
  )

  async function handleSend(e: FormEvent): Promise<void> {
    e.preventDefault()
    const text = input.trim()
    if (!text || thinking) return
    setInput('')
    setThinking(true)
    setIdeaError(null)
    setSuggestion(null)
    setMessages((m) => [...m, { role: 'user', content: text }])
    try {
      const r = await api.chatIdea(text)
      if (r.suggestion) {
        const s = {
          name: r.suggestion.name ?? '新项目',
          type: r.suggestion.type ?? 'paper-research',
          description: r.suggestion.description ?? ''
        }
        setSuggestion(s)
        setMessages((m) => [
          ...m,
          {
            role: 'assistant',
            content: `我建议创建「${s.name}」项目（类型：${typeLabel(projectTypes, s.type)}）：${s.description}`
          }
        ])
      } else {
        setMessages((m) => [
          ...m,
          { role: 'assistant', content: '未能生成建议，请换个说法试试。' }
        ])
      }
    } catch (err) {
      setIdeaError(err instanceof Error ? err.message : String(err))
    } finally {
      setThinking(false)
    }
  }

  async function handleCreateFromSuggestion(): Promise<void> {
    if (!suggestion || creating) return
    setCreating(true)
    try {
      const project = await api.createProject({
        name: suggestion.name,
        type: suggestion.type,
        description: suggestion.description,
        sandboxPath: (await window.api.selectDirectory()) ?? undefined
      })
      navigate(`/projects/${project.id}`)
    } catch (err) {
      setIdeaError(err instanceof Error ? err.message : String(err))
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="overview-page">
      {/* ===== OpenAI 式对话区 ===== */}
      <section className="overview-chat">
        <div className="overview-chat-inner">
          <h2 className="overview-greet">{username}，今天有什么想法？</h2>
          {messages.length === 0 && (
            <p className="muted">描述你的研究想法，AI 帮你生成项目建议</p>
          )}
          <div className="overview-messages">
            {messages.map((m, i) => (
              <div key={i} className={`overview-msg ${m.role}`}>
                {m.content}
              </div>
            ))}
            {thinking && <div className="overview-msg assistant typing">思考中</div>}
          </div>
          {ideaError && <div className="error-box">{ideaError}</div>}
          {suggestion && (
            <div className="suggestion-card">
              <div className="suggestion-head">
                <span className="badge">{typeLabel(projectTypes, suggestion.type)}</span>
                <strong>{suggestion.name}</strong>
              </div>
              <p className="muted small">{suggestion.description || '暂无描述'}</p>
              <div className="row gap">
                <button className="btn primary small" onClick={handleCreateFromSuggestion} disabled={creating}>
                  {creating ? '创建中…' : '按建议创建项目'}
                </button>
                <button className="btn small" onClick={() => setSuggestion(null)}>
                  换一个
                </button>
              </div>
            </div>
          )}
          <form className="overview-composer" onSubmit={handleSend}>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="例如：我想研究深度学习在遥感图像分割中的应用…"
              spellCheck={false}
            />
            <button type="submit" className="btn primary" disabled={thinking || !input.trim()}>
              <IconSend size={14} />
            </button>
          </form>
        </div>
      </section>

      {/* ===== 项目搜索与选择 ===== */}
      <section className="overview-projects">
        <div className="overview-projects-head">
          <div className="sidebar-search" style={{ width: 280, margin: 0 }}>
            <IconSearch size={14} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索项目…"
              spellCheck={false}
            />
          </div>
          <div style={{ flex: 1 }} />
          <div className="row gap">
            <button
              className={`btn small${viewMode === 'grid' ? ' primary' : ''}`}
              onClick={() => setViewMode('grid')}
              title="平铺视图"
            >
              平铺
            </button>
            <button
              className={`btn small${viewMode === 'list' ? ' primary' : ''}`}
              onClick={() => setViewMode('list')}
              title="列表视图"
            >
              列表
            </button>
            <button className="btn primary" onClick={() => navigate('/projects/new')}>
              新建项目
            </button>
          </div>
        </div>

        {error && <div className="error-box">{error}</div>}
        {loading && <p className="muted">加载中…</p>}

        {!loading && filtered.length === 0 && !query && (
          <div className="empty-state">
            <h3>创建你的第一个项目</h3>
            <p>在上方输入研究想法，AI 会帮你生成项目建议；或手动创建项目。</p>
          </div>
        )}

        {viewMode === 'grid' ? (
          <div className="card-grid">
            {filtered.map((p) => {
              const pct = p.taskCount > 0 ? Math.round((p.taskDone / p.taskCount) * 100) : 0
              return (
                <div
                  key={p.id}
                  className="card project-card"
                  onClick={() => navigate(`/projects/${p.id}`)}
                >
                  <div className="card-head">
                    <span className="badge">{typeLabel(projectTypes, p.type)}</span>
                    <div className="row gap">
                      <button
                        className="icon-btn"
                        title="项目设置"
                        onClick={(e) => {
                          e.stopPropagation()
                          navigate(`/projects/${p.id}/edit`)
                        }}
                      >
                        <IconSettings size={13} />
                      </button>
                      <span className="card-time">
                        {new Date(p.updatedAt).toLocaleDateString('zh-CN')}
                      </span>
                    </div>
                  </div>
                  <h3 className="card-title">{p.name}</h3>
                  <p className="card-desc">{p.description || '暂无描述'}</p>
                  <div className="progress-track">
                    <div className="progress-bar" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="card-foot">
                    <span>
                      任务 {p.taskDone}/{p.taskCount}
                      {p.taskCount > 0 ? ` · ${pct}%` : ''}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="list">
            {filtered.map((p) => (
              <div
                key={p.id}
                className="list-item clickable"
                onClick={() => navigate(`/projects/${p.id}`)}
              >
                <div className="list-item-main">
                  <div className="list-item-title">
                    {p.name}
                    <span className="badge subtle">{typeLabel(projectTypes, p.type)}</span>
                  </div>
                  <p className="muted small">
                    {p.description || '暂无描述'} · 任务 {p.taskDone}/{p.taskCount} ·{' '}
                    {new Date(p.updatedAt).toLocaleDateString('zh-CN')}
                  </p>
                </div>
                <div className="list-item-actions" onClick={(e) => e.stopPropagation()}>
                  <button
                    className="icon-btn"
                    title="项目设置"
                    onClick={() => navigate(`/projects/${p.id}/edit`)}
                  >
                    <IconSettings size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        {filtered.length === 0 && query && <p className="muted">没有匹配的项目</p>}
      </section>
    </div>
  )
}
