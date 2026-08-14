import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { JSX, KeyboardEvent as ReactKeyboardEvent } from 'react'
import { marked } from 'marked'
import type { Token } from 'marked'
import TurndownService from 'turndown'
import { tables as gfmTables } from 'turndown-plugin-gfm'
import { Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx'
import { IconDownload, IconEye, IconImage, IconLink, IconRedo, IconUndo } from '../Icon'

export type MdMode = 'code' | 'split' | 'preview'

// 分段切换：编辑 / 双栏 / 直观修改
export function ModeSwitch({ mode, setMode }: { mode: MdMode; setMode: (m: MdMode) => void }): JSX.Element {
  return (
    <div className="seg" role="group" aria-label="Markdown 视图模式">
      <button
        type="button"
        className={`seg-btn${mode === 'code' ? ' active' : ''}`}
        title="纯代码"
        onClick={() => setMode('code')}
      >
        编辑
      </button>
      <button
        type="button"
        className={`seg-btn${mode === 'split' ? ' active' : ''}`}
        title="双栏：左编辑右预览"
        onClick={() => setMode('split')}
      >
        <IconEye size={12} />
        双栏
      </button>
      <button
        type="button"
        className={`seg-btn${mode === 'preview' ? ' active' : ''}`}
        title="直观修改：所见即所得"
        onClick={() => setMode('preview')}
      >
        直观修改
      </button>
    </div>
  )
}

export function markdownToHtml(md: string): string {
  try {
    return marked.parse(md, { async: false, breaks: true }) as string
  } catch {
    return md
  }
}

const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
  emDelimiter: '*'
})
turndown.use(gfmTables)

// 对话气泡里的 Markdown 文本（AI 回复）
export function MdText({ text }: { text: string }): JSX.Element {
  const html = useMemo(() => markdownToHtml(text), [text])
  return <div className="bubble-text md" dangerouslySetInnerHTML={{ __html: html }} />
}

/* ================= WYSIWYG 编辑器（直观修改模式） =================
 * - DOM 由 useLayoutEffect 手动同步（React 不接管 innerHTML，避免重写破坏光标）
 * - 自维护撤销/重做栈（markdown 快照），支持 Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z
 * - Enter 插入段落、Shift+Enter 换行
 * - 工具栏：加粗/斜体/删除线/行内代码/标题/列表/引用/代码块/分割线/表格/链接/图片/撤销/重做/导出
 */

interface ToolBtn {
  cmd: string
  value?: string
  label: string
  title: string
  query?: string
  icon?: 'undo' | 'redo' | 'image' | 'link'
}

const TOOL_BTNS: ToolBtn[] = [
  { cmd: 'bold', label: 'B', title: '加粗', query: 'bold' },
  { cmd: 'italic', label: 'I', title: '斜体', query: 'italic' },
  { cmd: 'strikeThrough', label: 'S', title: '删除线', query: 'strikeThrough' },
  { cmd: 'inlineCode', label: '⟨/⟩', title: '行内代码' },
  { cmd: 'formatBlock', value: 'h1', label: 'H1', title: '一级标题' },
  { cmd: 'formatBlock', value: 'h2', label: 'H2', title: '二级标题' },
  { cmd: 'formatBlock', value: 'h3', label: 'H3', title: '三级标题' },
  { cmd: 'insertUnorderedList', label: '• 列表', title: '无序列表' },
  { cmd: 'insertOrderedList', label: '1. 列表', title: '有序列表' },
  { cmd: 'formatBlock', value: 'blockquote', label: '❝', title: '引用块' },
  { cmd: 'formatBlock', value: 'pre', label: '{}', title: '代码块' },
  { cmd: 'insertHorizontalRule', label: '—', title: '分割线' },
  { cmd: 'table', label: '表格', title: '插入表格' },
  { cmd: 'link', label: '链接', title: '插入链接', icon: 'link' },
  { cmd: 'image', label: '图片', title: '插入图片', icon: 'image' },
  { cmd: 'undo', label: '', title: '撤销 (Ctrl+Z)', icon: 'undo' },
  { cmd: 'redo', label: '', title: '重做 (Ctrl+Y)', icon: 'redo' }
]

