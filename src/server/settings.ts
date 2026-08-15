import { getDb } from './db'
import { join } from 'node:path'
import { homedir } from 'node:os'
import type {
  AccentColor,
  ApiProvider,
  AppSettings,
  EffortLevel,
  PythonEnv,
  SessionEngine,
  Theme
} from '../shared/types'

// Typed access to the key/value settings table. Values stored as JSON strings.

export function getSetting<T>(key: string, fallback: T): T {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined
  if (!row) return fallback
  try {
    return JSON.parse(row.value) as T
  } catch {
    return fallback
  }
}

export function setSetting(key: string, value: unknown): void {
  getDb()
    .prepare(
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    )
    .run(key, JSON.stringify(value))
}

const DEFAULTS: AppSettings = {
  defaultEngine: 'cli',
  apiKeyMasked: null,
  model: '', // empty => inherit the cc-switch model (CLI) / default (API)
  baseUrl: 'https://api.anthropic.com',
  theme: 'dark',
  pythonEnv: { type: null, value: '' },
  effort: 'high' as EffortLevel,
  skillsPath: join(homedir(), '.claude', 'skills'),
  cliTrustedMode: false,
  accent: 'blue' as AccentColor,
  customAccent: '#3794ff',
  username: '研究员',
  rssFeeds: [] as string[],
  recKeywords: [] as string[],
  recCategories: [] as string[]
}

export function getAppSettings(): AppSettings {
  return {
    defaultEngine: getSetting<SessionEngine>('defaultEngine', DEFAULTS.defaultEngine),
    apiKeyMasked: getSetting<string | null>('apiKey', null)
      ? maskKey(getSetting<string>('apiKey', ''))
      : null,
    model: getSetting<string>('model', DEFAULTS.model),
    baseUrl: getSetting<string>('baseUrl', DEFAULTS.baseUrl),
    theme: getSetting<Theme>('theme', DEFAULTS.theme),
    accent: getSetting<AccentColor>('accent', DEFAULTS.accent),
    customAccent: getSetting<string>('customAccent', DEFAULTS.customAccent),
    pythonEnv: getSetting<PythonEnv>('pythonEnv', DEFAULTS.pythonEnv),
    effort: getSetting<EffortLevel>('effort', DEFAULTS.effort),
    skillsPath: getSetting<string>('skillsPath', DEFAULTS.skillsPath),
    cliTrustedMode: getSetting<boolean>('cliTrustedMode', DEFAULTS.cliTrustedMode),
    username: getSetting<string>('username', DEFAULTS.username),
    rssFeeds: getSetting<string[]>('rssFeeds', DEFAULTS.rssFeeds),
    recKeywords: getSetting<string[]>('recKeywords', DEFAULTS.recKeywords),
    recCategories: getSetting<string[]>('recCategories', DEFAULTS.recCategories)
  }
}

export function getSkillsPath(): string {
  return getAppSettings().skillsPath
}

export function getApiKey(): string {
  return getSetting<string>('apiKey', '') || (process.env['ANTHROPIC_API_KEY'] ?? '')
}

export function getApiModel(): string {
  return getSetting<string>('model', '') || (process.env['ANTHROPIC_MODEL'] ?? 'claude-sonnet-5')
}

// ===== API Provider 配置（类 cc-switch，多配置切换） =====

export function getApiProviders(): ApiProvider[] {
  return getSetting<ApiProvider[]>('apiProviders', [])
}

export function setApiProviders(providers: ApiProvider[]): void {
  setSetting('apiProviders', providers)
}

export function getActiveApiProviderId(): string {
  return getSetting<string>('activeApiProviderId', '')
}

export function setActiveApiProviderId(id: string): void {
  setSetting('activeApiProviderId', id)
}

// 当前激活的 Provider（无则返回 null，回退到旧式 apiKey/baseUrl/model 设置）
export function getActiveApiProvider(): ApiProvider | null {
  const id = getActiveApiProviderId()
  if (!id) return null
  return getApiProviders().find((p) => p.id === id) ?? null
}

// Model override for the CLI engine: empty means "inherit cc-switch"
export function getCliModelOverride(): string {
  return getSetting<string>('model', '')
}

export function getEffort(): EffortLevel {
  return getSetting<EffortLevel>('effort', DEFAULTS.effort)
}

export function getPythonEnv(): PythonEnv {
  return getSetting<PythonEnv>('pythonEnv', DEFAULTS.pythonEnv)
}

export function getApiBaseUrl(): string {
  return getSetting<string>('baseUrl', '') || (process.env['ANTHROPIC_BASE_URL'] ?? DEFAULTS.baseUrl)
}

function maskKey(key: string): string {
  if (key.length <= 8) return '••••••••'
  return `${key.slice(0, 4)}…${key.slice(-4)}`
}
