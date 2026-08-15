import { useEffect, useRef, useState } from 'react'
import type { JSX } from 'react'
import { api } from '../../lib/api'
import { IconBook, IconHelp, IconPalette, IconPlus, IconType } from '../Icon'
import type { PersonalizationField } from '@shared/types'

// 分组 → 图标（美化用）
const GROUP_ICONS: Record<string, JSX.Element> = {
  外观: <IconPalette size={14} />,
  编辑器: <IconType size={14} />,
  用户信息: <IconHelp size={14} />,
  内容偏好: <IconBook size={14} />
}

function groupIcon(group: string): JSX.Element {
  return GROUP_ICONS[group] ?? <IconPlus size={14} />
}

interface Props {
  // 保存成功后回调（用于把 theme/accent/字体 等同步到 workspace store）
  onApplied?: (values: Record<string, unknown>) => void
}

// 通用个性化设置表单：按后端注册的 schema（字段/分组/类型/默认值）自动渲染。
// 新增设置只需在后端注册字段（或放入第三方 JSON 文件），无需改动此组件。
export default function PersonalizationForm({ onApplied }: Props): JSX.Element {
  const [fields, setFields] = useState<PersonalizationField[]>([])
  const [values, setValues] = useState<Record<string, unknown>>({})
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [reloading, setReloading] = useState(false)
  const saveChain = useRef<Promise<void>>(Promise.resolve())

  useEffect(() => {
    api
      .personalization()
      .then((r) => {
        setFields(r.fields)
        setValues(r.values)
        setReady(true)
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
  }, [])

  // 即时保存：串行化落库，快速连续操作按顺序执行，避免乱序覆盖
  function save(key: string, value: unknown): void {
    setValues((prev) => ({ ...prev, [key]: value }))
    saveChain.current = saveChain.current
      .then(() => api.updatePersonalization({ [key]: value }))
      .then((r) => {
        setValues(r.values)
        setSaved(true)
        setTimeout(() => setSaved(false), 1500)
        onApplied?.(r.values)
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
  }

  // 恢复全部默认值（含第三方字段）
  async function resetAll(): Promise<void> {
    const values: Record<string, unknown> = {}
    for (const f of fields) values[f.key] = f.defaultValue
    try {
      const r = await api.updatePersonalization(values)
      setValues(r.values)
      setNotice('已恢复全部默认设置')
      onApplied?.(r.values)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function reload(): Promise<void> {
    setReloading(true)
    setError(null)
    setNotice(null)
    try {
      const r = await api.reloadPersonalization()
      const fresh = await api.personalization()
      setFields(fresh.fields)
      setValues(fresh.values)
      setNotice(`已重载第三方字段（本次新增 ${r.count} 个）`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setReloading(false)
    }
  }

  const visible = (f: PersonalizationField): boolean =>
    !f.showWhen || values[f.showWhen.key] === f.showWhen.equals

  // 分组按首次出现顺序
  const groups: string[] = []
  for (const f of fields) {
    if (visible(f) && !groups.includes(f.group)) groups.push(f.group)
  }

  function tagsToText(f: PersonalizationField, v: unknown): string {
    const arr = Array.isArray(v) ? v.map(String) : []
    return f.tagsMode === 'line' ? arr.join('\n') : arr.join(', ')
  }

  function parseTags(f: PersonalizationField, text: string): string[] {
    const list = f.tagsMode === 'line' ? text.split(/\r?\n/) : text.split(/[,，\r\n]/)
    return list.map((s) => s.trim()).filter(Boolean)
  }

  function renderControl(f: PersonalizationField, v: unknown): JSX.Element {
    switch (f.type) {
      case 'image': {
        const src = String(v ?? '')
        return (
          <div className="personal-image">
            {src ? (
              <div className="personal-image-preview">
                <img src={src} alt={f.label} />
                <div className="row gap">
                  <button
                    type="button"
                    className="btn small ghost"
                    onClick={() => save(f.key, '')}
                  >
                    移除背景
                  </button>
                </div>
              </div>
            ) : (
              <span className="muted small">未设置</span>
            )}
            <label className="btn small">
              选择图片…
              <input
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (!file) return
                  const reader = new FileReader()
                  reader.onload = () => save(f.key, String(reader.result ?? ''))
                  reader.readAsDataURL(file)
                  e.target.value = ''
                }}
              />
            </label>
          </div>
        )
      }
      case 'select':
        return (
          <select value={String(v)} onChange={(e) => save(f.key, e.target.value)}>
            {(f.options ?? []).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        )
      case 'color': {
        const isClear = String(v ?? '') === ''
        return (
          <div className="row gap">
            <input
              type="color"
              value={isClear ? '#808080' : String(v)}
              onChange={(e) => save(f.key, e.target.value)}
              style={{
                width: 36,
                height: 30,
                padding: 0,
                border: '1px solid var(--border)',
                background: 'transparent',
                cursor: 'pointer'
              }}
            />
            <input
              value={isClear ? '' : String(v)}
              placeholder="跟随主题（#RRGGBB 或 #RRGGBBAA）"
              onChange={(e) => {
                const val = e.target.value
                if (val === '') save(f.key, '')
                else if (/^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(val)) save(f.key, val)
              }}
              style={{ width: 190 }}
            />
            {!isClear && (
              <button
                type="button"
                className="btn small ghost"
                title="清除自定义颜色（跟随主题）"
                onClick={() => save(f.key, '')}
              >
                清除
              </button>
            )}
          </div>
        )
      }
      case 'boolean':
        return (
          <label className="switch">
            <input type="checkbox" checked={!!v} onChange={(e) => save(f.key, e.target.checked)} />
            <span className="switch-track" />
          </label>
        )
      case 'number':
        // min/max 都定义时渲染为「滑块 + 数值」（如壁纸浓度/模糊半径/窗口不透明度）
        if (typeof f.min === 'number' && typeof f.max === 'number') {
          return (
            <div className="row gap personal-range">
              <input
                type="range"
                value={Number(v)}
                min={f.min}
                max={f.max}
                step={f.step ?? 1}
                onChange={(e) => save(f.key, Number(e.target.value))}
                style={{ width: 180 }}
              />
              <input
                type="number"
                value={Number(v)}
                min={f.min}
                max={f.max}
                step={f.step}
                onChange={(e) => save(f.key, e.target.value === '' ? f.defaultValue : Number(e.target.value))}
                style={{ width: 64 }}
              />
            </div>
          )
        }
        return (
          <input
            type="number"
            value={Number(v)}
            min={f.min}
            max={f.max}
            step={f.step}
            onChange={(e) => save(f.key, e.target.value === '' ? f.defaultValue : Number(e.target.value))}
          />
        )
      case 'tags':
        return f.tagsMode === 'line' ? (
          <textarea
            value={tagsToText(f, v)}
            rows={f.rows ?? 3}
            placeholder={f.placeholder}
            onBlur={(e) => save(f.key, parseTags(f, e.target.value))}
          />
        ) : (
          <input
            value={tagsToText(f, v)}
            placeholder={f.placeholder}
            onBlur={(e) => save(f.key, parseTags(f, e.target.value))}
          />
        )
      case 'textarea':
        return (
          <textarea
            value={String(v)}
            rows={f.rows ?? 3}
            placeholder={f.placeholder}
            onBlur={(e) => save(f.key, e.target.value)}
          />
        )
      default:
        // text
        return (
          <input
            value={String(v)}
            placeholder={f.placeholder}
            onChange={(e) => setValues((prev) => ({ ...prev, [f.key]: e.target.value }))}
            onBlur={(e) => save(f.key, e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') save(f.key, (e.target as HTMLInputElement).value)
            }}
          />
        )
    }
  }

  if (!ready) {
    return (
      <div className="settings-loading">
        <div className="spinner" />
        <span className="muted">正在加载个性化设置…</span>
      </div>
    )
  }

  return (
    <div className="personal-form">
      {groups.map((group) => (
        <section className="personal-card" key={group}>
          <h3 className="personal-card-title">
            {groupIcon(group)}
            {group}
          </h3>
          <div className="personal-card-body">
            {fields
              .filter((f) => f.group === group && visible(f))
              .map((f) => (
                <div className="personal-row" key={f.key}>
                  <div className="personal-row-label">
                    <span className="personal-row-name">{f.label}</span>
                    {f.description && <span className="personal-row-desc">{f.description}</span>}
                  </div>
                  <div className="personal-row-control">{renderControl(f, values[f.key] ?? f.defaultValue)}</div>
                </div>
              ))}
          </div>
        </section>
      ))}

      {error && <div className="error-box">{error}</div>}
      {notice && !error && <div className="success-box">{notice}</div>}
      {saved && !error && !notice && <div className="success-box">设置已保存</div>}

      <div className="form-actions">
        <button type="button" className="btn small ghost" onClick={resetAll} title="所有设置恢复默认值">
          恢复默认设置
        </button>
        <button type="button" className="btn small" onClick={reload} disabled={reloading}>
          {reloading ? '重载中…' : '重载第三方字段'}
        </button>
        <span className="muted small">个性化设置即时生效，无需手动保存</span>
      </div>
    </div>
  )
}
