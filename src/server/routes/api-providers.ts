import { Router } from 'express'
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { getApiProviders, setApiProviders, getActiveApiProviderId, setActiveApiProviderId } from '../settings'
import { newId } from '../db'
import type { ApiProvider } from '../../shared/types'

export const apiProvidersRouter = Router()

// 本机 AI 工具链定义（cc-switch 同款，三级检测）
const AGENTS: { id: string; label: string; configDirs: string[]; extraPaths: string[] }[] = [
  { id: 'claude', label: 'Claude Code', configDirs: ['.claude'], extraPaths: ['.local/bin/claude', '.claude/local/claude.exe'] },
  { id: 'codex', label: 'Codex CLI', configDirs: ['.codex'], extraPaths: ['.codex/bin/codex.exe'] },
  { id: 'gemini', label: 'Gemini CLI', configDirs: ['.gemini'], extraPaths: [] },
  { id: 'opencode', label: 'OpenCode', configDirs: ['.opencode'], extraPaths: [] },
  { id: 'cline', label: 'Cline', configDirs: ['.cline'], extraPaths: [] },
  { id: 'deepseek', label: 'DeepSeek Harness', configDirs: ['.deepseek'], extraPaths: [] }
]

// 一键导入模板（cc-switch 风格，兼容 OpenAI 格式的国内服务）
export const PROVIDER_TEMPLATES: ApiProvider[] = [
  {
    id: 'deepseek',
    name: 'DeepSeek',
    type: 'openai',
    baseUrl: 'https://api.deepseek.com/v1',
    apiKey: '',
    model: 'deepseek-chat',
    note: '兼容 OpenAI 格式，性价比高'
  },
  {
    id: 'moonshot',
    name: 'Kimi（月之暗面）',
    type: 'openai',
    baseUrl: 'https://api.moonshot.cn/v1',
    apiKey: '',
    model: 'moonshot-v1-8k',
    note: '长上下文'
  },
  {
    id: 'qwen',
    name: '通义千问',
    type: 'openai',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    apiKey: '',
    model: 'qwen-plus',
    note: '阿里云百炼兼容模式'
  },
  {
    id: 'zhipu',
    name: '智谱 GLM',
    type: 'openai',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    apiKey: '',
    model: 'glm-4-flash',
    note: '轻量快速'
  },
  {
    id: 'openai',
    name: 'OpenAI',
    type: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    apiKey: '',
    model: 'gpt-4o-mini',
    note: ''
  },
  {
    id: 'anthropic',
    name: 'Claude 官方',
    type: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    apiKey: '',
    model: 'claude-sonnet-5',
    note: 'Anthropic 原生格式'
  },
  {
    id: 'minimax',
    name: 'MiniMax',
    type: 'openai',
    baseUrl: 'https://api.minimax.chat/v1',
    apiKey: '',
    model: 'MiniMax-Text-01',
    note: ''
  },
  {
    id: 'stepfun',
    name: '阶跃星辰',
    type: 'openai',
    baseUrl: 'https://api.stepfun.com/v1',
    apiKey: '',
    model: 'step-2-mini',
    note: ''
  },
  {
    id: 'siliconflow',
    name: '硅基流动',
    type: 'openai',
    baseUrl: 'https://api.siliconflow.cn/v1',
    apiKey: '',
    model: 'deepseek-ai/DeepSeek-V3',
    note: '聚合平台，模型众多'
  },
  {
    id: 'doubao',
    name: '豆包（火山方舟）',
    type: 'openai',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    apiKey: '',
    model: 'doubao-seed-1-6-250615',
    note: ''
  },
  {
    id: 'yi',
    name: '零一万物',
    type: 'openai',
    baseUrl: 'https://api.lingyiwanwu.com/v1',
    apiKey: '',
    model: 'yi-lightning',
    note: ''
  }
]

// GET /api/api-providers — 全部配置 + 激活 id + 模板
apiProvidersRouter.get('/api-providers', (_req, res) => {
  res.json({
    providers: getApiProviders().map((p) => ({ ...p, apiKey: p.apiKey ? maskKey(p.apiKey) : '' })),
    activeId: getActiveApiProviderId(),
    templates: PROVIDER_TEMPLATES.map((p) => ({ ...p, apiKey: '' }))
  })
})