export function MdWysiwyg({
  value,
  onChange,
  exportName
}: {
  value: string
  onChange: (v: string) => void
  exportName?: string
}): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const editingRef = useRef(false)
  const applyingRef = useRef(false)
  const lastMdRef = useRef(value)
  const undoStack = useRef<string[]>([])
  const redoStack = useRef<string[]>([])
  const savedRange = useRef<Range | null>(null)
  const [states, setStates] = useState<Record<string, boolean>>({})
  const [linkOpen, setLinkOpen] = useState(false)
  const [linkUrl, setLinkUrl] = useState('https://')
  const html = useMemo(() => markdownToHtml(value), [value])
  const appliedHtmlRef = useRef<string | null>(null)

  // DOM 手动同步：React 不接管 innerHTML，避免每次渲染重写导致光标丢失
  useLayoutEffect(() => {
    if (editingRef.current) return
    if (appliedHtmlRef.current !== html) {
      if (ref.current) ref.current.innerHTML = html
      appliedHtmlRef.current = html
    }
  }, [html])

  // 选区状态（工具栏按钮高亮）
  useEffect(() => {
    const sync = (): void => {
      const next: Record<string, boolean> = {}
      for (const b of TOOL_BTNS) {
        if (b.query) {
          try {
            next[b.cmd] = document.queryCommandState(b.query)
          } catch {
            next[b.cmd] = false
          }
        }
      }
      setStates(next)
    }
    document.addEventListener('selectionchange', sync)
    sync()
    return () => document.removeEventListener('selectionchange', sync)
  }, [])

  const emit = (md: string): void => {
    lastMdRef.current = md
    onChange(md)
  }

  const handleInput = (): void => {
    if (applyingRef.current) return
    if (!ref.current) return
    editingRef.current = true
    try {
      const md = turndown.turndown(ref.current.innerHTML)
      if (md === lastMdRef.current) return
      undoStack.current.push(lastMdRef.current)
      redoStack.current = []
      emit(md)
    } catch {
      // 转换失败保留原内容
    }
  }

  // 程序性恢复历史：直接重写 DOM，跳过 undo 栈
  const applyMd = (md: string): void => {
    applyingRef.current = true
    editingRef.current = false
    lastMdRef.current = md
    const nextHtml = markdownToHtml(md)
    if (ref.current) ref.current.innerHTML = nextHtml
    appliedHtmlRef.current = nextHtml
    onChange(md)
    setTimeout(() => (applyingRef.current = false), 0)
  }

  const undo = (): void => {
    if (!undoStack.current.length) return
    redoStack.current.push(lastMdRef.current)
    applyMd(undoStack.current.pop()!)
  }

  const redo = (): void => {
    if (!redoStack.current.length) return
    undoStack.current.push(lastMdRef.current)
    applyMd(redoStack.current.pop()!)
  }

  // 保持选区（工具栏按钮 mousedown 会让 contentEditable 失焦）
  const keepSelection = (): void => {
    const sel = window.getSelection()
    if (sel && sel.rangeCount > 0) {
      savedRange.current = sel.getRangeAt(0).cloneRange()
    }
  }

  const restoreSelection = (): void => {
    const sel = window.getSelection()
    if (!sel || !savedRange.current) return
    sel.removeAllRanges()
    sel.addRange(savedRange.current)
  }

  const runTool = (btn: ToolBtn): void => {
    keepSelection()
    restoreSelection()
    switch (btn.cmd) {
      case 'inlineCode': {
        const sel = window.getSelection()
        const text = sel && sel.rangeCount > 0 ? sel.toString() : ''
        document.execCommand('insertHTML', false, `<code>${text || '代码'}</code>`)
        break
      }
      case 'table':
        document.execCommand(
          'insertHTML',
          false,
          '<p><br></p><table><thead><tr><th>列 1</th><th>列 2</th></tr></thead><tbody><tr><td>内容</td><td>内容</td></tr></tbody></table><p><br></p>'
        )
        break
      case 'link':
        setLinkOpen(true)
        break
      case 'image':
        fileRef.current?.click()
        break
      case 'undo':
        undo()
        break
      case 'redo':
        redo()
        break
      default:
        document.execCommand(btn.cmd, false, btn.value ?? undefined)
    }
  }

  const applyLink = (): void => {
    const url = linkUrl.trim()
    if (!url) return
    restoreSelection()
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) {
      document.execCommand('insertHTML', false, `<a href="${url}">${url}</a>`)
    } else {
      document.execCommand('createLink', false, url)
    }
    setLinkOpen(false)
  }

  const insertImage = (file: File): void => {
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = String(reader.result ?? '')
      restoreSelection()
      document.execCommand(
        'insertHTML',
        false,
        `<p><img src="${dataUrl}" alt="${file.name}" style="max-width:100%" /><br></p>`
      )
    }
    reader.readAsDataURL(file)
  }

  const onKeyDown = (e: ReactKeyboardEvent): void => {
    const mod = e.ctrlKey || e.metaKey
    if (mod && e.key.toLowerCase() === 'z') {
      e.preventDefault()
      if (e.shiftKey) redo()
      else undo()
      return
    }
    if (mod && e.key.toLowerCase() === 'y') {
      e.preventDefault()
      redo()
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      // 无 shift 插入段落，带 shift 仅换行
      document.execCommand(e.shiftKey ? 'insertLineBreak' : 'insertParagraph')
    }
  }

  async function handleExport(): Promise<void> {
    if (!exportName) return
    try {
      const blob = await exportMarkdownToDocx(lastMdRef.current)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = exportName
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('[md-export]', err)
    }
  }

  return (
    <div className="wb-md-wysiwyg">
      <div className="md-toolbar">
        {TOOL_BTNS.map((b) => (
          <button
            key={b.cmd}
            type="button"
            className={`md-tool-btn${b.query && states[b.cmd] ? ' active' : ''}`}
            title={b.title}
            onMouseDown={(e) => {
              // 保持选区不丢失
              e.preventDefault()
            }}
            onClick={() => runTool(b)}
          >
            {b.icon === 'undo' ? (
              <IconUndo size={13} />
            ) : b.icon === 'redo' ? (
              <IconRedo size={13} />
            ) : b.icon === 'image' ? (
              <IconImage size={13} />
            ) : b.icon === 'link' ? (
              <IconLink size={13} />
            ) : (
              b.label
            )}
          </button>
        ))}
        <span className="md-tool-sep" />
        <button type="button" className="md-tool-btn export" title="导出为 Word (.docx)" onClick={handleExport}>
          <IconDownload size={13} />
          Word
        </button>
        {linkOpen && (
          <span className="md-link-pop" onMouseDown={(e) => e.preventDefault()}>
            <input
              autoFocus
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') applyLink()
                if (e.key === 'Escape') setLinkOpen(false)
              }}
              placeholder="https://…"
              spellCheck={false}
            />
            <button type="button" className="btn small primary" onClick={applyLink}>
              确定
            </button>
          </span>
        )}
      </div>
      <div
        ref={ref}
        className="wb-md-preview-full editable"
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        onKeyDown={onKeyDown}
        onFocus={() => (editingRef.current = true)}
        onBlur={() => {
          editingRef.current = false
          setLinkOpen(false)
        }}
      />
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) insertImage(f)
          e.target.value = ''
        }}
      />
    </div>
  )
}

