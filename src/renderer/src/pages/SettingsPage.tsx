import { useEffect, useRef, useState } from 'react'
import type { FormEvent, JSX } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { IconBack, IconRefresh } from '../components/Icon'
import type { EffortLevel, PythonEnv } from '@shared/types'

interface CcProvider {
  id: string
  name: string
  model: string
  baseUrl: string
  isCurrent: boolean
}

interface EnvInfo {
  conda: { available: boolean; envs: { name: string; path: string }[] }
  uv: { available: boolean }
  python: string | null
  pythons?: { version: string; path: string }[]
}

export default function SettingsPage({ embedded }: { embedded?: boolean }): JSX.Element {
  const navigate = useNavigate()
  const [ready, setReady] = useState(false)
  const [providers, setProviders] = useState<CcProvider[]>([])
  const [cliModel, setCliModel] = useState<string | null>(null)
  const [envs, setEnvs] = useState<EnvInfo | null>(null)
  const [defaultEngine, setDefaultEngine] = useState<'cli' | 'api'>('cli')
  const [model, setModel] = useState('')
  const [effort, setEffort] = useState<EffortLevel>('high')
  const [pythonEnv, setPythonEnv] = useState<PythonEnv>({ type: null, value: '' })
  const [condaPath, setCondaPath] = useState('')
  const [skillsPath, setSkillsPath] = useState('')
  const [saving, setSaving] = useState(false)
  const [cliTrusted, setCliTrusted] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [scanResult, setScanResult] = useState<string | null>(null)
  const [clearing, setClearing] = useState(false)
  const [clearResult, setClearResult] = useState<string | null>(null)

  async function loadProviders(): Promise<void> {
    setRefreshing(true)
    try {
      setProviders(await api.ccSwitchProviders())
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setRefreshing(false)
    }
  }

  useEffect(() => {
    api
      .settings()
      .then((s) => {
        setDefaultEngine(s.defaultEngine)
        setModel(s.model)
        setEffort(s.effort)
        setCliTrusted(Boolean(s.cliTrustedMode))
        setPythonEnv(s.pythonEnv)
        setCondaPath(s.pythonEnv.condaPath ?? '')
        setSkillsPath(s.skillsPath)
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
    loadProviders()
    api.claudeStatus().then((s) => setCliModel(s.model)).catch(() => undefined)
    api.envs().then(setEnvs).catch(() => undefined)
    // 全部基础数据就绪后显示界面（避免打开时卡顿感）
    const timer = setTimeout(() => setReady(true), 350)
    return () => clearTimeout(timer)
  }, [])

  // 即时保存单个设置项（模型/环境/强度/主题等，无需点保存按钮）。
  // 串行化：快速连续切换时按顺序落库，避免并发乱序导致环境来回跳变。
  const saveChain = useRef<Promise<void>>(Promise.resolve())

  // 运行环境切换后需要重启才生效
  function promptRestartIfEnvChanged(patch: Record<string, unknown>): void {
    if (!('pythonEnv' in patch)) return
    if (window.confirm('运行环境已切换，需要重启 OAP 才能生效。是否立即重启？')) {
      window.api.relaunchApp()
    }
  }

  function quickSave(patch: Parameters<typeof api.updateSettings>[0]): Promise<void> {
    const task = saveChain.current.then(async () => {
      try {
        await api.updateSettings(patch)
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
        promptRestartIfEnvChanged(patch as Record<string, unknown>)
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      }
    })
    saveChain.current = task
    return task
  }

  async function handleTest(): Promise<void> {
    setTesting(true)
    setTestResult(null)
    try {
      const r = await api.claudeTest()
      setTestResult(
        r.ok
          ? `✓ 链接正常（${(r.latencyMs / 1000).toFixed(1)}s）：${r.detail}`
          : `✗ 测试失败（${(r.latencyMs / 1000).toFixed(1)}s）：${r.detail}`
      )
    } catch (err) {
      setTestResult(`✗ ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setTesting(false)
    }
  }

  async function handleSubmit(e: FormEvent): Promise<void> {
    e.preventDefault()
    setSaving(true)
    setSaved(false)
    setError(null)
    try {
      await api.updateSettings({
        defaultEngine,
        model: model.trim(),
        effort,
        pythonEnv: { ...pythonEnv, condaPath: condaPath.trim() || undefined },
        skillsPath
      })
      setSaved(true)
      promptRestartIfEnvChanged({
        pythonEnv: { ...pythonEnv, condaPath: condaPath.trim() || undefined }
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  if (!ready) {
    return (
      <div className="page settings-page settings-loading">
        <div className="spinner" />
        <span className="muted">正在加载设置…</span>
      </div>
    )
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
        <h2 style={{ marginTop: embedded ? 0 : 6 }}>系统设置</h2>
      </header>

      <form className="form" onSubmit={handleSubmit}>
        {/* ① 引擎与模型 */}
        <section className="form-section">
          <h3>引擎与模型</h3>
          <label className="field">
            <span className="field-label">默认引擎</span>
            <select value={defaultEngine} onChange={(e) => setDefaultEngine(e.target.value as 'cli' | 'api')}>
              <option value="cli">Claude Code (CLI) — 运行于项目沙盒</option>
              <option value="api">API 直连 — 保底方案</option>
            </select>
          </label>
          <div className="row gap wrap">
            <label className="field grow">
              <span className="field-label">模型（留空跟随 cc-switch）</span>
              <select
                value={model}
                onChange={(e) => {
                  setModel(e.target.value)
                  quickSave({ model: e.target.value })
                }}
                style={{ width: '100%' }}
              >
                <option value="">
                  跟随 Claude Code CLI（当前：{cliModel ?? '未知'}）
                </option>
                {/* 按 provider 分组展示全部模型（与 claude /model 一致） */}
                {[...new Set(providers.map((p) => p.name))].map((groupName) => {
                  const group = providers.filter((p) => p.name === groupName)
                  return (
                    <optgroup key={groupName} label={groupName}>
                      {group.map((p) => (
                        <option key={p.id} value={p.model}>
                          {p.model}
                          {p.isCurrent ? ' · 当前' : ''}
                        </option>
                      ))}
                    </optgroup>
                  )
                })}
                {!providers.some((p) => p.model === 'claude-opus-5') && (
                  <optgroup label="Claude 官方">
                    <option value="claude-opus-5">claude-opus-5</option>
                    <option value="claude-sonnet-5">claude-sonnet-5</option>
                    <option value="claude-haiku-4-5-20251001">claude-haiku-4-5-20251001</option>
                  </optgroup>
                )}
              </select>
              <span className="muted small">
                刷新后显示全部 provider 模型；CLI 引擎与 API 直连均使用此选择
              </span>
            </label>
            <label className="field">
              <span className="field-label">思考强度</span>
              <select
                value={effort}
                onChange={(e) => {
                  setEffort(e.target.value as EffortLevel)
                  quickSave({ effort: e.target.value as EffortLevel })
                }}
              >
                <option value="low">低</option>
                <option value="medium">中</option>
                <option value="high">高</option>
                <option value="max">最大</option>
              </select>
            </label>
          </div>
          <div className="row gap wrap">
            <button type="button" className="btn small" onClick={handleTest} disabled={testing}>
              {testing ? '测试中…' : '测试 Claude Code 链接'}
            </button>
            <button type="button" className="btn small" onClick={loadProviders} disabled={refreshing}>
              <IconRefresh size={13} />
              {refreshing ? '刷新中…' : '刷新模型列表'}
            </button>
            <span className="muted small">
              cc-switch：{providers.map((p) => `${p.name}${p.isCurrent ? '（当前）' : ''}`).join('、') || '未检测到'}
            </span>
          </div>
          {testResult && <span className={`muted small ${testResult.startsWith('✓') ? '' : 'warn-text'}`}>{testResult}</span>}
        </section>

        {/* ② 沙盒环境 */}
        <section className="form-section">
          <h3>沙盒环境（数据沙盒 / 文件运行）</h3>
          <div className="row gap wrap">
            <label className="field">
              <span className="field-label">运行环境</span>
              <select
                value={pythonEnv.type === 'system' && pythonEnv.value ? `py:${pythonEnv.value}` : (pythonEnv.type ?? '')}
                onChange={(e) => {
                  const raw = e.target.value
                  let next: PythonEnv
                  if (raw.startsWith('py:')) {
                    next = { ...pythonEnv, type: 'system', value: raw.slice(3) }
                  } else {
                    const t = raw as PythonEnv['type'] | ''
                    next = {
                      ...pythonEnv,
                      type: t || null,
                      value: t === 'conda' ? (envs?.conda.envs[0]?.name ?? pythonEnv.value) : ''
                    }
                  }
                  setPythonEnv(next)
                  quickSave({ pythonEnv: next })
                }}
              >
                {envs?.pythons?.map((p) => (
                  <option key={p.path} value={`py:${p.path}`}>
                    {p.version.replace('V:', 'Python ')}（{p.path}）
                  </option>
                ))}
                <option value="">系统 Python{envs?.python ? `（${envs.python}）` : ''}</option>
                {envs?.conda.available && <option value="conda">conda</option>}
                {envs?.uv.available && <option value="uv">uv (.venv)</option>}
              </select>
            </label>
            {pythonEnv.type === 'conda' && (
              <label className="field grow">
                <span className="field-label">conda 环境</span>
                <select
                  value={pythonEnv.value}
                  onChange={(e) => {
                    const next = { ...pythonEnv, value: e.target.value }
                    setPythonEnv(next)
                    quickSave({ pythonEnv: next })
                  }}
                >
                  {envs?.conda.envs.map((env) => (
                    <option key={env.name} value={env.name}>
                      {env.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <label className="field">
            <span className="field-label">conda 可执行路径（未自动检测到时手动指定）</span>
            <div className="row gap">
              <input
                value={condaPath}
                onChange={(e) => setCondaPath(e.target.value)}
                placeholder="如 C:\Users\you\anaconda3\Scripts\conda.exe"
                style={{ flex: 1 }}
              />
              <button
                type="button"
                className="btn small"
                onClick={async () => {
                  const dir = await window.api.selectDirectory()
                  if (dir) setCondaPath(dir)
                }}
              >
                选择目录
              </button>
            </div>
            <span className="muted small">
              提示：选择 anaconda3/miniconda3 的根目录（如 C:\Users\you\anaconda3），保存后将自动在 Scripts 下查找 conda.exe
            </span>
            <span className="muted small">
              检测结果：conda {envs?.conda.available ? `可用（${envs.conda.envs.length} 环境）` : '未检测到'} · uv {envs?.uv.available ? '可用' : '未检测到'} · 系统 Python {envs?.python ?? '未检测到'}
              {envs?.pythons ? ` · 已安装版本：${envs.pythons.map((p) => p.version.replace('V:', '')).join(', ')}` : ''}
            </span>
            <div className="row gap wrap">
              <button
                type="button"
                className="btn small"
                onClick={async () => {
                  setError(null)
                  try {
                    setEnvs(await api.envs())
                  } catch (err) {
                    setError(err instanceof Error ? err.message : String(err))
                  }
                }}
              >
                <IconRefresh size={13} />
                重新检测
              </button>
              <button
                type="button"
                className="btn small"
                disabled={scanning}
                onClick={async () => {
                  setScanning(true)
                  setError(null)
                  try {
                    const r = await api.fullCondaScan()
                    if (r.found) {
                      const nextEnv: PythonEnv = {
                        type: r.envs.length > 0 ? 'conda' : 'system',
                        value: r.envs[0]?.name ?? '',
                        condaPath: r.found
                      }
                      setCondaPath(r.found)
                      setPythonEnv(nextEnv)
                      await quickSave({ pythonEnv: nextEnv })
                      setScanResult(`✓ 已找到 conda：${r.found}（${r.envs.length} 个环境），已自动启用`)
                    } else {
                      setScanResult('未找到 conda（已全盘搜索）')
                    }
                    setEnvs(await api.envs())
                  } catch (err) {
                    setError(err instanceof Error ? err.message : String(err))
                  } finally {
                    setScanning(false)
                  }
                }}
              >
                全盘搜索 conda{scanning ? '（搜索中…）' : ''}
              </button>
            </div>
            {scanResult && <span className="muted small">{scanResult}</span>}
          </label>
          <label className="checkbox" title="CLI 会话跳过所有权限确认（危险，仅在你完全信任沙盒内容时开启）">
            <input
              type="checkbox"
              checked={cliTrusted}
              onChange={(e) => {
                setCliTrusted(e.target.checked)
                quickSave({ cliTrustedMode: e.target.checked })
              }}
            />
            CLI 完全信任模式（跳过权限确认，危险）
          </label>
          <span className="muted small">
            默认模式已预置常用命令白名单（提取文本/读取文件/沙盒内操作）；完全信任模式跳过全部确认
          </span>
        </section>

        {/* ③ 自定义技能（已迁移到 Skill 设置） */}
        <section className="form-section">
          <h3>自定义技能</h3>
          <label className="field">
            <span className="field-label">技能目录</span>
            <input
              value={skillsPath}
              onChange={(e) => setSkillsPath(e.target.value)}
              placeholder={`默认：~/.claude/skills`}
            />
            <span className="muted small">
              技能管理（安装/市场/部署到 Agent）已移至 设置 → Skill 设置
            </span>
          </label>
        </section>

        {/* ③.5 缓存与存储 */}
        <section className="form-section">
          <h3>缓存与存储</h3>
          <div className="row gap wrap">
            <button
              type="button"
              className="btn small"
              disabled={clearing}
              onClick={async () => {
                setClearing(true)
                setClearResult(null)
                try {
                  const r = await api.clearCache()
                  setClearResult(
                    r.freedBytes > 0
                      ? `✓ 已清除缓存（释放 ${(r.freedBytes / 1024 / 1024).toFixed(1)} MB）`
                      : '✓ 已清除缓存'
                  )
                } catch (err) {
                  setError(err instanceof Error ? err.message : String(err))
                } finally {
                  setClearing(false)
                }
              }}
            >
              {clearing ? '清理中…' : '清除缓存'}
            </button>
            <span className="muted small">
              清除应用渲染缓存与 Office 转换缓存（_oap_preview），不影响项目数据与知识库
            </span>
          </div>
          {clearResult && <div className="success-box">{clearResult}</div>}
        </section>

        {error && <div className="error-box">{error}</div>}
        {saved && <div className="success-box">设置已保存</div>}

        <div className="form-actions">
          <button type="submit" className="btn primary" disabled={saving}>
            {saving ? '保存中…' : '保存设置'}
          </button>
        </div>
      </form>
    </div>
  )
}
