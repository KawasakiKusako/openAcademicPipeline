import { useCallback, useEffect, useState } from 'react'
import type { FormEvent, JSX, MouseEvent } from 'react'
import { api } from '../../lib/api'
import { useWorkspaceStore, tabIdFor } from '../../store/workspace'
import ContextMenu from '../ContextMenu'
import type { ContextMenuItem } from '../ContextMenu'
import { IconChevronDown, IconCopy, IconFolder, IconPlay, IconPlus, IconRefresh, IconTrash } from '../Icon'
import FileTypeIcon from '../FileTypeIcon'
import type { FileTreeNode } from '@shared/types'

// 资源管理器：项目沙盒文件树（右键管理 + 自动刷新），点击文件在工作台打开
export default function ExplorerView({ projectId }: { projectId: string }): JSX.Element {
  const {
    expandedDirs,
    toggleDir,
    openTab,
    clipboard,
    setClipboard,
    setPendingChatText,
    setRunResult,
    togglePanel
  } = useWorkspaceStore()
  const [tree, setTree] = useState<FileTreeNode[]>([])
  const [newName, setNewName] = useState('')
  const [newIsDir, setNewIsDir] = useState(false)
  const [menu, setMenu] = useState<{ x: number; y: number; node: FileTreeNode | null } | null>(null)
  const [renaming, setRenaming] = useState<FileTreeNode | null>(null)
  const [renameValue, setRenameValue] = useState('')

  const load = useCallback(async () => {
    try {
      const next = await api.tree(projectId)
      // 仅当树内容真的变化时才更新——避免无谓重渲染导致
      // 展开状态/滚动位置/进行中的右键菜单被干扰
      setTree((prev) => {
        if (JSON.stringify(prev) === JSON.stringify(next)) return prev
        return next
      })
    } catch {
      // 失败保持旧数据，不清空
    }
  }, [projectId])

  useEffect(() => {
    load()
  }, [load])

  // 自动刷新：仅在没有右键菜单/重命名/拖拽等交互时进行（10s 间隔），
  // 避免操作进行中树被重渲染打断。
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    setBusy(Boolean(menu) || Boolean(renaming))
  }, [menu, renaming])

  useEffect(() => {
    if (busy) return
    const timer = setInterval(load, 10_000)
    return () => clearInterval(timer)
  }, [load, busy])

  // 窗口重新聚焦时刷新一次
  useEffect(() => {
    const onFocus = (): void => load()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [load])

  async function handleCreate(e: FormEvent): Promise<void> {
    e.preventDefault()
    if (!newName.trim()) return
    if (newIsDir) {
      await api.createDir(projectId, newName.trim())
    } else {
      // 同名文件已存在时自动加后缀，绝不覆盖已有文件（防止数据丢失）
      const dest = await uniqueDest(newName.trim())
      await api.writeFile(projectId, dest, '')
    }
    setNewName('')
    setNewIsDir(false)
    load()
  }

  function handleOpen(node: FileTreeNode): void {
    if (node.type === 'dir') {
      toggleDir(node.path)
      return
    }
    openTab({ id: tabIdFor('file', node.path), kind: 'file', title: node.name, refId: node.path })
  }

  function handleContext(e: MouseEvent, node: FileTreeNode | null): void {
    e.preventDefault()
    setMenu({ x: e.clientX, y: e.clientY, node })
  }

  function handleRun(node: FileTreeNode): void {
    if (!node.name.endsWith('.py')) return
    api
      .runProjectScript(projectId, node.path)
      .then((result) => {
        setRunResult({ filePath: node.path, result })
        if (!useWorkspaceStore.getState().showPanel) togglePanel()
      })
      .catch(() => undefined)
  }

  // resolve a non-conflicting destination (append 副本/move suffix if taken)
  async function uniqueDest(dest: string): Promise<string> {
    try {
      const entries = await api.files(projectId, dest.includes('/') ? dest.slice(0, dest.lastIndexOf('/')) : '')
      const names = new Set(entries.map((e) => e.name))
      if (!names.has(dest.split('/').pop() ?? dest)) return dest
      const base = dest.replace(/(\.[^/.]+)$/, '')
      const ext = dest.match(/(\.[^/.]+)$/)?.[1] ?? ''
      for (let i = 1; ; i++) {
        const candidate = `${base} (${i})${ext}`
        if (!names.has(candidate.split('/').pop() ?? candidate)) return candidate
      }
    } catch {
      return dest
    }
  }

  // drag & drop move: srcPath -> targetDir ('' = sandbox root)
  async function moveToDir(srcPath: string, targetDir: string): Promise<void> {
    try {
      const base = srcPath.split('/').pop() ?? srcPath
      const dest = await uniqueDest(targetDir ? `${targetDir}/${base}` : base)
      if (srcPath !== dest) {
        await api.renameFile(projectId, srcPath, dest)
        load()
      }
    } catch {
      // ignore
    }
  }

  async function handlePaste(targetDir: string): Promise<void> {
    if (!clipboard) return
    const base = clipboard.path.split('/').pop() ?? clipboard.path
    let dest = targetDir ? `${targetDir}/${base}` : base
    if (clipboard.cut) {
      if (clipboard.path === dest) {
        setClipboard(null)
        return
      }
      dest = await uniqueDest(dest)
      await api.renameFile(projectId, clipboard.path, dest)
    } else {
      if (clipboard.path === dest) {
        dest = await uniqueDest(`${dest.replace(/(\.[^/.]+)$/, '')} (副本)$1`)
      }
      await api.copyFile(projectId, clipboard.path, dest)
    }
    setClipboard(null)
    load()
  }

  async function handleSendToSession(node: FileTreeNode): Promise<void> {
    try {
      // reuse the most recent idle session of the project; create one only if none exists
      const sessions = await api.sessions(projectId)
      let session = sessions.find((s) => s.status !== 'running') ?? null
      if (!session) {
        session = await api.createSession(projectId, { title: '文件讨论' })
      }
      openTab({ id: tabIdFor('session', session.id), kind: 'session', title: session.title, refId: session.id })
      setPendingChatText(`请查看项目文件 ${node.path} 并简要说明它的作用。`)
    } catch {
      // ignore
    }
  }

  function menuItems(node: FileTreeNode | null): ContextMenuItem[] {
    const items: ContextMenuItem[] = []
    if (node) {
      if (node.type === 'file') {
        items.push({ label: '打开', action: () => handleOpen(node) })
        if (node.name.toLowerCase().endsWith('.md')) {
          items.push({
            label: '预览 Markdown',
            action: () =>
              openTab({ id: tabIdFor('file', node.path), kind: 'file', title: node.name, refId: node.path })
          })
        }
        if (node.name.toLowerCase().endsWith('.py')) {
          items.push({ label: '运行', action: () => handleRun(node) })
        }
        if (/\.(pptx|docx|pdf|txt|md)$/i.test(node.name)) {
          items.push({
            label: '在汇报助手中打开',
            action: () => {
              window.api.openPresentAssistWithFile({ projectId, path: node.path })
            }
          })
        }
        items.push({
          label: '发送到会话',
          action: () => handleSendToSession(node)
        })
      } else {
        items.push({
          label: '新建文件',
          action: () => {
            setNewName(`${node.path ? node.path + '/' : ''}untitled.py`)
            setNewIsDir(false)
          }
        })
        items.push({
          label: '新建文件夹',
          action: () => {
            setNewName(`${node.path ? node.path + '/' : ''}新文件夹`)
            setNewIsDir(true)
          }
        })
      }
      items.push({ label: '在文件资源管理器中打开', action: () => api.openExternal(projectId, node.path) })
      items.push({ label: '复制', action: () => setClipboard({ path: node.path, cut: false }) })
      items.push({ label: '剪切', action: () => setClipboard({ path: node.path, cut: true }) })
      if (clipboard) {
        items.push({
          label: `粘贴到此处（${clipboard.cut ? '剪切' : '复制'}: ${clipboard.path.split('/').pop()}）`,
          action: () => handlePaste(node.type === 'dir' ? node.path : (node.path.includes('/') ? node.path.slice(0, node.path.lastIndexOf('/')) : ''))
        })
      }
      items.push({
        label: '重命名',
        action: () => startRename(node)
      })
      items.push({
        label: '删除',
        danger: true,
        action: async () => {
          if (window.confirm(`删除 ${node.path} ？`)) {
            await api.deleteFile(projectId, node.path)
            load()
          }
        }
      })
    } else {
      items.push({
        label: '新建文件',
        action: () => {
          setNewName('untitled.py')
          setNewIsDir(false)
        }
      })
      items.push({
        label: '新建文件夹',
        action: () => {
          setNewName('新文件夹')
          setNewIsDir(true)
        }
      })
      if (clipboard) {
        items.push({
          label: `粘贴（${clipboard.cut ? '剪切' : '复制'}: ${clipboard.path.split('/').pop()}）`,
          action: () => handlePaste('')
        })
      }
      items.push({
        label: '刷新',
        action: load
      })
    }
    return items
  }

  // Inline rename: confirm with Enter, cancel with Escape
  async function commitRename(): Promise<void> {
    const node = renaming
    setRenaming(null)
    if (!node) return
    const name = renameValue.trim()
    if (!name || name === node.name) return
    const parent = node.path.includes('/')
      ? node.path.slice(0, node.path.lastIndexOf('/'))
      : ''
    const to = parent ? `${parent}/${name}` : name
    await api.renameFile(projectId, node.path, to)
    load()
  }

  function startRename(node: FileTreeNode): void {
    setRenameValue(node.name)
    setRenaming(node)
  }

  return (
    <div className="ws-side" onContextMenu={(e) => handleContext(e, null)}>
      <div className="ws-side-head">
        <span>资源管理器</span>
        <div className="row gap">
          <button className="icon-btn" title="刷新" onClick={load}>
            <IconRefresh size={13} />
          </button>
          <button className="icon-btn" title="新建文件" onClick={() => setNewName(newName ? '' : 'untitled.py')}>
            <IconPlus size={13} />
          </button>
        </div>
      </div>
      {newName !== '' && (
        <form className="ws-new" onSubmit={handleCreate}>
          <input
            value={newName}
            autoFocus
            onChange={(e) => setNewName(e.target.value)}
            onBlur={() => setNewName('')}
            spellCheck={false}
          />
        </form>
      )}
      <div
        className="ws-side-body"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          const src = e.dataTransfer.getData('text/plain')
          if (src) moveToDir(src, '')
        }}
      >
        <TreeNodes
          nodes={tree}
          depth={0}
          expandedDirs={expandedDirs}
          onToggle={toggleDir}
          onOpen={handleOpen}
          onContext={handleContext}
          onDropTo={moveToDir}
          onQuickRun={handleRun}
          onQuickCopy={(n) => setClipboard({ path: n.path, cut: false })}
          onQuickDelete={(n) => {
            if (window.confirm(`删除 ${n.path} ？`)) {
              api.deleteFile(projectId, n.path).then(load)
            }
          }}
          renamingPath={renaming?.path ?? null}
          renameValue={renameValue}
          onRenameValue={setRenameValue}
          onRenameCommit={commitRename}
          onRenameCancel={() => setRenaming(null)}
        />
      </div>
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={menuItems(menu.node)}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  )
}

