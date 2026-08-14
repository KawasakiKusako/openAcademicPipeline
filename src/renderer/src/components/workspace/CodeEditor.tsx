import CodeMirror from '@uiw/react-codemirror'
import { languages } from '@codemirror/language-data'
import { EditorView } from '@codemirror/view'
import { useMemo, useState } from 'react'
import type { Extension } from '@codemirror/state'
import type { JSX } from 'react'
import { vscodeDark, vscodeLight } from '@uiw/codemirror-theme-vscode'
import { createTheme } from '@uiw/codemirror-themes'
import { tags as t } from '@lezer/highlight'
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

// 可选语法高亮配色（One Dark / Monokai 用 createTheme 声明）
const oneDarkTheme = createTheme({
  theme: 'dark',
  settings: {
    background: 'transparent',
    foreground: '#abb2bf',
    caret: '#528bff',
    selection: 'rgba(82,139,255,0.3)',
    lineHighlight: 'rgba(255,255,255,0.05)',
    gutterBackground: 'transparent',
    gutterForeground: '#636d83',
    gutterActiveForeground: '#abb2bf'
  },
  styles: [
    { tag: t.heading, color: '#e06c75', fontWeight: 'bold' },
    { tag: t.strong, color: '#e06c75', fontWeight: 'bold' },
    { tag: t.emphasis, color: '#c678dd', fontStyle: 'italic' },
    { tag: t.link, color: '#61afef', textDecoration: 'underline' },
    { tag: t.url, color: '#61afef' },
    { tag: t.keyword, color: '#c678dd' },
    { tag: t.atom, color: '#d19a66' },
    { tag: t.number, color: '#d19a66' },
    { tag: t.bool, color: '#d19a66' },
    { tag: t.string, color: '#98c379' },
    { tag: t.comment, color: '#5c6370', fontStyle: 'italic' },
    { tag: t.function(t.variableName), color: '#61afef' },
    { tag: t.propertyName, color: '#e06c75' },
    { tag: t.typeName, color: '#e5c07b' },
    { tag: t.className, color: '#e5c07b' },
    { tag: t.namespace, color: '#e5c07b' },
    { tag: t.operator, color: '#56b6c2' },
    { tag: t.punctuation, color: '#abb2bf' },
    { tag: t.invalid, color: '#ff0000' }
  ]
})

const monokaiTheme = createTheme({
  theme: 'dark',
  settings: {
    background: 'transparent',
    foreground: '#f8f8f2',
    caret: '#f8f8f0',
    selection: 'rgba(248,248,242,0.25)',
    lineHighlight: 'rgba(255,255,255,0.06)',
    gutterBackground: 'transparent',
    gutterForeground: '#75715e',
    gutterActiveForeground: '#f8f8f2'
  },
  styles: [
    { tag: t.heading, color: '#f92672', fontWeight: 'bold' },
    { tag: t.strong, color: '#f92672', fontWeight: 'bold' },
    { tag: t.emphasis, color: '#f92672', fontStyle: 'italic' },
    { tag: t.link, color: '#66d9ef', textDecoration: 'underline' },
    { tag: t.url, color: '#66d9ef' },
    { tag: t.keyword, color: '#f92672' },
    { tag: t.atom, color: '#ae81ff' },
    { tag: t.number, color: '#ae81ff' },
    { tag: t.bool, color: '#ae81ff' },
    { tag: t.string, color: '#e6db74' },
    { tag: t.comment, color: '#75715e', fontStyle: 'italic' },
    { tag: t.function(t.variableName), color: '#a6e22e' },
    { tag: t.propertyName, color: '#a6e22e' },
    { tag: t.typeName, color: '#66d9ef' },
    { tag: t.className, color: '#a6e22e' },
    { tag: t.namespace, color: '#66d9ef' },
    { tag: t.operator, color: '#f92672' },
    { tag: t.punctuation, color: '#f8f8f2' },
    { tag: t.invalid, color: '#f92672' }
  ]
})

interface Props {
  path: string
  value: string
  onChange: (value: string) => void
}

export default function CodeEditor({ path, value, onChange }: Props): JSX.Element {
  const { wordWrap, fontSize, editorFontFamily, editorLineHeight, editorTheme, theme } = useWorkspaceStore()
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
    const exts: Extension[] = [baseTheme]
    switch (editorTheme) {
      case 'vscode-dark':
        exts.push(vscodeDark)
        break
      case 'vscode-light':
        exts.push(vscodeLight)
        break
      case 'one-dark':
        exts.push(oneDarkTheme)
        break
      case 'monokai':
        exts.push(monokaiTheme)
        break
      default:
        exts.push(isDark ? darkTheme : lightTheme)
    }
    exts.push(
      EditorView.theme({
        '&': { fontSize: `${fontSize}px` },
        '.cm-scroller': { fontFamily: editorFontFamily, lineHeight: editorLineHeight }
      })
    )
    return exts
  }, [isDark, fontSize, editorFontFamily, editorLineHeight, editorTheme])

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
