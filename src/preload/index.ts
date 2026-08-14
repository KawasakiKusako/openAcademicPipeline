import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// The typed API surface exposed to the renderer.
// Future additions (LLM session management, pipeline control, file dialogs, ...)
// will be added to this object and mirrored in index.d.ts.
const api = {
  appVersion: (): Promise<string> => ipcRenderer.invoke('app:getVersion'),
  selectDirectory: (): Promise<string | null> =>
    ipcRenderer.invoke('dialog:selectDirectory'),
  selectFile: (filters: { name: string; extensions: string[] }[], multi?: boolean): Promise<string | string[] | null> =>
    ipcRenderer.invoke('dialog:selectFile', filters, multi),
  windowMinimize: (): void => ipcRenderer.send('window:minimize'),
  windowMaximize: (): void => ipcRenderer.send('window:maximize'),
  windowClose: (): void => ipcRenderer.send('window:close'),
  openPath: (target: string): Promise<boolean> => ipcRenderer.invoke('shell:openPath', target),
  onGlobalSearch: (cb: () => void): void => {
    ipcRenderer.on('global-search', () => cb())
  },
  onTempChat: (cb: () => void): void => {
    ipcRenderer.on('temp-chat', () => cb())
  },
  openFloatingChat: (text?: string): void => {
    ipcRenderer.send('floating-chat:open', text)
  },
  closeFloatingChat: (): void => {
    ipcRenderer.send('floating-chat:close')
  },
  openPresentAssist: (): void => ipcRenderer.send('present-assist:open'),
  closePresentAssist: (): void => ipcRenderer.send('present-assist:close'),
  openPresentAssistWithFile: (payload: { path: string; projectId?: string }): void =>
    ipcRenderer.send('present-assist:open-with-file', payload),
  onPresentAssistImport: (cb: (payload: { path: string; projectId?: string }) => void): void => {
    ipcRenderer.on('present-assist:import-file', (_e, payload: { path: string; projectId?: string }) =>
      cb(payload)
    )
  },
  onFloatingInject: (cb: (text: string) => void): void => {
    ipcRenderer.on('floating-chat:inject', (_e, text: string) => cb(text))
  },
  sendToFloating: (text: string): void => {
    ipcRenderer.send('floating-chat:inject', text)
  },
  getDisplays: (): Promise<
    { id: number; label: string; bounds: { x: number; y: number; width: number; height: number }; primary: boolean }[]
  > => ipcRenderer.invoke('screen:displays'),
  audienceOpen: (displayId: number): Promise<boolean> =>
    ipcRenderer.invoke('present:audience-open', displayId),
  audienceRender: (html: string): void => ipcRenderer.send('present:audience-render', html),
  audienceMarker: (svg: string): void => ipcRenderer.send('present:audience-marker', svg),
  audienceClose: (): Promise<boolean> => ipcRenderer.invoke('present:audience-close'),
  audienceGetLast: (): Promise<string> => ipcRenderer.invoke('audience:get-last'),
  onAudienceRender: (cb: (html: string) => void): void => {
    ipcRenderer.on('audience:render', (_e, html: string) => cb(html))
  },
  onAudienceMarker: (cb: (svg: string) => void): void => {
    ipcRenderer.on('audience:marker', (_e, svg: string) => cb(svg))
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