export function TreeNodes({
  nodes,
  depth,
  expandedDirs,
  onToggle,
  onOpen,
  onContext,
  onDropTo,
  onQuickRun,
  onQuickCopy,
  onQuickDelete,
  renamingPath,
  renameValue,
  onRenameValue,
  onRenameCommit,
  onRenameCancel
}: {
  nodes: FileTreeNode[]
  depth: number
  expandedDirs: Set<string>
  onToggle: (path: string) => void
  onOpen: (node: FileTreeNode) => void
  onContext: (e: MouseEvent, node: FileTreeNode) => void
  onDropTo: (srcPath: string, targetDir: string) => void
  onQuickRun: (node: FileTreeNode) => void
  onQuickCopy: (node: FileTreeNode) => void
  onQuickDelete: (node: FileTreeNode) => void
  renamingPath: string | null
  renameValue: string
  onRenameValue: (v: string) => void
  onRenameCommit: () => void
  onRenameCancel: () => void
}): JSX.Element {
  return (
    <>
      {nodes.map((node) => (
        <TreeNode
          key={node.path}
          node={node}
          depth={depth}
          expandedDirs={expandedDirs}
          onToggle={onToggle}
          onOpen={onOpen}
          onContext={onContext}
          onDropTo={onDropTo}
          onQuickRun={onQuickRun}
          onQuickCopy={onQuickCopy}
          onQuickDelete={onQuickDelete}
          renamingPath={renamingPath}
          renameValue={renameValue}
          onRenameValue={onRenameValue}
          onRenameCommit={onRenameCommit}
          onRenameCancel={onRenameCancel}
        />
      ))}
    </>
  )
}

