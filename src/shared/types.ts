// Shared type definitions used by main/server, preload and renderer.

export type ProjectStatus = 'active' | 'archived'
export type TaskStatus = 'todo' | 'in_progress' | 'done'
export type TaskKind = 'chat' | 'sandbox' | 'form'

// Form-driven task schema: each form task type defines its input fields.
export interface TaskFormField {
  key: string
  label: string
  type: 'text' | 'textarea' | 'select'
  options?: string[]
  required?: boolean
  placeholder?: string
  description?: string
}
export type SessionStatus = 'idle' | 'running' | 'done' | 'error'
export type SessionEngine = 'cli' | 'api'
export type MessageRole = 'user' | 'assistant'

export interface ToolUse {
  name: string
  input: unknown
}

export interface Project {
  id: string
  name: string
  type: string
  description: string
  mainPrompt: string
  sandboxPath: string | null
  status: ProjectStatus
  taskCount: number
  taskDone: number
  createdAt: string
  updatedAt: string
}

export interface Task {
  id: string
  projectId: string
  name: string
  type: string
  prompt: string
  skill: string | null // ARS skill override (e.g. 'academic-paper:lit-review')
  status: TaskStatus
  position: number
  createdAt: string
  updatedAt: string
}

export interface Session {
  id: string
  projectId: string
  taskId: string | null
  claudeSessionId: string | null
  engine: SessionEngine
  title: string
  model: string
  status: SessionStatus
  cost: number // USD accumulated
  createdAt: string
  updatedAt: string
}

export interface ProjectStats {
  totalCost: number
}

export interface Message {
  id: string
  sessionId: string
  role: MessageRole
  content: string
  toolUses: ToolUse[]
  createdAt: string
}

export interface Library {
  id: string
  projectId: string | null // null => global library
  name: string
  path: string
  description: string
  createdAt: string
}

export interface FileEntry {
  name: string
  path: string // path relative to the sandbox/library root
  type: 'file' | 'dir'
  size: number
  modifiedAt: string
}

export interface FileTreeNode {
  name: string
  path: string
  type: 'file' | 'dir'
  size?: number
  children?: FileTreeNode[]
}

export interface RunResult {
  exitCode: number | null
  stdout: string
  stderr: string
  timedOut: boolean
  command: string
}

export interface TaskTemplate {
  type: string
  label: string
  prompt: string
}

export interface ProjectTypeTemplate {
  type: string
  label: string
  description: string
  defaultTasks: TaskTemplate[]
}

export interface CreateProjectInput {
  name: string
  type: string
  description?: string
  mainPrompt?: string
  sandboxPath?: string // user-chosen folder; required for new projects
}

export interface CreateTaskInput {
  name: string
  type?: string
  prompt?: string
  skill?: string | null
}

export interface CreateSessionInput {
  title?: string
  taskId?: string | null
  engine?: SessionEngine
}

export interface CreateLibraryInput {
  projectId?: string | null
  name: string
  path: string
  description?: string
}

export interface Literature {
  id: string
  projectId: string | null // null = global library
  title: string
  authors: string[] // display names
  year: number | null
  venue: string
  doi: string
  url: string
  abstract: string
  notes: string
  createdAt: string
  updatedAt: string
}

export interface ClaudeStatus {
  cliAvailable: boolean
  cliVersion: string | null
  model: string | null
  apiKeyConfigured: boolean
  baseUrl: string | null
}

export type Theme = 'dark' | 'light'

export interface PythonEnv {
  type: 'conda' | 'uv' | 'system' | null
  value: string // conda env name / uv args / system: absolute python.exe path (empty = PATH python)
  condaPath?: string // manual conda executable path (when not auto-detected)
}

export type EffortLevel = 'low' | 'medium' | 'high' | 'max'

export type AccentColor = 'blue' | 'green' | 'purple' | 'orange' | 'custom'

export interface AppSettings {
  defaultEngine: SessionEngine
  apiKeyMasked: string | null // e.g. "sk-…abcd", null when unset
  model: string // empty = inherit cc-switch (CLI) / default (API)
  baseUrl: string
  theme: Theme
  accent: AccentColor
  customAccent: string // hex color when accent === 'custom'
  pythonEnv: PythonEnv
  effort: EffortLevel
  skillsPath: string
  username: string
  rssFeeds: string[]
  recKeywords: string[]
  recCategories: string[] // arXiv 分类（如 cs.CV, cs.LG），空 = 不限
}