// POST /api/api-providers — 新增/更新（apiKey 为空字符串 = 保留原值）
apiProvidersRouter.post('/api-providers', (req, res) => {
  const body = (req.body ?? {}) as Partial<ApiProvider> & { id?: string; apiKey?: string }
  if (!body.name?.trim() || !body.baseUrl?.trim() || !body.model?.trim()) {
    res.status(400).json({ error: '名称/地址/模型不能为空' })
    return
  }
  const providers = getApiProviders()
  const now = newId()
  const id = body.id && providers.some((p) => p.id === body.id) ? body.id : now
  const existing = providers.find((p) => p.id === id)
  const next: ApiProvider = {
    id,
    name: body.name.trim(),
    type: body.type === 'openai' ? 'openai' : 'anthropic',
    baseUrl: body.baseUrl.trim().replace(/\/$/, ''),
    apiKey:
      body.apiKey && body.apiKey.trim()
        ? body.apiKey.trim()
        : body.apiKey === ''
          ? (existing?.apiKey ?? '')
          : (existing?.apiKey ?? ''),
    model: body.model.trim(),
    note: typeof body.note === 'string' ? body.note : existing?.note
  }
  const list = existing ? providers.map((p) => (p.id === id ? next : p)) : [...providers, next]
  setApiProviders(list)
  if (!getActiveApiProviderId()) setActiveApiProviderId(id)
  res.json({ ok: true, id })
})

// POST /api/api-providers/import — 一键导入模板（同 cc-switch 风格）
apiProvidersRouter.post('/api-providers/import', (req, res) => {
  const templateId = String(req.body?.templateId ?? '')
  const template = PROVIDER_TEMPLATES.find((t) => t.id === templateId)
  if (!template) {
    res.status(400).json({ error: '模板不存在' })
    return
  }
  const providers = getApiProviders()
  if (providers.some((p) => p.id === template.id)) {
    // 已存在：直接激活
    setActiveApiProviderId(template.id)
    res.json({ ok: true, id: template.id, already: true })
    return
  }
  const id = template.id
  setApiProviders([...providers, { ...template, id }])
  setActiveApiProviderId(id)
  res.json({ ok: true, id })
})

// POST /api/api-providers/activate — 切换激活配置
apiProvidersRouter.post('/api-providers/activate', (req, res) => {
  const id = String(req.body?.id ?? '')
  if (!getApiProviders().some((p) => p.id === id)) {
    res.status(404).json({ error: '配置不存在' })
    return
  }
  setActiveApiProviderId(id)
  res.json({ ok: true })
})

// DELETE /api/api-providers/:id
apiProvidersRouter.delete('/api-providers/:id', (req, res) => {
  const id = req.params.id
  let providers = getApiProviders()
  if (!providers.some((p) => p.id === id)) {
    res.status(404).json({ error: '配置不存在' })
    return
  }
  providers = providers.filter((p) => p.id !== id)
  setApiProviders(providers)
  if (getActiveApiProviderId() === id) {
    setActiveApiProviderId(providers[0]?.id ?? '')
  }
  res.status(204).end()
})

// POST /api/api-providers/detect-tools — 三级检测本机 AI 工具链（cc-switch 同款清单）
apiProvidersRouter.post('/api-providers/detect-tools', (_req, res) => {
  const home = homedir()
  const which = (name: string): string | null => {
    try {
      const out = execFileSync('where', [name], { timeout: 5000, windowsHide: true })
      return String(out).trim().split(/\r?\n/)[0] || null
    } catch {
      return null
    }
  }
  const found: Record<string, string | null> = {}
  const installed: Record<string, boolean> = {}
  const skillDirs: Record<string, string | null> = {}
  for (const agent of AGENTS) {
    // ① PATH 命令
    let path = which(agent.id)
    // ② 配置目录存在（有配置即视为已安装/曾使用）
    const hasConfig = agent.configDirs.some((d) => existsSync(join(home, d)))
    // ③ 常见安装路径
    if (!path) {
      path =
        agent.extraPaths
          .map((p) => join(home, p))
          .find((p) => existsSync(p)) ?? null
    }
    found[agent.id] = path
    installed[agent.id] = Boolean(path) || hasConfig
    const skillsDir = join(home, `.${agent.id}`, 'skills')
    skillDirs[agent.id] = existsSync(skillsDir) ? skillsDir : null
  }
  res.json({ found, installed, skillDirs, agents: AGENTS.map((a) => ({ id: a.id, label: a.label })) })
})

