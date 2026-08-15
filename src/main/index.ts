import { app, dialog, ipcMain, shell, BrowserWindow, Menu, Tray, nativeImage, screen } from 'electron'
import { EventEmitter } from 'node:events'
import { autoUpdater } from 'electron-updater'
// 注意：这里绝不可静态 import '../server/...' 的运行时值——ESM import 会先于
// 本模块函数体求值 server 模块（其内部 paths.ts 在模块加载时解析 DATA_ROOT），
// 导致下方 OAP_DATA_DIR 设置失效、dev 误用生产数据目录（Roaming）。
// server 侧的类型可静态 import（编译期擦除，无运行时求值）。
import type { PermissionRequest, PermissionDecision } from '../server/claude/cli-engine'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'

// In development, keep data (db + sandboxes) inside the project for easy inspection.
// Must be set BEFORE the server module is loaded (hence dynamic import below).
if (!app.isPackaged) {
  process.env['OAP_DATA_DIR'] = join(__dirname, '../../data')
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    autoHideMenuBar: true,
    title: 'Open Academic Pipeline',
    frame: false, // custom title bar (VSCode-style)
    icon, // taskbar + window icon (all platforms, uses resources/icon.png)
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      webviewTag: true // HTML 文件预览用（webview 不继承宿主 CSP）
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  // Open external links in the system browser, never inside the app
  mainWindow?.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // Load the Vite dev server URL in development, the built file in production
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow?.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow?.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// Directory picker for project creation (project sandbox = user-chosen folder)
ipcMain.handle('dialog:selectDirectory', async (): Promise<string | null> => {
  const result = await dialog.showOpenDialog({
    title: '选择项目文件夹',
    properties: ['openDirectory', 'createDirectory']
  })
  return result.canceled ? null : (result.filePaths[0] ?? null)
})

// File picker with filters (e.g. presentation mode: .pptx / .html); multi for batch import
ipcMain.handle(
  'dialog:selectFile',
  async (
    _event,
    filters: { name: string; extensions: string[] }[],
    multi?: boolean
  ): Promise<string | string[] | null> => {
    const result = await dialog.showOpenDialog({
      title: '选择文件',
      properties: multi ? ['openFile', 'multiSelections'] : ['openFile'],
      filters: Array.isArray(filters) && filters.length > 0 ? filters : undefined
    })
    if (result.canceled) return null
    return multi ? result.filePaths : (result.filePaths[0] ?? null)
  }
)

// Custom window controls (frameless window)
ipcMain.on('window:minimize', (event) => {
  BrowserWindow.fromWebContents(event.sender)?.minimize()
})
ipcMain.on('window:maximize', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win) return
  if (win.isMaximized()) win.unmaximize()
  else win.maximize()
})
ipcMain.on('window:close', (event) => {
  BrowserWindow.fromWebContents(event.sender)?.close()
})

// 重启应用（环境切换等需要重启生效的场景）
ipcMain.handle('app:relaunch', () => {
  app.relaunch()
  app.exit(0)
  return true
})

// Open a folder in the system file explorer
ipcMain.handle('shell:openPath', async (_event, target: string) => {
  if (typeof target !== 'string' || !target) return false
  const err = await shell.openPath(target)
  return !err // empty string means success
})

// 窗口不透明度（个性化设置 → 窗口组；仅主窗口，排除演示 audience 窗口）
ipcMain.on('window:set-opacity', (event, v: unknown) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win || win === audienceWindow) return
  const o = Math.min(1, Math.max(0.8, Number(v) / 100))
  if (!Number.isFinite(o)) return
  try {
    win.setOpacity(o) // Windows 下最大化窗口可能忽略；Linux 部分 WM 不支持（try/catch）
  } catch {
    // ignore
  }
})

