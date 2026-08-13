import type { JSX } from 'react'
import { IconClose } from './Icon'
import appBack from '../assets/app-back.png'

const SHORTCUTS: [string, string][] = [
  ['Ctrl+S', '保存当前文件'],
  ['Ctrl+B', '开关主侧栏'],
  ['Ctrl+J', '开关输出面板'],
  ['Ctrl+Shift+B', '开关副侧栏'],
  ['Ctrl+W', '关闭当前选项卡'],
  ['Ctrl+Tab', '切换选项卡'],
  ['Ctrl+Shift+P', '全局搜索'],
  ['Ctrl+= / Ctrl+-', '增大 / 减小编辑器字体']
]

const STACK: [string, string][] = [
  ['桌面框架', 'Electron 43'],
  ['构建工具', 'electron-vite 5 · Vite 7'],
  ['前端', 'React 19 · TypeScript'],
  ['数据存储', 'SQLite（node:sqlite）'],
  ['AI 引擎', 'Claude Code CLI + Anthropic API'],
  ['学术技能', 'ARS · academic-paper · deep-research 等']
]

// 关于页面（帮助 → 关于）
export default function AboutModal({ onClose }: { onClose: () => void }): JSX.Element {
  return (
    <div className="global-search-overlay" onMouseDown={onClose}>
      <div className="about-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="about-head">
          <img className="about-logo" src={appBack} alt="Open Academic Pipeline" />
          <div>
            <h2>Open Academic Pipeline</h2>
            <p className="about-version">版本 v{window.api.appVersion()}</p>
          </div>
          <button className="icon-btn" onClick={onClose} style={{ marginLeft: 'auto' }}>
            <IconClose size={16} />
          </button>
        </div>

        <p className="about-desc">
          开源的学术研究助手工作台：以项目为容器组织任务、会话、文件与知识库，
          将 Claude Code 与学术技能（ARS）整合为完整的研究管线——
          研究咨询 · 数据沙盒 · 准备写作 · 论文写作 · 论文审核 · 论文修改。
        </p>

        <div className="about-section">
          <h3>技术栈</h3>
          <div className="about-grid">
            {STACK.map(([k, v]) => (
              <div key={k} className="about-row">
                <span className="about-key">{k}</span>
                <span className="about-val">{v}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="about-section">
          <h3>常用快捷键</h3>
          <div className="about-grid">
            {SHORTCUTS.map(([k, v]) => (
              <div key={k} className="about-row">
                <kbd className="about-kbd">{k}</kbd>
                <span className="about-val">{v}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="about-foot">
          <span>
            Open Academic Pipeline · MIT + GPLv3 ·{' '}
            <a
              href="https://kawasakikusako.github.io/generalExp/oap/"
              target="_blank"
              rel="noreferrer"
              style={{ color: 'var(--accent)' }}
            >
              官方网站
            </a>
          </span>
          <span>Copyright © 2026 Kawasaki Kusako</span>
        </div>
      </div>
    </div>
  )
}
