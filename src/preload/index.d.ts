import { ElectronAPI } from '@electron-toolkit/preload'

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      appVersion: () => string
      selectDirectory: () => Promise<string | null>
      windowMinimize: () => void
      windowMaximize: () => void
      windowClose: () => void
      openPath: (target: string) => Promise<boolean>
      onGlobalSearch: (cb: () => void) => void
      onTempChat: (cb: () => void) => void
      openFloatingChat: (text?: string) => void
      closeFloatingChat: () => void
      onFloatingInject: (cb: (text: string) => void) => void
      sendToFloating: (text: string) => void
    }
  }
}
