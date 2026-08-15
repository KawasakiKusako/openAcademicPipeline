import { useCallback, useEffect, useMemo, useState } from 'react'
import type { JSX } from 'react'
import { api } from '../../lib/api'
import { IconClose, IconEdit, IconExpand, IconPlus, IconSave, IconTrash } from '../Icon'
import { MdWysiwyg, ModeSwitch, markdownToHtml } from './MarkdownEditor'
import CodeEditor from './CodeEditor'
import type { MdMode } from './MarkdownEditor'

interface ScratchItem {
  id: string
  content: string
  summary: string
  createdAt: string
}

// 随记（知识库第三类）：临时对话的沉淀，快速想法记录（支持编辑/删除）
export default function ScratchView({ projectId }: { projectId?: string | null }): JSX.Element {
  const [items, setItems] = useState<ScratchItem[]>([])
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [content, setContent] = useState('')
  const [summary, setSummary] = useState('')
  const [editId, setEditId] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')
  const [editSummary, setEditSummary] = useState('')
  const [mdMode, setMdMode] = useState<MdMode>('preview')
  const [detailEdit, setDetailEdit] = useState<{ id: string; summary: string; content: string } | null>(null)
  const [detailMode, setDetailMode] = useState<MdMode>('preview')
  const [detailSaving, setDetailSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const mdHtml = useMemo(() => markdownToHtml(editContent), [editContent])

  const load = useCallback(async () => {
    try {
      setItems(await api.scratch(projectId))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [projectId])

  useEffect(() => {
    load()
  }, [load])

  async function handleAdd(): Promise<void> {
    if (!content.trim()) return
    await api.createScratch({
      content: content.trim(),
      summary: summary.trim() || undefined,
      projectId: projectId ?? undefined
    })
    setContent('')
    setSummary('')
    setAddOpen(false)
    load()
  }

  async function handleSaveEdit(item: ScratchItem): Promise<void> {
    if (!editContent.trim()) return
    try {
      await api.updateScratch(item.id, {
        content: editContent.trim(),
        summary: editSummary.trim() || undefined
      })
      setEditId(null)
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function handleDelete(item: ScratchItem): Promise<void> {
    if (!window.confirm('删除该随记？')) return
    await api.deleteScratch(item.id)
    load()
  }

  // 详细编辑：大窗口模态（MarkdownEditor 三模式）
  async function handleDetailSave(): Promise<void> {
    if (!detailEdit || !detailEdit.content.trim()) return
    setDetailSaving(true)
    try {
      await api.updateScratch(detailEdit.id, {
        content: detailEdit.content.trim(),
        summary: detailEdit.summary.trim() || undefined
      })
      setDetailEdit(null)
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setDetailSaving(false)
    }
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
            {expandedId === item.id &&
              (editId === item.id ? (
                <div className="scratch-editor">
                  <input
                    value={editSummary}
                    onChange={(e) => setEditSummary(e.target.value)}
                    placeholder="标题/摘要（可选）"
                    spellCheck={false}
                    style={{ width: '100%', marginBottom: 6 }}
                  />
                  <div className="scratch-editor-toolbar">
                    <ModeSwitch mode={mdMode} setMode={setMdMode} />
                    <span className="muted small">预览模式可直接编辑</span>
                  </div>
                  {mdMode === 'code' ? (
                    <CodeEditor
                      path="scratch.md"
                      value={editContent}
                      onChange={setEditContent}
                    />
                  ) : mdMode === 'split' ? (
                    <div className="wb-md-split scratch-editor-body">
                      <div className="wb-code-wrap">
                        <CodeEditor path="scratch.md" value={editContent} onChange={setEditContent} />
                      </div>
                      <div className="wb-md-divider" />
                      <div className="wb-md-preview" dangerouslySetInnerHTML={{ __html: mdHtml }} />
                    </div>
                  ) : (
                    <MdWysiwyg
                      value={editContent}
                      onChange={setEditContent}
                      exportName={`${editSummary || '随记'}.docx`}
                    />
                  )}
                  <div className="row gap" style={{ marginTop: 8 }}>
                    <button className="btn small primary" onClick={() => handleSaveEdit(item)}>
                      保存
                    </button>
                    <button className="btn small ghost" onClick={() => setEditId(null)}>
                      取消
                    </button>
                    <button className="btn small danger" onClick={() => handleDelete(item)}>
                      <IconTrash size={12} />
                      删除
                    </button>
                  </div>
                </div>
              ) : (
                <div className="lit-detail">
                  <div
                    className="scratch-preview"
                    dangerouslySetInnerHTML={{ __html: markdownToHtml(item.content) }}
                  />
                  <div className="row gap" style={{ marginTop: 6 }}>
                    <button
                      className="btn small"
                      onClick={() => {
                        setEditId(item.id)
                        setEditContent(item.content)
                        setEditSummary(item.summary)
                        setMdMode('preview')
                      }}
                    >
                      <IconEdit size={12} />
                      编辑
                    </button>
                    <button
                      className="btn small ghost"
                      title="在更大窗口中编辑"
                      onClick={() => {
                        setDetailEdit({ id: item.id, summary: item.summary, content: item.content })
                        setDetailMode('preview')
                      }}
                    >
                      <IconExpand size={12} />
                      详细编辑
                    </button>
                    <button className="btn small danger" onClick={() => handleDelete(item)}>
                      <IconTrash size={12} />
                      删除
                    </button>
                  </div>
                </div>
              ))}
          </div>
        ))}
        {items.length === 0 && <p className="muted small" style={{ padding: 10 }}>暂无随记</p>}
      </div>

      {/* 详细编辑大窗口 */}
      {detailEdit && (
        <div className="global-search-overlay" onMouseDown={() => setDetailEdit(null)}>
          <div className="lit-modal xl note-editor" onMouseDown={(e) => e.stopPropagation()}>
            <div className="lit-modal-head">
              <h3>编辑随记</h3>
              <div className="row gap">
                <ModeSwitch mode={detailMode} setMode={setDetailMode} />
                <button className="btn small primary" onClick={handleDetailSave} disabled={detailSaving || !detailEdit.content.trim()}>
                  <IconSave size={12} />
                  {detailSaving ? '保存中…' : '保存'}
                </button>
                <button className="icon-btn" onClick={() => setDetailEdit(null)}>
                  <IconClose size={14} />
                </button>
              </div>
            </div>
            <div className="scratch-detail-body">
              <input
                value={detailEdit.summary}
                onChange={(e) => setDetailEdit({ ...detailEdit, summary: e.target.value })}
                placeholder="标题/摘要（可选）"
                spellCheck={false}
                style={{ width: '100%', marginBottom: 8 }}
              />
              {detailMode === 'code' ? (
                <CodeEditor
                  path="scratch.md"
                  value={detailEdit.content}
                  onChange={(v) => setDetailEdit({ ...detailEdit, content: v })}
                />
              ) : detailMode === 'split' ? (
                <div className="wb-md-split scratch-detail-split">
                  <div className="wb-code-wrap">
                    <CodeEditor
                      path="scratch.md"
                      value={detailEdit.content}
                      onChange={(v) => setDetailEdit({ ...detailEdit, content: v })}
                    />
                  </div>
                  <div className="wb-md-divider" />
                  <div className="wb-md-preview" dangerouslySetInnerHTML={{ __html: markdownToHtml(detailEdit.content) }} />
                </div>
              ) : (
                <MdWysiwyg value={detailEdit.content} onChange={(v) => setDetailEdit({ ...detailEdit, content: v })} />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
