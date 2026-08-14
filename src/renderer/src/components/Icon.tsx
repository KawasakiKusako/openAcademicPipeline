import type { JSX } from 'react'

// Minimal inline SVG icon set (16px stroke icons, no external deps).
interface IconProps {
  size?: number
  className?: string
}

function base(size: number): Record<string, string | number> {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round',
    strokeLinejoin: 'round'
  }
}

export function IconProject(props: IconProps): JSX.Element {
  const { size = 16, className } = props
  return (
    <svg {...base(size)} className={className}>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  )
}

export function IconChat(props: IconProps): JSX.Element {
  const { size = 16, className } = props
  return (
    <svg {...base(size)} className={className}>
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  )
}

export function IconTask(props: IconProps): JSX.Element {
  const { size = 16, className } = props
  return (
    <svg {...base(size)} className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M8.5 12.5l2.3 2.3 4.8-5.2" />
    </svg>
  )
}

export function IconFile(props: IconProps): JSX.Element {
  const { size = 16, className } = props
  return (
    <svg {...base(size)} className={className}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
    </svg>
  )
}

export function IconLibrary(props: IconProps): JSX.Element {
  const { size = 16, className } = props
  return (
    <svg {...base(size)} className={className}>
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  )
}

export function IconPlus(props: IconProps): JSX.Element {
  const { size = 16, className } = props
  return (
    <svg {...base(size)} className={className}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

export function IconSearch(props: IconProps): JSX.Element {
  const { size = 16, className } = props
  return (
    <svg {...base(size)} className={className}>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </svg>
  )
}

export function IconBack(props: IconProps): JSX.Element {
  const { size = 16, className } = props
  return (
    <svg {...base(size)} className={className}>
      <path d="M19 12H5M12 19l-7-7 7-7" />
    </svg>
  )
}

export function IconEdit(props: IconProps): JSX.Element {
  const { size = 16, className } = props
  return (
    <svg {...base(size)} className={className}>
      <path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z" />
    </svg>
  )
}

export function IconTrash(props: IconProps): JSX.Element {
  const { size = 16, className } = props
  return (
    <svg {...base(size)} className={className}>
      <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    </svg>
  )
}

export function IconSend(props: IconProps): JSX.Element {
  const { size = 16, className } = props
  return (
    <svg {...base(size)} className={className}>
      <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
    </svg>
  )
}

export function IconStop(props: IconProps): JSX.Element {
  const { size = 16, className } = props
  return (
    <svg {...base(size)} className={className}>
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  )
}

export function IconClose(props: IconProps): JSX.Element {
  const { size = 16, className } = props
  return (
    <svg {...base(size)} className={className}>
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  )
}

export function IconFolder(props: IconProps): JSX.Element {
  const { size = 16, className } = props
  return (
    <svg {...base(size)} className={className}>
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  )
}

export function IconSettings(props: IconProps): JSX.Element {
  const { size = 16, className } = props
  return (
    <svg {...base(size)} className={className}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}

export function IconSun(props: IconProps): JSX.Element {
  const { size = 16, className } = props
  return (
    <svg {...base(size)} className={className}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  )
}

export function IconMoon(props: IconProps): JSX.Element {
  const { size = 16, className } = props
  return (
    <svg {...base(size)} className={className}>
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  )
}

export function IconBook(props: IconProps): JSX.Element {
  const { size = 16, className } = props
  return (
    <svg {...base(size)} className={className}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="4.5" />
      <path d="M12 3v4.5M12 16.5V21M3 12h4.5M16.5 12H21M5.6 5.6l3.2 3.2M15.2 15.2l3.2 3.2M18.4 5.6l-3.2 3.2M8.8 15.2l-3.2 3.2" />
    </svg>
  )
}

export function IconMore(props: IconProps): JSX.Element {
  const { size = 16, className } = props
  return (
    <svg {...base(size)} className={className}>
      <circle cx="5" cy="12" r="1.4" fill="currentColor" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" />
      <circle cx="19" cy="12" r="1.4" fill="currentColor" />
    </svg>
  )
}

export function IconChevronDown(props: IconProps): JSX.Element {
  const { size = 16, className } = props
  return (
    <svg {...base(size)} className={className}>
      <path d="M6 9l6 6 6-6" />
    </svg>
  )
}

export function IconMin(props: IconProps): JSX.Element {
  const { size = 16, className } = props
  return (
    <svg {...base(size)} className={className}>
      <path d="M5 12h14" />
    </svg>
  )
}

export function IconMax(props: IconProps): JSX.Element {
  const { size = 16, className } = props
  return (
    <svg {...base(size)} className={className}>
      <rect x="5" y="5" width="14" height="14" rx="1" />
    </svg>
  )
}

export function IconRefresh(props: IconProps): JSX.Element {
  const { size = 16, className } = props
  return (
    <svg {...base(size)} className={className}>
      <path d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6" />
    </svg>
  )
}

export function IconPanel(props: IconProps): JSX.Element {
  const { size = 16, className } = props
  return (
    <svg {...base(size)} className={className}>
      <rect x="3" y="3" width="18" height="12" rx="2" />
      <path d="M9 15v6M15 15v6M3 19h18" />
    </svg>
  )
}

export function IconPlay(props: IconProps): JSX.Element {
  const { size = 16, className } = props
  return (
    <svg {...base(size)} className={className}>
      <path d="M6 4l14 8-14 8z" />
    </svg>
  )
}

export function IconCopy(props: IconProps): JSX.Element {
  const { size = 16, className } = props
  return (
    <svg {...base(size)} className={className}>
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  )
}

export function IconEye(props: IconProps): JSX.Element {
  const { size = 16, className } = props
  return (
    <svg {...base(size)} className={className}>
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

export function IconSave(props: IconProps): JSX.Element {
  const { size = 16, className } = props
  return (
    <svg {...base(size)} className={className}>
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
      <path d="M17 21v-8H7v8M7 3v5h8" />
    </svg>
  )
}

export function IconDoc(props: IconProps): JSX.Element {
  const { size = 16, className } = props
  return (
    <svg {...base(size)} className={className}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6M9 13h6M9 17h6" />
    </svg>
  )
}

export function IconPalette(props: IconProps): JSX.Element {
  const { size = 16, className } = props
  return (
    <svg {...base(size)} className={className}>
      <path d="M12 22a10 10 0 1 1 10-10c0 2.2-1.8 3-3.5 3H16a2 2 0 0 0-1.5 3.3c.4.5.6 1 .3 1.7a1 1 0 0 1-.9.6z" />
      <circle cx="7.5" cy="11.5" r="1" fill="currentColor" />
      <circle cx="11" cy="7.5" r="1" fill="currentColor" />
      <circle cx="16" cy="8.5" r="1" fill="currentColor" />
    </svg>
  )
}

export function IconType(props: IconProps): JSX.Element {
  const { size = 16, className } = props
  return (
    <svg {...base(size)} className={className}>
      <path d="M4 7V5h16v2M9 19h6M12 5v14" />
    </svg>
  )
}

export function IconHelp(props: IconProps): JSX.Element {
  const { size = 16, className } = props
  return (
    <svg {...base(size)} className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 2.4-3 4M12 17.5h.01" />
    </svg>
  )
}

export function IconDownload(props: IconProps): JSX.Element {
  const { size = 16, className } = props
  return (
    <svg {...base(size)} className={className}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
    </svg>
  )
}

export function IconCheck(props: IconProps): JSX.Element {
  const { size = 16, className } = props
  return (
    <svg {...base(size)} className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M8.5 12.5l2.3 2.3 4.8-5.2" />
    </svg>
  )
}

export function IconWarning(props: IconProps): JSX.Element {
  const { size = 16, className } = props
  return (
    <svg {...base(size)} className={className}>
      <path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
      <path d="M12 9v4M12 17h.01" />
    </svg>
  )
}

export function IconImage(props: IconProps): JSX.Element {
  const { size = 16, className } = props
  return (
    <svg {...base(size)} className={className}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="M21 15l-5-5L5 21" />
    </svg>
  )
}

export function IconPresent(props: IconProps): JSX.Element {
  const { size = 16, className } = props
  return (
    <svg {...base(size)} className={className}>
      <rect x="2" y="4" width="20" height="13" rx="2" />
      <path d="M8 21l4-4 4 4M12 17v4" />
    </svg>
  )
}

export function IconUpload(props: IconProps): JSX.Element {
  const { size = 16, className } = props
  return (
    <svg {...base(size)} className={className}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />
    </svg>
  )
}

export function IconLink(props: IconProps): JSX.Element {
  const { size = 16, className } = props
  return (
    <svg {...base(size)} className={className}>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  )
}

export function IconUndo(props: IconProps): JSX.Element {
  const { size = 16, className } = props
  return (
    <svg {...base(size)} className={className}>
      <path d="M3 7v6h6" />
      <path d="M21 17a9 9 0 0 0-15-6.7L3 13" />
    </svg>
  )
}

export function IconRedo(props: IconProps): JSX.Element {
  const { size = 16, className } = props
  return (
    <svg {...base(size)} className={className}>
      <path d="M21 7v6h-6" />
      <path d="M3 17a9 9 0 0 1 15-6.7L21 13" />
    </svg>
  )
}

export function IconRocket(props: IconProps): JSX.Element {
  const { size = 16, className } = props
  return (
    <svg {...base(size)} className={className}>
      <path d="M4.5 16.5c-1.5 1.3-2 5-2 5s3.7-.5 5-2c.7-.8.7-2 0-2.8-.8-.7-2-.7-3 0z" />
      <path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
      <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
    </svg>
  )
}
