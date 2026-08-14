import { useEffect, useRef, useState } from 'react'
import type { FormEvent, JSX } from 'react'
import { api } from '../lib/api'
import {
  IconClose,
  IconDownload,
  IconFile,
  IconMore,
  IconPlus,
  IconSend,
  IconStop,
  IconTrash
} from '../components/Icon'
import type { EffortLevel } from '@shared/types'
import appIcon from '../assets/app-icon.png'

interface ImportedFile {
  name: string
  chars: number
  text: string
}

interface LocalMsg {
  role: 'user' | 'assistant' | 'system'
  content: string
  time?: string
}

const STORAGE_KEY = 'oap-present-assist-state'

const EFFORTS: { value: EffortLevel; label: string }[] = [
  { value: 'low', label: '低 · 最快' },
  { value: 'medium', label: '中' },
  { value: 'high', label: '高' },
  { value: 'max', label: '最大 · 最慢' }
]

const OFFICIAL_MODELS = ['claude-opus-5', 'claude-sonnet-5', 'claude-haiku-4-5-20251001']

function loadState(): { files: ImportedFile[]; messages: LocalMsg[] } {
  try {
    const s = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as {
      files?: ImportedFile[]
      messages?: LocalMsg[]
    } | null
    return { files: s?.files ?? [], messages: s?.messages ?? [] }
  } catch {
    return { files: [], messages: [] }
  }
}

const now = (): string => new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })

