import type { JSX } from 'react'

// 资源管理器文件类型图标：按扩展名返回带颜色的 VSCode 风格小图标

interface IconProps {
  size?: number
  className?: string
}

function base(size: number, color: string): Record<string, string | number> {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: color,
    strokeWidth: 1.8,
    strokeLinecap: 'round',
    strokeLinejoin: 'round'
  }
}

// 带字母的文档图标（Office 系列）
function LetterDoc({ letter, color, size }: { letter: string; color: string; size: number }): JSX.Element {
  return (
    <svg {...base(size, color)}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <text
        x="12"
        y="18"
        textAnchor="middle"
        fontSize="9"
        fontWeight="700"
        fill={color}
        stroke="none"
        fontFamily="Segoe UI, sans-serif"
      >
        {letter}
      </text>
    </svg>
  )
}

// 代码类：花括号
function BraceIcon({ color, size }: { color: string; size: number }): JSX.Element {
  return (
    <svg {...base(size, color)}>
      <path d="M8 3H7a2 2 0 0 0-2 2v4a2 2 0 0 1-2 2 2 2 0 0 1 2 2v4a2 2 0 0 0 2 2h1M16 3h1a2 2 0 0 1 2 2v4a2 2 0 0 0 2 2 2 2 0 0 0-2 2v4a2 2 0 0 1-2 2h-1" />
    </svg>
  )
}

// 图片类
function ImageIcon({ color, size }: { color: string; size: number }): JSX.Element {
  return (
    <svg {...base(size, color)}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="M21 15l-5-5L5 21" />
    </svg>
  )
}

// PDF
function PdfIcon({ size }: { size: number }): JSX.Element {
  return <LetterDoc letter="PDF" color="#f14c4c" size={size} />
}

// 数据/表格
function GridIcon({ color, size }: { color: string; size: number }): JSX.Element {
  return (
    <svg {...base(size, color)}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
    </svg>
  )
}

// 文本
function TextIcon({ color, size }: { color: string; size: number }): JSX.Element {
  return (
    <svg {...base(size, color)}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6M9 13h6M9 17h6" />
    </svg>
  )
}

const COLORS = {
  blue: '#4d9fff',
  green: '#3fb950',
  orange: '#d29922',
  purple: '#a371f7',
  red: '#f14c4c',
  cyan: '#39c5cf',
  gray: '#8b949e',
  pink: '#f778ba'
}

export function fileTypeOf(path: string): JSX.Element {
  return <FileTypeIcon path={path} size={14} />
}

export default function FileTypeIcon({ path, size = 14, className }: IconProps & { path: string }): JSX.Element {
  const name = path.split(/[\\/]/).pop() ?? path
  const ext = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1).toLowerCase() : ''

  const common = { size, className }

  // 图片
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico'].includes(ext)) {
    return <ImageIcon color={COLORS.green} {...common} />
  }
  if (ext === 'svg') return <ImageIcon color={COLORS.orange} {...common} />
  // Office
  if (['pptx', 'ppt'].includes(ext)) return <LetterDoc letter="P" color={COLORS.orange} {...common} />
  if (['docx', 'doc'].includes(ext)) return <LetterDoc letter="W" color={COLORS.blue} {...common} />
  if (['xlsx', 'xls', 'csv'].includes(ext)) return <GridIcon color={COLORS.green} {...common} />
  // 文档
  if (ext === 'pdf') return <PdfIcon {...common} />
  if (ext === 'md' || ext === 'markdown') return <TextIcon color={COLORS.purple} {...common} />
  if (['txt', 'text', 'rtf', 'log'].includes(ext)) return <TextIcon color={COLORS.gray} {...common} />
  // 代码
  if (['js', 'ts', 'jsx', 'tsx', 'json', 'css', 'scss', 'html', 'htm', 'vue', 'py', 'java', 'c', 'cpp', 'go', 'rs', 'sh'].includes(ext)) {
    return <BraceIcon color={COLORS.cyan} {...common} />
  }
  if (ext === 'py') return <BraceIcon color={COLORS.blue} {...common} />
  // 数据
  if (['db', 'sqlite', 'sql', 'parquet', 'feather', 'h5', 'npz', 'npy', 'pickle', 'pkl'].includes(ext)) {
    return <GridIcon color={COLORS.pink} {...common} />
  }
  // 媒体
  if (['mp4', 'webm', 'mov', 'avi', 'mkv', 'mp3', 'wav', 'ogg', 'flac'].includes(ext)) {
    return <ImageIcon color={COLORS.purple} {...common} />
  }
  // 默认文本/未知
  return <TextIcon color={COLORS.gray} {...common} />
}