// 窗口磨砂材质（Win11 亚克力/云母）：需要透明背景才能透出系统材质，
// 渲染端配合 body[data-material] 半透明化 .app-frame。
// 系统不支持（Win10/非 22H2）时退化为渲染层半透明，无报错。
ipcMain.on('window:set-material', (event, m: unknown) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win || win === audienceWindow) return
  const material = m === 'acrylic' || m === 'mica' ? m : 'none'
  try {
    win.setBackgroundColor(material === 'none' ? '#000000' : '#00000000')
    win.setBackgroundMaterial(material as never)
  } catch {
    // 平台不支持时忽略
  }
})

// App version for the UI. Never rely on npm_package_version (unset in packaged builds).
ipcMain.handle('app:getVersion', () => app.getVersion())

// ===== CLI 权限确认桥：server 的 permission_request → 广播到窗口 → 决策回写 =====
// 在 whenReady 中拿到动态 import 的 permissionBus 后调用（见下方）。
function setupPermissionBridge(permissionBus: EventEmitter): void {
  permissionBus.on('request', (req: PermissionRequest) => {
    console.log('[main] permission request → 广播窗口:', req.action, req.command.slice(0, 120))
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send('cli:permission-request', req)
    }
    // 弹窗需要用户及时处理：把主窗口带到前台（悬浮窗无弹窗组件，弹窗在主窗口渲染）
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.show()
      mainWindow.focus()
    }
  })

  ipcMain.on(
    'cli:permission-respond',
    (_e, payload: { requestId: string; decision: string; alwaysAllow?: boolean }) => {
      const d: PermissionDecision = {
        decision: payload.decision === 'allow' ? 'allow' : 'deny',
        alwaysAllow: payload.alwaysAllow === true
      }
      permissionBus.emit(`decision:${payload.requestId}`, d)
    }
  )
}

// ===== 自动更新（增量优先，electron-updater 读 GitHub releases 的 latest.yml） =====
let autoUpdateState: 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'error' = 'idle'

function pushAutoUpdate(extra: Record<string, unknown> = {}): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('app:auto-update', { state: autoUpdateState, ...extra })
  }
}

function setupAutoUpdater(): void {
  if (!app.isPackaged) return // dev 模式无更新通道
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.setFeedURL({
    provider: 'github',
    owner: 'KawasakiKusako',
    repo: 'openAcademicPipeline'
  })
  autoUpdater.on('checking-for-update', () => {
    autoUpdateState = 'checking'
    pushAutoUpdate()
  })
  autoUpdater.on('update-available', () => {
    autoUpdateState = 'available'
    pushAutoUpdate()
  })
  autoUpdater.on('update-not-available', () => {
    autoUpdateState = 'idle'
    pushAutoUpdate()
  })
  autoUpdater.on('download-progress', (p) => {
    autoUpdateState = 'downloading'
    pushAutoUpdate({
      percent: Math.round(p.percent),
      transferred: p.transferred,
      total: p.total,
      speed: p.bytesPerSecond
    })
  })
  autoUpdater.on('update-downloaded', () => {
    autoUpdateState = 'downloaded'
    pushAutoUpdate()
  })
  autoUpdater.on('error', (err) => {
    autoUpdateState = 'error'
    pushAutoUpdate({ error: err.message })
  })
}

ipcMain.handle('app:auto-update-check', () => {
  if (!app.isPackaged) return { state: 'error', error: '自动更新仅打包版可用，请手动下载' }
  setupAutoUpdater()
  autoUpdater.checkForUpdates().catch((err: Error) => {
    autoUpdateState = 'error'
    pushAutoUpdate({ error: err.message })
  })
  return { state: autoUpdateState }
})

ipcMain.handle('app:auto-update-download', () => {
  if (autoUpdateState === 'available') autoUpdater.downloadUpdate()
  return { state: autoUpdateState }
})

ipcMain.handle('app:auto-update-install', () => {
  autoUpdater.quitAndInstall()
  return true
})

