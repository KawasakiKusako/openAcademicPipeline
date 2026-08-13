import { useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import type { JSX } from 'react'
import { api } from '../lib/api'
import { IconClose } from './Icon'

// 文献批量导入：粘贴 BibTeX / RIS (Zotero·EndNote) / JSON / 自由文本，
// 或选择文件导入（.bib/.ris/.json/.txt）。格式自动检测。
export default function LiteratureImportModal({
  projectId,
  onClose,
  onImported
}: {
  projectId?: string | null
  onClose: () => void
  onImported: () => void
}): JSX.Element {
  const [text, setText] = useState('')
  const [format, setFormat] = useState<'auto' | 'bibtex' | 'ris' | 'json' | 'text'>('auto')
  const [scope, setScope] = useState<'project' | 'global'>(projectId ? 'project' : 'global')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ inserted: number; skipped: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleImport(): Promise<void> {
    if (!text.trim() || busy) return
    setBusy(true)
    setError(null)
    try {
      const r = await api.importLiterature({
        text,
        format,
        projectId: scope === 'project' ? (projectId ?? null) : null
      })
      setResult(r)
      setText('')
      onImported()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  function handleFile(e: ChangeEvent<HTMLInputElement>): void {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (): void => setText(String(reader.result ?? ''))
    reader.readAsText(file)
    // 按扩展名猜测格式
    const ext = file.name.split('.').pop()?.toLowerCase()
    if (ext === 'bib') setFormat('bibtex')
    else if (ext === 'ris') setFormat('ris')
    else if (ext === 'json') setFormat('json')
    else setFormat('auto')
  }

  return (
    <div className="global-search-overlay" onMouseDown={onClose}>
      <div className="lit-modal wide" onMouseDown={(e) => e.stopPropagation()}>
        <div className="lit-modal-head">
          <h3>导入文献</h3>
          <button className="icon-btn" onClick={onClose}>
            <IconClose size={15} />
          </button>
        </div>

        <div className="row gap wrap" style={{ marginBottom: 10 }}>
          <label className="field" style={{ width: 160 }}>
            <span className="field-label">格式</span>
            <select value={format} onChange={(e) => setFormat(e.target.value as typeof format)}>
              <option value="auto">自动检测</option>
              <option value="bibtex">BibTeX (.bib)</option>
              <option value="ris">RIS · Zotero/EndNote (.ris)</option>
              <option value="json">JSON</option>
              <option value="text">自由文本（逐行引用）</option>
            </select>
          </label>
          {projectId && (
            <label className="field" style={{ width: 160 }}>
              <span className="field-label">归属</span>
              <select value={scope} onChange={(e) => setScope(e.target.value as 'project' | 'global')}>
                <option value="project">本项目</option>
                <option value="global">全局知识库</option>
              </select>
            </label>
          )}
          <button className="btn" onClick={() => fileRef.current?.click()}>
            选择文件导入…
          </button>
          <input ref={fileRef} type="file" accept=".bib,.ris,.json,.txt,.md" hidden onChange={handleFile} />
        </div>

        <textarea
          className="lit-import-textarea"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={`粘贴文献内容，支持：\n• BibTeX：@article{...}\n• RIS（Zotero/EndNote 导出）：TY  - JOUR...\n• JSON：[{title, authors, year, ...}]\n• 自由文本：每行一条引用`}
          rows={10}
          spellCheck={false}
        />

        {result && (
          <div className="success-box">
            导入完成：新增 {result.inserted} 条，跳过（重复/无效）{result.skipped} 条
          </div>
        )}
        {error && <div className="error-box">{error}</div>}

        <div className="form-actions">
          <button className="btn ghost" onClick={onClose}>
            关闭
          </button>
          <button className="btn primary" onClick={handleImport} disabled={busy || !text.trim()}>
            {busy ? '导入中…' : '导入'}
          </button>
        </div>
      </div>
    </div>
  )
}
