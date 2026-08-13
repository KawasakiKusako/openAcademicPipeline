import { useEffect, useMemo, useRef, useState } from 'react'
import ContextMenu from '../ContextMenu'
import type { ContextMenuItem } from '../ContextMenu'
import type { JSX, MouseEvent as ReactMouseEvent } from 'react'
import { marked } from 'marked'
import { api, rawFileUrl } from '../../lib/api'
import { useWorkspaceStore } from '../../store/workspace'
import ChatPanel from './ChatPanel'
import CodeEditor from './CodeEditor'
import { isTextFile } from './CodeEditor'
import TaskSandboxView from '../TaskSandboxView'
import SettingsPage from '../../pages/SettingsPage'
import RecommendationsPage from '../../pages/RecommendationsPage'
import { TaskFormView, TaskChatView } from '../../pages/TaskDetailPage'
import {
  IconChat,
  IconClose,
  IconDoc,
  IconEye,
  IconFile,
  IconBook,
  IconPanel,
  IconPlay,
  IconSettings,
  IconTask
} from '../Icon'
import type { RunResult, Task } from '@shared/types'

// 工作台：选项卡式（文件 / 任务 / 会话）+ 底部可调输出面板
export default function Workbench({ projectId }: { projectId: string }): JSX.Element {
  const {
    tabs,
    activeTabId,
    closeTab,
    setActiveTab,
    showSidebar,
    showAux,
    showPanel,
    toggleSidebar,
    toggleAux,
    togglePanel,
    panelHeight,
    setPanelHeight,
    runResult,
    saveRequest
  } = useWorkspaceStore()
  // keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const mod = e.ctrlKey || e.metaKey
      if (!mod) return
      const key = e.key.toLowerCase()
      if (key === 's') {
        e.preventDefault()
        useWorkspaceStore.getState().requestSave()
      } else if (key === 'b' && !e.shiftKey) {
        e.preventDefault()
        toggleSidebar()
      } else if (key === 'j') {
        e.preventDefault()
        togglePanel()
      } else if (key === 'b' && e.shiftKey) {
        e.preventDefault()
        toggleAux()
      } else if (key === 'w') {
        e.preventDefault()
        const s = useWorkspaceStore.getState()
        if (s.activeTabId) s.closeTab(s.activeTabId)
      } else if (key === 'tab') {
        e.preventDefault()
        const s = useWorkspaceStore.getState()
        if (s.tabs.length > 1) {
          const idx = s.tabs.findIndex((t) => t.id === s.activeTabId)
          s.setActiveTab(s.tabs[(idx + 1) % s.tabs.length].id)
        }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [toggleSidebar, toggleAux, togglePanel])

  const [textMenu, setTextMenu] = useState<{ x: number; y: number; selected: string } | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const resizeStart = useRef<{ y: number; h: number }>({ y: 0, h: 0 })
  const panelDragging = useRef(false)

  const onPanelMouseDown = (e: ReactMouseEvent): void => {
    e.preventDefault()
    panelDragging.current = true
    resizeStart.current = { y: e.clientY, h: panelRef.current?.offsetHeight ?? panelHeight }
    document.body.style.cursor = 'row-resize'
    document.body.style.userSelect = 'none'
    const onMove = (ev: MouseEvent): void => {
      if (!panelDragging.current) return
      const el = panelRef.current
      if (el) {
        const h = resizeStart.current.h + (resizeStart.current.y - ev.clientY)
        el.style.height = `${Math.max(80, Math.min(h, 500))}px`
      }
    }
    const onUp = (): void => {
      panelDragging.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      if (panelRef.current) setPanelHeight(panelRef.current.offsetHeight)
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  return (
    <div className="workbench">
      <div className="wb-tabs">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={`wb-tab${tab.id === activeTabId ? ' active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
            title={tab.refId}
          >
            {tab.kind === 'file' && <IconDoc size={13} />}
            {tab.kind === 'task' && <IconTask size={13} />}
            {tab.kind === 'session' && <IconChat size={13} />}
            {tab.kind === 'settings' && <IconSettings size={13} />}
            {tab.kind === 'recommend' && <IconBook size={13} />}
            <span className="wb-tab-title">{tab.title}</span>
            <button
              className="wb-tab-close"
              onClick={(e) => {
                e.stopPropagation()
                closeTab(tab.id)
              }}
            >
              <IconClose size={12} />
            </button>
          </div>
        ))}
        <div className="wb-tabs-actions">
          <button className={`icon-btn${showSidebar ? ' on' : ''}`} title="开关主侧栏 (Ctrl+B)" onClick={toggleSidebar}>
            <IconFile size={14} />
          </button>
          <button className={`icon-btn${showPanel ? ' on' : ''}`} title="开关面板 (Ctrl+J)" onClick={togglePanel}>
            <IconPanel size={14} />
          </button>
          <button className={`icon-btn${showAux ? ' on' : ''}`} title="开关副侧栏 (Ctrl+Shift+B)" onClick={toggleAux}>
            <IconChat size={14} />
          </button>
        </div>
      </div>

      <div
        className="wb-body"
        onContextMenu={(e) => {
          // 文字区域右键菜单：复制/粘贴/删除/发送到悬浮窗
          const sel = window.getSelection()?.toString() ?? ''
          setTextMenu({ x: e.clientX, y: e.clientY, selected: sel })
        }}
      >
        {/* 所有 tab 内容保持挂载，仅用 display 切换 —— 未保存草稿不丢、
            编辑器不重建（解决切换卡顿） */}
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className="wb-tab-content"
            style={{ display: tab.id === activeTabId ? 'flex' : 'none' }}
          >
            {tab.kind === 'file' && (
              <FileEditorTab path={tab.refId} projectId={projectId} saveRequest={saveRequest} />
            )}
            {tab.kind === 'task' && <TaskTab taskId={tab.refId} projectId={projectId} />}
            {tab.kind === 'session' && <ChatPanel sessionId={tab.refId} />}
            {tab.kind === 'settings' && <SettingsPage embedded />}
            {tab.kind === 'recommend' && <RecommendationsPage embedded />}
          </div>
        ))}
        {tabs.length === 0 && (
          <div className="wb-empty">
            <p>从左侧资源管理器 / 任务 / 会话打开内容</p>
          </div>
        )}
      </div>

      {textMenu && (
        <ContextMenu
          x={textMenu.x}
          y={textMenu.y}
          onClose={() => setTextMenu(null)}
          items={[
            { label: '复制', action: () => document.execCommand('copy') },
            { label: '粘贴', action: () => document.execCommand('paste') },
            { label: '删除', action: () => document.execCommand('delete') },
            ...(textMenu.selected.trim()
              ? [
                  {
                    label: '发送到悬浮窗',
                    action: () => window.api.sendToFloating(textMenu.selected.trim())
                  }
                ]
              : [])
          ] satisfies ContextMenuItem[]}
        />
      )}

      {showPanel && (
        <div className="wb-panel" ref={panelRef} style={{ height: panelHeight }}>
          <div className="wb-panel-head" onMouseDown={onPanelMouseDown}>
            <span>输出</span>
            <button className="icon-btn" title="关闭面板" onClick={togglePanel}>
              <IconClose size={12} />
            </button>
          </div>
          <div className="wb-panel-body">
            {runResult ? (
              <RunOutput result={runResult.result as RunResult} filePath={runResult.filePath} />
            ) : (
              <span className="muted small">运行脚本后在此查看输出与问题</span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/* ---------- run output / problems ---------- */

function RunOutput({ result, filePath }: { result: RunResult; filePath: string }): JSX.Element {
  const [tab, setTab] = useState<'output' | 'problems'>('output')

  const problems = useMemo(() => {
    const lines: { line: number; text: string }[] = []
    const re = /line\s+(\d+)/i
    for (const raw of (result.stderr || '').split(/\r?\n/)) {
      if (/error|exception|traceback|warning/i.test(raw)) {
        const m = raw.match(re)
        lines.push({ line: m ? Number(m[1]) : 0, text: raw.trim() })
      }
    }
    return lines
  }, [result.stderr])

  return (
    <div className="wb-panel-inner">
      <div className="wb-panel-tabs">
        <button className={`sub-btn${tab === 'output' ? ' active' : ''}`} onClick={() => setTab('output')}>
          输出
        </button>
        <button className={`sub-btn${tab === 'problems' ? ' active' : ''}`} onClick={() => setTab('problems')}>
          问题{problems.length > 0 ? ` (${problems.length})` : ''}
        </button>
      </div>
      {tab === 'output' ? (
        <pre className="wb-panel-console">
          <span className={result.exitCode === 0 ? 'ok' : 'err'}>
            $ {filePath} — {result.exitCode === 0 ? '✓ 退出码 0' : `✗ 退出码 ${result.exitCode}`}
            {result.timedOut ? '（超时终止）' : ''} · {result.command}
          </span>
          {result.stdout || ''}
          {result.stderr ? `\n[stderr]\n${result.stderr}` : ''}
        </pre>
      ) : problems.length > 0 ? (
        <div className="wb-problems">
          {problems.map((p, i) => (
            <div key={i} className={`wb-problem${p.line ? ' clickable' : ''}`} title={p.text}>
              <span className="err-dot" />
              <span>{p.text.slice(0, 200)}</span>
              {p.line > 0 && <span className="problem-line">:{p.line}</span>}
            </div>
          ))}
        </div>
      ) : (
        <span className="muted small">没有问题</span>
      )}
    </div>
  )
}

/* ---------- file editor tab (CodeMirror + run + markdown split preview) ---------- */

function FileEditorTab({
  path,
  projectId,
  saveRequest
}: {
  path: string
  projectId: string
  saveRequest: number
  key?: string
}): JSX.Element {
  // 草稿优先：切换选项卡不丢未保存内容（draft 存 store，组件保持挂载）
  const { setRunResult, togglePanel, tabs, activeTabId, fileDrafts, setFileDraft, clearFileDraft } =
    useWorkspaceStore()
  const [content, setContent] = useState(() => fileDrafts[path] ?? '')
  const [dirty, setDirty] = useState(() => fileDrafts[path] !== undefined)
  const [loaded, setLoaded] = useState(() => fileDrafts[path] !== undefined)
  const [error, setError] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [preview, setPreview] = useState(false)
  const isMd = path.toLowerCase().endsWith('.md')
  const isPy = path.toLowerCase().endsWith('.py')
  const isText = isTextFile(path)
  const html = useMemoMd(content)

  useEffect(() => {
    if (loaded) return // draft already present — keep the unsaved edits
    setError(null)
    setPreview(false)
    if (!isText) {
      setContent('（二进制文件，无法编辑）')
      setLoaded(true)
      return
    }
    api
      .readFile(projectId, path)
      .then(({ content: fileContent }) => {
        setContent(fileContent)
        setDirty(false)
        setLoaded(true)
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, path, isText, loaded])

  async function handleSave(): Promise<void> {
    try {
      await api.writeFile(projectId, path, content)
      setDirty(false)
      clearFileDraft(path)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  // Ctrl+S (store saveRequest) saves the active file tab
  useEffect(() => {
    if (saveRequest > 0 && activeTabId && tabs.find((t) => t.id === activeTabId)?.refId === path) {
      handleSave()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saveRequest])

  async function handleRun(): Promise<void> {
    if (!isPy || running) return
    setRunning(true)
    setError(null)
    try {
      if (dirty) await handleSave()
      const result = await api.runProjectScript(projectId, path)
      setRunResult({ filePath: path, result })
      if (!useWorkspaceStore.getState().showPanel) togglePanel()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="wb-file">
      <div className="wb-file-head">
        <span className="wb-file-path">{path}</span>
        <div className="row gap">
          {isMd && (
            <button className="btn small ghost" onClick={() => setPreview((v) => !v)}>
              <IconEye size={13} />
              {preview ? '编辑' : '双栏预览'}
            </button>
          )}
          {isPy && (
            <button className="btn small" onClick={handleRun} disabled={running}>
              <IconPlay size={13} />
              {running ? '运行中…' : '运行'}
            </button>
          )}
          <button className="btn small primary" onClick={handleSave} disabled={!dirty}>
            {dirty ? '保存' : '已保存'}
          </button>
        </div>
      </div>
      {error && <div className="error-box">{error}</div>}
      {isMd && preview ? (
        <div className="wb-md-split">
          <div className="wb-code-wrap">
            <CodeEditor path={path} value={content} onChange={(v) => { setContent(v); setDirty(true); setFileDraft(path, v) }} />
          </div>
          <div className="wb-md-divider" />
          <div className="wb-md-preview" dangerouslySetInnerHTML={{ __html: html }} />
        </div>
      ) : (
        <div className="wb-code-wrap">
          {isText ? (
            <CodeEditor path={path} value={content} onChange={(v) => { setContent(v); setDirty(true); setFileDraft(path, v) }} />
          ) : (
            <MediaPreview path={path} projectId={projectId} />
          )}
        </div>
      )}
    </div>
  )
}

/* ---------- media preview (image / video / audio / pdf) ---------- */

function MediaPreview({ path, projectId }: { path: string; projectId: string }): JSX.Element {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  const url = rawFileUrl(projectId, path)

  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico', 'bmp'].includes(ext)) {
    return (
      <div className="wb-media">
        <img src={url} alt={path} />
      </div>
    )
  }
  if (['mp4', 'webm', 'mov', 'avi', 'mkv'].includes(ext)) {
    return (
      <div className="wb-media">
        <video src={url} controls style={{ maxWidth: '100%', maxHeight: '100%' }} />
      </div>
    )
  }
  if (['mp3', 'wav', 'ogg', 'm4a', 'flac'].includes(ext)) {
    return (
      <div className="wb-media">
        <audio src={url} controls style={{ width: '100%' }} />
        <span className="muted small">{path}</span>
      </div>
    )
  }
  if (ext === 'pdf') {
    return (
      <iframe
        className="wb-media-pdf"
        src={url}
        title={path}
      />
    )
  }
  return <div className="wb-empty">暂不支持预览该文件类型（{ext}）</div>
}

// memoized markdown render
function useMemoMd(content: string): string {
  return useMemo(() => {
    try {
      return marked.parse(content, { async: false, breaks: true }) as string
    } catch {
      return content
    }
  }, [content])
}

/* ---------- task tab: renders the form/chat/sandbox view per task kind ---------- */

function TaskTab({ taskId, projectId }: { taskId: string; projectId: string; key?: string }): JSX.Element {
  const [task, setTask] = useState<Task | null>(null)
  const [kind, setKind] = useState<'chat' | 'sandbox' | 'form'>('chat')

  useEffect(() => {
    let cancelled = false
    api
      .task(taskId)
      .then(async (t) => {
        if (cancelled) return
        setTask(t)
        const ts = await api.taskTypes()
        if (cancelled) return
        const map = Object.fromEntries(ts.map((x) => [x.type, x]))
        setKind(map[t.type]?.kind ?? 'chat')
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [taskId])

  if (!task) return <div className="wb-empty">加载中…</div>

  return (
    <div className="wb-task">
      {kind === 'form' && <TaskFormView task={task} skillLabel={null} />}
      {kind === 'chat' && <TaskChatView task={task} />}
      {kind === 'sandbox' && <TaskSandboxView task={task} projectId={projectId} />}
    </div>
  )
}