// ===== 演讲者视图：观众窗口（第二显示器全屏放映） =====
let audienceWindow: BrowserWindow | null = null
let lastAudienceHtml = ''

ipcMain.handle('screen:displays', () => {
  const displays = screen.getAllDisplays()
  const primary = screen.getPrimaryDisplay()
  return displays.map((d) => ({
    id: d.id,
    label: d.label || (d.id === primary.id ? '主显示器' : `显示器 ${d.id}`),
    bounds: { x: d.bounds.x, y: d.bounds.y, width: d.bounds.width, height: d.bounds.height },
    primary: d.id === primary.id
  }))
})

ipcMain.handle('present:audience-open', (_e, displayId: number) => {
  const display = screen.getAllDisplays().find((d) => d.id === Number(displayId))
  if (!display) return false
  const bounds = display.bounds
  if (!audienceWindow || audienceWindow.isDestroyed()) {
    audienceWindow = new BrowserWindow({
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      frame: false,
      fullscreen: true,
      autoHideMenuBar: true,
      backgroundColor: '#000000',
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false
      }
    })
    audienceWindow.on('closed', () => {
      audienceWindow = null
    })
    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      audienceWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}#/audience`)
    } else {
      audienceWindow.loadFile(join(__dirname, '../renderer/index.html'), { hash: '/audience' })
    }
  } else {
    audienceWindow.setBounds(bounds)
    audienceWindow.setFullScreen(true)
    audienceWindow.show()
  }
  return true
})

ipcMain.on('present:audience-render', (_e, html: string) => {
  lastAudienceHtml = String(html)
  if (audienceWindow && !audienceWindow.isDestroyed()) {
    audienceWindow.webContents.send('audience:render', lastAudienceHtml)
  }
})

// 荧光笔增量同步：只发送小的 SVG 标注层（避免高频传输整页 HTML 卡死）
ipcMain.on('present:audience-marker', (_e, svg: string) => {
  if (audienceWindow && !audienceWindow.isDestroyed()) {
    audienceWindow.webContents.send('audience:marker', String(svg))
  }
})

ipcMain.handle('audience:get-last', () => lastAudienceHtml)

ipcMain.handle('present:audience-close', () => {
  audienceWindow?.close()
  audienceWindow = null
  lastAudienceHtml = ''
  return true
})

// System tray + global search (floating panel triggered from the tray)
let tray: Tray | null = null
let mainWindow: BrowserWindow | null = null
let floatingWindow: BrowserWindow | null = null

// 系统级悬浮窗：独立置顶小窗口（临时对话），与主窗口并存
function openFloatingChat(text?: string): void {
  if (floatingWindow && !floatingWindow.isDestroyed()) {
    floatingWindow.show()
    floatingWindow.focus()
    if (text) floatingWindow.webContents.send('floating-chat:inject', text)
    return
  }
  floatingWindow = new BrowserWindow({
    width: 360,
    height: 480,
    minWidth: 300,
    minHeight: 360,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true, // 系统级 widget：不占任务栏
    resizable: true,
    transparent: false,
    icon, // 与主窗口图标统一
    title: 'OAP 临时对话',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })
  floatingWindow.on('closed', () => {
    floatingWindow = null
  })
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    floatingWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}#/floating-chat`)
  } else {
    floatingWindow
      .loadFile(join(__dirname, '../renderer/index.html'), { hash: '/floating-chat' })
      .catch(() => undefined)
  }
  floatingWindow.webContents.on('did-finish-load', () => {
    if (text) floatingWindow?.webContents.send('floating-chat:inject', text)
  })
}

// 汇报助手悬浮窗：读取 PPT 内容 + 原生 API 生成汇报讲稿
let presentAssistWindow: BrowserWindow | null = null

