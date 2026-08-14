import { useState } from 'react'
import type { JSX } from 'react'
import { useNavigate } from 'react-router-dom'
import { IconBack, IconBook, IconHelp } from '../components/Icon'
import { HELP_INTRO, HELP_SECTIONS } from '../lib/help-content'

// 帮助文档（帮助 → 帮助文档）：内容集中在 lib/help-content.ts
export default function HelpPage(): JSX.Element {
  const navigate = useNavigate()
  const [active, setActive] = useState(HELP_SECTIONS[0]?.id ?? '')

  return (
    <div className="page help-page">
      <header className="page-head">
        <button className="back-link btn ghost" onClick={() => navigate(-1)}>
          <IconBack size={14} />
          返回
        </button>
        <h2 style={{ marginTop: 6 }}>
          <span style={{ verticalAlign: -3, marginRight: 6 }}>
            <IconHelp size={18} />
          </span>
          {HELP_INTRO.title}
        </h2>
      </header>
      <p className="muted" style={{ marginTop: 0, marginBottom: 20 }}>
        {HELP_INTRO.subtitle}
      </p>

      <div className="help-layout">
        <nav className="help-nav">
          {HELP_SECTIONS.map((s) => (
            <button
              key={s.id}
              className={`help-nav-item${active === s.id ? ' active' : ''}`}
              onClick={() => setActive(s.id)}
            >
              {s.title}
            </button>
          ))}
        </nav>

        <div className="help-content">
          {HELP_SECTIONS.filter((s) => s.id === active).map((s) => (
            <section key={s.id} className="help-section">
              <h2>{s.title}</h2>
              {s.intro && <p className="muted">{s.intro}</p>}
              {s.blocks.map((b, i) => (
                <div key={i} className="help-block">
                  {b.heading && <h3>{b.heading}</h3>}
                  {b.paragraphs?.map((p, j) => <p key={j}>{p}</p>)}
                  {b.list && (
                    <ul>
                      {b.list.map((li, j) => (
                        <li key={j}>{li}</li>
                      ))}
                    </ul>
                  )}
                  {b.code && (
                    <pre>
                      <code>{b.code}</code>
                    </pre>
                  )}
                </div>
              ))}
            </section>
          ))}

          <div className="help-foot">
            <IconBook size={13} />
            <span className="muted small">有问题或建议？到 GitHub Issues 反馈</span>
          </div>
        </div>
      </div>
    </div>
  )
}