function TreeNode({
  node,
  depth,
  expandedDirs,
  onToggle,
  onOpen,
  onContext,
  onDropTo,
  onQuickRun,
  onQuickCopy,
  onQuickDelete,
  renamingPath,
  renameValue,
  onRenameValue,
  onRenameCommit,
  onRenameCancel
}: {
  node: FileTreeNode
  depth: number
  expandedDirs: Set<string>
  onToggle: (path: string) => void
  onOpen: (node: FileTreeNode) => void
  onContext: (e: MouseEvent, node: FileTreeNode) => void
  onDropTo: (srcPath: string, targetDir: string) => void
  onQuickRun: (node: FileTreeNode) => void
  onQuickCopy: (node: FileTreeNode) => void
  onQuickDelete: (node: FileTreeNode) => void
  renamingPath: string | null
  renameValue: string
  onRenameValue: (v: string) => void
  onRenameCommit: () => void
  onRenameCancel: () => void
  key?: string
}): JSX.Element {
  const isDir = node.type === 'dir'
  const isOpen = expandedDirs.has(node.path)
  const isPy = node.name.toLowerCase().endsWith('.py')
  const isRenaming = renamingPath === node.path
  const [dragOver, setDragOver] = useState(false)
  return (
    <div
      onDragOver={(e) => {
        if (isDir) {
          e.preventDefault()
          setDragOver(true)
        }
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        if (!isDir) return
        e.preventDefault()
        e.stopPropagation()
        setDragOver(false)
        const src = e.dataTransfer.getData('text/plain')
        if (src) onDropTo(src, node.path)
      }}
    >
      <div
        className={`ws-tree-node${isDir ? ' drop-target' : ''}${dragOver ? ' drag-over' : ''}`}
        style={{ paddingLeft: 8 + depth * 14 }}
        draggable={!isDir}
        onDragStart={(e) => {
          e.dataTransfer.setData('text/plain', node.path)
          e.dataTransfer.effectAllowed = 'move'
        }}
        onClick={() => {
          if (!isRenaming) isDir ? onToggle(node.path) : onOpen(node)
        }}
        onContextMenu={(e) => {
          e.preventDefault()
          e.stopPropagation() // 防止冒泡到空白区域右键处理（会覆盖节点菜单）
          onContext(e, node)
        }}
        title={node.path}
      >
        {isDir ? (
          <>
            <IconChevronDown size={12} className={`tree-arrow${isOpen ? ' open' : ''}`} />
            <IconFolder size={13} className={isOpen ? 'open' : ''} />
          </>
        ) : (
          <>
            <span className="tree-arrow-spacer" />
            <FileTypeIcon path={node.path} size={13} />
          </>
        )}
        {isRenaming ? (
          <input
            className="ws-tree-rename"
            value={renameValue}
            autoFocus
            onChange={(e) => onRenameValue(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              e.stopPropagation()
              if (e.key === 'Enter') onRenameCommit()
              if (e.key === 'Escape') onRenameCancel()
            }}
            onBlur={onRenameCommit}
          />
        ) : (
          <span className="ws-tree-name">{node.name}</span>
        )}
        {!isDir && !isRenaming && (
          <span className="tree-quick-actions" onClick={(e) => e.stopPropagation()}>
            {isPy && (
              <button className="icon-btn" title="运行" onClick={() => onQuickRun(node)}>
                <IconPlay size={12} />
              </button>
            )}
            <button className="icon-btn" title="复制" onClick={() => onQuickCopy(node)}>
              <IconCopy size={12} />
            </button>
            <button className="icon-btn danger" title="删除" onClick={() => onQuickDelete(node)}>
              <IconTrash size={12} />
            </button>
          </span>
        )}
      </div>
      {isDir && isOpen && node.children && (
        <TreeNodes
          nodes={node.children}
          depth={depth + 1}
          expandedDirs={expandedDirs}
          onToggle={onToggle}
          onOpen={onOpen}
          onContext={onContext}
          onDropTo={onDropTo}
          onQuickRun={onQuickRun}
          onQuickCopy={onQuickCopy}
          onQuickDelete={onQuickDelete}
          renamingPath={renamingPath}
          renameValue={renameValue}
          onRenameValue={onRenameValue}
          onRenameCommit={onRenameCommit}
          onRenameCancel={onRenameCancel}
        />
      )}
    </div>
  )
}
