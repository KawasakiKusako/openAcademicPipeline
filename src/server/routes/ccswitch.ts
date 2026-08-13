import { Router } from 'express'
import { DatabaseSync } from 'node:sqlite'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { existsSync, copyFileSync, readFileSync } from 'node:fs'

export const ccswitchRouter = Router()

const CC_SWITCH_DB = join(homedir(), '.cc-switch', 'cc-switch.db')

export interface ModelEntry {
  id: string
  name: string // provider 名（或 'CLI 当前' / 'CLI 模型'）
  model: string // 单个模型名
  baseUrl: string
  isCurrent: boolean
}

// 读取 cc-switch 数据库（复制到临时文件避免锁冲突），
// 提取每个 provider 的全部模型家族（与 `claude /model` 一致）：
// ANTHROPIC_MODEL + DEFAULT_{FABLE,OPUS,SONNET,HAIKU}_MODEL + SUBAGENT_MODEL + 顶层 model。
ccswitchRouter.get('/cc-switch/providers', (_req, res) => {
  const entries: ModelEntry[] = []
  const seen = new Set<string>()

  const push = (name: string, model: string, baseUrl: string, isCurrent: boolean): void => {
    if (!model || seen.has(model)) return
    seen.add(model)
    entries.push({ id: `${name}-${model}`, name, model, baseUrl, isCurrent })
  }

  if (existsSync(CC_SWITCH_DB)) {
    try {
      const tmp = join(tmpdir(), `cc-switch-${Date.now()}.db`)
      copyFileSync(CC_SWITCH_DB, tmp)
      const db = new DatabaseSync(tmp, { readOnly: true })
      const rows = db
        .prepare(
          `SELECT id, name, settings_config, is_current FROM providers
           WHERE app_type = 'claude' ORDER BY sort_index`
        )
        .all() as { name: unknown; settings_config: unknown; is_current: unknown }[]
      db.close()

      const modelKeys = [
        'ANTHROPIC_DEFAULT_FABLE_MODEL',
        'ANTHROPIC_DEFAULT_OPUS_MODEL',
        'ANTHROPIC_DEFAULT_SONNET_MODEL',
        'ANTHROPIC_DEFAULT_HAIKU_MODEL',
        'CLAUDE_CODE_SUBAGENT_MODEL'
      ]

      for (const r of rows) {
        let cfg: Record<string, unknown> = {}
        try {
          cfg = JSON.parse(String(r.settings_config ?? '{}')) as Record<string, unknown>
        } catch {
          cfg = {}
        }
        const env = (cfg.env ?? {}) as Record<string, string>
        const name = String(r.name ?? '未命名')
        const baseUrl = String(env.ANTHROPIC_BASE_URL ?? '')
        const current = env.ANTHROPIC_MODEL ?? String(cfg.model ?? '')
        const providerIsCurrent = Boolean(r.is_current)

        // 当前生效模型优先（provider 为当前时标 isCurrent）
        if (current) {
          push(name, current, baseUrl, providerIsCurrent)
        }
        // 模型家族
        for (const key of modelKeys) {
          const m = env[key]
          if (m) push(name, m, baseUrl, false)
        }
        const top = String(cfg.model ?? '')
        if (top) push(name, top, baseUrl, false)
      }
    } catch (err) {
      console.error('[ccswitch] db read failed, falling back to settings.json:', err)
    }
  }

  // 补充 settings.json 中的当前模型与家族（cc-switch 写入 CLI 的配置）
  try {
    const settingsPath = join(homedir(), '.claude', 'settings.json')
    if (existsSync(settingsPath)) {
      const settings = JSON.parse(readFileSync(settingsPath, 'utf-8')) as {
        env?: Record<string, string>
      }
      const env = settings.env ?? {}
      const current = env.ANTHROPIC_MODEL
      if (current) {
        const already = entries.some((e) => e.model === current)
        push('CLI 当前', current, '', !already)
      }
      const familyKeys = [
        'ANTHROPIC_DEFAULT_FABLE_MODEL',
        'ANTHROPIC_DEFAULT_OPUS_MODEL',
        'ANTHROPIC_DEFAULT_SONNET_MODEL',
        'ANTHROPIC_DEFAULT_HAIKU_MODEL'
      ]
      for (const key of familyKeys) {
        const m = env[key]
        if (m) push('CLI 模型', m, '', false)
      }
    }
  } catch {
    // ignore
  }

  res.json(entries)
})