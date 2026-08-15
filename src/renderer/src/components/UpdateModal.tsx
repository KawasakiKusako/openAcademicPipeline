import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import { api } from '../lib/api'
import {
  IconCheck,
  IconClose,
  IconDownload,
  IconRefresh,
  IconRocket,
  IconWarning
} from './Icon'
import appIcon from '../assets/app-icon.png'

interface UpdateInfo {
  current: string
  latest: string | null
  updateAvailable: boolean
  updateType: string
  updateLog: string[]
  downloadUrl: string | null
  incrementalUrl: string | null
  standbySite: string | null
  officialWebsite: string | null
  fallbackPages: string[]
}

interface Props {
  onClose: () => void
  // auto 模式（启动时自动检查）：无新版时静默关闭，不打扰用户
  auto?: boolean
}

type AutoState = { state: string; percent?: number; error?: string }

// 检查更新弹窗：检测中 / 发现新版（版本差异 + 更新日志 + 一键增量更新）/ 已是最新 / 失败
export default function UpdateModal({ onClose, auto }: Props): JSX.Element {
  const [checking, setChecking] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<UpdateInfo | null>(null)
  // electron-updater 自动更新状态（仅打包版）
  const [autoState, setAutoState] = useState<AutoState | null>(null)
  const [autoTried, setAutoTried] = useState(false)

  async function check(): Promise<void> {
    setChecking(true)
    setError(null)
    try {
      const u = await api.checkUpdate()
      setInfo(u)
      setChecking(false)
      if (auto && !u.updateAvailable) onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setChecking(false)
    }
  }

  useEffect(() => {
    check()
    window.api.onAutoUpdate((s) => {
      setAutoState(s as AutoState)
      // 可用即自动开始下载（增量优先）
      if (s.state === 'available') window.api.autoUpdateDownload().catch(() => undefined)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 一键更新：走 electron-updater 增量通道；失败则提示手动下载
  async function startAutoUpdate(): Promise<void> {
    setAutoTried(true)
    const r = await window.api.autoUpdateCheck()
    if (r.state === 'error') {
      setAutoState({ state: 'error', error: r.error ?? '自动更新不可用' })
    }
  }

  const isNewest = info && !info.updateAvailable

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
          {checking && (
            <div className="update-state">
              <div className="spinner" />
              <span className="muted">正在连接更新服务器…</span>
            </div>
          )}

          {error && (
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

          {/* 已是最新版本 */}
          {isNewest && info?.latest && (
            <div className="update-state">
              <span className="update-state-icon ok">
                <IconCheck size={24} />
              </span>
              <p>
                当前已是最新版本 <b>v{info.current}</b>
              </p>
              {info.officialWebsite && (
                <a className="muted small" href={info.officialWebsite} target="_blank" rel="noreferrer">
                  访问官网
                </a>
              )}
            </div>
          )}

          {/* 发现新版本：差异 + 更新日志 + 更新操作 */}
          {info?.updateAvailable && info.latest && (
            <div className="update-new">
              <span className="update-state-icon accent">
                <IconRocket size={24} />
              </span>
              <p className="update-title">
                发现新版本 <b>v{info.latest}</b>
              </p>
              <p className="muted small">
                当前版本 <b>v{info.current}</b> → 最新版本 <b>v{info.latest}</b>
                {info.updateType ? ` · 类型：${info.updateType}` : ''}
              </p>

              {/* 更新日志 */}
              {info.updateLog.length > 0 && (
                <div className="update-log">
                  <div className="update-log-title">更新内容</div>
                  <ul>
                    {info.updateLog.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* 自动更新状态（增量优先） */}
              {autoState && (
                <div className="update-auto">
                  {autoState.state === 'checking' && <span className="muted small">正在检查增量更新…</span>}
                  {autoState.state === 'downloading' && (
                    <div className="update-progress">
                      <div className="update-progress-bar" style={{ width: `${autoState.percent ?? 0}%` }} />
                      <span className="muted small">增量下载中 {autoState.percent ?? 0}%</span>
                    </div>
                  )}
                  {autoState.state === 'downloaded' && (
                    <span className="success-text">✓ 更新包已就绪</span>
                  )}
                  {autoState.state === 'error' && (
                    <span className="warn-text small">
                      {autoState.error ?? '自动更新失败'}（可改用下方手动下载）
                    </span>
                  )}
                </div>
              )}

              <div className="update-links">
                {(!autoState || autoState.state === 'error' || !autoState.state) && (
                  <button
                    className="btn primary"
                    onClick={startAutoUpdate}
                    disabled={autoTried && autoState?.state !== 'error'}
                  >
                    <IconDownload size={13} />
                    一键更新（增量）
                  </button>
                )}
                {autoState?.state === 'downloaded' && (
                  <button className="btn primary" onClick={() => window.api.autoUpdateInstall()}>
                    <IconRocket size={13} />
                    重启安装
                  </button>
                )}
                {info.downloadUrl && (
                  <a className="btn" href={info.downloadUrl} target="_blank" rel="noreferrer">
                    <IconDownload size={13} />
                    下载安装包
                  </a>
                )}
                {info.fallbackPages.map((url) => (
                  <a key={url} className="btn ghost small" href={url} target="_blank" rel="noreferrer">
                    备用页
                  </a>
                ))}
              </div>
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
