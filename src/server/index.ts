import express from 'express'
import type { Express, NextFunction, Request, Response } from 'express'
import cors from 'cors'
import { mkdirSync } from 'node:fs'
import { getDb } from './db'
import { cliVersionAsync } from './claude/cli-engine'
import { DATA_ROOT, SANDBOXES_ROOT } from './paths'
import { projectsRouter } from './routes/projects'
import { tasksRouter } from './routes/tasks'
import { sessionsRouter } from './routes/sessions'
import { librariesRouter } from './routes/libraries'
import { filesRouter } from './routes/files'
import { chatRouter } from './routes/chat'
import { settingsRouter } from './routes/settings'
import { literatureRouter } from './routes/literature'
import { ccswitchRouter } from './routes/ccswitch'
import { envsRouter } from './routes/envs'
import { runRouter } from './routes/run'
import { skillsRouter } from './routes/skills'
import { recommendationsRouter } from './routes/recommendations'
import { scratchRouter } from './routes/scratch'
import { updateRouter } from './routes/update'
import { personalizationRouter } from './routes/personalization'
import { presentRouter } from './routes/present'
import { officeRouter } from './routes/office'
import { presentAssistRouter } from './routes/present-assist'
import { apiProvidersRouter } from './routes/api-providers'
import { arsRouter } from './routes/ars'
import { styleRouter, initStyleModule } from './routes/style'
import { initPersonalization } from './personalization'

export const SERVER_PORT = 11455

// Local-only HTTP API. Allowed origins: the Vite dev server (11454) and file://
// (packaged app). Listen on loopback only — never expose on the network.
function createApp(): Express {
  const app = express()
  app.use(express.json({ limit: '10mb' }))
  app.use(
    cors({
      origin: (origin, cb) => {
        if (!origin || origin === 'null') return cb(null, true)
        if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return cb(null, true)
        cb(new Error(`不允许的来源: ${origin}`))
      }
    })
  )

  app.use('/api', projectsRouter)
  app.use('/api', tasksRouter)
  app.use('/api', sessionsRouter)
  app.use('/api', librariesRouter)
  app.use('/api', filesRouter)
  app.use('/api', chatRouter)
  app.use('/api', settingsRouter)
  app.use('/api', literatureRouter)
  app.use('/api', ccswitchRouter)
  app.use('/api', envsRouter)
  app.use('/api', runRouter)
  app.use('/api', skillsRouter)
  app.use('/api', recommendationsRouter)
  app.use('/api', scratchRouter)
  app.use('/api', updateRouter)
  app.use('/api', personalizationRouter)
  app.use('/api', presentRouter)
  app.use('/api', officeRouter)
  app.use('/api', presentAssistRouter)
  app.use('/api', apiProvidersRouter)
  app.use('/api', arsRouter)
  app.use('/api', styleRouter)

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, time: new Date().toISOString() })
  })

  // 404 for unknown API routes
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: '接口不存在' })
  })

  // Error handler: normalize thrown status, never leak stack traces
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const e = err as { message?: string; status?: number }
    console.error('[server]', e)
    res.status(e.status && e.status < 500 ? e.status : 500).json({
      error: e.message ?? '服务器内部错误'
    })
  })

  return app
}

let server: ReturnType<Express['listen']> | null = null

export function startServer(port = SERVER_PORT): Promise<void> {
  mkdirSync(SANDBOXES_ROOT, { recursive: true })
  getDb() // initialize schema eagerly so failures surface at startup
  // 启动清扫：进程重启后引擎已消亡，DB 里残留的 running 一律复位，
  // 防止崩溃/强杀后会话被永久占用（409）。
  getDb().prepare(`UPDATE sessions SET status = 'idle' WHERE status = 'running'`).run()
  initPersonalization() // 注册内置个性化设置 + 加载第三方 JSON schema
  initStyleModule() // 自定义样式目录 + 版本变化时自动备份默认样式
  // 预热 CLI 版本探测（异步 spawn，不阻塞事件循环）：UI 首次拉 claude/status 时直接命中缓存
  void cliVersionAsync()

  return new Promise((resolve, reject) => {
    const app = createApp()
    server = app.listen(port, '127.0.0.1', () => {
      console.log(`[server] Open Academic Pipeline API listening on http://127.0.0.1:${port}`)
      console.log(`[server] data root: ${DATA_ROOT}`)
      resolve()
    })
    server.on('error', reject)
  })
}

export function stopServer(): Promise<void> {
  return new Promise((resolve) => {
    if (!server) return resolve()
    server.close(() => resolve())
    server = null
  })
}
