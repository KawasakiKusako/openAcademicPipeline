import { useRef, useState } from 'react'
import type { JSX } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { applyPersonalization } from '../lib/personalize'
import PersonalizationForm from '../components/settings/PersonalizationForm'
import { IconBack, IconDownload, IconPalette, IconUpload } from '../components/Icon'

// 个性化设置页：外观 / 用户信息 / 编辑器 / 内容偏好 等个人偏好。
// 表单由后端注册的 schema 自动生成（内置 + 第三方 JSON 字段）。
export default function PersonalSettingsPage({ embedded }: { embedded?: boolean }): JSX.Element {
  const navigate = useNavigate()
  const fileRef = useRef<HTMLInputElement>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  function applyToStore(values: Record<string, unknown>): void {
    applyPersonalization(values)
  }

  // 导出全部个性化设置（JSON 下载）
  async function handleExport(): Promise<void> {
    try {
      const r = await api.personalization()
      const blob = new Blob([JSON.stringify(r.values, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'oap-personal-settings.json'
      a.click()
      URL.revokeObjectURL(url)
      setNotice('已导出个性化设置')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  // 导入个性化设置（JSON → 逐项校验落库）
  async function handleImport(file: File): Promise<void> {
    try {
      const values = JSON.parse(await file.text()) as Record<string, unknown>
      const r = await api.updatePersonalization(values)
      applyPersonalization(r.values)
      setNotice(`已导入 ${Object.keys(values).length} 项个性化设置`)
    } catch (err) {
      setError(`导入失败：${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return (
    <div className="page settings-page">
      <header className="page-head">
        {!embedded && (
          <button className="back-link btn ghost" onClick={() => navigate(-1)}>
            <IconBack size={14} />
            返回
          </button>
        )}
        <h2 style={{ marginTop: embedded ? 0 : 6 }}>
          <span style={{ verticalAlign: -3, marginRight: 6 }}>
            <IconPalette size={18} />
          </span>
          个性化设置
        </h2>
      </header>

      <p className="muted small" style={{ marginBottom: 16 }}>
        外观、编辑器与内容偏好——即时生效，无需手动保存。第三方插件可通过{' '}
        <code style={{ fontFamily: 'Consolas, monospace' }}>data/personalization/*.json</code>{' '}
        注册自己的设置项。
      </p>

      <PersonalizationForm onApplied={applyToStore} />

      <div className="form-section" style={{ marginTop: 16 }}>
        <h3>设置备份</h3>
        <div className="row gap wrap">
          <button type="button" className="btn small" onClick={handleExport}>
            <IconDownload size={13} />
            导出全部设置
          </button>
          <button type="button" className="btn small" onClick={() => fileRef.current?.click()}>
            <IconUpload size={13} />
            导入设置…
          </button>
          <span className="muted small">导出为 JSON，可迁移到另一台设备或在同事间共享</span>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void handleImport(f)
              e.target.value = ''
            }}
          />
        </div>
        {notice && !error && <div className="success-box">{notice}</div>}
        {error && <div className="error-box">{error}</div>}
      </div>
    </div>
  )
}
