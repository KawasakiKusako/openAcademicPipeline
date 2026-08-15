#!/usr/bin/env node
// 一次性开发脚本：从微软 Fluent System Icons 官方仓库（MIT）拉取 regular SVG，
// 生成新的 src/renderer/src/components/Icon.tsx（fill 风格，零依赖内联）。
// 用法：node scripts/fetch-fluent-icons.mjs
// 全部成功才写文件；任一失败 → 退出码 1 并列出失败项（不部分覆盖）。

import { writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'src/renderer/src/components/Icon.tsx')
const BASE_URL = 'https://raw.githubusercontent.com/microsoft/fluentui-system-icons/main/assets'

// 组件名 → { dir: 仓库目录名, file: SVG 文件名 }
// 文件名默认按 `ic_fluent_<目录名 snake_case>_24_regular.svg` 推导，特殊尺寸显式指定。
const MAPPING = {
  IconProject: { dir: 'Grid' },
  IconChat: { dir: 'Chat' },
  IconTask: { dir: 'Task List Square LTR' },
  IconFile: { dir: 'Document' },
  IconLibrary: { dir: 'Book Open' },
  IconPlus: { dir: 'Add' },
  IconSearch: { dir: 'Search' },
  IconBack: { dir: 'Arrow Left' },
  IconEdit: { dir: 'Edit' },
  IconTrash: { dir: 'Delete' },
  IconSend: { dir: 'Send' },
  IconStop: { dir: 'Stop' },
  IconClose: { dir: 'Dismiss' },
  IconFolder: { dir: 'Folder' },
  IconSettings: { dir: 'Settings' },
  IconSun: { dir: 'Weather Sunny' },
  IconMoon: { dir: 'Weather Moon' },
  IconBook: { dir: 'Book Compass' },
  IconMore: { dir: 'More Horizontal' },
  IconChevronDown: { dir: 'Chevron Down' },
  IconMin: { dir: 'Subtract' },
  IconMax: { dir: 'Square' },
  IconRefresh: { dir: 'Arrow Sync' },
  IconPanel: { dir: 'Panel Bottom', file: 'ic_fluent_panel_bottom_20_regular.svg' },
  IconPlay: { dir: 'Play' },
  IconCopy: { dir: 'Copy' },
  IconEye: { dir: 'Eye' },
  IconSave: { dir: 'Save' },
  IconDoc: { dir: 'Document Text' },
  IconPalette: { dir: 'Color' },
  IconType: { dir: 'Text', file: 'ic_fluent_text_16_regular.svg' },
  IconHelp: { dir: 'Question Circle' },
  IconDownload: { dir: 'Arrow Download' },
  IconCheck: { dir: 'Checkmark Circle' },
  IconWarning: { dir: 'Warning' },
  IconPlug: { dir: 'Plug Connected' },
  IconSkill: { dir: 'Flash' },
  IconBug: { dir: 'Bug' },
  IconFilter: { dir: 'Filter' },
  IconPackage: { dir: 'Box' },
  IconTest: { dir: 'Pulse' },
  IconStar: { dir: 'Star' },
  IconFolderOpen: { dir: 'Folder Open' },
  IconExpand: { dir: 'Arrow Expand All' },
  IconImage: { dir: 'Image' },
  IconPresent: { dir: 'Presenter' },
  IconUpload: { dir: 'Arrow Upload' },
  IconLink: { dir: 'Link' },
  IconUndo: { dir: 'Arrow Undo' },
  IconRedo: { dir: 'Arrow Redo' },
  IconRocket: { dir: 'Rocket' }
}

function defaultFile(dir) {
  return `ic_fluent_${dir.toLowerCase().replace(/ /g, '_')}_24_regular.svg`
}

function normalizeInner(inner) {
  // 官方默认前景色 → currentColor；其余（fill=none 等）保留
  return inner
    .replace(/fill="#212121"/g, 'fill="currentColor"')
    .replace(/fill="black"/g, 'fill="currentColor"')
    .replace(/fill="#000000"/g, 'fill="currentColor"')
    .trim()
}

async function fetchIcon(entry) {
  const file = entry.file ?? defaultFile(entry.dir)
  const url = `${BASE_URL}/${encodeURIComponent(entry.dir)}/SVG/${file}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`)
  const svg = await res.text()
  const m = svg.match(/<svg([^>]*)>([\s\S]*?)<\/svg>/)
  if (!m) throw new Error(`unexpected svg structure: ${url}`)
  const viewBox = m[1].match(/viewBox="([^"]+)"/)?.[1] ?? '0 0 24 24'
  return { inner: normalizeInner(m[2]), viewBox }
}

const results = {}
const failures = []
for (const [comp, entry] of Object.entries(MAPPING)) {
  try {
    results[comp] = await fetchIcon(entry)
    console.log(`OK   ${comp} → ${entry.dir} (${results[comp].viewBox})`)
  } catch (err) {
    failures.push(`${comp} (${entry.dir}): ${err.message}`)
    console.error(`FAIL ${comp} (${entry.dir})`)
  }
  // 温和限速，避免被 GitHub 节流
  await new Promise((r) => setTimeout(r, 150))
}

if (failures.length > 0) {
  console.error(`\n${failures.length} 项失败，Icon.tsx 未修改：\n` + failures.join('\n'))
  process.exit(1)
}

const header = `import type { JSX } from 'react'

// Inline SVG icon set — Microsoft Fluent System Icons (MIT), regular fill style.
// 生成方式：node scripts/fetch-fluent-icons.mjs（官方仓库 fluentui-system-icons）
// 重新生成会整体覆盖本文件，勿手工改动单个 path。
interface IconProps {
  size?: number
  className?: string
}

function base(size: number, viewBox: string): Record<string, string | number> {
  return {
    width: size,
    height: size,
    viewBox,
    fill: 'currentColor'
  }
}
`

const components = Object.entries(MAPPING)
  .map(([comp, entry]) => {
    const { inner, viewBox } = results[comp]
    const indented = inner
      .split('\n')
      .map((l) => (l.trim() ? `      ${l}` : ''))
      .join('\n')
    return `// Fluent: ${entry.dir} regular
export function ${comp}(props: IconProps): JSX.Element {
  const { size = 16, className } = props
  return (
    <svg {...base(size, '${viewBox}')} className={className}>
${indented}
    </svg>
  )
}
`
  })
  .join('\n')

writeFileSync(OUT, header + '\n' + components, 'utf-8')
console.log(`\n已写入 ${OUT}（${Object.keys(MAPPING).length} 个图标）`)
