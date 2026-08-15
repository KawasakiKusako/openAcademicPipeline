import type {
  ApiProvider,
  AppSettings,
  ClaudeStatus,
  SlideDetail,
  CreateProjectInput,
  EffortLevel,
  FileTreeNode,
  Literature,
  PythonEnv,
  RunResult,
  TaskKind,
  CreateSessionInput,
  CreateTaskInput,
  FileEntry,
  Library,
  Message,
  PersonalizationField,
  Project,
  ProjectTypeTemplate,
  Session,
  Task,
  TaskTemplate,
  ToolUse
} from '@shared/types'

const BASE = 'http://127.0.0.1:11455/api'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init
  })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error((body as { error?: string } | null)?.error ?? `请求失败 (${res.status})`)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export const api = {
  health: () => request<{ ok: boolean }>('/health'),

  projectTypes: () => request<ProjectTypeTemplate[]>('/project-types'),
  projects: () => request<Project[]>('/projects'),
  project: (id: string) => request<Project>(`/projects/${id}`),
  createProject: (input: CreateProjectInput) =>
    request<Project>('/projects', { method: 'POST', body: JSON.stringify(input) }),
  updateProject: (id: string, input: Partial<CreateProjectInput> & { status?: string }) =>
    request<Project>(`/projects/${id}`, { method: 'PUT', body: JSON.stringify(input) }),
  deleteProject: (id: string) => request<void>(`/projects/${id}`, { method: 'DELETE' }),
  exportProject: (id: string) => request<unknown>(`/projects/${id}/export`),
  importProject: (data: unknown) =>
    request<{ id: string; name: string }>('/projects/import', {
      method: 'POST',
      body: JSON.stringify(data)
    }),

  taskTypes: () =>
    request<{ type: string; label: string; description: string; kind: TaskKind }[]>(
      '/task-types'
    ),
  literature: (opts?: { q?: string; projectId?: string | null }) => {
    const params = new URLSearchParams()
    if (opts?.q) params.set('q', opts.q)
    if (opts?.projectId) params.set('projectId', opts.projectId)
    const qs = params.toString()
    return request<Literature[]>(`/literature${qs ? `?${qs}` : ''}`)
  },
  createLiterature: (input: {
    title: string
    authors?: string[] | string
    year?: number | null
    venue?: string
    doi?: string
    url?: string
    abstract?: string
    notes?: string
    projectId?: string | null
  }) => request<Literature>('/literature', { method: 'POST', body: JSON.stringify(input) }),
  updateLiterature: (id: string, input: Parameters<typeof api.createLiterature>[0]) =>
    request<Literature>(`/literature/${id}`, { method: 'PUT', body: JSON.stringify(input) }),
  deleteLiterature: (id: string) =>
    request<void>(`/literature/${id}`, { method: 'DELETE' }),
  tasks: (projectId: string) => request<Task[]>(`/projects/${projectId}/tasks`),
  task: (id: string) => request<Task>(`/tasks/${id}`),
  createTask: (projectId: string, input: CreateTaskInput) =>
    request<Task>(`/projects/${projectId}/tasks`, { method: 'POST', body: JSON.stringify(input) }),
  updateTask: (id: string, input: Partial<CreateTaskInput> & { status?: string; position?: number }) =>
    request<Task>(`/tasks/${id}`, { method: 'PUT', body: JSON.stringify(input) }),
  deleteTask: (id: string) => request<void>(`/tasks/${id}`, { method: 'DELETE' }),

  sessions: (projectId: string) => request<Session[]>(`/projects/${projectId}/sessions`),
  session: (id: string) => request<Session>(`/sessions/${id}`),
  createSession: (projectId: string, input: CreateSessionInput) =>
    request<Session>(`/projects/${projectId}/sessions`, {
      method: 'POST',
      body: JSON.stringify(input)
    }),
  claudeStatus: () => request<ClaudeStatus>('/claude/status'),
  claudeTest: () =>
    request<{ ok: boolean; latencyMs: number; detail: string }>('/claude/test', {
      method: 'POST'
    }),
  chatIdea: (text: string) =>
    request<{ suggestion: { name: string; type: string; description: string } | null }>(
      '/chat-idea',
      { method: 'POST', body: JSON.stringify({ text }) }
    ),
  projectStats: (projectId: string) => request<{ totalCost: number }>(`/projects/${projectId}/stats`),
  ccSwitchProviders: () =>
    request<{ id: string; name: string; model: string; baseUrl: string; isCurrent: boolean }[]>(
      '/cc-switch/providers'
    ),
  envs: () =>
    request<{
      conda: { available: boolean; envs: { name: string; path: string }[] }
      uv: { available: boolean }
      python: string | null
    }>('/envs'),
  fullCondaScan: () =>
    request<{ found: string | null; envs: { name: string; path: string }[] }>('/envs/full-scan', {
      method: 'POST'
    }),
  checkUpdate: () =>
    request<{
      current: string
      latest: string | null
      updateAvailable: boolean
      updateType: string
      updateLog: string[]
      downloadUrl: string | null
      incrementalUrl: string | null
      standbySite: string | null
      officialWebsite: string | null
      fallbackPages: string[]
    }>('/update-check'),
  officePreview: (
    path: string,
    opts?: { projectId?: string; detailed?: boolean }
  ) =>
    request<{
      type: 'pptx' | 'docx' | 'xlsx'
      name: string
      slides?: string[][] | SlideDetail[]
      html?: string
      sheets?: { name: string; rows: string[][] }[]
      detailed?: boolean
    }>('/office/preview', {
      method: 'POST',
      body: JSON.stringify({ path, projectId: opts?.projectId, detailed: opts?.detailed })
    }),
  // 沙盒内文件 → 绝对路径（webview 预览等场景）
  fileAbsPath: (projectId: string, path: string) =>
    request<{ abs: string }>(`/projects/${projectId}/file/abs`, {
      method: 'POST',
      body: JSON.stringify({ path })
    }),
  clearCache: () =>
    request<{ ok: boolean; freedBytes: number }>('/settings/clear-cache', { method: 'POST' }),
  renderStatus: () =>
    request<{ powerpoint: boolean; libreoffice: boolean }>('/office/render-status'),
  convertToPdf: (path: string, projectId?: string) =>
    request<{ pdfPath: string }>('/office/convert-pdf', {
      method: 'POST',
      body: JSON.stringify({ path, projectId })
    }),
  openExternal: (projectId: string, path: string) =>
    request<{ ok: boolean }>(`/projects/${projectId}/open-external`, {
      method: 'POST',
      body: JSON.stringify({ path })
    }),
  recommendations: (projectId?: string) =>
    request<{
      keywords: string[]
      items: { title: string; link: string; summary: string; source: string; published: string }[]
    }>(`/recommendations${projectId ? `?projectId=${projectId}` : ''}`),
  arsSkills: () => request<Record<string, ArsSkillEntry>>('/ars-skills'),
  skills: () => request<{ path: string; skills: { name: string; description: string }[] }>('/skills'),
  skillsMarket: (repo: string) =>
    request<{
      repo: string
      branch: string
      repoDescription: string
      skills: { name: string; description: string; repo: string; path: string; files: string[] }[]
    }>(`/skills/market?repo=${encodeURIComponent(repo)}`),
  installSkill: (input: { repo: string; path: string; name: string; branch: string }) =>
    request<{ ok: boolean; name: string; files: number }>('/skills/install', {
      method: 'POST',
      body: JSON.stringify(input)
    }),
  deleteSkill: (name: string) => request<void>(`/skills/${encodeURIComponent(name)}`, { method: 'DELETE' }),
  deploySkill: (input: { name: string; target: string }) =>
    request<{ ok: boolean; dest: string }>('/skills/deploy', { method: 'POST', body: JSON.stringify(input) }),
  apiEnabledSkills: () => request<{ enabled: string[] }>('/skills/api-enabled'),
  setApiEnabledSkills: (enabled: string[]) =>
    request<{ ok: boolean }>('/skills/api-enabled', { method: 'PUT', body: JSON.stringify({ enabled }) }),
  apiProviders: () =>
    request<{ providers: ApiProvider[]; activeId: string; templates: ApiProvider[] }>('/api-providers'),
  saveApiProvider: (input: {
    id?: string
    name: string
    type: 'anthropic' | 'openai'
    baseUrl: string
    apiKey?: string
    model: string
    note?: string
  }) => request<{ ok: boolean; id: string }>('/api-providers', { method: 'POST', body: JSON.stringify(input) }),
  importApiProvider: (templateId: string) =>
    request<{ ok: boolean; id: string; already?: boolean }>('/api-providers/import', {
      method: 'POST',
      body: JSON.stringify({ templateId })
    }),
  activateApiProvider: (id: string) =>
    request<{ ok: boolean }>('/api-providers/activate', { method: 'POST', body: JSON.stringify({ id }) }),
  deleteApiProvider: (id: string) => request<void>(`/api-providers/${id}`, { method: 'DELETE' }),
  detectTools: () =>
    request<{
      found: Record<string, string | null>
      installed: Record<string, boolean>
      skillDirs: Record<string, string | null>
      agents: { id: string; label: string }[]
    }>('/api-providers/detect-tools', { method: 'POST' }),
  importCcSwitch: () =>
    request<{ ok: boolean; imported: number }>('/api-providers/import-ccswitch', { method: 'POST' }),
  exportApiProviders: () =>
    request<{ version: number; exportedAt: string; activeId: string; providers: ApiProvider[] }>(
      '/api-providers/export'
    ),
  importApiProviders: (data: { providers: ApiProvider[]; activeId?: string }) =>
    request<{ ok: boolean; imported: number }>('/api-providers/import', {
      method: 'POST',
      body: JSON.stringify(data)
    }),
  testApiProvider: (id: string) =>
    request<{ ok: boolean; latencyMs: number; detail: string }>('/api-providers/test', {
      method: 'POST',
      body: JSON.stringify({ id })
    }),
  arsStatus: () =>
    request<{
      installed: boolean
      meta: { version: string; source: string; installedAt: string; skills: string[] } | null
      availableSource: { version: string } | null
      cacheFound: boolean
      remote: string | null
    }>('/ars/status'),
  arsInstall: () =>
    request<{ ok: boolean; version: string; source: string; skills: string[] }>('/ars/install', {
      method: 'POST'
    }),
  arsUpdate: () =>
    request<{ ok: boolean; updated: boolean; version: string; message?: string }>('/ars/update', {
      method: 'POST'
    }),
  arsDeploy: (target: string) =>
    request<{ ok: boolean; dest: string }>('/ars/deploy', { method: 'POST', body: JSON.stringify({ target }) }),
  arsInstallPpt: () =>
    request<{ ok: boolean; repo: string; branch: string; files: number; hasSkillMd: boolean }>(
      '/ars/install-ppt',
      { method: 'POST' }
    ),
  settings: () => request<AppSettings>('/settings'),
  updateSettings: (input: {
    defaultEngine?: 'cli' | 'api'
    apiKey?: string
    clearApiKey?: boolean
    model?: string
    baseUrl?: string
    pythonEnv?: PythonEnv
    effort?: EffortLevel
    skillsPath?: string
  }) =>
    request<AppSettings>('/settings', { method: 'PUT', body: JSON.stringify(input) }),
  // 个性化设置：schema 驱动的通用接口
  personalization: () =>
    request<{ fields: PersonalizationField[]; values: Record<string, unknown> }>(
      '/settings/personalization'
    ),
  updatePersonalization: (values: Record<string, unknown>) =>
    request<{ values: Record<string, unknown> }>('/settings/personalization', {
      method: 'PUT',
      body: JSON.stringify({ values })
    }),
  reloadPersonalization: () =>
    request<{ count: number; removed: number; total: number }>('/settings/personalization/reload', {
      method: 'POST'
    }),
  // 自定义样式（DATA_ROOT/custom-style/style.css）
  styleStatus: () =>
    request<{
      enabled: boolean
      exists: boolean
      mtime: number
      cssPath: string
      backupDir: string
      exportDir: string
    }>('/style/status'),
  styleCss: () => request<{ content: string }>('/style/css'),
  saveStyleCss: (content: string) =>
    request<{ ok: boolean }>('/style/css', { method: 'PUT', body: JSON.stringify({ content }) }),
  setStyleEnabled: (enabled: boolean) =>
    request<{ ok: boolean; enabled: boolean }>('/style/enable', {
      method: 'PUT',
      body: JSON.stringify({ enabled })
    }),
  resetStyle: () => request<{ ok: boolean }>('/style/reset', { method: 'POST' }),
  backupStyle: () => request<{ ok: boolean; path: string }>('/style/backup', { method: 'POST' }),
  exportStyle: () => request<{ ok: boolean; path: string }>('/style/export', { method: 'POST' }),
  sessionMessages: (sessionId: string) => request<Message[]>(`/sessions/${sessionId}/messages`),
  deleteSession: (id: string) => request<void>(`/sessions/${id}`, { method: 'DELETE' }),
  stopSession: (id: string) =>
    request<{ ok: boolean; stopped: boolean }>(`/sessions/${id}/stop`, { method: 'POST' }),

  libraries: (projectId?: string) =>
    request<Library[]>(`/libraries${projectId ? `?projectId=${projectId}` : ''}`),
  createLibrary: (input: { projectId?: string | null; name: string; path: string; description?: string }) =>
    request<Library>('/libraries', { method: 'POST', body: JSON.stringify(input) }),
  deleteLibrary: (id: string) => request<void>(`/libraries/${id}`, { method: 'DELETE' }),
  libraryEntries: (id: string, path?: string) =>
    request<FileEntry[]>(`/libraries/${id}/entries${path ? `?path=${encodeURIComponent(path)}` : ''}`),
  libraryTree: (id: string) => request<FileTreeNode[]>(`/libraries/${id}/tree`),
  libraryFile: (id: string, path: string) =>
    request<{ content: string }>(`/libraries/${id}/file?path=${encodeURIComponent(path)}`),
  libraryWrite: (id: string, path: string, content: string) =>
    request<void>(`/libraries/${id}/file?path=${encodeURIComponent(path)}`, {
      method: 'PUT',
      body: JSON.stringify({ content })
    }),
  scratch: (projectId?: string | null) =>
    request<{ id: string; content: string; summary: string; projectId: string | null; createdAt: string }[]>(
      `/scratch${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`
    ),
  createScratch: (input: { content: string; summary?: string; projectId?: string | null }) =>
    request<{ id: string }>('/scratch', { method: 'POST', body: JSON.stringify(input) }),
  updateScratch: (id: string, input: { content?: string; summary?: string }) =>
    request<{ id: string; content: string; summary: string; createdAt: string }>(`/scratch/${id}`, {
      method: 'PUT',
      body: JSON.stringify(input)
    }),
  deleteScratch: (id: string) => request<void>(`/scratch/${id}`, { method: 'DELETE' }),
  importLiterature: (input: { text: string; format?: string; projectId?: string | null }) =>
    request<{ inserted: number; skipped: number; total: number }>('/literature/import', {
      method: 'POST',
      body: JSON.stringify(input)
    }),

  files: (projectId: string, path?: string) =>
    request<FileEntry[]>(`/projects/${projectId}/files${path ? `?path=${encodeURIComponent(path)}` : ''}`),
  tree: (projectId: string) => request<FileTreeNode[]>(`/projects/${projectId}/tree`),
  runScript: (taskId: string, filePath: string) =>
    request<RunResult>(`/tasks/${taskId}/run`, {
      method: 'POST',
      body: JSON.stringify({ filePath })
    }),
  runProjectScript: (projectId: string, filePath: string) =>
    request<RunResult>(`/projects/${projectId}/run`, {
      method: 'POST',
      body: JSON.stringify({ filePath })
    }),
  renameFile: (projectId: string, from: string, to: string) =>
    request<void>(`/projects/${projectId}/rename`, {
      method: 'PUT',
      body: JSON.stringify({ from, to })
    }),
  copyFile: (projectId: string, from: string, to: string) =>
    request<void>(`/projects/${projectId}/copy`, {
      method: 'POST',
      body: JSON.stringify({ from, to })
    }),
  readFile: (projectId: string, path: string) =>
    request<{ content: string }>(
      `/projects/${projectId}/file?path=${encodeURIComponent(path)}`
    ),
  writeFile: (projectId: string, path: string, content: string) =>
    request<void>(`/projects/${projectId}/file?path=${encodeURIComponent(path)}`, {
      method: 'PUT',
      body: JSON.stringify({ content })
    }),
  createDir: (projectId: string, path: string) =>
    request<void>(`/projects/${projectId}/dirs?path=${encodeURIComponent(path)}`, {
      method: 'POST'
    }),
  deleteFile: (projectId: string, path: string) =>
    request<void>(`/projects/${projectId}/file?path=${encodeURIComponent(path)}`, {
      method: 'DELETE'
    })
}

