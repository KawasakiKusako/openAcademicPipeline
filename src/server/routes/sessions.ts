import { Router } from 'express'
import { getDb, mapMessage, mapSession, newId, now } from '../db'
import { getSetting } from '../settings'
import type { CreateSessionInput, SessionEngine } from '../../shared/types'

export const sessionsRouter = Router()

sessionsRouter.get('/projects/:projectId/sessions', (req, res) => {
  const rows = getDb()
    .prepare('SELECT * FROM sessions WHERE project_id = ? ORDER BY updated_at DESC')
    .all(req.params.projectId)
  res.json(rows.map(mapSession))
})

sessionsRouter.post('/projects/:projectId/sessions', (req, res) => {
  const { projectId } = req.params
  const input = req.body as Partial<CreateSessionInput>
  const db = getDb()
  if (!db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId)) {
    res.status(404).json({ error: '项目不存在' })
    return
  }
  // Sessions can be attached to a task (task -> session handover)
  const taskId = input.taskId ?? null
  if (taskId) {
    const task = db.prepare('SELECT id FROM tasks WHERE id = ? AND project_id = ?').get(taskId, projectId)
    if (!task) {
      res.status(400).json({ error: '任务不属于该项目' })
      return
    }
  }

  const ts = now()
  const id = newId()
  const engine: SessionEngine =
    input.engine ?? getSetting<SessionEngine>('defaultEngine', 'cli')
  db.prepare(
    `INSERT INTO sessions (id, project_id, task_id, engine, title, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'idle', ?, ?)`
  ).run(id, projectId, taskId, engine, input.title?.trim() || '新会话', ts, ts)

  res.status(201).json(
    mapSession(db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as Record<string, unknown>)
  )
})

sessionsRouter.get('/sessions/:id', (req, res) => {
  const row = getDb().prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.id)
  if (!row) {
    res.status(404).json({ error: '会话不存在' })
    return
  }
  res.json(mapSession(row as Record<string, unknown>))
})

sessionsRouter.get('/sessions/:id/messages', (req, res) => {
  const db = getDb()
  if (!db.prepare('SELECT id FROM sessions WHERE id = ?').get(req.params.id)) {
    res.status(404).json({ error: '会话不存在' })
    return
  }
  const rows = db
    .prepare('SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC')
    .all(req.params.id)
  res.json(rows.map(mapMessage))
})

sessionsRouter.delete('/sessions/:id', (req, res) => {
  const result = getDb().prepare('DELETE FROM sessions WHERE id = ?').run(req.params.id)
  if (result.changes === 0) {
    res.status(404).json({ error: '会话不存在' })
    return
  }
  res.status(204).end()
})
