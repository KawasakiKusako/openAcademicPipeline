import { Router } from 'express'
import { isAbsolute } from 'node:path'
import { getDb, mapLiterature, mapMessage, mapProject, mapSession, mapTask, newId, now } from '../db'
import { getProjectType, PROJECT_TYPES } from '../project-templates'
import { initProjectSandbox, projectSandboxRoot, writeMainPrompt } from '../sandbox'
import type { CreateProjectInput, Literature, Message, Project, Session, Task } from '../../shared/types'

export const projectsRouter = Router()

// List of project type templates
projectsRouter.get('/project-types', (_req, res) => {
  res.json(PROJECT_TYPES)
})

projectsRouter.get('/projects', (_req, res) => {
  const rows = getDb()
    .prepare(
      `SELECT p.*,
              (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id) AS task_count,
              (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.status = 'done') AS task_done
       FROM projects p ORDER BY p.updated_at DESC`
    )
    .all()
  res.json(rows.map(mapProject))
})

projectsRouter.post('/projects', (req, res) => {
  const input = req.body as Partial<CreateProjectInput>
  if (!input.name || !input.name.trim()) {
    res.status(400).json({ error: '项目名称必填' })
    return
  }
  const type = input.type || 'paper-research'
  const template = getProjectType(type)
  if (!template) {
    res.status(400).json({ error: `未知项目类型: ${type}` })
    return
  }
  // A user-chosen folder is required; it becomes the project sandbox
  if (!input.sandboxPath || !isAbsolute(input.sandboxPath)) {
    res.status(400).json({ error: '请选择项目文件夹（必填）' })
    return
  }

  const db = getDb()
  const id = newId()
  const ts = now()

  db.exec('BEGIN')
  try {
    db.prepare(
      `INSERT INTO projects (id, name, type, description, main_prompt, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'active', ?, ?)`
    ).run(id, input.name.trim(), type, input.description ?? '', input.mainPrompt ?? '', ts, ts)

    // Create the sandbox (the user-chosen folder) before seeding default tasks
    const project = mapProject(
      db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as Record<string, unknown>
    )
    const sandboxPath = initProjectSandbox(project, input.sandboxPath)
    db.prepare('UPDATE projects SET sandbox_path = ? WHERE id = ?').run(sandboxPath, id)

    // Seed default tasks from the type template
    const insertTask = db.prepare(
      `INSERT INTO tasks (id, project_id, name, type, prompt, status, position, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'todo', ?, ?, ?)`
    )
    template.defaultTasks.forEach((task, i) => {
      insertTask.run(newId(), id, task.label, task.type, task.prompt, i, ts, ts)
    })

    db.exec('COMMIT')
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }

  const created = mapProject(
    db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as Record<string, unknown>
  )
  res.status(201).json(created)
})

projectsRouter.get('/projects/:id', (req, res) => {
  const row = getDb().prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id)
  if (!row) {
    res.status(404).json({ error: '项目不存在' })
    return
  }
  res.json(mapProject(row as Record<string, unknown>))
})

projectsRouter.put('/projects/:id', (req, res) => {
  const db = getDb()
  const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id)
  if (!row) {
    res.status(404).json({ error: '项目不存在' })
    return
  }
  const body = req.body as Partial<CreateProjectInput> & { status?: string }
  const project = mapProject(row as Record<string, unknown>)
  const ts = now()

  db.prepare(
    `UPDATE projects
     SET name = ?, description = ?, main_prompt = ?, status = ?, updated_at = ?
     WHERE id = ?`
  ).run(
    body.name?.trim() || project.name,
    body.description ?? project.description,
    body.mainPrompt ?? project.mainPrompt,
    body.status ?? project.status,
    ts,
    project.id
  )

  // Keep the sandbox CLAUDE.md in sync with the main prompt
  const updated = mapProject(
    db.prepare('SELECT * FROM projects WHERE id = ?').get(project.id) as Record<string, unknown>
  )
  writeMainPrompt(updated)
  res.json(updated)
})

projectsRouter.delete('/projects/:id', (req, res) => {
  // Removes the DB record; the sandbox directory is intentionally kept on disk
  // to avoid accidental data loss. Delete it manually if truly unwanted.
  const result = getDb().prepare('DELETE FROM projects WHERE id = ?').run(req.params.id)
  if (result.changes === 0) {
    res.status(404).json({ error: '项目不存在' })
    return
  }
  res.status(204).end()
})