// ---- streaming chat (SSE over fetch) ----

export interface ChatHandlers {
  onText: (delta: string) => void
  onToolUse?: (tool: ToolUse) => void
  onDone: () => void
  onError: (message: string) => void
  onIncomplete?: () => void
}

// POST /api/sessions/:id/chat, parsing the SSE event stream.
// Pass an AbortController signal to stop the running generation.
export async function sendChat(
  sessionId: string,
  content: string,
  handlers: ChatHandlers,
  signal?: AbortSignal
): Promise<void> {
  const res = await fetch(`${BASE}/sessions/${sessionId}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
    signal
  })
  if (!res.ok || !res.body) {
    const body = await res.json().catch(() => null)
    throw new Error((body as { error?: string } | null)?.error ?? `请求失败 (${res.status})`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let sawTerminal = false

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    buffer = buffer.replace(/\r\n/g, '\n') // 防 CRLF 导致事件分隔符失配
    let sep: number
    while ((sep = buffer.indexOf('\n\n')) >= 0) {
      const rawEvent = buffer.slice(0, sep)
      buffer = buffer.slice(sep + 2)
      let event = 'message'
      const dataLines: string[] = []
      for (const line of rawEvent.split('\n')) {
        const trimmed = line.trim()
        if (trimmed.startsWith('event:')) event = trimmed.slice(6).trim()
        if (trimmed.startsWith('data:')) dataLines.push(trimmed.slice(5).trim())
      }
      const data = dataLines.join('\n')
      if (!data) continue
      let json: Record<string, unknown>
      try {
        json = JSON.parse(data) as Record<string, unknown>
      } catch {
        continue
      }
      switch (event) {
        case 'text':
          handlers.onText(String(json.delta ?? ''))
          break
        case 'tool_use':
          handlers.onToolUse?.(json as unknown as ToolUse)
          break
        case 'done':
          sawTerminal = true
          handlers.onDone()
          break
        case 'error':
          sawTerminal = true
          handlers.onError(String(json.message ?? '未知错误'))
          break
      }
    }
  }

  // 流在 done/error 之前静默结束（后端异常断开/重启）：
  // 通知消费方刷新状态，否则界面会一直停留在"运行中"。
  if (!sawTerminal) {
    handlers.onIncomplete?.()
  }
}

// direct URL for binary file preview (images/video/audio/pdf)
export function rawFileUrl(projectId: string, path: string): string {
  return `${BASE}/projects/${projectId}/file/raw?path=${encodeURIComponent(path)}`
}

export interface ArsSkillEntry {
  skill: string
  mode: string
  label: string
  hint: string
}

export type { TaskTemplate }
