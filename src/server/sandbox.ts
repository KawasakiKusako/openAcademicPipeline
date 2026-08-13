import { mkdirSync, writeFileSync } from 'node:fs'
import { isAbsolute, join, resolve, sep } from 'node:path'
import { SANDBOXES_ROOT } from './paths'
import { getDb } from './db'
import { buildMainPrompt, getProjectType } from './project-templates'
import type { Project } from '../shared/types'

export const SANDBOX_SUBDIRS = ['resources', 'data', 'drafts', 'notes'] as const

export function projectSandboxRoot(projectId: string): string {
  return join(SANDBOXES_ROOT, projectId)
}

// Create the sandbox directory structure and the CLAUDE.md main-prompt file.
// The sandbox is the working directory Claude Code sessions run in; CLAUDE.md
// is auto-loaded by `claude` when launched there — this is how a project
// "links" to Claude Code. rootOverride: the user-chosen folder for the project
// (required at creation); falls back to the managed sandboxes dir.
export function initProjectSandbox(project: Project, rootOverride?: string): string {
  const root = rootOverride && isAbsolute(rootOverride) ? rootOverride : projectSandboxRoot(project.id)
  for (const sub of SANDBOX_SUBDIRS) {
    mkdirSync(join(root, sub), { recursive: true })
  }
  writeMainPrompt(project, root)
  return root
}

export function writeMainPrompt(project: Project, rootOverride?: string): void {
  // Prefer the recorded sandbox path (user-chosen folder), then the override,
  // then the managed default.
  const recorded =
    project.sandboxPath && isAbsolute(project.sandboxPath) ? project.sandboxPath : null
  const root = recorded ?? (rootOverride && isAbsolute(rootOverride) ? rootOverride : projectSandboxRoot(project.id))
  const type = getProjectType(project.type)
  const content = buildMainPrompt(
    project.name,
    type?.label ?? project.type,
    project.description,
    project.mainPrompt
  )
  writeFileSync(join(root, 'CLAUDE.md'), content, 'utf-8')
}

// Resolve a project-relative path, refusing to escape the project's sandbox
// root (the user-chosen folder recorded at creation).
export function resolveInSandbox(projectId: string, relPath: string): string {
  const row = getDb().prepare('SELECT sandbox_path FROM projects WHERE id = ?').get(projectId) as
    | { sandbox_path: string | null }
    | undefined
  if (!row) throw new Error('项目不存在')
  const root = resolve(row.sandbox_path && isAbsolute(row.sandbox_path) ? row.sandbox_path : projectSandboxRoot(projectId))
  const target = resolve(root, relPath || '.')
  if (target !== root && !target.startsWith(root + sep)) {
    throw new Error('路径超出项目沙盒范围')
  }
  return target
}
