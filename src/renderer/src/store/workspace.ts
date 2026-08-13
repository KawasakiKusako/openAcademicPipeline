import { create } from 'zustand'
import type { AccentColor, Theme } from '@shared/types'

export type SidebarView = 'explorer' | 'tasks' | 'sessions' | 'library'

export interface WsTab {
  id: string // 'file:<path>' | 'task:<id>' | 'session:<id>' | 'settings:main'
  kind: 'file' | 'task' | 'session' | 'settings' | 'recommend'
  title: string
  refId: string // file path / task id / session id
}

interface WorkspaceState {
  sidebarView: SidebarView
  tabs: WsTab[]
  activeTabId: string | null
  sidebarWidth: number
  auxWidth: number
  expandedDirs: Set<string>
  showSidebar: boolean
  showAux: boolean
  showPanel: boolean
  panelHeight: number
  wordWrap: boolean
  fontSize: number
  runResult: { filePath: string; result: unknown } | null
  saveRequest: number
  clipboard: { path: string; cut: boolean } | null
  pendingChatText: string | null
  theme: Theme
  accent: AccentColor
  customAccent: string

  openTab: (tab: WsTab) => void
  closeTab: (id: string) => void
  setActiveTab: (id: string) => void
  setSidebarView: (v: SidebarView) => void
  setSidebarWidth: (w: number) => void
  setAuxWidth: (w: number) => void
  toggleDir: (path: string) => void
  toggleSidebar: () => void
  toggleAux: () => void
  togglePanel: () => void
  setPanelHeight: (h: number) => void
  setWordWrap: (v: boolean) => void
  setFontSize: (n: number) => void
  setRunResult: (r: { filePath: string; result: unknown } | null) => void
  requestSave: () => void
  setClipboard: (c: { path: string; cut: boolean } | null) => void
  setPendingChatText: (t: string | null) => void
  setTheme: (t: Theme) => void
  setAccent: (a: AccentColor) => void
  setCustomAccent: (c: string) => void
  fileDrafts: Record<string, string>
  setFileDraft: (path: string, content: string) => void
  clearFileDraft: (path: string) => void
  sessionsVersion: number
  bumpSessions: () => void
}

const MIN_SIDEBAR = 200
const MIN_AUX = 220

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  sidebarView: 'explorer',
  tabs: [],
  activeTabId: null,
  sidebarWidth: 260,
  auxWidth: 280,
  expandedDirs: new Set(['']),
  showSidebar: true,
  showAux: true,
  showPanel: false,
  panelHeight: 180,
  wordWrap: false,
  fontSize: 13,
  runResult: null,
  saveRequest: 0,
  clipboard: null,
  pendingChatText: null,
  theme: 'dark',
  accent: 'blue',
  customAccent: '#3794ff',

  openTab: (tab) => {
    const { tabs } = get()
    if (!tabs.some((t) => t.id === tab.id)) {
      set({ tabs: [...tabs, tab] })
    }
    set({ activeTabId: tab.id })
  },

  closeTab: (id) => {
    const { tabs, activeTabId } = get()
    const idx = tabs.findIndex((t) => t.id === id)
    if (idx < 0) return
    const next = tabs.filter((t) => t.id !== id)
    let nextActive = activeTabId
    if (activeTabId === id) {
      nextActive = next[Math.min(idx, next.length - 1)]?.id ?? null
    }
    set({ tabs: next, activeTabId: nextActive })
  },

  setActiveTab: (id) => set({ activeTabId: id }),

  setSidebarView: (v) => set({ sidebarView: v }),

  setSidebarWidth: (w) =>
    set({ sidebarWidth: Math.max(MIN_SIDEBAR, Math.min(w, 480)) }),

  setAuxWidth: (w) => set({ auxWidth: Math.max(MIN_AUX, Math.min(w, 520)) }),

  toggleDir: (path) =>
    set((s) => {
      const next = new Set(s.expandedDirs)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return { expandedDirs: next }
    }),

  toggleSidebar: () => set((s) => ({ showSidebar: !s.showSidebar })),
  toggleAux: () => set((s) => ({ showAux: !s.showAux })),
  togglePanel: () => set((s) => ({ showPanel: !s.showPanel })),
  setPanelHeight: (h) => set({ panelHeight: Math.max(100, Math.min(h, 500)) }),
  setWordWrap: (v) => set({ wordWrap: v }),
  setFontSize: (n) => set({ fontSize: Math.max(10, Math.min(n, 24)) }),
  setRunResult: (r) => set({ runResult: r }),
  requestSave: () => set((s) => ({ saveRequest: s.saveRequest + 1 })),
  setClipboard: (c) => set({ clipboard: c }),
  setPendingChatText: (t) => set({ pendingChatText: t }),
  setTheme: (t) => set({ theme: t }),
  setAccent: (a) => set({ accent: a }),
  setCustomAccent: (c) => set({ customAccent: c }),
  fileDrafts: {},
  setFileDraft: (path, content) =>
    set((s) => ({ fileDrafts: { ...s.fileDrafts, [path]: content } })),
  clearFileDraft: (path) =>
    set((s) => {
      const next = { ...s.fileDrafts }
      delete next[path]
      return { fileDrafts: next }
    }),
  sessionsVersion: 0,
  bumpSessions: () => set((s) => ({ sessionsVersion: s.sessionsVersion + 1 }))
}))

export function tabIdFor(kind: WsTab['kind'], refId: string): string {
  return `${kind}:${refId}`
}