/* ================= Markdown → Word (docx) 导出 ================= */

interface RunExtra {
  bold?: boolean
  italics?: boolean
  strike?: boolean
  font?: string
  color?: string
  underline?: { type?: 'single' }
}

function inlineRuns(tokens: Token[] | undefined, base: RunExtra = {}): TextRun[] {
  if (!tokens) return [new TextRun({ text: '', ...base })]
  return tokens.map((t) => {
    switch (t.type) {
      case 'strong':
        return new TextRun({ text: (t as { text: string }).text, bold: true, ...base })
      case 'em':
        return new TextRun({ text: (t as { text: string }).text, italics: true, ...base })
      case 'codespan':
        return new TextRun({ text: (t as { text: string }).text, font: 'Consolas', ...base })
      case 'link':
        return new TextRun({
          text: (t as { text: string }).text,
          underline: { type: 'single' },
          color: '0563C1',
          ...base
        })
      case 'del':
        return new TextRun({ text: (t as { text: string }).text, strike: true, ...base })
      case 'text':
        return new TextRun({ text: (t as { text: string }).text, ...base })
      default:
        return new TextRun({ text: t.raw, ...base })
    }
  })
}

function tokensToParagraphs(tokens: Token[]): Paragraph[] {
  const out: Paragraph[] = []
  for (const t of tokens) {
    switch (t.type) {
      case 'heading':
        out.push(
          new Paragraph({
            heading: (['Heading1', 'Heading2', 'Heading3'] as const)[(t as { depth: number }).depth - 1] ?? HeadingLevel.HEADING_3,
            children: inlineRuns((t as { tokens?: Token[] }).tokens)
          })
        )
        break
      case 'paragraph':
        out.push(new Paragraph({ children: inlineRuns((t as { tokens?: Token[] }).tokens), spacing: { after: 120 } }))
        break
      case 'code':
        out.push(
          new Paragraph({
            children: [
              new TextRun({ text: (t as { text: string }).text, font: 'Consolas', size: 20 })
            ],
            spacing: { before: 120, after: 120 },
            indent: { left: 240 }
          })
        )
        break
      case 'blockquote':
        out.push(
          new Paragraph({
            children: inlineRuns((t as { tokens?: Token[] }).tokens),
            indent: { left: 360 }
          })
        )
        break
      case 'list': {
        const list = t as { ordered: boolean; items: { tokens?: Token[] }[] }
        list.items.forEach((item, i) =>
          out.push(
            list.ordered
              ? new Paragraph({
                  children: [new TextRun({ text: `${i + 1}. ` }), ...inlineRuns(item.tokens)],
                  indent: { left: 240 }
                })
              : new Paragraph({
                  children: inlineRuns(item.tokens),
                  bullet: { level: 0 },
                  indent: { left: 240 }
                })
          )
        )
        break
      }
      case 'table': {
        const table = t as unknown as { header: { text: string }[]; rows: { text: string }[][] }
        out.push(
          new Paragraph({
            children: [new TextRun({ text: table.header.map((c) => c.text).join(' | '), bold: true })],
            spacing: { before: 120 }
          }),
          ...table.rows.map(
            (r) =>
              new Paragraph({
                children: [new TextRun({ text: r.map((c) => c.text).join(' | ') })]
              })
          )
        )
        break
      }
      case 'hr':
        out.push(new Paragraph({ children: [new TextRun({ text: '──────────────' })], spacing: { before: 200, after: 200 } }))
        break
      default:
        break
    }
  }
  return out
}

export async function exportMarkdownToDocx(md: string): Promise<Blob> {
  const tokens = marked.lexer(md)
  const doc = new Document({
    sections: [{ children: tokensToParagraphs(tokens) }]
  })
  return Packer.toBlob(doc)
}
