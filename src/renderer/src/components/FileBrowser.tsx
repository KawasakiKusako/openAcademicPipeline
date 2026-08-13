import { useCallback, useEffect, useState } from 'react'
import type { FormEvent, JSX } from 'react'
import { api } from '../lib/api'
import { IconDoc, IconFolder } from './Icon'
import type { FileEntry } from '@shared/types'

interface Props {
  projectId: string
}

// 沙盒文件浏览：目录导航 + 文本预览 + 新建目录/删除
export default function FileBrowser({ projectId }: Props): JSX.Element {
  const [path, setPath] = useState('')
  const [entries, setEntries] = useState<FileEntry[]>([])
  const [preview, setPreview] = useState<{ path: string; content: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [newDir, setNewDir] = useState('')

  const load = useCallback(
    async (p: string) => {
      try {
        setEntries(await api.files(projectId, p))
        setError(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      }
    },
    [projectId]
  )

  useEffect(() => {
    load(path)
  }, [path, load])

  const crumbs = path ? path.split('/').filter(Boolean) : []

  function go(dir: string): void {
    setPath(dir)
    setPreview(null)
  }

  async function handleOpen(entry: FileEntry): Promise<void> {
    if (entry.type === 'dir') {
      go(entry.path)
      return
    }
    try {
      const { content } = await api.readFile(projectId, entry.path)
      setPreview({ path: entry.path, content })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function handleNewDir(e: FormEvent): Promise<void> {
    e.preventDefault()
    if (!newDir.trim()) return
    const target = path ? `${path}/${newDir.trim()}` : newDir.trim()
    await api.createDir(projectId, target)
    setNewDir('')
    load(path)
  }

  async function handleDelete(entry: FileEntry): Promise<void> {
    if (!window.confirm(`确定删除 ${entry.path} ？`)) return
    await api.deleteFile(projectId, entry.path)
    if (preview?.path === entry.path) setPreview(null)
    load(path)
  }

  return (
    <div className="files">
      <div className="row gap wrap">
        <button className="btn small" onClick={() => go('')} disabled={!path}>
          ← 返回根目录
        </button>
        <span className="crumbs">
          <button className="crumb" onClick={() => go('')}>
            沙盒 /
          </button>
          {crumbs.map((c, i) => (
            <span key={i}>
              <button className="crumb" onClick={() => go(crumbs.slice(0, i + 1).join('/'))}>
                {c}
              </button>
              /
            </span>
          ))}
        </span>
        <form className="row gap" onSubmit={handleNewDir}>
          <input
            className="small"
            value={newDir}
            onChange={(e) => setNewDir(e.target.value)}
            placeholder="新目录名"
          />
          <button type="submit" className="btn small">
            新建目录
          </button>
        </form>
      </div>

      {error && <div className="error-box">{error}</div>}

      <div className="file-grid">
        {entries.map((entry) => (
          <div key={entry.path} className="file-item" onClick={() => handleOpen(entry)}>
            <span className={`file-icon ${entry.type}`}>
              {entry.type === 'dir' ? <IconFolder size={15} /> : <IconDoc size={15} />}
            </span>
            <div className="file-meta">
              <span className="file-name">{entry.name}</span>
              <span className="muted small">
                {entry.type === 'dir'
                  ? '目录'
                  : `${(entry.size / 1024).toFixed(1)} KB`}
              </span>
            </div>
            <button
              className="btn small danger file-del"
              onClick={(e) => {
                e.stopPropagation()
                handleDelete(entry)
              }}
            >
              删除
            </button>
          </div>
        ))}
        {entries.length === 0 && <p className="muted">目录为空</p>}
      </div>

      {preview && (
        <div className="preview">
          <div className="preview-head">
            <span>{preview.path}</span>
            <button className="btn small ghost" onClick={() => setPreview(null)}>
              关闭
            </button>
          </div>
          <pre className="preview-body">{preview.content}</pre>
        </div>
      )}
    </div>
  )
}
