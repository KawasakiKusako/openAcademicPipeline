import type {
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
    request<{ current: string; latest: string | null; updateAvailable: boolean; downloadPages: string[] }>(
      '/update-check'
    ),
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
  skills: () => request<{ path: string; skills: { name: string }[] }>('/skills'),
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
    request<{ count: number; total: number }>('/settings/personalization/reload', {
      method: 'POST'
    }),
  sessionMessages: (sessionId: string) => request<Message[]>(`/sessions/${sessionId}/messages`),
  deleteSession: (id: string) => request<void>(`/sessions/${id}`, { method: 'DELETE' }),

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
  scratch: () =>
    request<{ id: string; content: string; summary: string; createdAt: string }[]>('/scratch'),
  createScratch: (input: { content: string; summary?: string }) =>
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

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let sep: number
    while ((sep = buffer.indexOf('\n\n')) >= 0) {
      const rawEvent = buffer.slice(0, sep)
      buffer = buffer.slice(sep + 2)
      let event = 'message'
      const dataLines: string[] = []
      for (const line of rawEvent.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim()
        if (line.startsWith('data:')) dataLines.push(line.slice(5).trim())
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
          handlers.onDone()
          break
        case 'error':
          handlers.onError(String(json.message ?? '未知错误'))
          break
      }
    }
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
