import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import LiteraturePanel from '../components/LiteraturePanel'
import NotesView from '../components/workspace/NotesView'
import ScratchView from '../components/workspace/ScratchView'
import { api } from '../lib/api'
import type { Library } from '@shared/types'

// 全局知识库页（项目总览时从活动栏进入）：文献库 + 笔记库
export default function LibraryPage(): JSX.Element {
  const [tab, setTab] = useState<'lit' | 'notes' | 'scratch'>('lit')
  const [libraries, setLibraries] = useState<Library[]>([])

  const reload = (): void => {
    api.libraries().then(setLibraries).catch(() => undefined)
  }

  useEffect(() => {
    reload()
  }, [])

  return (
    <div className="page">
      <header className="page-head">
        <h2>知识库</h2>
        <p className="muted">个人知识库：文献库（全局共享）+ 笔记库（Obsidian vault / 本地目录）。</p>
      </header>

      <div className="sub-tabs">
        <button className={tab === 'lit' ? 'tab active' : 'tab'} onClick={() => setTab('lit')}>
          文献库
        </button>
        <button className={tab === 'notes' ? 'tab active' : 'tab'} onClick={() => setTab('notes')}>
          笔记库
        </button>
        <button className={tab === 'scratch' ? 'tab active' : 'tab'} onClick={() => setTab('scratch')}>
          随记
        </button>
      </div>

      {tab === 'lit' && <LiteraturePanel />}
      {tab === 'notes' && <NotesView projectId={null} libraries={libraries} onChanged={reload} />}
      {tab === 'scratch' && <ScratchView />}
    </div>
  )
}
