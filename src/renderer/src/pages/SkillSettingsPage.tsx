import { useEffect, useMemo, useState } from 'react'
import type { JSX } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import {
  IconBack,
  IconDownload,
  IconPackage,
  IconRefresh,
  IconSearch,
  IconSkill,
  IconTrash
} from '../components/Icon'
import SkillMarketModal from '../components/settings/SkillMarketModal'

// Skill 设置：已安装技能管理 + 技能市场 + 一键部署到各 Agent + API 技能注入
export default function SkillSettingsPage({ embedded }: { embedded?: boolean }): JSX.Element {
  const navigate = useNavigate()
  const [path, setPath] = useState('')
  const [skills, setSkills] = useState<{ name: string; description: string }[]>([])
  const [enabled, setEnabled] = useState<string[]>([])
  const [tools, setTools] = useState<{
    found: Record<string, string | null>
    installed: Record<string, boolean>
    skillDirs: Record<string, string | null>
    agents: { id: string; label: string }[]
  } | null>(null)
  const [marketOpen, setMarketOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [query, setQuery] = useState('')
  // ARS 管理状态
  const [ars, setArs] = useState<Awaited<ReturnType<typeof api.arsStatus>> | null>(null)
  const [arsBusy, setArsBusy] = useState(false)
  // 部署菜单折叠（每个技能卡片）
  const [deployOpenFor, setDeployOpenFor] = useState<string | null>(null)

  // 可用 agent（已安装的）
  const availableAgents = useMemo(
    () => (tools?.agents ?? []).filter((a) => tools?.installed?.[a.id]),
    [tools]
  )

  // 搜索过滤
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return skills
    return skills.filter(
      (s) => s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q)
    )
  }, [skills, query])

  async function load(): Promise<void> {
    try {
      const [s, e, t, a] = await Promise.all([
        api.skills(),
        api.apiEnabledSkills(),
        api.detectTools().catch(() => null),
        api.arsStatus().catch(() => null)
      ])
      setPath(s.path)
      setSkills(s.skills)
      setEnabled(e.enabled)
      setTools(t)
      setArs(a)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  // ARS 管理操作
  async function arsAction(action: 'install' | 'update' | 'install-ppt'): Promise<void> {
    setArsBusy(true)
    setError(null)
    try {
      if (action === 'install') {
        await api.arsInstall()
      } else if (action === 'update') {
        const r = await api.arsUpdate()
        setError(r.updated ? `✓ ARS 已更新到 ${r.version}` : `✓ ${r.message ?? '已是最新'}`)
      } else {
        const r = await api.arsInstallPpt()
        setError(r.hasSkillMd ? `✓ PPT 生成技能已安装（${r.files} 个文件）` : `⚠ PPT 技能已下载但未找到 SKILL.md（${r.files} 文件）`)
      }
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setArsBusy(false)
    }
  }

  async function arsDeploy(target: string): Promise<void> {
    setArsBusy(true)
    setError(null)
    try {
      const r = await api.arsDeploy(target)
      setError(`✓ ARS 已部署到 ${target}（${r.dest}）`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setArsBusy(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function toggleApiSkill(name: string, on: boolean): Promise<void> {
    const next = on ? [...enabled, name] : enabled.filter((n) => n !== name)
    setEnabled(next)
    try {
      await api.setApiEnabledSkills(next)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function deploy(name: string, target: string): Promise<void> {
    setError(null)
    try {
      const r = await api.deploySkill({ name, target })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      setError(`✓ 已部署「${name}」到 ${target}（${r.dest}）`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function removeSkill(name: string): Promise<void> {
    if (!window.confirm(`删除技能「${name}」？`)) return
    await api.deleteSkill(name)
    await load()
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
            <IconSkill size={18} />
          </span>
          Skill 设置
        </h2>
      </header>

      {error && <div className="error-box">{error}</div>}
      {saved && !error && <div className="success-box">已保存</div>}

      <section className="form-section">
        <h3>技能目录</h3>
        <span className="muted small">{path}（SKILL.md 自动识别，任务可关联这些技能）</span>
      </section>

      {/* ARS 管理：OAP 内置学术技能 */}
      <section className="form-section">
        <h3>ARS 学术技能（内置）</h3>
        <div className="row gap wrap">
          <span className="muted small">
            {ars?.installed
              ? `已内置 v${ars.meta?.version ?? ''} · ${ars.meta?.skills.length ?? 0} 个技能 · 来源：${ars.meta?.source ?? ''}`
              : `未内置（${ars?.cacheFound ? '检测到本机插件缓存，可一键安装' : '未检测到插件缓存'}）`}
          </span>
        </div>
        <div className="row gap wrap" style={{ marginTop: 8 }}>
          {!ars?.installed && (
            <button className="btn small primary" disabled={arsBusy} onClick={() => arsAction('install')}>
              <IconDownload size={13} />
              {arsBusy ? '安装中…' : '安装 ARS'}
            </button>
          )}
          {ars?.installed && (
            <button className="btn small ghost" disabled={arsBusy} onClick={() => arsAction('update')}>
              <IconRefresh size={13} />
              检查更新
            </button>
          )}
          <button className="btn small ghost" disabled={arsBusy} onClick={() => arsAction('install-ppt')}>
            <IconPackage size={13} />
            PPT 生成技能（easyslides）
          </button>
          {/* 部署到已安装 agent */}
          {ars?.installed &&
            (tools?.agents ?? [])
              .filter((a) => tools?.installed?.[a.id])
              .map((a) => (
                <button key={a.id} className="btn small ghost" disabled={arsBusy} onClick={() => arsDeploy(a.id)}>
                  → 部署到 {a.label}
                </button>
              ))}
        </div>
        <span className="muted small">
          ARS 存储在应用数据目录（热插拔，任务注入实时读取）；可一键部署到已检测到的 Agent 技能目录
        </span>
      </section>

      {/* 已安装技能（搜索 + 网格） */}
      <section className="form-section">
        <h3>已安装技能（{filtered.length}/{skills.length}）</h3>
        <div className="sidebar-search" style={{ width: '100%', margin: 0 }}>
          <IconSearch size={14} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索技能名称或描述…"
            spellCheck={false}
          />
        </div>
        <div className="skill-grid">
          {filtered.map((s) => (
            <div key={s.name} className="skill-card skill-grid-card">
              <div className="skill-card-body">
                <span className="skill-card-name">{s.name}</span>
                {s.description && <span className="skill-card-desc">{s.description}</span>}
              </div>
              <div className="skill-grid-actions">
                {/* 部署：agent ≤2 直接显示，>2 折叠为菜单 */}
                {availableAgents.length <= 2 ? (
                  <div className="row gap">
                    {availableAgents.map((a) => (
                      <button
                        key={a.id}
                        className="btn small ghost"
                        title={`部署到 ${a.label}（${tools?.skillDirs?.[a.id] ?? ''}）`}
                        onClick={() => deploy(s.name, a.id)}
                      >
                        → {a.label}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="deploy-wrap">
                    <button
                      className="btn small ghost"
                      onClick={() => setDeployOpenFor(deployOpenFor === s.name ? null : s.name)}
                    >
                      部署 ▾
                    </button>
                    {deployOpenFor === s.name && (
                      <div className="deploy-menu">
                        {availableAgents.map((a) => (
                          <button
                            key={a.id}
                            onClick={() => {
                              deploy(s.name, a.id)
                              setDeployOpenFor(null)
                            }}
                          >
                            {a.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                <label className="checkbox" title="在 API 直连（非 CLI）时注入此技能指令">
                  <input
                    type="checkbox"
                    checked={enabled.includes(s.name)}
                    onChange={(e) => toggleApiSkill(s.name, e.target.checked)}
                  />
                  API 注入
                </label>
                <button className="icon-btn" title="删除" onClick={() => removeSkill(s.name)}>
                  <IconTrash size={13} />
                </button>
              </div>
            </div>
          ))}
          {skills.length === 0 && <p className="muted small">暂无已安装技能</p>}
          {skills.length > 0 && filtered.length === 0 && (
            <p className="muted small">无匹配「{query}」的技能</p>
          )}
        </div>
        <div className="row gap wrap" style={{ marginTop: 8 }}>
          <button className="btn small primary" onClick={() => setMarketOpen(true)}>
            <IconDownload size={13} />
            技能市场
          </button>
          <span className="muted small">
            市场技能来自 GitHub 公开仓库（skill.sh 生态）；「API 注入」让本地 API 直连也能调用技能
          </span>
        </div>
      </section>

      {marketOpen && (
        <SkillMarketModal onClose={() => setMarketOpen(false)} onInstalled={() => load()} />
      )}
    </div>
  )
}
