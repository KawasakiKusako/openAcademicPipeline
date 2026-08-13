import { app, dialog, ipcMain, shell, BrowserWindow, Menu, Tray, nativeImage } from 'electron'
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
      sandbox: false
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

// Open a folder in the system file explorer
ipcMain.handle('shell:openPath', async (_event, target: string) => {
  if (typeof target !== 'string' || !target) return false
  const err = await shell.openPath(target)
  return !err // empty string means success
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
