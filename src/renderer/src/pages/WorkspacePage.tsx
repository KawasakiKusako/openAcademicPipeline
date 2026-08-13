import { useRef } from 'react'
import type { JSX } from 'react'
import { useParams } from 'react-router-dom'
import { useWorkspaceStore } from '../store/workspace'
import Resizer from '../components/workspace/Resizer'
import ExplorerView from '../components/workspace/ExplorerView'
import TasksView from '../components/workspace/TasksView'
import SessionsView from '../components/workspace/SessionsView'
import LibraryView from '../components/workspace/LibraryView'
import AuxPanel from '../components/workspace/AuxPanel'
import Workbench from '../components/workspace/Workbench'
// 项目工作区：VSCode 风格（主侧栏 | 工作台 | 副侧栏，均可拖拽）
export default function WorkspacePage(): JSX.Element {
  const { projectId = '' } = useParams()
  const {
    sidebarView,
    sidebarWidth,
    auxWidth,
    setSidebarWidth,
    setAuxWidth,
    activeTabId,
    tabs,
    showSidebar,
    showAux
  } = useWorkspaceStore()

  // current task (for the aux panel: its sessions)
  const activeTaskTab = tabs.find((t) => t.id === activeTabId && t.kind === 'task')
  const sidebarRef = useRef<HTMLDivElement>(null)
  const auxRef = useRef<HTMLDivElement>(null)

  return (
    <div className="workspace">
      {showSidebar && (
        <>
          <div className="ws-panel" ref={sidebarRef} style={{ width: sidebarWidth }}>
            {sidebarView === 'explorer' && <ExplorerView projectId={projectId} />}
            {sidebarView === 'tasks' && <TasksView projectId={projectId} />}
            {sidebarView === 'sessions' && <SessionsView projectId={projectId} />}
            {sidebarView === 'library' && <LibraryView projectId={projectId} />}
          </div>
          <Resizer panelRef={sidebarRef} onCommit={setSidebarWidth} />
        </>
      )}

      <Workbench projectId={projectId} />

      {showAux && (
        <>
          <Resizer panelRef={auxRef} onCommit={setAuxWidth} reverse />
          <div className="ws-panel aux" ref={auxRef} style={{ width: auxWidth }}>
            <AuxPanel projectId={projectId} taskIdFilter={activeTaskTab?.refId ?? null} />
          </div>
        </>
      )}
    </div>
  )
}
