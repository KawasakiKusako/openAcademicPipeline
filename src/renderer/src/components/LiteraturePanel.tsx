import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import type { JSX } from 'react'
import { api } from '../lib/api'
import { IconPlus, IconSearch, IconTrash, IconChevronDown } from './Icon'
import LiteratureImportModal from './LiteratureImportModal'
import type { Literature } from '@shared/types'

// 文献库（侧栏紧凑版）：搜索 + 分组列表 + 展开详情 + 添加/导入模态
export default function LiteraturePanel({ projectId }: { projectId?: string | null }): JSX.Element {
  const [items, setItems] = useState<Literature[]>([])
  const [query, setQuery] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setItems(await api.literature({ q: query || undefined, projectId }))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [query, projectId])

  useEffect(() => {
    const t = setTimeout(load, 200)
    return () => clearTimeout(t)
  }, [load])

  async function handleDelete(lit: Literature): Promise<void> {
    if (!window.confirm(`删除文献「${lit.title}」？`)) return
    await api.deleteLiterature(lit.id)
    load()
  }

  const projectItems = items.filter((l) => l.projectId === projectId)
  const globalItems = items.filter((l) => l.projectId === null)
  const grouped = projectId
    ? [
        { title: `项目文献（${projectItems.length}）`, list: projectItems },
        { title: `全局文献（${globalItems.length}）`, list: globalItems }
      ]
    : [{ title: `全部文献（${items.length}）`, list: items }]

  return (
    <div className="lit-panel">
      <div className="lit-toolbar">
        <div className="lit-search">
          <IconSearch size={13} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索文献…"
            spellCheck={false}
          />
        </div>
        <div className="row gap">
          <button className="icon-btn" title="导入文献（BibTeX/RIS/JSON/文本）" onClick={() => setImportOpen(true)}>
            <IconChevronDown size={13} />
          </button>
          <button className="icon-btn" title="添加文献" onClick={() => setAddOpen(true)}>
            <IconPlus size={13} />
          </button>
        </div>
      </div>

      {error && <div className="error-box">{error}</div>}

      <div className="lit-list">
        {grouped.map((group) =>
          group.list.length === 0 ? null : (
            <div key={group.title} className="lit-group">
              <div className="lit-group-title">{group.title}</div>
              {group.list.map((lit) => (
                <div key={lit.id} className="lit-item">
                  <div
                    className="lit-item-row"
                    onClick={() => setExpandedId(expandedId === lit.id ? null : lit.id)}
                  >
                    <span className="lit-item-title">{lit.title}</span>
                    <span className="lit-item-meta">
                      {lit.authors[0] ?? '佚名'}
                      {lit.year ? ` · ${lit.year}` : ''}
                    </span>
                  </div>
                  {expandedId === lit.id && (
                    <div className="lit-detail">
                      <p className="muted small">
                        {lit.authors.join(', ')}
                        {lit.venue ? ` · ${lit.venue}` : ''}
                        {lit.doi ? ` · DOI: ${lit.doi}` : ''}
                      </p>
                      {lit.abstract && <p className="muted small">{lit.abstract}</p>}
                      {lit.notes && <p className="muted small">笔记：{lit.notes}</p>}
                      {lit.url && (
                        <a className="crumb" href={lit.url} target="_blank" rel="noreferrer">
                          打开链接
                        </a>
                      )}
                      <div className="row gap" style={{ marginTop: 6 }}>
                        <button className="btn small danger" onClick={() => handleDelete(lit)}>
                          <IconTrash size={12} />
                          删除
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )
        )}
        {items.length === 0 && (
          <p className="muted small" style={{ padding: 10 }}>
            文献库为空。点 + 添加，或从 BibTeX / RIS / EndNote / Zotero 导入
          </p>
        )}
      </div>

      {addOpen && <LitAddModal projectId={projectId} onClose={() => setAddOpen(false)} onSaved={load} />}
      {importOpen && (
        <LiteratureImportModal projectId={projectId} onClose={() => setImportOpen(false)} onImported={load} />
      )}
    </div>
  )
}

/* ---------- add single literature (modal) ---------- */

function LitAddModal({
  projectId,
  onClose,
  onSaved
}: {
  projectId?: string | null
  onClose: () => void
  onSaved: () => void
}): JSX.Element {
  const [title, setTitle] = useState('')
  const [authors, setAuthors] = useState('')
  const [year, setYear] = useState('')
  const [venue, setVenue] = useState('')
  const [doi, setDoi] = useState('')
  const [url, setUrl] = useState('')
  const [notes, setNotes] = useState('')
  const [scope, setScope] = useState<'project' | 'global'>(projectId ? 'project' : 'global')
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent): Promise<void> {
    e.preventDefault()
    if (!title.trim()) return
    try {
      await api.createLiterature({
        title: title.trim(),
        authors,
        year: year ? Number(year) : null,
        venue: venue.trim(),
        doi: doi.trim(),
        url: url.trim(),
        notes: notes.trim(),
        projectId: scope === 'project' ? (projectId ?? null) : null
      })
      onSaved()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div className="global-search-overlay" onMouseDown={onClose}>
      <div className="lit-modal" onMouseDown={(e) => e.stopPropagation()}>
        <h3>添加文献</h3>
        <form className="form" onSubmit={handleSubmit}>
          {projectId && (
            <label className="field">
              <span className="field-label">归属</span>
              <select value={scope} onChange={(e) => setScope(e.target.value as 'project' | 'global')}>
                <option value="project">本项目</option>
                <option value="global">全局知识库</option>
              </select>
            </label>
          )}
          <label className="field">
            <span className="field-label">
              标题 <b className="required">*</b>
            </span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
          </label>
          <div className="row gap">
            <label className="field grow">
              <span className="field-label">作者</span>
              <input value={authors} onChange={(e) => setAuthors(e.target.value)} placeholder="逗号分隔" />
            </label>
            <label className="field">
              <span className="field-label">年份</span>
              <input value={year} onChange={(e) => setYear(e.target.value)} style={{ width: 90 }} />
            </label>
          </div>
          <div className="row gap">
            <label className="field grow">
              <span className="field-label">期刊/会议</span>
              <input value={venue} onChange={(e) => setVenue(e.target.value)} />
            </label>
            <label className="field grow">
              <span className="field-label">DOI</span>
              <input value={doi} onChange={(e) => setDoi(e.target.value)} />
            </label>
          </div>
          <label className="field">
            <span className="field-label">URL</span>
            <input value={url} onChange={(e) => setUrl(e.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">笔记</span>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </label>
          {error && <div className="error-box">{error}</div>}
          <div className="form-actions">
            <button type="button" className="btn ghost" onClick={onClose}>
              取消
            </button>
            <button type="submit" className="btn primary" disabled={!title.trim()}>
              添加
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
