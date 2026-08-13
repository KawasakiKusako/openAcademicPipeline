import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import { api } from '../../lib/api'
import LiteraturePanel from '../LiteraturePanel'
import NotesView from './NotesView'
import ScratchView from './ScratchView'
import type { Library } from '@shared/types'

// 知识库视图：文献库（全局共享，可导入）+ 笔记库（本地目录/Obsidian）+ 随记
export default function LibraryView({ projectId }: { projectId: string }): JSX.Element {
  const [sub, setSub] = useState<'lit' | 'notes' | 'scratch'>('lit')
  const [libraries, setLibraries] = useState<Library[]>([])

  const reload = (): void => {
    api.libraries(projectId).then(setLibraries).catch(() => undefined)
  }

  useEffect(reload, [projectId]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="ws-side">
      <div className="ws-side-head">
        <div className="row gap">
          <button
            className={`sub-btn${sub === 'lit' ? ' active' : ''}`}
            onClick={() => setSub('lit')}
          >
            文献
          </button>
          <button
            className={`sub-btn${sub === 'notes' ? ' active' : ''}`}
            onClick={() => setSub('notes')}
          >
            笔记
          </button>
          <button
            className={`sub-btn${sub === 'scratch' ? ' active' : ''}`}
            onClick={() => setSub('scratch')}
          >
            随记
          </button>
        </div>
      </div>
      <div className="ws-side-body ws-library">
        {sub === 'lit' && <LiteraturePanel projectId={projectId} />}
        {sub === 'notes' && <NotesView projectId={projectId} libraries={libraries} onChanged={reload} />}
        {sub === 'scratch' && <ScratchView />}
      </div>
    </div>
  )
}
