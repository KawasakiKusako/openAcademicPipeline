import CodeMirror from '@uiw/react-codemirror'
import { languages } from '@codemirror/language-data'
import { EditorView } from '@codemirror/view'
import { useMemo, useState } from 'react'
import type { Extension } from '@codemirror/state'
import type { JSX } from 'react'
import { useWorkspaceStore } from '../../store/workspace'

// Language auto-detection: match by filename against the full language-data
// catalogue (python, markdown, json, js, ts, css, html, sql, …)
export function isTextFile(path: string): boolean {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  const binary = [
    'png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'pdf', 'zip', 'gz', 'tar',
    '7z', 'rar', 'exe', 'dll', 'so', 'dylib', 'bin', 'woff', 'woff2', 'ttf',
    'otf', 'mp3', 'mp4', 'avi', 'mov', 'db', 'sqlite', 'pickle', 'pkl', 'npy',
    'npz', 'h5', 'hdf5', 'xlsx', 'docx', 'pptx', 'pyc', 'parquet', 'feather'
  ]
  return !binary.includes(ext)
}

const baseTheme = EditorView.theme({
  '&': { height: '100%', backgroundColor: 'transparent' },
  '.cm-scroller': { fontFamily: "'Cascadia Code', Consolas, monospace", lineHeight: '1.7' },
  '.cm-content': { userSelect: 'text' },
  '&.cm-focused': { outline: 'none' }
})

const darkTheme = EditorView.theme(
  {
    '&': { color: '#d4d4d4', backgroundColor: 'transparent' },
    '.cm-gutters': { backgroundColor: 'transparent', color: '#6e7681', border: 'none' },
    '.cm-activeLine': { backgroundColor: 'rgba(255,255,255,0.04)' },
    '.cm-activeLineGutter': { backgroundColor: 'rgba(255,255,255,0.04)', color: '#e8e8e8' },
    '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
      backgroundColor: 'rgba(55,148,255,0.25)'
    }
  },
  { dark: true }
)

const lightTheme = EditorView.theme(
  {
    '&': { color: '#1f2328', backgroundColor: 'transparent' },
    '.cm-gutters': { backgroundColor: 'transparent', color: '#8b949e', border: 'none' },
    '.cm-activeLine': { backgroundColor: 'rgba(0,0,0,0.04)' },
    '.cm-activeLineGutter': { backgroundColor: 'rgba(0,0,0,0.04)', color: '#57606a' },
    '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
      backgroundColor: 'rgba(9,105,218,0.15)'
    }
  },
  { dark: false }
)

interface Props {
  path: string
  value: string
  onChange: (value: string) => void
}

export default function CodeEditor({ path, value, onChange }: Props): JSX.Element {
  const { wordWrap, fontSize, theme } = useWorkspaceStore()
  const [langExt, setLangExt] = useState<Extension | null>(null)

  // load the language extension for this file (async via language-data)
  useMemo(() => {
    let cancelled = false
    setLangExt(null)
    const desc =
      languages.find((l) => l.filename && l.filename.test(path)) ??
      languages.find((l) => l.name.toLowerCase() === 'python') ??
      null
    if (desc) {
      desc
        .load()
        .then((ext) => {
          if (!cancelled) setLangExt(ext)
        })
        .catch(() => undefined)
    }
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path])

  const isDark = theme === 'dark'

  const extensions = useMemo(() => {
    const exts: Extension[] = []
    if (wordWrap) exts.push(EditorView.lineWrapping)
    if (langExt) exts.push(langExt)
    return exts
  }, [wordWrap, langExt])

  const themeExt = useMemo(() => {
    const exts: Extension[] = [baseTheme, isDark ? darkTheme : lightTheme]
    exts.push(
      EditorView.theme({
        '&': { fontSize: `${fontSize}px` }
      })
    )
    return exts
  }, [isDark, fontSize])

  return (
    <CodeMirror
      value={value}
      onChange={onChange}
      theme={themeExt}
      extensions={extensions}
      basicSetup={{
        lineNumbers: true,
        foldGutter: true,
        highlightActiveLine: true,
        autocompletion: true,
        bracketMatching: true,
        indentOnInput: true
      }}
      height="100%"
      style={{ height: '100%', overflow: 'auto' }}
    />
  )
}
