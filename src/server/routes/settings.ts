import { Router } from 'express'
import { session } from 'electron'
import { rmSync } from 'node:fs'
import { join } from 'node:path'
import { getAppSettings, setSetting } from '../settings'
import { getDb } from '../db'
import type { AppSettings, PythonEnv, SessionEngine } from '../../shared/types'

export const settingsRouter = Router()

export const pythonEnvInputGuard = (v: unknown): v is PythonEnv =>
  !!v &&
  typeof v === 'object' &&
  ((v as PythonEnv).type === 'conda' || (v as PythonEnv).type === 'uv' || (v as PythonEnv).type === 'system' || (v as PythonEnv).type === null) &&
  typeof (v as PythonEnv).value === 'string'

// Current settings with the API key masked (never echo the full key)
settingsRouter.get('/settings', (_req, res) => {
  res.json(getAppSettings())
})

// POST /api/settings/clear-cache — 清除 Chromium 缓存与 Office 转换缓存（_oap_preview）
settingsRouter.post('/settings/clear-cache', async (_req, res) => {
  try {
    let freedBytes = 0
    // 1) Office 高保真转换缓存（各项目沙盒 _oap_preview）
    const projects = getDb().prepare('SELECT sandbox_path FROM projects').all() as {
      sandbox_path: string | null
    }[]
    for (const p of projects) {
      if (!p.sandbox_path) continue
      const dir = join(p.sandbox_path, '_oap_preview')
      try {
        const { statSync } = await import('node:fs')
        if (statSync(dir).isDirectory()) {
          freedBytes += statSync(dir).size
          rmSync(dir, { recursive: true, force: true })
        }
      } catch {
        // 目录不存在则跳过
      }
    }
    // 2) Chromium 渲染缓存（应用内图片/页面缓存，不影响数据）
    const ses = session.defaultSession
    await ses.clearCache()
    await ses.clearStorageData({ storages: ['cachestorage', 'serviceworkers'] })
    res.json({ ok: true, freedBytes })
  } catch (err) {
    res.status(500).json({ error: `清除失败：${err instanceof Error ? err.message : String(err)}` })
  }
})

// Save settings. apiKey may be omitted/empty to keep the existing one;
// send a falsy "clear" marker to delete it.
settingsRouter.put('/settings', (req, res) => {
  const body = req.body as Partial<AppSettings> & {
    apiKey?: string | null
    clearApiKey?: boolean
    condaPath?: string
  }

  if (body.defaultEngine) {
    const engine: SessionEngine = body.defaultEngine === 'api' ? 'api' : 'cli'
    setSetting('defaultEngine', engine)
  }
  if (typeof body.apiKey === 'string' && body.apiKey.trim()) {
    setSetting('apiKey', body.apiKey.trim())
  } else if (body.clearApiKey) {
    setSetting('apiKey', '')
  }
  if (typeof body.model === 'string' && body.model.trim()) {
    setSetting('model', body.model.trim())
  }
  if (typeof body.baseUrl === 'string' && body.baseUrl.trim()) {
    setSetting('baseUrl', body.baseUrl.trim())
  }
  if (body.effort === 'low' || body.effort === 'medium' || body.effort === 'high' || body.effort === 'max') {
    setSetting('effort', body.effort)
  }
  if (pythonEnvInputGuard(body.pythonEnv)) {
    setSetting('pythonEnv', body.pythonEnv)
  }
  if (typeof body.condaPath === 'string') {
    const current = getAppSettings().pythonEnv
    setSetting('pythonEnv', { ...current, condaPath: body.condaPath.trim() || undefined })
  }
  if (typeof body.skillsPath === 'string' && body.skillsPath.trim()) {
    setSetting('skillsPath', body.skillsPath.trim())
  }
  if (typeof body.cliTrustedMode === 'boolean') {
    setSetting('cliTrustedMode', body.cliTrustedMode)
  }
  // 内容偏好与昵称（推荐页内嵌编辑器保存走这里；个性化页则走 /settings/personalization）
  if (Array.isArray(body.recKeywords)) {
    setSetting('recKeywords', body.recKeywords.map(String))
  }
  if (Array.isArray(body.recCategories)) {
    setSetting('recCategories', body.recCategories.map(String))
  }
  if (Array.isArray(body.rssFeeds)) {
    setSetting('rssFeeds', body.rssFeeds.map(String))
  }
  if (typeof body.username === 'string' && body.username.trim()) {
    setSetting('username', body.username.trim())
  }

  res.json(getAppSettings())
})