// 自定义下拉（原生 select 在 Windows 上背景样式不可控，自绘保证主题一致）
function CustomSelect({
  value,
  onChange,
  options
}: {
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
}): JSX.Element {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])
  const current = options.find((o) => o.value === value)
  return (
    <div className="pa-select" ref={ref}>
      <button
        type="button"
        className={`pa-select-btn${open ? ' open' : ''}`}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="pa-select-value">{current?.label ?? '—'}</span>
        <span className="pa-select-arrow">▾</span>
      </button>
      {open && (
        <div className="pa-select-list">
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              className={`pa-select-opt${o.value === value ? ' active' : ''}`}
              onClick={() => {
                onChange(o.value)
                setOpen(false)
              }}
            >
              <span>{o.label}</span>
              {o.value === value && <span className="pa-select-check">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// 汇报助手（悬浮窗）：多文件导入 + 原生 API 对话（模型/思考强度可调，记录持久化，可导出知识库）
export default function PresentAssistPage(): JSX.Element {
  const initial = useRef(loadState())
  const [files, setFiles] = useState<ImportedFile[]>(initial.current.files)
  const [messages, setMessages] = useState<LocalMsg[]>(initial.current.messages)
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState('')
  const [sending, setSending] = useState(false)
  const [model, setModel] = useState('')
  const [providers, setProviders] = useState<{ id: string; name: string; model: string; isCurrent: boolean }[]>([])
  const [effort, setEffort] = useState<EffortLevel>('high')
  const [error, setError] = useState<string | null>(null)
  const [exported, setExported] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const messagesRef = useRef<LocalMsg[]>(messages)
  messagesRef.current = messages

  // 对话记录持久化：未点「清空」前，窗口关闭再打开也不丢失
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ files, messages }))
  }, [files, messages])

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [messages, streaming])

  // 模型列表：cc-switch providers + 官方模型
  useEffect(() => {
    api
      .ccSwitchProviders()
      .then((ps) => setProviders(ps))
      .catch(() => undefined)
  }, [])

  // 从资源管理器右键进入：自动导入文件
  useEffect(() => {
    window.api.onPresentAssistImport((payload) => {
      void importPath(payload.path, payload.projectId)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function importPath(path: string, projectId?: string): Promise<void> {
    setError(null)
    try {
      const res = await fetch('http://127.0.0.1:11455/api/present-assist/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, projectId })
      })
      const d = (await res.json()) as { name?: string; text?: string; chars?: number; error?: string }
      if (!res.ok || !d.text) throw new Error(d.error ?? '解析失败')
      setFiles((prev) => {
        if (prev.some((f) => f.name === d.name)) return prev
        return [...prev, { name: d.name!, text: d.text!, chars: d.chars ?? 0 }]
      })
      setMessages((prev) => [
        ...prev,
        { role: 'system', content: `已导入文件：${d.name}（${d.chars?.toLocaleString() ?? ''} 字符）`, time: now() }
      ])
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function pickFiles(): Promise<void> {
    const picked = await window.api.selectFile(
      [{ name: '文档 / 演示文稿', extensions: ['pptx', 'docx', 'pdf', 'txt', 'md'] }],
      true
    )
    if (!picked) return
    const paths = Array.isArray(picked) ? picked : [picked]
    for (const p of paths) void importPath(p)
  }

  function buildSystem(): string | undefined {
    if (files.length === 0) return undefined
    const body = files.map((f) => `【文件：${f.name}】\n${f.text}`).join('\n\n')
    return `你是学术汇报助手。用户已导入以下文件，请基于这些内容回答问题、生成讲稿或讲解要点。\n\n${body}`
  }

  async function handleSend(e: FormEvent): Promise<void> {
    e.preventDefault()
    const content = input.trim()
    if (!content || sending) return
    setInput('')
    setError(null)
    setExported(false)
    setStreaming('')
    setMessages((prev) => [...prev, { role: 'user', content, time: now() }])
    setSending(true)
    const controller = new AbortController()
    abortRef.current = controller

    const history = messagesRef.current
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role, content: m.content }))

    try {
      const res = await fetch('http://127.0.0.1:11455/api/temp/chat-api', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, system: buildSystem(), effort, model: model || undefined, history }),
        signal: controller.signal
      })
      if (!res.ok || !res.body) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null
        throw new Error(body?.error ?? `请求失败 (${res.status})`)
      }
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let reply = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        let sep: number
        while ((sep = buffer.indexOf('\n\n')) >= 0) {
          const raw = buffer.slice(0, sep)
          buffer = buffer.slice(sep + 2)
          const dataLine = raw.split('\n').find((l) => l.startsWith('data:'))
          if (!dataLine) continue
          try {
            const json = JSON.parse(dataLine.slice(5).trim()) as { delta?: string; message?: string }
            if (json.delta) {
              reply += json.delta
              setStreaming(reply)
            } else if (json.message) setError(json.message)
          } catch {
            // skip
          }
        }
      }
      setStreaming('')
      if (reply) setMessages((prev) => [...prev, { role: 'assistant', content: reply, time: now() }])
    } catch (err) {
      if (!(err instanceof Error && err.name === 'AbortError')) {
        setError(err instanceof Error ? err.message : String(err))
      }
      setStreaming('')
    } finally {
      setSending(false)
      abortRef.current = null
    }
  }

  function removeFile(name: string): void {
    setFiles((prev) => prev.filter((f) => f.name !== name))
  }

  // 点击面板外关闭「更多」
  useEffect(() => {
    if (!moreOpen) return
    const onDown = (e: MouseEvent): void => {
      if (!(e.target as HTMLElement).closest('.pa-more-wrap')) setMoreOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [moreOpen])

  function clearChat(): void {
    if (!window.confirm('清空当前对话与已导入文件？')) return
    setMessages([])
    setFiles([])
    setStreaming('')
    localStorage.removeItem(STORAGE_KEY)
  }

  // 导出对话记录到知识库（随记，markdown 格式）
  async function exportChat(): Promise<void> {
    if (messages.length === 0) return
    const roleLabel = (r: string): string => (r === 'user' ? '用户' : r === 'system' ? '系统' : 'AI')
    const md = [
      '# 汇报助手对话记录',
      '',
      `- 时间：${new Date().toLocaleString('zh-CN')}`,
      `- 已导入文件：${files.map((f) => f.name).join('、') || '无'}`,
      '',
      ...messages.map((m) => `## ${roleLabel(m.role)}${m.time ? `（${m.time}）` : ''}\n\n${m.content}`)
    ].join('\n')
    try {
      await api.createScratch({
        content: md,
        summary: `汇报助手对话 · ${new Date().toLocaleString('zh-CN')}`
      })
      setExported(true)
      setTimeout(() => setExported(false), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const modelOptions: string[] = [
    ...new Map<string, string>([
      ...providers.map((p) => [p.model, p.model] as [string, string]),
      ...OFFICIAL_MODELS.map((m) => [m, m] as [string, string])
    ]).keys()
  ]

  return (
    <div className="present-assist">
      <div className="pa-head">
        <span className="pa-title">
          <img className="pa-logo" src={appIcon} alt="" />
          汇报助手
        </span>
        <div className="row gap pa-head-controls">
          <button className="icon-btn" title="导入文件" onClick={pickFiles}>
            <IconPlus size={16} />
          </button>
          <button
            className="icon-btn"
            title="导出对话到知识库"
            onClick={exportChat}
            disabled={messages.length === 0}
          >
            <IconDownload size={16} />
          </button>
          <div className="pa-more-wrap">
            <button
              className={`icon-btn${moreOpen ? ' on' : ''}`}
              title="更多设置"
              onClick={() => setMoreOpen((v) => !v)}
            >
              <IconMore size={16} />
            </button>
            {moreOpen && (
              <div className="pa-more-panel" onClick={(e) => e.stopPropagation()}>
                <div className="pa-more-row">
                  <span className="pa-more-label">模型</span>
                  <CustomSelect
                    value={model}
                    onChange={setModel}
                    options={[
                      { value: '', label: '跟随设置' },
                      ...modelOptions.map((m) => ({ value: m, label: m }))
                    ]}
                  />
                </div>
                <div className="pa-more-row">
                  <span className="pa-more-label">思考强度</span>
                  <CustomSelect
                    value={effort}
                    onChange={(v) => setEffort(v as EffortLevel)}
                    options={EFFORTS.map((e) => ({ value: e.value, label: e.label }))}
                  />
                </div>
                <div className="pa-more-sep" />
                <button
                  className="btn small danger pa-more-clear"
                  onClick={clearChat}
                  disabled={messages.length === 0 && files.length === 0}
                >
                  <IconTrash size={12} />
                  清空对话与文件
                </button>
              </div>
            )}
          </div>
          <button className="icon-btn" title="关闭" onClick={() => window.api.closePresentAssist()}>
            <IconClose size={16} />
          </button>
        </div>
      </div>

      {files.length > 0 && (
        <div className="pa-files">
          {files.map((f) => (
            <span key={f.name} className="pa-file-chip" title={f.name}>
              <IconFile size={11} />
              {f.name.length > 24 ? f.name.slice(0, 24) + '…' : f.name}
              <button className="pa-file-x" onClick={() => removeFile(f.name)}>
                ×
              </button>
            </span>
          ))}
          <span className="muted small">{files.length} 个文件已作为上下文</span>
        </div>
      )}

      {error && <div className="error-box" style={{ margin: '8px 12px' }}>{error}</div>}
      {exported && <div className="success-box" style={{ margin: '8px 12px' }}>已导出到知识库（随记）</div>}

      <div className="pa-chat" ref={listRef}>
        {messages.map((m, i) => (
          <div key={i} className={`pa-msg ${m.role}`}>
            {m.role === 'assistant' && (
              <img className="pa-avatar" src={appIcon} alt="" />
            )}
            <div className="pa-msg-body">
              {m.role === 'system' ? (
                <div className="pa-sys-msg">{m.content}</div>
              ) : (
                <div className="pa-msg-bubble">{m.content}</div>
              )}
              {m.time && <span className="pa-msg-time">{m.time}</span>}
            </div>
          </div>
        ))}
        {streaming && (
          <div className="pa-msg assistant">
            <img className="pa-avatar" src={appIcon} alt="" />
            <div className="pa-msg-body">
              <div className="pa-msg-bubble streaming">
                {streaming}
                <span className="pa-cursor" />
              </div>
            </div>
          </div>
        )}
        {sending && !streaming && <span className="typing">思考中</span>}
        {messages.length === 0 && !sending && (
          <div className="pa-empty">
            <img className="pa-empty-logo" src={appIcon} alt="" />
            <p>导入 PPT / 论文文件，向 AI 提问</p>
            <p className="muted small">支持 pptx · docx · pdf · txt · md · 原生 API 快速响应</p>
            <button className="btn primary" onClick={pickFiles}>
              <IconPlus size={14} />
              导入文件
            </button>
          </div>
        )}
      </div>

      <form className="pa-composer" onSubmit={handleSend}>
        <button type="button" className="icon-btn" title="对话中上传文件" onClick={pickFiles}>
          <IconPlus size={15} />
        </button>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="询问 PPT / 论文内容…（Enter 发送，Shift+Enter 换行）"
          rows={2}
          spellCheck={false}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleSend(e)
            }
          }}
        />
        {sending ? (
          <button type="button" className="btn danger" onClick={() => abortRef.current?.abort()}>
            <IconStop size={14} />
          </button>
        ) : (
          <button type="submit" className="btn primary pa-send" disabled={!input.trim()}>
            <IconSend size={15} />
          </button>
        )}
      </form>
    </div>
  )
}
