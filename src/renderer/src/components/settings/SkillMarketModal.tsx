import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import { api } from '../../lib/api'
import { IconClose, IconDownload, IconRefresh, IconSearch } from '../Icon'

interface MarketSkill {
  name: string
  description: string
  repo: string
  path: string
  files: string[]
}

const FEATURED_REPOS: { repo: string; label: string }[] = [
  { repo: 'anthropics/skills', label: 'Anthropic 官方' },
  { repo: 'secondsky/claude-skills', label: 'Claude Skills（139+ 技能）' },
  { repo: 'expo/skills', label: 'Expo 移动开发' },
  { repo: 'coreyhaines31/marketingskills', label: '营销技能包（23 个）' },
  { repo: 'jimliu/baoyu-skills', label: '宝玉技能包（PPT/图片）' }
]

// 技能市场：从 GitHub 仓库浏览并安装 SKILL.md 技能（skill.sh 生态）
export default function SkillMarketModal({
  onClose,
  onInstalled
}: {
  onClose: () => void
  onInstalled: () => void
}): JSX.Element {
  const [repo, setRepo] = useState(FEATURED_REPOS[0].repo)
  const [customRepo, setCustomRepo] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [skills, setSkills] = useState<MarketSkill[]>([])
  const [repoDesc, setRepoDesc] = useState('')
  const [installing, setInstalling] = useState<string | null>(null)

  async function load(repoName: string): Promise<void> {
    if (!repoName) return
    setLoading(true)
    setError(null)
    setSkills([])
    try {
      const r = await api.skillsMarket(repoName)
      setSkills(r.skills)
      setRepoDesc(r.repoDescription)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load(repo)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function install(s: MarketSkill): Promise<void> {
    setInstalling(s.name)
    setError(null)
    try {
      await api.installSkill({ repo: s.repo, path: s.path, name: s.name, branch: 'main' })
      onInstalled()
      setInstalling(null)
      setError(`✓ 已安装技能「${s.name}」`)
    } catch (err) {
      setInstalling(null)
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div className="global-search-overlay" onMouseDown={onClose}>
      <div className="skill-market" onMouseDown={(e) => e.stopPropagation()}>
        <div className="skill-market-head">
          <h3>技能市场</h3>
          <button className="icon-btn" onClick={onClose}>
            <IconClose size={15} />
          </button>
        </div>

        <div className="skill-market-toolbar">
          <select
            value={repo}
            onChange={(e) => {
              setRepo(e.target.value)
              setCustomRepo('')
              load(e.target.value)
            }}
            style={{ maxWidth: 260 }}
          >
            {FEATURED_REPOS.map((r) => (
              <option key={r.repo} value={r.repo}>
                {r.label}（{r.repo}）
              </option>
            ))}
          </select>
          <div className="row gap" style={{ flex: 1 }}>
            <input
              value={customRepo}
              onChange={(e) => setCustomRepo(e.target.value)}
              placeholder="或输入任意 owner/repo…"
              spellCheck={false}
              style={{ flex: 1 }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && customRepo.trim()) {
                  setRepo(customRepo.trim())
                  load(customRepo.trim())
                }
              }}
            />
            <button
              className="btn small"
              disabled={!customRepo.trim()}
              onClick={() => {
                setRepo(customRepo.trim())
                load(customRepo.trim())
              }}
            >
              <IconSearch size={13} />
              查询
            </button>
          </div>
          <button className="btn small ghost" onClick={() => load(repo)} disabled={loading}>
            <IconRefresh size={13} />
            刷新
          </button>
        </div>

        {repoDesc && <p className="muted small" style={{ margin: '8px 0 4px' }}>{repoDesc}</p>}
        {error && <div className="error-box" style={{ marginTop: 8 }}>{error}</div>}

        <div className="skill-market-list">
          {loading ? (
            <div className="skill-market-empty">
              <div className="spinner" />
              <span className="muted small">正在拉取技能列表…</span>
            </div>
          ) : skills.length === 0 && !error ? (
            <div className="skill-market-empty">
              <span className="muted small">该仓库没有 skills/ 目录下的技能</span>
            </div>
          ) : (
            skills.map((s) => (
              <div key={`${s.repo}/${s.path}`} className="skill-card">
                <div className="skill-card-body">
                  <span className="skill-card-name">{s.name}</span>
                  <span className="skill-card-desc">{s.description || '（无描述）'}</span>
                  <span className="muted small">
                    {s.repo} · {s.files.length} 个文件
                  </span>
                </div>
                <button
                  className="btn small primary"
                  disabled={installing === s.name}
                  onClick={() => install(s)}
                >
                  <IconDownload size={12} />
                  {installing === s.name ? '安装中…' : '安装'}
                </button>
              </div>
            ))
          )}
        </div>

        <div className="skill-market-foot">
          <span className="muted small">
            技能来自 GitHub 公开仓库的 skills/ 目录（skill.sh 生态），安装到自定义技能目录
          </span>
        </div>
      </div>
    </div>
  )
}
