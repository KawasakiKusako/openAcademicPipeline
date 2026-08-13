import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { api } from '../lib/api'
import { IconRefresh, IconPlus } from '../components/Icon'

interface RecItem {
  title: string
  link: string
  summary: string
  source: string
  published: string
}

// 推荐阅读：基于项目文献 + 知识库文献的关键词，推荐 arXiv 与自定义 RSS 内容
export default function RecommendationsPage(): JSX.Element {
  const { projectId } = useParams()
  const [searchParams] = useSearchParams()
  const pid = projectId ?? searchParams.get('projectId') ?? undefined
  const [data, setData] = useState<{ keywords: string[]; items: RecItem[] } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [importingId, setImportingId] = useState<string | null>(null)
  const [imported, setImported] = useState<string | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [recKeywords, setRecKeywords] = useState('')
  const [recCategories, setRecCategories] = useState('')
  const [rssFeeds, setRssFeeds] = useState('')

  const load = async (): Promise<void> => {
    setLoading(true)
    setError(null)
    try {
      setData(await api.recommendations(pid))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  // 推荐设置直接在本页编辑并即时生效
  useEffect(() => {
    api.settings().then((s) => {
      setRecKeywords((s.recKeywords ?? []).join(', '))
      setRecCategories((s.recCategories ?? []).join(', '))
      setRssFeeds((s.rssFeeds ?? []).join('\n'))
    }).catch(() => undefined)
  }, [])

  async function saveRecSettings(): Promise<void> {
    await api.updateSettings({
      recKeywords: recKeywords.split(/[,，\r\n]/).map((k) => k.trim()).filter(Boolean),
      recCategories: recCategories.split(/[,，\r\n]/).map((c) => c.trim()).filter(Boolean),
      rssFeeds: rssFeeds.split(/\r?\n/).map((f) => f.trim()).filter(Boolean)
    })
    setShowSettings(false)
    load()
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pid])

  // 一键导入文献库（结构化）或随记（摘要）
  async function importToLibrary(item: RecItem, mode: 'lit' | 'scratch'): Promise<void> {
    setImportingId(item.link)
    setImported(null)
    try {
      if (mode === 'lit') {
        await api.createLiterature({
          title: item.title,
          url: item.link,
          abstract: item.summary,
          notes: item.source === 'arxiv' ? 'arXiv 推荐导入' : 'RSS 推荐导入',
          projectId: pid ?? null
        })
      } else {
        await api.createScratch({
          content: `标题：${item.title}
链接：${item.link}
摘要：${item.summary}`,
          summary: item.title.slice(0, 60)
        })
      }
      setImported(`已导入：${item.title.slice(0, 40)}…`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setImportingId(null)
    }
  }

  return (
    <div className="page">
      <header className="page-head row">
        <div>
          <h2>推荐阅读</h2>
          <p className="muted">基于项目预设文献与知识库文献的关键词，推荐 arXiv 与 RSS 订阅内容。</p>
        </div>
        <div className="row gap">
          <button className="btn" onClick={() => setShowSettings((v) => !v)}>
            {showSettings ? '收起设置' : '推荐设置'}
          </button>
          <button className="btn" onClick={load} disabled={loading}>
            <IconRefresh size={14} />
            {loading ? '加载中…' : '刷新'}
          </button>
        </div>
      </header>

      {showSettings && (
        <div className="form-section" style={{ marginBottom: 18 }}>
          <h3 style={{ margin: '0 0 10px', fontSize: 13 }}>推荐设置</h3>
          <div className="row gap wrap">
            <label className="field grow">
              <span className="field-label">自定义关键词（逗号分隔）</span>
              <input value={recKeywords} onChange={(e) => setRecKeywords(e.target.value)} placeholder="remote sensing, vision transformer" />
            </label>
            <label className="field grow">
              <span className="field-label">arXiv 分类（如 cs.CV / cs.LG）</span>
              <input value={recCategories} onChange={(e) => setRecCategories(e.target.value)} placeholder="cs.CV, cs.LG" />
            </label>
          </div>
          <label className="field">
            <span className="field-label">RSS 订阅源（每行一个，支持 URL 或本地 .rss/.xml 文件路径）</span>
            <textarea value={rssFeeds} onChange={(e) => setRssFeeds(e.target.value)} rows={2} placeholder={'https://example.com/feed.xml\nD:/feeds/paper.rss'} />
          </label>
          <div className="form-actions">
            <button className="btn primary small" onClick={saveRecSettings}>
              保存并刷新
            </button>
          </div>
        </div>
      )}

      {error && <div className="error-box">{error}</div>}

      {data && data.keywords.length > 0 && (
        <div className="row gap wrap" style={{ marginBottom: 16 }}>
          <span className="muted small">关键词：</span>
          {data.keywords.map((k) => (
            <span key={k} className="badge subtle">
              {k}
            </span>
          ))}
        </div>
      )}
      {data && data.keywords.length === 0 && (
        <p className="muted" style={{ marginBottom: 16 }}>
          文献库为空，暂无关键词。先在知识库中添加文献，即可获得个性化推荐。
        </p>
      )}

      {data && data.items.length > 0 && (
        <RecTabs
          items={data.items}
          onImport={importToLibrary}
          importingId={importingId}
        />
      )}
      {imported && <div className="success-box">{imported}</div>}
      {!loading && data && data.items.length === 0 && (
        <p className="muted">暂无推荐内容（网络不可达或未配置 RSS 源）</p>
      )}
    </div>
  )
}

// 按源分组标签卡：arXiv / 各 RSS 源独立切换
function RecTabs({
  items,
  onImport,
  importingId
}: {
  items: RecItem[]
  onImport: (item: RecItem, mode: 'lit' | 'scratch') => void
  importingId: string | null
}): JSX.Element {
  // 分组：arXiv + 每个 RSS 源
  const sources = new Map<string, RecItem[]>()
  for (const item of items) {
    const list = sources.get(item.source) ?? []
    list.push(item)
    sources.set(item.source, list)
  }
  const sourceNames = [...sources.keys()]
  const [active, setActive] = useState(sourceNames[0] ?? '')

  const current = sources.get(active) ?? []

  return (
    <div>
      <div className="tabs" style={{ flexWrap: 'wrap' }}>
        {sourceNames.map((name) => {
          const label = name === 'arxiv' ? 'arXiv' : name.split('/').pop() ?? name
          return (
            <button
              key={name}
              className={name === active ? 'tab active' : 'tab'}
              onClick={() => setActive(name)}
            >
              {label}（{sources.get(name)?.length ?? 0}）
            </button>
          )
        })}
      </div>
      <div className="list">
        {current.map((item, i) => (
          <a
            key={`${item.link}-${i}`}
            className="list-item rec-item"
            href={item.link}
            target="_blank"
            rel="noreferrer"
            style={{ textDecoration: 'none', color: 'inherit' }}
          >
            <div className="list-item-main">
              <div className="list-item-title rec-title">{item.title}</div>
              {item.summary && <p className="muted small">{item.summary}</p>}
              {item.published && <span className="muted small">{item.published}</span>}
            </div>
            <div className="list-item-actions" onClick={(e) => e.preventDefault()}>
              <button
                className="btn small"
                title="导入文献库"
                disabled={importingId === item.link}
                onClick={() => onImport(item, 'lit')}
              >
                <IconPlus size={12} />
                文献库
              </button>
              <button
                className="btn small"
                title="导入随记"
                disabled={importingId === item.link}
                onClick={() => onImport(item, 'scratch')}
              >
                随记
              </button>
            </div>
          </a>
        ))}
      </div>
    </div>
  )
}
