import { useEffect, useState } from 'react'
import type { JSX } from 'react'

// 观众窗口（演讲者视图）：全屏显示当前幻灯片内容。
// 内容由主进程 IPC 推送（演讲者窗口翻页时同步）。
export default function AudiencePage(): JSX.Element {
  const [html, setHtml] = useState('')
  const [marker, setMarker] = useState('')

  useEffect(() => {
    window.api
      .audienceGetLast()
      .then((h) => {
        if (h) setHtml(h)
      })
      .catch(() => undefined)
    window.api.onAudienceRender((h) => setHtml(h))
    window.api.onAudienceMarker((svg) => setMarker(svg))
  }, [])

  return (
    <div className="audience-page">
      {html ? (
        <div className="audience-content">
          <div dangerouslySetInnerHTML={{ __html: html }} />
          {marker && (
            <div className="audience-marker-layer" dangerouslySetInnerHTML={{ __html: marker }} />
          )}
        </div>
      ) : (
        <div className="audience-idle">
          <p>等待演讲开始…</p>
        </div>
      )}
    </div>
  )
}
