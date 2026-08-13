import { useEffect } from 'react'
import type { CSSProperties, JSX } from 'react'

export interface ContextMenuItem {
  label: string
  action: () => void
  danger?: boolean
}

interface Props {
  x: number
  y: number
  items: ContextMenuItem[]
  onClose: () => void
}

// Global right-click menu (VSCode-style)
export default function ContextMenu({ x, y, items, onClose }: Props): JSX.Element {
  useEffect(() => {
    const onDown = (e: MouseEvent): void => {
      const target = e.target as HTMLElement
      if (!target.closest('.ctx-menu')) onClose()
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  // keep the menu inside the window
  const style: CSSProperties = {
    left: Math.min(x, window.innerWidth - 200),
    top: Math.min(y, window.innerHeight - items.length * 34 - 16)
  }

  return (
    <div className="ctx-menu" style={style}>
      {items.map((item) => (
        <button
          key={item.label}
          className={`ctx-item${item.danger ? ' danger' : ''}`}
          onClick={() => {
            onClose()
            item.action()
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}
