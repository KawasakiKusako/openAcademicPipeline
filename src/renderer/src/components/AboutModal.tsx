import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import { IconClose, IconHelp } from './Icon'
import appBack from '../assets/app-back.png'
import { ABOUT_TEXT, LINKS } from '../lib/about-content'

// 关于页面（帮助 → 关于）：技术栈/快捷键等详细内容见 帮助 → 帮助文档
export default function AboutModal({ onClose }: { onClose: () => void }): JSX.Element {
  const [appVersion, setAppVersion] = useState('')
  useEffect(() => {
    window.api.appVersion().then(setAppVersion).catch(() => undefined)
  }, [])
  return (
    <div className="global-search-overlay" onMouseDown={onClose}>
      <div className="about-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="about-head">
          <img className="about-logo" src={appBack} alt="Open Academic Pipeline" />
          <div className="about-title-wrap">
            <h2>{ABOUT_TEXT.appName}</h2>
            <p className="about-slogan">{ABOUT_TEXT.slogan}</p>
            <p className="about-version">
              版本 <b>v{appVersion}</b>
            </p>
          </div>
          <button className="icon-btn" onClick={onClose} style={{ marginLeft: 'auto' }}>
            <IconClose size={16} />
          </button>
        </div>

        <p className="about-desc">{ABOUT_TEXT.description}</p>

        <div className="about-section">
          <h3>
            <IconHelp size={13} />
            帮助
          </h3>
          <div className="about-links">
            {LINKS.map((l) => (
              <a key={l.url} href={l.url} target="_blank" rel="noreferrer" className="about-link">
                {l.label}
              </a>
            ))}
          </div>
        </div>

        <div className="about-foot">
          <span>
            {ABOUT_TEXT.appName} · {ABOUT_TEXT.license}
          </span>
          <span>{ABOUT_TEXT.copyright}</span>
        </div>
      </div>
    </div>
  )
}
