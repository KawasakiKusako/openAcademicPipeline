import { useEffect, useRef, useState } from 'react'
import type { FormEvent, JSX } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import {
  IconBack,
  IconCheck,
  IconClose,
  IconDownload,
  IconPackage,
  IconPlus,
  IconRefresh,
  IconSettings,
  IconTest,
  IconTrash,
  IconUpload
} from '../components/Icon'
import type { ApiProvider, AppSettings } from '@shared/types'

// API 设置（类 cc-switch）：多 Provider 配置管理 + 模板一键导入 + 本机 AI 工具检测
export default function ApiSettingsPage({ embedded }: { embedded?: boolean }): JSX.Element {
  const navigate = useNavigate()
  const [providers, setProviders] = useState<ApiProvider[]>([])
  const [templates, setTemplates] = useState<ApiProvider[]>([])
  const [activeId, setActiveId] = useState('')
  const [tools, setTools] = useState<{ found: Record<string, string | null> } | null>(null)
  const [editing, setEditing] = useState<ApiProvider | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  // 保底直连（旧式全局设置，无 Provider 时使用）
  const [fallback, setFallback] = useState<AppSettings | null>(null)
  const [fbKey, setFbKey] = useState('')
  const [fbClear, setFbClear] = useState(false)
  const [fbUrl, setFbUrl] = useState('')
  // 测速 / 导入导出
  const [testing, setTesting] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function load(): Promise<void> {
    try {
      const r = await api.apiProviders()
      setProviders(r.providers)
      setTemplates(r.templates)
      setActiveId(r.activeId)
      const s = await api.settings()
      setFallback(s)
      setFbUrl(s.baseUrl)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function detect(): Promise<void> {
    try {
      setTools(await api.detectTools())
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  useEffect(() => {
    load()
    detect()
  }, [])

  async function importTemplate(templateId: string): Promise<void> {
    setError(null)
    try {
      const r = await api.importApiProvider(templateId)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      await load()
      if (!r.already) {
        setEditing(providers.find((p) => p.id === templateId) ?? null)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function activate(id: string): Promise<void> {
    await api.activateApiProvider(id)
    setActiveId(id)
  }

  async function remove(id: string): Promise<void> {
    if (!window.confirm('删除该 API 配置？')) return
    await api.deleteApiProvider(id)
    await load()
  }

  // 保底直连保存（无 Provider 时的全局回退）
  async function saveFallback(e: FormEvent): Promise<void> {
    e.preventDefault()
    setError(null)
    try {
      const updated = await api.updateSettings({
        apiKey: fbKey.trim() || undefined,
        clearApiKey: fbClear || undefined,
        baseUrl: fbUrl.trim()
      })
      setFallback(updated)
      setFbKey('')
      setFbClear(false)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  // 从 cc-switch 导入配置
  async function importFromCcSwitch(): Promise<void> {
    setError(null)
    try {
      const r = await api.importCcSwitch()
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      setError(r.imported > 0 ? `✓ 已从 cc-switch 导入 ${r.imported} 个配置` : 'cc-switch 中没有可导入的配置')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  // 导出全部配置（JSON 下载）
  async function exportAll(): Promise<void> {
    try {
      const data = await api.exportApiProviders()
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'oap-api-providers.json'
      a.click()
      URL.revokeObjectURL(url)
      setError('✓ 已导出 API 配置')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  // 导入配置（JSON 文件）
  async function importFile(file: File): Promise<void> {
    try {
      const data = JSON.parse(await file.text()) as { providers?: ApiProvider[]; activeId?: string }
      if (!Array.isArray(data.providers)) throw new Error('文件格式不正确（缺少 providers）')
      const r = await api.importApiProviders({ providers: data.providers, activeId: data.activeId })
      setError(`✓ 已导入 ${r.imported} 个配置`)
      await load()
    } catch (err) {
      setError(`导入失败：${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // 测速
  async function testProvider(id: string): Promise<void> {
    setTesting(id)
    setError(null)
    try {
      const r = await api.testApiProvider(id)
      setTestResult(
        r.ok
          ? `✓ ${r.detail}（${(r.latencyMs / 1000).toFixed(1)}s）`
          : `✗ ${r.detail}（${(r.latencyMs / 1000).toFixed(1)}s）`
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setTesting(null)
    }
  }

  async function saveProvider(e: FormEvent): Promise<void> {
    e.preventDefault()
    if (!editing) return
    setError(null)
    try {
      await api.saveApiProvider({
        id: editing.id,
        name: editing.name,
        type: editing.type,
        baseUrl: editing.baseUrl,
        apiKey: editing.apiKey || undefined,
        model: editing.model,
        note: editing.note
      })
      setEditing(null)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const toolLabels: Record<string, string> = {
    claude: 'Claude Code',
    codex: 'Codex CLI',
    deepseek: 'DeepSeek Harness'
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
            <IconSettings size={18} />
          </span>
          API 设置
        </h2>
      </header>

      {error && <div className="error-box">{error}</div>}
      {saved && !error && <div className="success-box">配置已保存/导入</div>}

      {/* 本机 AI 工具检测 */}
      <section className="form-section">
        <h3>本机 AI 工具</h3>
        <div className="row gap wrap">
          {!tools ? (
            <span className="muted small">检测中…</span>
          ) : (
            Object.entries(toolLabels).map(([key, label]) => (
              <span key={key} className={`tool-chip${tools.found[key] ? ' on' : ''}`} title={tools.found[key] ?? undefined}>
                {tools.found[key] ? <IconCheck size={11} /> : <span className="tool-chip-x">✕</span>}
                {label}
                {tools.found[key] ? '' : '（未检测到）'}
              </span>
            ))
          )}
          <button className="btn small ghost" onClick={detect}>
            <IconRefresh size={12} />
            重新检测
          </button>
        </div>
        <span className="muted small">检测 PATH 与常见安装位置；这些工具的技能目录可用于 Skill 设置的一键部署</span>
      </section>

      {/* 模板一键导入 */}
      <section className="form-section">
        <h3>一键导入</h3>
        <div className="row gap wrap">
          {templates.map((t) => (
            <button key={t.id} className="btn small" onClick={() => importTemplate(t.id)}>
              <IconPlus size={12} />
              {t.name}
            </button>
          ))}
        </div>
        <span className="muted small">导入后自动激活，填写 API Key 即可使用（与 cc-switch 交互一致）</span>
        <div className="row gap wrap" style={{ marginTop: 8 }}>
          <button className="btn small ghost" onClick={importFromCcSwitch}>
            <IconPackage size={13} />
            从 cc-switch 导入
          </button>
          <button className="btn small ghost" onClick={exportAll}>
            <IconDownload size={13} />
            导出配置
          </button>
          <button className="btn small ghost" onClick={() => fileRef.current?.click()}>
            <IconUpload size={13} />
            导入配置
          </button>
          <span className="muted small">
            cc-switch 配置读取自 ~/.cc-switch/cc-switch.db；导出为 JSON 可迁移
          </span>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void importFile(f)
              e.target.value = ''
            }}
          />
        </div>
      </section>

      {/* 保底直连（无 Provider 时的全局回退） */}
      <section className="form-section">
        <h3>API 直连（保底）</h3>
        <span className="muted small">Provider 优先；未启用任何 Provider 时，API 引擎使用此全局直连配置</span>
        <form className="form" onSubmit={saveFallback} style={{ gap: 10 }}>
          <label className="field">
            <span className="field-label">API Key</span>
            <input
              type="password"
              value={fbKey}
              onChange={(e) => setFbKey(e.target.value)}
              placeholder={fallback?.apiKeyMasked ? `已保存 ${fallback.apiKeyMasked}，留空保持不变` : 'sk-…'}
              autoComplete="off"
            />
          </label>
          {fallback?.apiKeyMasked && (
            <label className="checkbox">
              <input type="checkbox" checked={fbClear} onChange={(e) => setFbClear(e.target.checked)} />
              清除已保存的 API Key
            </label>
          )}
          <label className="field">
            <span className="field-label">API Base URL</span>
            <input
              value={fbUrl}
              onChange={(e) => setFbUrl(e.target.value)}
              placeholder="https://api.anthropic.com"
            />
          </label>
          <button type="submit" className="btn primary small" style={{ alignSelf: 'flex-start' }}>
            保存保底直连
          </button>
        </form>
      </section>

      {/* Provider 列表 */}
      <section className="form-section">
        <h3>API 配置</h3>
        <div className="skill-list">
          {providers.map((p) => (
            <div key={p.id} className={`skill-item${p.id === activeId ? ' active' : ''}`}>
              <div className="skill-item-body">
                <span className="skill-item-name">
                  {p.name} {p.id === activeId && <span className="badge subtle">当前</span>}
                </span>
                <span className="skill-item-desc">
                  {p.type === 'openai' ? 'OpenAI 兼容' : 'Anthropic 原生'} · {p.baseUrl} · {p.model}
                  {p.note ? ` · ${p.note}` : ''}
                </span>
              </div>
              <div className="row gap">
                {p.id !== activeId && (
                  <button className="btn small ghost" onClick={() => activate(p.id)}>
                    启用
                  </button>
                )}
                <button
                  className="btn small ghost"
                  title="测速（最小请求）"
                  disabled={testing === p.id}
                  onClick={() => testProvider(p.id)}
                >
                  <IconTest size={12} />
                  {testing === p.id ? '测试中…' : '测速'}
                </button>
                <button className="btn small ghost" onClick={() => setEditing({ ...p })}>
                  编辑
                </button>
                <button className="icon-btn" title="删除" onClick={() => remove(p.id)}>
                  <IconTrash size={13} />
                </button>
              </div>
            </div>
          ))}
          {providers.length === 0 && <p className="muted small">暂无配置，从上方模板导入或手动新增</p>}
        </div>
        <button className="btn small" onClick={() => setEditing({ id: '', name: '', type: 'openai', baseUrl: '', apiKey: '', model: '', note: '' })}>
          <IconPlus size={12} />
          新增配置
        </button>
        {testResult && (
          <div className={testResult.startsWith('✓') ? 'success-box' : 'error-box'}>{testResult}</div>
        )}
      </section>

      {/* 编辑/新增表单 */}
      {editing && (
        <section className="form-section">
          <h3>{editing.id ? '编辑配置' : '新增配置'}</h3>
          <form className="form" onSubmit={saveProvider}>
            <label className="field">
              <span className="field-label">名称</span>
              <input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="如：DeepSeek" />
            </label>
            <label className="field">
              <span className="field-label">接口格式</span>
              <select
                value={editing.type}
                onChange={(e) => setEditing({ ...editing, type: e.target.value as 'anthropic' | 'openai' })}
              >
                <option value="openai">OpenAI 兼容（DeepSeek/Kimi/通义/智谱…）</option>
                <option value="anthropic">Anthropic 原生（Claude）</option>
              </select>
            </label>
            <label className="field">
              <span className="field-label">API 地址</span>
              <input
                value={editing.baseUrl}
                onChange={(e) => setEditing({ ...editing, baseUrl: e.target.value })}
                placeholder="https://api.deepseek.com/v1"
              />
            </label>
            <label className="field">
              <span className="field-label">API Key</span>
              <input
                type="password"
                value={editing.apiKey ?? ''}
                onChange={(e) => setEditing({ ...editing, apiKey: e.target.value })}
                placeholder="sk-…（留空保持不变）"
                autoComplete="off"
              />
            </label>
            <label className="field">
              <span className="field-label">默认模型</span>
              <input value={editing.model} onChange={(e) => setEditing({ ...editing, model: e.target.value })} placeholder="deepseek-chat" />
            </label>
            <label className="field">
              <span className="field-label">备注（可选）</span>
              <input value={editing.note ?? ''} onChange={(e) => setEditing({ ...editing, note: e.target.value })} />
            </label>
            <div className="row gap">
              <button type="submit" className="btn primary">保存</button>
              <button type="button" className="btn ghost" onClick={() => setEditing(null)}>
                <IconClose size={12} />
                取消
              </button>
            </div>
          </form>
        </section>
      )}
    </div>
  )
}