function openPresentAssist(): void {
  if (presentAssistWindow && !presentAssistWindow.isDestroyed()) {
    presentAssistWindow.show()
    presentAssistWindow.focus()
    return
  }
  presentAssistWindow = new BrowserWindow({
    width: 960,
    height: 640,
    minWidth: 560,
    minHeight: 420,
    frame: false,
    autoHideMenuBar: true,
    title: 'OAP 汇报助手',
    icon, // 任务栏/窗口图标与主窗口统一
    backgroundColor: '#1e1e1e',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })
  // 最高置顶级别：放映/全屏时也不被遮挡
  presentAssistWindow.setAlwaysOnTop(true, 'screen-saver')
  presentAssistWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  presentAssistWindow.on('closed', () => {
    presentAssistWindow = null
  })
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    presentAssistWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}#/present-assist`)
  } else {
    presentAssistWindow.loadFile(join(__dirname, '../renderer/index.html'), { hash: '/present-assist' })
  }
}

ipcMain.on('present-assist:open', () => openPresentAssist())
ipcMain.on('present-assist:close', () => presentAssistWindow?.close())

// 打开悬浮窗并导入文件（资源管理器右键"在汇报助手中打开"）
ipcMain.on(
  'present-assist:open-with-file',
  (_e, payload: { path: string; projectId?: string }) => {
    openPresentAssist()
    const send = (): void => {
      if (presentAssistWindow && !presentAssistWindow.isDestroyed()) {
        presentAssistWindow.webContents.send('present-assist:import-file', payload)
      }
    }
    if (presentAssistWindow?.webContents.isLoading()) {
      presentAssistWindow.webContents.once('did-finish-load', send)
    } else {
      setTimeout(send, 200)
    }
  }
)

// 主进程转发：主窗口"发送到悬浮窗"
ipcMain.on('floating-chat:open', (_e, text?: string) => {
  openFloatingChat(typeof text === 'string' ? text : undefined)
})
ipcMain.on('floating-chat:close', () => {
  floatingWindow?.close()
})
ipcMain.on('floating-chat:inject', (_e, text: string) => {
  if (floatingWindow && !floatingWindow.isDestroyed()) {
    floatingWindow.webContents.send('floating-chat:inject', text)
  } else {
    openFloatingChat(text)
  }
})

function setupTray(): void {
  const trayIcon = nativeImage.createFromPath(icon).resize({ width: 16, height: 16 })
  tray = new Tray(trayIcon.isEmpty() ? nativeImage.createEmpty() : trayIcon)
  tray.setToolTip('Open Academic Pipeline')
  const openSearch = (): void => {
    mainWindow?.show()
    mainWindow?.webContents.send('global-search')
  }
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: '显示主窗口', click: () => mainWindow?.show() },
      { label: '快速搜索 (Ctrl+Shift+P)', click: openSearch },
      {
        label: '开始临时对话（悬浮窗）',
        click: () => openFloatingChat()
      },
      {
        label: '打开汇报助手',
        click: () => openPresentAssist()
      },
      { type: 'separator' },
      { label: '退出', click: () => app.quit() }
    ])
  )
  tray.on('click', () => mainWindow?.show())
}

app.whenReady().then(async () => {
  // Set app user model id for Windows notifications
  electronApp.setAppUserModelId('com.openacademicpipeline.app')

  // F12 to open DevTools in dev, ignore the Ctrl+Shift+I shortcut in production
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Start the local API server (port 11455) before opening the window
  try {
    const { startServer } = await import('../server')
    // 权限桥必须在 server 动态加载之后接线（此时 OAP_DATA_DIR 已设置）
    const { permissionBus } = await import('../server/claude/cli-engine')
    setupPermissionBridge(permissionBus)
    await startServer(11455)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[main] failed to start API server:', err)
    dialog.showErrorBox('Open Academic Pipeline', `后端服务启动失败（端口 11455 可能被占用）：\n${msg}`)
    app.quit()
    return
  }

  createWindow()
  setupTray()

  app.on('activate', () => {
    // On macOS re-create a window when the dock icon is clicked
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
