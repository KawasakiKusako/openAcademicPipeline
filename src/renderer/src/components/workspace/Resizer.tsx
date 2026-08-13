import { useRef } from 'react'
import type { JSX, RefObject } from 'react'

interface Props {
  panelRef: RefObject<HTMLDivElement | null>
  onCommit: (width: number) => void
  reverse?: boolean // true when dragging the panel's left edge (aux panel)
}

// Vertical drag separator. During the drag the panel width is mutated directly
// on the DOM (no React re-render => perfectly responsive); the final width is
// committed to the store on mouse-up.
export default function Resizer({ panelRef, onCommit, reverse }: Props): JSX.Element {
  const lastX = useRef<number>(0)

  return (
    <div
      className="resizer"
      onMouseDown={(e) => {
        e.preventDefault()
        lastX.current = e.clientX
        document.body.style.cursor = 'col-resize'
        document.body.style.userSelect = 'none'
        const onMove = (ev: MouseEvent): void => {
          const dx = ev.clientX - lastX.current
          lastX.current = ev.clientX
          const el = panelRef.current
          if (el) {
            // reverse: dragging the panel's left edge left grows it (aux panel)
            el.style.width = `${Math.max(180, el.offsetWidth + (reverse ? -dx : dx))}px`
          }
        }
        const onUp = (): void => {
          const el = panelRef.current
          if (el) onCommit(el.offsetWidth)
          document.body.style.cursor = ''
          document.body.style.userSelect = ''
          document.removeEventListener('mousemove', onMove)
          document.removeEventListener('mouseup', onUp)
        }
        document.addEventListener('mousemove', onMove)
        document.addEventListener('mouseup', onUp)
      }}
    />
  )
}
