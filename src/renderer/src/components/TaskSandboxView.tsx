import { useCallback, useEffect, useState } from 'react'
import type { FormEvent, JSX } from 'react'
import { api } from '../lib/api'
import { IconFolder, IconDoc, IconPlay, IconPlus, IconSave } from './Icon'
import FileTypeIcon from './FileTypeIcon'
import type { AppSettings, FileTreeNode, RunResult, Task } from '@shared/types'

interface Props {
  task: Task
  projectId: string
}

// 数据沙盒：类 VSCode 三栏（文件树 | 编辑器 | 运行输出），支持 conda/uv/系统环境
export default function TaskSandboxView({ task, projectId }: Props): JSX.Element {
  const [tree, setTree] = useState<FileTreeNode[]>([])
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['']))
  const [activePath, setActivePath] = useState<string | null>(null)
  const [content, setContent] = useState('')
  const [dirty, setDirty] = useState(false)
  const [newFileName, setNewFileName] = useState('')
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<RunResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [settings, setSettings] = useState<AppSettings | null>(null)

  const loadTree = useCallback(async () => {
    try {
      setTree(await api.tree(projectId))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [projectId])

  useEffect(() => {
    loadTree()
    api.settings().then(setSettings).catch(() => undefined)
  }, [loadTree])

  async function handleOpen(node: FileTreeNode): Promise<void> {
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
      const { content } = await api.readFile(projectId, node.path)
      setActivePath(node.path)
      setContent(content)
      setDirty(false)
      setResult(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function handleSave(): Promise<void> {
    // 保护：无修改不写盘，避免空/旧内容覆盖磁盘文件
    if (!activePath || !dirty) return
    await api.writeFile(projectId, activePath, content)
    setDirty(false)
    loadTree()
  }

  async function handleCreateFile(e: FormEvent): Promise<void> {
    e.preventDefault()
    if (!newFileName.trim()) return
    const target = activePath?.endsWith('.py')
      ? activePath.replace(/[^/\\]+$/, newFileName.trim())
      : newFileName.trim()
    await api.writeFile(projectId, target, '# -*- coding: utf-8 -*-\n')
    setNewFileName('')
    loadTree()
    const { content } = await api.readFile(projectId, target)
    setActivePath(target)
    setContent(content)
    setDirty(false)
  }

  async function handleRun(): Promise<void> {
    if (!activePath || running) return
    setRunning(true)
    setError(null)
    setResult(null)
    try {
      if (dirty) await handleSave()
      setResult(await api.runScript(task.id, activePath))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setRunning(false)
    }
  }

  const envLabel = settings?.pythonEnv
    ? settings.pythonEnv.type === 'conda'
      ? `conda: ${settings.pythonEnv.value}`
      : settings.pythonEnv.type === 'uv'
        ? 'uv (.venv)'
        : '系统 Python'
    : '系统 Python'

  return (
    <div className="sandbox">
      <aside className="sb-tree">
        <div className="sb-pane-head">
          <span>资源管理器</span>
        </div>
        <div className="sb-tree-body">
          <TreeNode
            node={{ name: '沙盒', path: '', type: 'dir', children: tree }}
            depth={0}
            expanded={expanded}
            activePath={activePath}
            onToggle={(p) =>
              setExpanded((prev) => {
                const next = new Set(prev)
                if (next.has(p)) next.delete(p)
                else next.add(p)
                return next
              })
            }
            onOpen={handleOpen}
          />
        </div>
        <form className="sb-new-file" onSubmit={handleCreateFile}>
          <input
            value={newFileName}
            onChange={(e) => setNewFileName(e.target.value)}
            placeholder="新建文件.py"
            spellCheck={false}
          />
          <button type="submit" className="icon-btn" title="创建文件">
            <IconPlus size={13} />
          </button>
        </form>
      </aside>

      <section className="sb-editor">
        <div className="sb-pane-head">
          <span className="sb-file-tab">{activePath ?? '未打开文件'}</span>
          {activePath && (
            <button className="btn small" onClick={handleSave} disabled={!dirty}>
              <IconSave size={13} />
              {dirty ? '保存' : '已保存'}
            </button>
          )}
        </div>
        {activePath ? (
          <textarea
            className="sb-code"
            value={content}
            onChange={(e) => {
              setContent(e.target.value)
              setDirty(true)
            }}
            spellCheck={false}
          />
        ) : (
          <div className="sb-empty">
            <IconDoc size={28} />
            <p>从左侧选择文件，或新建一个 .py 脚本</p>
          </div>
        )}
      </section>

      <aside className="sb-output">
        <div className="sb-pane-head">
          <span>输出 · {envLabel}</span>
          <button className="btn small primary" onClick={handleRun} disabled={!activePath || running}>
            <IconPlay size={13} />
            {running ? '运行中…' : '运行'}
          </button>
        </div>
        {error && <div className="error-box">{error}</div>}
        <pre className="sb-console">
          {result
            ? `${result.command}\n$ ${result.exitCode === 0 ? '✓ 退出码 0' : `✗ 退出码 ${result.exitCode}`}${result.timedOut ? '（超时终止）' : ''}\n\n${result.stdout || ''}${result.stderr ? `\n[stderr]\n${result.stderr}` : ''}`
            : running
              ? '运行中…'
              : '点击「运行」执行当前脚本'}
        </pre>
      </aside>
    </div>
  )
}

function TreeNode({
  node,
  depth,
  expanded,
  activePath,
  onToggle,
  onOpen
}: {
  node: FileTreeNode
  depth: number
  expanded: Set<string>
  activePath: string | null
  onToggle: (path: string) => void
  onOpen: (node: FileTreeNode) => void
  key?: string
}): JSX.Element {
  const isDir = node.type === 'dir'
  const isOpen = expanded.has(node.path)
  const isActive = activePath === node.path

  return (
    <div>
      <div
        className={`sb-node${isActive ? ' active' : ''}`}
        style={{ paddingLeft: 6 + depth * 14 }}
        onClick={() => (isDir ? onToggle(node.path) : onOpen(node))}
        title={node.path || '沙盒根目录'}
      >
        {isDir ? (
          <IconFolder size={13} className={isOpen ? 'open' : ''} />
        ) : (
          <FileTypeIcon path={node.path} size={13} />
        )}
        <span className="sb-node-name">{node.name}</span>
      </div>
      {isDir && isOpen && node.children && (
        <div>
          {node.children.map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              activePath={activePath}
              onToggle={onToggle}
              onOpen={onOpen}
            />
          ))}
        </div>
      )}
    </div>
  )
}
