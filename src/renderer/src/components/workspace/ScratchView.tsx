import { useCallback, useEffect, useState } from 'react'
import type { JSX } from 'react'
import { api } from '../../lib/api'
import { IconPlus, IconTrash } from '../Icon'

interface ScratchItem {
  id: string
  content: string
  summary: string
  createdAt: string
}

// 随记（知识库第三类）：临时对话的沉淀，快速想法记录
export default function ScratchView(): JSX.Element {
  const [items, setItems] = useState<ScratchItem[]>([])
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [content, setContent] = useState('')
  const [summary, setSummary] = useState('')
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setItems(await api.scratch())
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function handleAdd(): Promise<void> {
    if (!content.trim()) return
    await api.createScratch({ content: content.trim(), summary: summary.trim() || undefined })
    setContent('')
    setSummary('')
    setAddOpen(false)
    load()
  }

  async function handleDelete(item: ScratchItem): Promise<void> {
    if (!window.confirm('删除该随记？')) return
    await api.deleteScratch(item.id)
    load()
  }

  return (
    <div className="scratch-panel">
      <div className="notes-toolbar">
        <button className="btn small" onClick={() => setAddOpen((v) => !v)}>
          <IconPlus size={12} />
          {addOpen ? '收起' : '新建随记'}
        </button>
      </div>

      {addOpen && (
        <div className="ws-new">
          <input
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="标题/摘要（可选）"
            spellCheck={false}
          />
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="记录想法、对话总结、研究灵感…"
            rows={4}
            style={{ width: '100%', marginTop: 4 }}
            spellCheck={false}
          />
          <button className="btn small primary" style={{ marginTop: 4 }} onClick={handleAdd}>
            保存
          </button>
        </div>
      )}

      {error && <div className="error-box">{error}</div>}

      <div className="lit-list">
        {items.map((item) => (
          <div key={item.id} className="lit-item">
            <div
              className="lit-item-row"
              onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}
            >
              <span className="lit-item-title">{item.summary || '（无标题）'}</span>
              <span className="lit-item-meta">
                {new Date(item.createdAt).toLocaleString('zh-CN')}
              </span>
            </div>
            {expandedId === item.id && (
              <div className="lit-detail">
                <p className="muted small" style={{ whiteSpace: 'pre-wrap' }}>
                  {item.content}
                </p>
                <button className="btn small danger" onClick={() => handleDelete(item)}>
                  <IconTrash size={12} />
                  删除
                </button>
              </div>
            )}
          </div>
        ))}
        {items.length === 0 && <p className="muted small" style={{ padding: 10 }}>暂无随记</p>}
      </div>
    </div>
  )
}
