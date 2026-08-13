import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// The typed API surface exposed to the renderer.
// Future additions (LLM session management, pipeline control, file dialogs, ...)
// will be added to this object and mirrored in index.d.ts.
const api = {
  appVersion: () => process.env['npm_package_version'] ?? '0.0.0',
  selectDirectory: (): Promise<string | null> =>
    ipcRenderer.invoke('dialog:selectDirectory'),
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
  onFloatingInject: (cb: (text: string) => void): void => {
    ipcRenderer.on('floating-chat:inject', (_e, text: string) => cb(text))
  },
  sendToFloating: (text: string): void => {
    ipcRenderer.send('floating-chat:inject', text)
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
