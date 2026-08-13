import { useState } from 'react'
import type { FormEvent, JSX } from 'react'
import { api } from '../lib/api'
import { IconDoc, IconFolder } from './Icon'
import type { FileEntry, Library } from '@shared/types'

interface Props {
  projectId?: string | null
  libraries: Library[]
  onChanged: () => void
}

// 知识库：项目库 + 全局库，注册本地目录并浏览内容
export default function LibraryPanel({ projectId, libraries, onChanged }: Props): JSX.Element {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [path, setPath] = useState('')
  const [description, setDescription] = useState('')
  const [global, setGlobal] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [entries, setEntries] = useState<FileEntry[]>([])
  const [browsingId, setBrowsingId] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent): Promise<void> {
    e.preventDefault()
    if (!name.trim() || !path.trim()) return
    setSubmitting(true)
    setError(null)
    try {
      await api.createLibrary({
        projectId: global ? null : projectId,
        name: name.trim(),
        path: path.trim(),
        description
      })
      setName('')
      setPath('')
      setDescription('')
      setOpen(false)
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  async function handleBrowse(lib: Library): Promise<void> {
    setBrowsingId(browsingId === lib.id ? null : lib.id)
    if (browsingId !== lib.id) {
      try {
        setEntries(await api.libraryEntries(lib.id))
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      }
    }
  }

  async function handlePreview(lib: Library, entry: FileEntry): Promise<void> {
    if (entry.type !== 'file') return
    try {
      const { content } = await api.libraryFile(lib.id, entry.path)
      const target = window.open('', '_blank', 'width=720,height=560')
      if (target) {
        target.document.write(
          `<html><head><title>${entry.name}</title><style>body{background:#1e1e1e;color:#e8e8e8;font-family:Segoe UI,sans-serif;padding:20px;line-height:1.7;white-space:pre-wrap;}</style></head><body>${content.replace(/</g, '&lt;')}</body></html>`
        )
        target.document.close()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function handleDelete(lib: Library): Promise<void> {
    if (!window.confirm(`确定移除知识库「${lib.name}」？磁盘目录不会删除。`)) return
    await api.deleteLibrary(lib.id)
    onChanged()
  }

  return (
    <div>
      <div className="row gap">
        <button className="btn" onClick={() => setOpen((v) => !v)}>
          {open ? '收起' : '+ 添加知识库'}
        </button>
        <span className="muted small">
          笔记库为本地目录（支持选择 Obsidian vault 文件夹），md 文件可点击预览
        </span>
      </div>

      {open && (
        <form className="form inset" onSubmit={handleSubmit}>
          <div className="row gap">
            <label className="field grow">
              <span className="field-label">
                库名称 <b className="required">*</b>
              </span>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：机器学习文献库" />
            </label>
            <label className="field grow">
              <span className="field-label">
                目录路径 <b className="required">*</b>
              </span>
              <input value={path} onChange={(e) => setPath(e.target.value)} placeholder="E:\...\literature" />
            </label>
          </div>
          <label className="field">
            <span className="field-label">描述</span>
            <input value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>
          <label className="checkbox">
            <input type="checkbox" checked={global} onChange={(e) => setGlobal(e.target.checked)} />
            全局知识库（所有项目可用）
          </label>
          {error && <div className="error-box">{error}</div>}
          <div className="form-actions">
            <button type="submit" className="btn primary" disabled={submitting}>
              添加
            </button>
          </div>
        </form>
      )}

      <div className="list">
        {libraries.map((lib) => (
          <div key={lib.id} className="list-item">
            <div className="list-item-main" onClick={() => handleBrowse(lib)} style={{ cursor: 'pointer' }}>
              <div className="list-item-title">
                {lib.name}
                <span className="badge subtle">{lib.projectId === null ? '全局' : '项目'}</span>
              </div>
              <p className="muted small">
                {lib.path}
                {lib.description ? ` · ${lib.description}` : ''}
              </p>
              {browsingId === lib.id && (
                <div className="file-grid compact">
                  {entries.map((e) => (
                    <div
                      key={e.path}
                      className={`file-item${e.type === 'file' ? ' static clickable' : ' static'}`}
                      onClick={() => handlePreview(lib, e)}
                      title={e.type === 'file' ? '点击预览' : undefined}
                    >
                      <span className={`file-icon ${e.type}`}>
                        {e.type === 'dir' ? <IconFolder size={15} /> : <IconDoc size={15} />}
                      </span>
                      <div className="file-meta">
                        <span className="file-name">{e.name}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="list-item-actions">
              <button className="btn small danger" onClick={() => handleDelete(lib)}>
                移除
              </button>
            </div>
          </div>
        ))}
        {libraries.length === 0 && <p className="muted">暂无知识库</p>}
      </div>
    </div>
  )
}
