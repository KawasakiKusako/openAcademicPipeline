import { ElectronAPI } from '@electron-toolkit/preload'

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      appVersion: () => Promise<string>
      selectDirectory: () => Promise<string | null>
      selectFile: (filters: { name: string; extensions: string[] }[], multi?: boolean) => Promise<string | string[] | null>
      openPresentAssist: () => void
      closePresentAssist: () => void
      openPresentAssistWithFile: (payload: { path: string; projectId?: string }) => void
      onPresentAssistImport: (cb: (payload: { path: string; projectId?: string }) => void) => void
      getDisplays: () => Promise<
        { id: number; label: string; bounds: { x: number; y: number; width: number; height: number }; primary: boolean }[]
      >
      audienceOpen: (displayId: number) => Promise<boolean>
      audienceRender: (html: string) => void
      audienceMarker: (svg: string) => void
      audienceClose: () => Promise<boolean>
      audienceGetLast: () => Promise<string>
      onAudienceRender: (cb: (html: string) => void) => void
      autoUpdateCheck: () => Promise<{ state: string; error?: string }>
      autoUpdateDownload: () => Promise<{ state: string }>
      autoUpdateInstall: () => Promise<boolean>
      relaunchApp: () => Promise<boolean>
      onAutoUpdate: (cb: (status: Record<string, unknown>) => void) => void
      onCliPermissionRequest: (cb: (req: { requestId: string; action: string; command: string; toolInput: string }) => void) => void
      cliPermissionRespond: (payload: { requestId: string; decision: string; alwaysAllow?: boolean }) => void
      onAudienceMarker: (cb: (svg: string) => void) => void
      windowMinimize: () => void
      windowMaximize: () => void
      windowClose: () => void
      openPath: (target: string) => Promise<boolean>
      setWindowOpacity: (v: number) => void
      setWindowMaterial: (m: string) => void
      onGlobalSearch: (cb: () => void) => void
      onTempChat: (cb: () => void) => void
      openFloatingChat: (text?: string) => void
      closeFloatingChat: () => void
      openPresentAssist: () => void
      closePresentAssist: () => void
      onFloatingInject: (cb: (text: string) => void) => void
      sendToFloating: (text: string) => void
    }
  }
}
