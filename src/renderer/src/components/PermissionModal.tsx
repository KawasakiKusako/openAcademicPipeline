import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import { IconWarning } from './Icon'

interface PermissionReq {
  requestId: string
  action: string
  command: string
  toolInput: string
}

// CLI 权限确认弹窗：AI 请求执行命令时弹出，允许/拒绝/总是允许
export default function PermissionModal(): JSX.Element | null {
  const [req, setReq] = useState<PermissionReq | null>(null)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    window.api.onCliPermissionRequest((r) => {
      setReq(r)
      setExpanded(false)
    })
  }, [])

  if (!req) return null

  const respond = (decision: 'allow' | 'deny', alwaysAllow = false): void => {
    window.api.cliPermissionRespond({ requestId: req.requestId, decision, alwaysAllow })
    setReq(null)
  }

  return (
    <div className="global-search-overlay" style={{ zIndex: 9999 }}>
      <div className="permission-modal">
        <div className="permission-head">
          <span className="permission-icon">
            <IconWarning size={18} />
          </span>
          <div>
            <h3>AI 请求执行命令</h3>
            <span className="muted small">Claude Code 需要你的授权才能继续</span>
          </div>
        </div>

        <div className="permission-body">
          <span className="permission-action">{req.action}</span>
          {req.command && (
            <pre className="permission-command">{req.command}</pre>
          )}
          {req.toolInput && (
            <>
              <button
                type="button"
                className="permission-toggle"
                onClick={() => setExpanded((v) => !v)}
              >
                {expanded ? '收起参数 ▴' : '查看参数 ▾'}
              </button>
              {expanded && <pre className="permission-input">{req.toolInput}</pre>}
            </>
          )}
        </div>

        <div className="permission-actions">
          <button className="btn ghost" onClick={() => respond('deny')}>
            拒绝
          </button>
          <button className="btn small ghost" onClick={() => respond('allow', true)} title="允许本次，并记住此命令不再询问">
            总是允许
          </button>
          <button className="btn primary" onClick={() => respond('allow')}>
            允许
          </button>
        </div>
        <div className="permission-foot">
          <span className="muted small">「总是允许」将把该命令加入项目沙盒的白名单 · 60 秒未处理将自动拒绝</span>
        </div>
      </div>
    </div>
  )
}
