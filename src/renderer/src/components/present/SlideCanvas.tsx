import { useEffect, useRef, useState } from 'react'
import type { JSX } from 'react'
import type { SlideDetail } from '@shared/types'

// 按 PPT 版面渲染一页幻灯片：文本与图片按原始坐标/字号定位
export function SlideCanvas({ slide }: { slide: SlideDetail }): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = (): void => setWidth(el.clientWidth)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // PPT 16:9 画布 = 12192000 × 6858000 emu（1280 × 720 px @96dpi）
  const EMU = 9525
  const slideW = 12192000
  const slideH = 6858000
  const k = width > 0 ? width / (slideW / EMU) : 1 // 缩放系数（px）
  const toPx = (emu: number): number => (emu / EMU) * k

  return (
    <div
      ref={ref}
      className="slide-canvas"
      style={{ aspectRatio: `${slideW} / ${slideH}`, width: '100%' }}
    >
      {slide.images.map((img, i) => (
        <img
          key={`img-${i}`}
          src={img.src}
          alt=""
          style={{
            position: 'absolute',
            left: toPx(img.x),
            top: toPx(img.y),
            width: toPx(img.cx),
            height: toPx(img.cy),
            objectFit: 'contain'
          }}
        />
      ))}
      {slide.texts.map((t, i) => (
        <div
          key={`txt-${i}`}
          className="slide-canvas-text"
          style={{
            position: 'absolute',
            left: toPx(t.x),
            top: toPx(t.y),
            width: toPx(t.cx),
            fontSize: Math.max(t.size * (96 / 72) * k, 6),
            lineHeight: 1.35
          }}
        >
          {t.text}
        </div>
      ))}
    </div>
  )
}
