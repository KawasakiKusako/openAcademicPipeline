import CodeMirror from '@uiw/react-codemirror'
import { languages } from '@codemirror/language-data'
import { indentUnit } from '@codemirror/language'
import { Decoration, EditorView, ViewPlugin } from '@codemirror/view'
import type { DecorationSet, ViewUpdate } from '@codemirror/view'
import { useMemo, useState } from 'react'
import type { Extension } from '@codemirror/state'
import type { JSX } from 'react'
import { vscodeDark, vscodeLight } from '@uiw/codemirror-theme-vscode'
import { createTheme } from '@uiw/codemirror-themes'
import { tags as t } from '@lezer/highlight'
import { useWorkspaceStore } from '../../store/workspace'

// 缩进参考线：对每级缩进的前导空白段打 mark，CSS 用 border-left 画竖线
// （@codemirror/language 无内置扩展，按 replit 扩展的思路手写一个轻量版）
function indentGuideExtension(): Extension {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet
      constructor(view: EditorView) {
        this.decorations = this.compute(view)
      }
      update(update: ViewUpdate): void {
        if (update.docChanged || update.viewportChanged) {
          this.decorations = this.compute(update.view)
        }
      }
      compute(view: EditorView): DecorationSet {
        const deco: { from: number; to: number; value: Decoration }[] = []
        const unit = view.state.facet(indentUnit)
        const unitLen = unit.length || 2
        for (const { from, to } of view.visibleRanges) {
          let pos = from
          while (pos <= to) {
            const line = view.state.doc.lineAt(pos)
            const m = /^[ \t]*/.exec(line.text)
            if (m && m[0]) {
              const cols = m[0].replace(/\t/g, unit).length
              const level = Math.floor(cols / unitLen)
              for (let i = 1; i <= level; i++) {
                const startIdx = Math.min((i - 1) * unitLen, m[0].length)
                const endIdx = Math.min(i * unitLen, m[0].length)
                if (startIdx < endIdx) {
                  deco.push({
                    from: line.from + startIdx,
                    to: line.from + endIdx,
                    value: Decoration.mark({ class: 'cm-indent-guide' })
                  })
                }
              }
            }
            pos = line.to + 1
          }
        }
        return Decoration.set(deco, true)
      }
    },
    { decorations: (v) => v.decorations }
  )
}

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

// Solarized 经典配色（暗/亮）
const solarizedDarkTheme = createTheme({
  theme: 'dark',
  settings: {
    background: 'transparent',
    foreground: '#839496',
    caret: '#d33682',
    selection: 'rgba(38,139,210,0.3)',
    lineHighlight: 'rgba(255,255,255,0.04)',
    gutterBackground: 'transparent',
    gutterForeground: '#586e75',
    gutterActiveForeground: '#839496'
  },
  styles: [
    { tag: t.heading, color: '#b58900', fontWeight: 'bold' },
    { tag: t.strong, color: '#b58900', fontWeight: 'bold' },
    { tag: t.emphasis, color: '#d33682', fontStyle: 'italic' },
    { tag: t.link, color: '#268bd2', textDecoration: 'underline' },
    { tag: t.url, color: '#268bd2' },
    { tag: t.keyword, color: '#859900' },
    { tag: t.atom, color: '#d33682' },
    { tag: t.number, color: '#2aa198' },
    { tag: t.bool, color: '#2aa198' },
    { tag: t.string, color: '#2aa198' },
    { tag: t.comment, color: '#586e75', fontStyle: 'italic' },
    { tag: t.function(t.variableName), color: '#268bd2' },
    { tag: t.propertyName, color: '#b58900' },
    { tag: t.typeName, color: '#b58900' },
    { tag: t.className, color: '#b58900' },
    { tag: t.namespace, color: '#b58900' },
    { tag: t.operator, color: '#6c71c4' },
    { tag: t.punctuation, color: '#839496' },
    { tag: t.invalid, color: '#dc322f' }
  ]
})

const solarizedLightTheme = createTheme({
  theme: 'light',
  settings: {
    background: 'transparent',
    foreground: '#657b83',
    caret: '#d33682',
    selection: 'rgba(38,139,210,0.2)',
    lineHighlight: 'rgba(0,0,0,0.04)',
    gutterBackground: 'transparent',
    gutterForeground: '#93a1a1',
    gutterActiveForeground: '#657b83'
  },
  styles: [
    { tag: t.heading, color: '#b58900', fontWeight: 'bold' },
    { tag: t.strong, color: '#b58900', fontWeight: 'bold' },
    { tag: t.emphasis, color: '#d33682', fontStyle: 'italic' },
    { tag: t.link, color: '#268bd2', textDecoration: 'underline' },
    { tag: t.url, color: '#268bd2' },
    { tag: t.keyword, color: '#859900' },
    { tag: t.atom, color: '#d33682' },
    { tag: t.number, color: '#2aa198' },
    { tag: t.bool, color: '#2aa198' },
    { tag: t.string, color: '#2aa198' },
    { tag: t.comment, color: '#93a1a1', fontStyle: 'italic' },
    { tag: t.function(t.variableName), color: '#268bd2' },
    { tag: t.propertyName, color: '#b58900' },
    { tag: t.typeName, color: '#b58900' },
    { tag: t.className, color: '#b58900' },
    { tag: t.namespace, color: '#b58900' },
    { tag: t.operator, color: '#6c71c4' },
    { tag: t.punctuation, color: '#657b83' },
    { tag: t.invalid, color: '#dc322f' }
  ]
})

