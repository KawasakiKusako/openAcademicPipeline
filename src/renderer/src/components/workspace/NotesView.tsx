import { useCallback, useEffect, useState } from 'react'
import type { FormEvent, JSX } from 'react'
import { api } from '../../lib/api'
import { IconChevronDown, IconClose, IconDoc, IconFolder, IconPlus, IconSave, IconTrash } from '../Icon'
import type { FileTreeNode, Library } from '@shared/types'

// 笔记库（侧栏）：库列表 + 递归文件树 + 模态编辑器（读写）
export default function NotesView({
  projectId,
  libraries,
  onChanged
}: {
  projectId?: string | null
  libraries: Library[]
  onChanged: () => void
}): JSX.Element {
  const [activeLib, setActiveLib] = useState<Library | null>(null)
  const [tree, setTree] = useState<FileTreeNode[]>([])
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [editing, setEditing] = useState<{ lib: Library; path: string; name: string; content: string } | null>(null)
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newPath, setNewPath] = useState('')
  const [newGlobal, setNewGlobal] = useState(false)

  const loadTree = useCallback(async (lib: Library) => {
    try {
      setTree(await api.libraryTree(lib.id))
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    if (activeLib) loadTree(activeLib)
  }, [activeLib, loadTree])

  async function handleOpen(lib: Library, node: FileTreeNode): Promise<void> {
    if (node.type === 'dir') {
      setExpanded((prev) => {
        const next = new Set(prev)
        if (next.has(node.path)) next.delete(node.path)
        else next.add(node.path)
        return next
      })
      return
    }
    try {
      const { content } = await api.libraryFile(lib.id, node.path)
      setEditing({ lib, path: node.path, name: node.name, content })
      setDirty(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function handleSave(): Promise<void> {
    if (!editing) return
    await api.libraryWrite(editing.lib.id, editing.path, editing.content)
    setDirty(false)
    if (activeLib) loadTree(activeLib)
  }

  async function handleAddLib(e: FormEvent): Promise<void> {
    e.preventDefault()
    if (!newName.trim() || !newPath.trim()) return
    await api.createLibrary({
      projectId: newGlobal ? null : (projectId ?? null),
      name: newName.trim(),
      path: newPath.trim()
    })
    setAddOpen(false)
    setNewName('')
    setNewPath('')
    onChanged()
  }

  async function handleDeleteLib(lib: Library): Promise<void> {
    if (!window.confirm(`移除知识库「${lib.name}」？磁盘目录不会删除。`)) return
    await api.deleteLibrary(lib.id)
    if (activeLib?.id === lib.id) setActiveLib(null)
    onChanged()
  }

  async function pickFolder(): Promise<void> {
    const dir = await window.api.selectDirectory()
    if (dir) setNewPath(dir)
  }

  return (
    <div className="notes-panel">
      <div className="notes-toolbar">
        <button className="btn small" onClick={() => setAddOpen((v) => !v)}>
          <IconPlus size={12} />
          {addOpen ? '收起' : '添加库'}
        </button>
      </div>

      {addOpen && (
        <form className="ws-new" onSubmit={handleAddLib}>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="库名称"
            spellCheck={false}
          />
          <div className="row gap" style={{ marginTop: 4 }}>
            <input
              value={newPath}
              onChange={(e) => setNewPath(e.target.value)}
              placeholder="目录（支持 Obsidian vault）"
              spellCheck={false}
              style={{ flex: 1 }}
            />
            <button type="button" className="btn small" onClick={pickFolder}>
              选择
            </button>
          </div>
          <label className="checkbox" style={{ marginTop: 4 }}>
            <input type="checkbox" checked={newGlobal} onChange={(e) => setNewGlobal(e.target.checked)} />
            全局知识库
          </label>
          <button type="submit" className="btn small primary" style={{ marginTop: 4 }}>
            添加
          </button>
        </form>
      )}

      <div className="notes-libs">
        {libraries.map((lib) => (
          <div key={lib.id} className="notes-lib">
            <div
              className={`notes-lib-head${activeLib?.id === lib.id ? ' active' : ''}`}
              onClick={() => setActiveLib(activeLib?.id === lib.id ? null : lib)}
            >
              <IconFolder size={12} />
              <span className="notes-lib-name">{lib.name}</span>
              <span className="badge subtle">{lib.projectId === null ? '全局' : '项目'}</span>
              <button
                className="icon-btn notes-lib-del"
                title="移除"
                onClick={(e) => {
                  e.stopPropagation()
                  handleDeleteLib(lib)
                }}
              >
                <IconTrash size={11} />
              </button>
            </div>
            {activeLib?.id === lib.id && (
              <div className="notes-tree">
                <NoteTreeNodes
                  nodes={tree}
                  depth={0}
                  expanded={expanded}
                  onToggle={(p) =>
                    setExpanded((prev) => {
                      const next = new Set(prev)
                      if (next.has(p)) next.delete(p)
                      else next.add(p)
                      return next
                    })
                  }
                  onOpen={(n) => handleOpen(lib, n)}
                />
              </div>
            )}
          </div>
        ))}
        {libraries.length === 0 && <p className="muted small" style={{ padding: 10 }}>暂无笔记库</p>}
      </div>

      {error && <div className="error-box">{error}</div>}

      {editing && (
        <div className="global-search-overlay" onMouseDown={() => setEditing(null)}>
          <div className="lit-modal wide note-editor" onMouseDown={(e) => e.stopPropagation()}>
            <div className="lit-modal-head">
              <h3>
                {editing.lib.name} / {editing.path}
              </h3>
              <div className="row gap">
                <button className="btn small primary" onClick={handleSave} disabled={!dirty}>
                  <IconSave size={12} />
                  {dirty ? '保存' : '已保存'}
                </button>
                <button className="icon-btn" onClick={() => setEditing(null)}>
                  <IconClose size={14} />
                </button>
              </div>
            </div>
            <textarea
              className="lit-import-textarea note-editor-body"
              value={editing.content}
              onChange={(e) => {
                setEditing({ ...editing, content: e.target.value })
                setDirty(true)
              }}
              spellCheck={false}
            />
          </div>
        </div>
      )}
    </div>
  )
}

function NoteTreeNodes({
  nodes,
  depth,
  expanded,
  onToggle,
  onOpen
}: {
  nodes: FileTreeNode[]
  depth: number
  expanded: Set<string>
  onToggle: (p: string) => void
  onOpen: (n: FileTreeNode) => void
}): JSX.Element {
  return (
    <>
      {nodes.map((node) => (
        <div key={node.path}>
          <div
            className="ws-tree-node"
            style={{ paddingLeft: 4 + depth * 12 }}
            onClick={() => (node.type === 'dir' ? onToggle(node.path) : onOpen(node))}
            title={node.path}
          >
            {node.type === 'dir' ? (
              <>
                <IconChevronDown
                  size={11}
                  className={`tree-arrow${expanded.has(node.path) ? ' open' : ''}`}
                />
                <IconFolder size={12} className={expanded.has(node.path) ? 'open' : ''} />
              </>
            ) : (
              <>
                <span className="tree-arrow-spacer" />
                <IconDoc size={12} />
              </>
            )}
            <span className="ws-tree-name">{node.name}</span>
          </div>
          {node.type === 'dir' && expanded.has(node.path) && node.children && (
            <NoteTreeNodes nodes={node.children} depth={depth + 1} expanded={expanded} onToggle={onToggle} onOpen={onOpen} />
          )}
        </div>
      ))}
    </>
  )
}
