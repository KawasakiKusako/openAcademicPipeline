import { Router } from 'express'
import { getAppSettings, setSetting } from '../settings'
import type { AppSettings, PythonEnv, SessionEngine, Theme } from '../../shared/types'

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
  if (body.theme === 'dark' || body.theme === 'light') {
    setSetting('theme', body.theme as Theme)
  }
  if (body.accent === 'blue' || body.accent === 'green' || body.accent === 'purple' || body.accent === 'orange' || body.accent === 'custom') {
    setSetting('accent', body.accent)
  }
  if (typeof body.customAccent === 'string' && /^#[0-9a-fA-F]{6}$/.test(body.customAccent)) {
    setSetting('customAccent', body.customAccent)
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
  if (typeof body.username === 'string' && body.username.trim()) {
    setSetting('username', body.username.trim())
  }
  if (Array.isArray(body.rssFeeds)) {
    setSetting('rssFeeds', body.rssFeeds.map((f) => String(f).trim()).filter(Boolean))
  }
  if (Array.isArray(body.recKeywords)) {
    setSetting('recKeywords', body.recKeywords.map((k) => String(k).trim()).filter(Boolean))
  }
  if (Array.isArray(body.recCategories)) {
    setSetting('recCategories', body.recCategories.map((c) => String(c).trim()).filter(Boolean))
  }

  res.json(getAppSettings())
})