// GitHub 配色（暗/亮）
const githubDarkTheme = createTheme({
  theme: 'dark',
  settings: {
    background: 'transparent',
    foreground: '#c9d1d9',
    caret: '#58a6ff',
    selection: 'rgba(56,139,253,0.4)',
    lineHighlight: 'rgba(110,118,129,0.15)',
    gutterBackground: 'transparent',
    gutterForeground: '#484f58',
    gutterActiveForeground: '#c9d1d9'
  },
  styles: [
    { tag: t.heading, color: '#79c0ff', fontWeight: 'bold' },
    { tag: t.strong, color: '#79c0ff', fontWeight: 'bold' },
    { tag: t.emphasis, color: '#ff7b72', fontStyle: 'italic' },
    { tag: t.link, color: '#58a6ff', textDecoration: 'underline' },
    { tag: t.url, color: '#58a6ff' },
    { tag: t.keyword, color: '#ff7b72' },
    { tag: t.atom, color: '#79c0ff' },
    { tag: t.number, color: '#79c0ff' },
    { tag: t.bool, color: '#79c0ff' },
    { tag: t.string, color: '#a5d6ff' },
    { tag: t.comment, color: '#8b949e', fontStyle: 'italic' },
    { tag: t.function(t.variableName), color: '#d2a8ff' },
    { tag: t.propertyName, color: '#ffa657' },
    { tag: t.typeName, color: '#ffa657' },
    { tag: t.className, color: '#ffa657' },
    { tag: t.namespace, color: '#ffa657' },
    { tag: t.operator, color: '#ff7b72' },
    { tag: t.punctuation, color: '#c9d1d9' },
    { tag: t.invalid, color: '#f85149' }
  ]
})

const githubLightTheme = createTheme({
  theme: 'light',
  settings: {
    background: 'transparent',
    foreground: '#24292f',
    caret: '#0969da',
    selection: 'rgba(9,105,218,0.2)',
    lineHighlight: 'rgba(208,215,222,0.4)',
    gutterBackground: 'transparent',
    gutterForeground: '#8c959f',
    gutterActiveForeground: '#24292f'
  },
  styles: [
    { tag: t.heading, color: '#0969da', fontWeight: 'bold' },
    { tag: t.strong, color: '#0969da', fontWeight: 'bold' },
    { tag: t.emphasis, color: '#cf222e', fontStyle: 'italic' },
    { tag: t.link, color: '#0969da', textDecoration: 'underline' },
    { tag: t.url, color: '#0969da' },
    { tag: t.keyword, color: '#cf222e' },
    { tag: t.atom, color: '#0550ae' },
    { tag: t.number, color: '#0550ae' },
    { tag: t.bool, color: '#0550ae' },
    { tag: t.string, color: '#0a3069' },
    { tag: t.comment, color: '#6e7781', fontStyle: 'italic' },
    { tag: t.function(t.variableName), color: '#8250df' },
    { tag: t.propertyName, color: '#953800' },
    { tag: t.typeName, color: '#953800' },
    { tag: t.className, color: '#953800' },
    { tag: t.namespace, color: '#953800' },
    { tag: t.operator, color: '#cf222e' },
    { tag: t.punctuation, color: '#24292f' },
    { tag: t.invalid, color: '#82071e' }
  ]
})

interface Props {
  path: string
  value: string
  onChange: (value: string) => void
}

export default function CodeEditor({ path, value, onChange }: Props): JSX.Element {
  const {
    wordWrap,
    fontSize,
    editorFontFamily,
    editorLineHeight,
    editorTheme,
    editorCursor,
    editorIndentGuides,
    theme
  } = useWorkspaceStore()
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
    if (editorIndentGuides) exts.push(indentGuideExtension())
    if (langExt) exts.push(langExt)
    return exts
  }, [wordWrap, editorIndentGuides, langExt])

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
      case 'solarized-dark':
        exts.push(solarizedDarkTheme)
        break
      case 'solarized-light':
        exts.push(solarizedLightTheme)
        break
      case 'github-dark':
        exts.push(githubDarkTheme)
        break
      case 'github-light':
        exts.push(githubLightTheme)
        break
      default:
        exts.push(isDark ? darkTheme : lightTheme)
    }
    exts.push(
      EditorView.theme({
        '&': { fontSize: `${fontSize}px` },
        '.cm-scroller': { fontFamily: editorFontFamily, lineHeight: editorLineHeight },
        // 光标样式（个性化设置 → 编辑器）
        ...(editorCursor === 'block'
          ? { '.cm-cursor': { borderLeft: '3px solid currentColor' } }
          : editorCursor === 'underline'
            ? {
                '.cm-cursor': {
                  borderLeft: 'none',
                  borderBottom: '2px solid currentColor',
                  width: '0.7ch',
                  marginLeft: '0',
                  marginRight: '0'
                }
              }
            : {}),
        // 缩进参考线（开关时由 indentUnit 注入元素，此处仅配色/隐藏）
        ...(editorIndentGuides
          ? { '.cm-indent-guide': { borderLeft: '1px solid var(--border)' } }
          : { '.cm-indent-guide': { display: 'none' } })
      })
    )
    return exts
  }, [isDark, fontSize, editorFontFamily, editorLineHeight, editorTheme, editorCursor, editorIndentGuides])

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
