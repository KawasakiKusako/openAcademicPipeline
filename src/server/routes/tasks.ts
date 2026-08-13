import { Router } from 'express'
import { getDb, mapTask, newId, now } from '../db'
import { TASK_TYPES } from '../project-templates'
import type { CreateTaskInput } from '../../shared/types'

export const tasksRouter = Router()

// Catalogue of task types with their presentation kind + form schema
tasksRouter.get('/task-types', (_req, res) => {
  res.json(TASK_TYPES.map(({ type, label, description, kind, formSchema }) => ({ type, label, description, kind, formSchema })))
})

tasksRouter.get('/tasks/:id', (req, res) => {
  const row = getDb().prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id)
  if (!row) {
    res.status(404).json({ error: '任务不存在' })
    return
  }
  res.json(mapTask(row as Record<string, unknown>))
})

tasksRouter.get('/projects/:projectId/tasks', (req, res) => {
  const rows = getDb()
    .prepare('SELECT * FROM tasks WHERE project_id = ? ORDER BY position ASC, created_at ASC')
    .all(req.params.projectId)
  res.json(rows.map(mapTask))
})

tasksRouter.post('/projects/:projectId/tasks', (req, res) => {
  const { projectId } = req.params
  const input = req.body as Partial<CreateTaskInput>
  if (!input.name || !input.name.trim()) {
    res.status(400).json({ error: '任务名称必填' })
    return
  }

  const db = getDb()
  const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId)
  if (!project) {
    res.status(404).json({ error: '项目不存在' })
    return
  }

  const ts = now()
  const row = db
    .prepare('SELECT COALESCE(MAX(position), -1) AS max_pos FROM tasks WHERE project_id = ?')
    .get(projectId) as { max_pos: number }

  db.prepare(
    `INSERT INTO tasks (id, project_id, name, type, prompt, skill, status, position, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'todo', ?, ?, ?)`
  ).run(
    newId(),
    projectId,
    input.name.trim(),
    input.type || 'custom',
    input.prompt ?? '',
    input.skill ?? null,
    row.max_pos + 1,
    ts,
    ts
  )

  const created = mapTask(
    db
      .prepare('SELECT * FROM tasks WHERE project_id = ? ORDER BY position DESC LIMIT 1')
      .get(projectId) as Record<string, unknown>
  )
  res.status(201).json(created)
})

tasksRouter.put('/tasks/:id', (req, res) => {
  const db = getDb()
  const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id)
  if (!row) {
    res.status(404).json({ error: '任务不存在' })
    return
  }
  const task = mapTask(row as Record<string, unknown>)
  const body = req.body as Partial<CreateTaskInput> & { status?: string; position?: number }
  const ts = now()

  db.prepare(
    `UPDATE tasks SET name = ?, type = ?, prompt = ?, skill = ?, status = ?, position = ?, updated_at = ?
     WHERE id = ?`
  ).run(
    body.name?.trim() || task.name,
    body.type ?? task.type,
    body.prompt ?? task.prompt,
    body.skill !== undefined ? body.skill : task.skill,
    body.status ?? task.status,
    body.position ?? task.position,
    ts,
    task.id
  )
  res.json(
    mapTask(db.prepare('SELECT * FROM tasks WHERE id = ?').get(task.id) as Record<string, unknown>)
  )
})

tasksRouter.delete('/tasks/:id', (req, res) => {
  const result = getDb().prepare('DELETE FROM tasks WHERE id = ?').run(req.params.id)
  if (result.changes === 0) {
    res.status(404).json({ error: '任务不存在' })
    return
  }
  res.status(204).end()
})