// 项目导出：元数据 + 任务 + 会话 + 消息 + 项目文献（JSON）
projectsRouter.get('/projects/:id/export', (req, res) => {
  const db = getDb()
  const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id)
  if (!row) {
    res.status(404).json({ error: '项目不存在' })
    return
  }
  const project = mapProject(row as Record<string, unknown>)
  const tasks = (db.prepare('SELECT * FROM tasks WHERE project_id = ? ORDER BY position').all(project.id) as Record<string, unknown>[]).map(mapTask)
  const sessions = (db.prepare('SELECT * FROM sessions WHERE project_id = ?').all(project.id) as Record<string, unknown>[]).map(mapSession)
  const messages = (
    db
      .prepare(
        `SELECT m.* FROM messages m JOIN sessions s ON m.session_id = s.id WHERE s.project_id = ?`
      )
      .all(project.id) as Record<string, unknown>[]
  ).map(mapMessage)
  const literature = (
    db.prepare('SELECT * FROM literature WHERE project_id = ?').all(project.id) as Record<string, unknown>[]
  ).map(mapLiterature)

  res.json({
    exportedAt: now(),
    version: 1,
    project,
    tasks,
    sessions,
    messages,
    literature
  })
})

// 项目导入：从导出的 JSON 恢复（新建项目 + 任务 + 会话 + 消息 + 文献）
projectsRouter.post('/projects/import', (req, res) => {
  const body = req.body as {
    project?: Partial<Project>
    tasks?: Partial<Task>[]
    sessions?: Partial<Session>[]
    messages?: Partial<Message>[]
    literature?: Partial<Literature>[]
  }
  if (!body.project?.name) {
    res.status(400).json({ error: '导入数据缺少项目信息' })
    return
  }
  const db = getDb()
  const projectId = newId()
  const ts = now()

  db.exec('BEGIN')
  try {
    const p = body.project
    db.prepare(
      `INSERT INTO projects (id, name, type, description, main_prompt, sandbox_path, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, NULL, 'active', ?, ?)`
    ).run(projectId, String(p.name), p.type || 'paper-research', p.description ?? '', p.mainPrompt ?? '', ts, ts)

    // 任务
    const taskIdMap = new Map<string, string>()
    for (const t of body.tasks ?? []) {
      const tid = newId()
      taskIdMap.set(t.id as string, tid)
      db.prepare(
        `INSERT INTO tasks (id, project_id, name, type, prompt, skill, status, position, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        tid,
        projectId,
        t.name ?? '任务',
        t.type ?? 'custom',
        t.prompt ?? '',
        t.skill ?? null,
        t.status ?? 'todo',
        t.position ?? 0,
        ts,
        ts
      )
    }

    // 会话 + 消息
    const sessionIdMap = new Map<string, string>()
    for (const s of body.sessions ?? []) {
      const sid = newId()
      sessionIdMap.set(s.id as string, sid)
      db.prepare(
        `INSERT INTO sessions (id, project_id, task_id, engine, title, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        sid,
        projectId,
        s.taskId ? (taskIdMap.get(s.taskId as string) ?? null) : null,
        s.engine ?? 'cli',
        s.title ?? '导入会话',
        s.status ?? 'idle',
        ts,
        ts
      )
    }
    for (const m of body.messages ?? []) {
      if (!m.sessionId) continue
      const sid = sessionIdMap.get(m.sessionId as string)
      if (!sid) continue
      db.prepare(
        `INSERT INTO messages (id, session_id, role, content, tool_uses, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(newId(), sid, m.role ?? 'user', m.content ?? '', JSON.stringify(m.toolUses ?? []), ts)
    }

    // 项目文献
    for (const l of body.literature ?? []) {
      db.prepare(
        `INSERT INTO literature (id, project_id, title, authors, year, venue, doi, url, abstract, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        newId(),
        projectId,
        l.title ?? '导入文献',
        JSON.stringify(l.authors ?? []),
        l.year ?? null,
        l.venue ?? '',
        l.doi ?? '',
        l.url ?? '',
        l.abstract ?? '',
        l.notes ?? '',
        ts,
        ts
      )
    }

    db.exec('COMMIT')
    res.status(201).json({ id: projectId, name: p.name })
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
})

// Aggregated stats for the status bar (token spend, etc.)
projectsRouter.get('/projects/:id/stats', (req, res) => {
  const row = getDb()
    .prepare(
      `SELECT COALESCE(SUM(cost), 0) AS total_cost FROM sessions WHERE project_id = ?`
    )
    .get(req.params.id) as { total_cost: number }
  res.json({ totalCost: Number(row.total_cost ?? 0) })
})

// Sandbox root path info (useful for the UI to show where files live)
projectsRouter.get('/projects/:id/sandbox', (req, res) => {
  const row = getDb().prepare('SELECT id FROM projects WHERE id = ?').get(req.params.id)
  if (!row) {
    res.status(404).json({ error: '项目不存在' })
    return
  }
  res.json({ path: projectSandboxRoot(req.params.id) })
})
