import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import { api } from '../lib/api'
import { IconCheck, IconClose, IconDownload, IconRefresh, IconWarning } from './Icon'
import appIcon from '../assets/app-icon.png'

interface UpdateInfo {
  current: string
  latest: string | null
  updateAvailable: boolean
  downloadPages: string[]
}

interface Props {
  onClose: () => void
  // auto 模式（启动时自动检查）：无新版时静默关闭，不打扰用户
  auto?: boolean
}

// 检查更新弹窗：检测中 / 发现新版（下载页）/ 已是最新 / 失败 四种状态
export default function UpdateModal({ onClose, auto }: Props): JSX.Element {
  const [state, setState] = useState<'checking' | 'done' | 'error'>('checking')
  const [info, setInfo] = useState<UpdateInfo | null>(null)

  async function check(): Promise<void> {
    setState('checking')
    try {
      const u = await api.checkUpdate()
      setInfo(u)
      setState('done')
      if (auto && !u.updateAvailable) onClose()
    } catch {
      setState('error')
    }
  }

  useEffect(() => {
    check()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="global-search-overlay" onMouseDown={onClose}>
      <div className="update-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="update-head">
          <img className="update-logo" src={appIcon} alt="" />
          <h3>检查更新</h3>
          <button className="icon-btn" onClick={onClose} style={{ marginLeft: 'auto' }}>
            <IconClose size={15} />
          </button>
        </div>

        <div className="update-body">
          {state === 'checking' && (
            <div className="update-state">
              <div className="spinner" />
              <span className="muted">正在连接更新服务器…</span>
            </div>
          )}

          {state === 'error' && (
            <div className="update-state">
              <span className="update-state-icon warn">
                <IconWarning size={26} />
              </span>
              <p>检查更新失败，请检查网络连接</p>
              <button className="btn small" onClick={check}>
                <IconRefresh size={13} />
                重试
              </button>
            </div>
          )}

          {state === 'done' && info && info.updateAvailable && info.latest && (
            <div className="update-new">
              <img className="update-state-logo" src={appIcon} alt="" />
              <p className="update-title">
                发现新版本 <b>v{info.latest}</b>
              </p>
              <p className="muted small">当前版本 v{info.current}，建议升级到最新版本体验新功能</p>
              <div className="update-links">
                {info.downloadPages.map((url) => (
                  <a key={url} href={url} target="_blank" rel="noreferrer" className="btn primary">
                    <IconDownload size={13} />
                    {url.includes('github.com') ? 'GitHub 下载' : '官方网站下载'}
                  </a>
                ))}
              </div>
            </div>
          )}

          {state === 'done' && info && !info.updateAvailable && (
            <div className="update-state">
              <span className="update-state-icon ok">
                <IconCheck size={24} />
              </span>
              <p>
                当前已是最新版本 <b>v{info.current}</b>
              </p>
            </div>
          )}
        </div>

        <div className="update-foot">
          <button className="btn small ghost" onClick={check}>
            <IconRefresh size={13} />
            重新检查
          </button>
          <span className="muted small">更新检查读取 kawasakikusako.github.io 的版本清单</span>
        </div>
      </div>
    </div>
  )
}
