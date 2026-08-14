import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent, JSX } from 'react'
import { marked } from 'marked'
import { api } from '../lib/api'
import { IconClose, IconSave, IconSend, IconStop, IconTrash } from '../components/Icon'
import appIcon from '../assets/app-icon.png'

interface LocalMsg {
  role: 'user' | 'assistant'
  content: string
}

const STORAGE_KEY = 'oap-floating-chat-history'

// Markdown 渲染的气泡文本（AI 回复支持格式）
function MdText({ text }: { text: string }): JSX.Element {
  const html = useMemo(() => {
    try {
      return marked.parse(text, { async: false, breaks: true }) as string
    } catch {
      return text
    }
  }, [text])
  return <div className="bubble-text md" dangerouslySetInnerHTML={{ __html: html }} />
}

// 系统级悬浮窗：独立对话框（不加载应用壳），纯对话 + 可导入知识库（随记）。
// 修复点：注入监听器只注册一次（用 ref 持有最新 send，避免闭包竞态），
// 发送串行化（上一轮未完成时不接受新发送），AI 回复支持 Markdown 渲染。
export default function FloatingChatPage(): JSX.Element {
  const [messages, setMessages] = useState<LocalMsg[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as LocalMsg[]
    } catch {
      return []
    }
  })
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState('')
  const [sending, setSending] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const sendingRef = useRef(false)
  const messagesRef = useRef<LocalMsg[]>(messages)
  messagesRef.current = messages

  // 注入监听器（主窗口选中文字 → 发送到悬浮窗）：注册一次，通过 ref 读取最新状态
  useEffect(() => {
    const handler = (text: string): void => {
      if (text?.trim() && !sendingRef.current) {
        const content = text.trim()
        setMessages((m) => [...m, { role: 'user', content }])
        void sendNow(content)
      }
    }
    window.api.onFloatingInject(handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-60)))
  }, [messages])

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [messages, streaming])

  async function sendNow(content: string): Promise<void> {
    if (sendingRef.current) return
    sendingRef.current = true
    setSending(true)
    setError(null)
    setSaved(false)
    const controller = new AbortController()
    abortRef.current = controller
    setStreaming('')
    const history = messagesRef.current.filter((m) => m.content !== content).slice(-20)

    try {
      const res = await fetch('http://127.0.0.1:11455/api/temp/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content,
          history: history.map((h) => ({ role: h.role, content: h.content }))
        }),
        signal: controller.signal
      })
      if (!res.ok || !res.body) throw new Error(`请求失败 (${res.status})`)
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
      if (reply) setMessages((m) => [...m, { role: 'assistant', content: reply }])
    } catch (err) {
      if (!(err instanceof Error && err.name === 'AbortError')) {
        setError(err instanceof Error ? err.message : String(err))
      }
      setStreaming('')
    } finally {
      setSending(false)
      sendingRef.current = false
      abortRef.current = null
    }
  }

  function handleSend(e: FormEvent): void {
    e.preventDefault()
    const content = input.trim()
    if (!content || sendingRef.current) return
    setInput('')
    setMessages((m) => [...m, { role: 'user', content }])
    void sendNow(content)
  }

  // 导入知识库：整段对话沉淀为一条随记（知识库第三类）
  async function handleSaveToKb(): Promise<void> {
    if (messages.length === 0) return
    const content = messages
      .map((m) => `【${m.role === 'user' ? '用户' : 'AI'}】\n${m.content}`)
      .join('\n\n')
    const firstUser = messages.find((m) => m.role === 'user')
    try {
      await api.createScratch({
        content,
        summary: `悬浮窗对话 · ${firstUser ? firstUser.content.slice(0, 40) : new Date().toLocaleString('zh-CN')}`
      })
      setSaved(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  function handleClear(): void {
    if (!window.confirm('清空当前对话历史？')) return
    setMessages([])
    setStreaming('')
    setSaved(false)
    localStorage.removeItem(STORAGE_KEY)
  }

  return (
    <div className="floating-chat">
      <div className="floating-head">
        <img className="pa-logo" src={appIcon} alt="" />
        <span className="floating-title">临时对话</span>
        <div className="row gap floating-actions">
          <button
            className="btn small ghost"
            title="导入知识库（存入随记）"
            onClick={handleSaveToKb}
            disabled={messages.length === 0}
          >
            <IconSave size={12} />
            保存
          </button>
          <button
            className="btn small ghost"
            title="清空对话"
            onClick={handleClear}
            disabled={messages.length === 0}
          >
            <IconTrash size={12} />
            清空
          </button>
          <button className="icon-btn" title="关闭" onClick={() => window.api.closeFloatingChat()}>
            <IconClose size={13} />
          </button>
        </div>
      </div>
      <div className="floating-list" ref={listRef}>
        {messages.map((m, i) => (
          <div key={i} className={`pa-msg ${m.role}`}>
            {m.role === 'assistant' && <img className="pa-avatar" src={appIcon} alt="" />}
            <div className="pa-msg-body">
              {m.role === 'assistant' ? (
                <div className="pa-msg-bubble">
                  <MdText text={m.content} />
                </div>
              ) : (
                <div className="pa-msg-bubble">{m.content}</div>
              )}
            </div>
          </div>
        ))}
        {streaming && (
          <div className="pa-msg assistant">
            <img className="pa-avatar" src={appIcon} alt="" />
            <div className="pa-msg-body">
              <div className="pa-msg-bubble streaming">
                <MdText text={streaming} />
                <span className="pa-cursor" />
              </div>
            </div>
          </div>
        )}
        {sending && !streaming && <span className="typing">思考中</span>}
        {messages.length === 0 && !sending && (
          <div className="floating-empty">
            <img className="pa-empty-logo" src={appIcon} alt="" />
            <p>输入问题开始临时对话</p>
            <p className="muted small">完成后的对话可一键导入知识库（随记）</p>
          </div>
        )}
      </div>
      {saved && (
        <div className="floating-saved">✓ 已导入知识库（设置 → 知识库 → 随记 可查看）</div>
      )}
      {error && <div className="error-box" style={{ margin: '0 10px' }}>{error}</div>}
      <form className="floating-composer" onSubmit={handleSend}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="临时提问…（Enter 发送）"
          spellCheck={false}
          disabled={sending}
        />
        {sending ? (
          <button type="button" className="btn danger" onClick={() => abortRef.current?.abort()}>
            <IconStop size={13} />
          </button>
        ) : (
          <button type="submit" className="btn primary pa-send" disabled={!input.trim()}>
            <IconSend size={13} />
          </button>
        )}
      </form>
    </div>
  )
}