// 从 cc-switch 导入 provider 配置（读 ~/.cc-switch/cc-switch.db，临时复制防锁）
apiProvidersRouter.post('/api-providers/import-ccswitch', (_req, res) => {
  const CC_SWITCH_DB = join(homedir(), '.cc-switch', 'cc-switch.db')
  if (!existsSync(CC_SWITCH_DB)) {
    res.status(404).json({ error: '未找到 cc-switch 数据库（~/.cc-switch/cc-switch.db）' })
    return
  }
  try {
    const tmp = join(tmpdir(), `cc-switch-${Date.now()}.db`)
    copyFileSync(CC_SWITCH_DB, tmp)
    const db = new DatabaseSync(tmp, { readOnly: true })
    const rows = db
      .prepare(`SELECT id, name, settings_config FROM providers WHERE app_type = 'claude'`)
      .all() as unknown as { id: string; name: string; settings_config: string }[]
    db.close()

    const providers = getApiProviders()
    let imported = 0
    for (const row of rows) {
      if (providers.some((p) => p.name === row.name)) continue
      try {
        const cfg = JSON.parse(row.settings_config) as {
          env?: Record<string, string>
          model?: string
        }
        const env = cfg.env ?? {}
        const baseUrl = (env['ANTHROPIC_BASE_URL'] ?? '').replace(/\/$/, '')
        if (!baseUrl) continue
        const apiKey = env['ANTHROPIC_AUTH_TOKEN'] ?? env['ANTHROPIC_API_KEY'] ?? ''
        const model = cfg.model ?? env['ANTHROPIC_MODEL'] ?? ''
        providers.push({
          id: newId(),
          name: row.name,
          type: /anthropic/i.test(baseUrl) ? 'anthropic' : 'openai',
          baseUrl,
          apiKey,
          model,
          note: '从 cc-switch 导入'
        })
        imported++
      } catch {
        // 跳过无法解析的配置
      }
    }
    setApiProviders(providers)
    res.json({ ok: true, imported })
  } catch (err) {
    res.status(500).json({ error: `导入失败：${err instanceof Error ? err.message : String(err)}` })
  }
})

// 导出全部 provider 配置（JSON）
apiProvidersRouter.get('/api-providers/export', (_req, res) => {
  res.json({
    version: 1,
    exportedAt: new Date().toISOString(),
    activeId: getActiveApiProviderId(),
    providers: getApiProviders()
  })
})

// 导入 provider 配置（JSON，合并去重）
apiProvidersRouter.post('/api-providers/import', (req, res) => {
  const body = (req.body ?? {}) as { providers?: ApiProvider[]; activeId?: string }
  if (!Array.isArray(body.providers)) {
    res.status(400).json({ error: '缺少 providers 数组' })
    return
  }
  const providers = getApiProviders()
  let imported = 0
  for (const p of body.providers) {
    if (!p?.name || !p?.baseUrl || !p?.model) continue
    if (providers.some((x) => x.name === p.name)) continue
    providers.push({
      id: newId(),
      name: String(p.name),
      type: p.type === 'openai' ? 'openai' : 'anthropic',
      baseUrl: String(p.baseUrl).replace(/\/$/, ''),
      apiKey: String(p.apiKey ?? ''),
      model: String(p.model),
      note: typeof p.note === 'string' ? p.note : '导入配置'
    })
    imported++
  }
  setApiProviders(providers)
  if (body.activeId) setActiveApiProviderId(body.activeId)
  res.json({ ok: true, imported })
})

// 测速：用 provider 配置发最小请求测延迟
apiProvidersRouter.post('/api-providers/test', async (req, res) => {
  const id = String(req.body?.id ?? '')
  const provider = getApiProviders().find((p) => p.id === id)
  if (!provider) {
    res.status(404).json({ error: '配置不存在' })
    return
  }
  if (!provider.apiKey?.trim()) {
    res.json({ ok: false, latencyMs: 0, detail: '未填写 API Key' })
    return
  }
  const start = Date.now()
  try {
    const baseUrl = provider.baseUrl.replace(/\/$/, '')
    const url =
      provider.type === 'openai'
        ? `${baseUrl.endsWith('/v1') ? baseUrl : baseUrl + '/v1'}/chat/completions`
        : `${baseUrl.endsWith('/v1') ? baseUrl : baseUrl + '/v1'}/messages`
    const res2 = await fetch(url, {
      method: 'POST',
      headers:
        provider.type === 'openai'
          ? { 'content-type': 'application/json', authorization: `Bearer ${provider.apiKey}` }
          : {
              'content-type': 'application/json',
              'x-api-key': provider.apiKey,
              'anthropic-version': '2023-06-01'
            },
      body: JSON.stringify(
        provider.type === 'openai'
          ? { model: provider.model, messages: [{ role: 'user', content: 'hi' }], max_tokens: 1 }
          : { model: provider.model, max_tokens: 1, messages: [{ role: 'user', content: 'hi' }] }
      ),
      signal: AbortSignal.timeout(15_000)
    })
    const latency = Date.now() - start
    if (!res2.ok) {
      const body = await res2.text().catch(() => '')
      res.json({ ok: false, latencyMs: latency, detail: `HTTP ${res2.status}：${body.slice(0, 120)}` })
      return
    }
    res.json({ ok: true, latencyMs: latency, detail: `${provider.name} 连接正常` })
  } catch (err) {
    res.json({
      ok: false,
      latencyMs: Date.now() - start,
      detail: err instanceof Error ? err.message : String(err)
    })
  }
})

function maskKey(key: string): string {
  if (key.length <= 8) return '••••••••'
  return `${key.slice(0, 4)}…${key.slice(-4)}`
}
