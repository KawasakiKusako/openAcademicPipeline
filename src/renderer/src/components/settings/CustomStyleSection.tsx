import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import { api } from '../../lib/api'
import { refreshCustomCss } from '../../lib/customStyle'
import { IconDownload, IconFolder, IconPackage, IconRefresh, IconSave, IconUndo } from '../Icon'

interface StyleStatus {
  enabled: boolean
  exists: boolean
  mtime: number
  cssPath: string
  backupDir: string
  exportDir: string
}

// 自定义样式区块（个性化设置页）：
// 启用开关 / CSS 编辑 / 打开文件 / 重新加载 / 恢复默认 / 备份默认样式 / 导出样式包(.tar)
export default function CustomStyleSection(): JSX.Element {
  const [status, setStatus] = useState<StyleStatus | null>(null)
  const [css, setCss] = useState('')
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.styleStatus().then(setStatus).catch(() => undefined)
    api.styleCss().then((r) => setCss(r.content)).catch(() => undefined)
  }, [])

  async function toggleEnabled(): Promise<void> {
    if (!status) return
    setBusy(true)
    try {
      const r = await api.setStyleEnabled(!status.enabled)
      setStatus({ ...status, enabled: r.enabled })
      await refreshCustomCss()
      setNotice(r.enabled ? '自定义样式已启用' : '自定义样式已停用')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function saveCss(): Promise<void> {
    setBusy(true)
    try {
      await api.saveStyleCss(css)
      setEditing(false)
      await refreshCustomCss()
      setNotice('已保存并重新加载')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function handleReset(): Promise<void> {
    if (!window.confirm('恢复默认？当前自定义样式内容将被清空。')) return
    setBusy(true)
    try {
      await api.resetStyle()
      const r = await api.styleCss()
      setCss(r.content)
      setEditing(false)
      await refreshCustomCss()
      setNotice('已恢复默认（自定义样式已清空）')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function handleBackup(): Promise<void> {
    setBusy(true)
    try {
      const r = await api.backupStyle()
      setNotice(`默认样式已备份：${r.path}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function handleExport(): Promise<void> {
    setBusy(true)
    try {
      const r = await api.exportStyle()
      setNotice(`样式包已导出：${r.path}`)
      if (status) void window.api.openPath(status.exportDir)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="form-section" style={{ marginTop: 16 }}>
      <h3>自定义样式</h3>
      <p className="muted small" style={{ marginBottom: 10 }}>
        在应用内置样式之上叠加你的 CSS（支持覆盖设计 token，如{' '}
        <code style={{ fontFamily: 'Consolas, monospace' }}>:root {'{'} --accent: #ff6b81 {'}'}</code>
        ）。保存后点击「重新加载」即时生效。完整说明见项目内 StyleHANDOFF.md。
      </p>

      <div className="row gap wrap">
        <button type="button" className={`btn small ${status?.enabled ? 'primary' : ''}`} onClick={() => void toggleEnabled()} disabled={busy || !status}>
          {status?.enabled ? '停用自定义样式' : '启用自定义样式'}
        </button>
        <button type="button" className="btn small" onClick={() => setEditing((v) => !v)} disabled={!status?.exists && !css}>
          {editing ? '收起编辑' : '编辑 CSS'}
        </button>
        <button type="button" className="btn small" onClick={() => void refreshCustomCss().then(() => setNotice('已重新加载'))} disabled={busy}>
          <IconRefresh size={13} />
          重新加载
        </button>
        <button type="button" className="btn small ghost" onClick={() => void handleReset()} disabled={busy}>
          <IconUndo size={13} />
          恢复默认
        </button>
        <button type="button" className="btn small ghost" onClick={() => void handleBackup()} disabled={busy}>
          <IconPackage size={13} />
          备份默认样式
        </button>
        <button type="button" className="btn small" onClick={() => void handleExport()} disabled={busy}>
          <IconDownload size={13} />
          导出样式包 (.tar)
        </button>
        {status?.cssPath && (
          <button type="button" className="btn small ghost" title={status.cssPath} onClick={() => void window.api.openPath(status.cssPath)}>
            <IconFolder size={13} />
            打开样式文件
          </button>
        )}
      </div>

      {editing && (
        <div style={{ marginTop: 10 }}>
          <textarea
            className="custom-style-editor"
            value={css}
            onChange={(e) => setCss(e.target.value)}
            rows={14}
            spellCheck={false}
            placeholder={`/* 例如 */\n:root {\n  --accent: #ff6b81;\n  --radius: 12px;\n}`}
            style={{
              width: '100%',
              fontFamily: 'Consolas, monospace',
              fontSize: 12,
              lineHeight: 1.6,
              background: 'var(--bg-input)',
              color: 'var(--fg)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              padding: 10,
              resize: 'vertical'
            }}
          />
          <div className="row gap" style={{ marginTop: 8 }}>
            <button type="button" className="btn small primary" onClick={() => void saveCss()} disabled={busy}>
              <IconSave size={13} />
              保存并生效
            </button>
            <button type="button" className="btn small ghost" onClick={() => setEditing(false)}>
              取消
            </button>
          </div>
        </div>
      )}

      {notice && !error && <div className="success-box">{notice}</div>}
      {error && <div className="error-box">{error}</div>}
    </div>
  )
}
