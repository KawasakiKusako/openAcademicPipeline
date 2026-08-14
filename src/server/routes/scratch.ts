import { Router } from 'express'
import { getDb, newId, now } from '../db'

export const scratchRouter = Router()

// 随记（临时对话沉淀）：知识库第三类，与文献库/笔记库并列
interface ScratchRow {
  id: string
  content: string
  summary: string
  created_at: string
}

scratchRouter.get('/scratch', (_req, res) => {
  const rows = getDb()
    .prepare('SELECT * FROM scratch_notes ORDER BY created_at DESC')
    .all() as unknown as ScratchRow[]
  res.json(
    rows.map((r) => ({
      id: r.id,
      content: r.content,
      summary: r.summary,
      createdAt: r.created_at
    }))
  )
})

scratchRouter.post('/scratch', (req, res) => {
  const content = String(req.body?.content ?? '').trim()
  if (!content) {
    res.status(400).json({ error: '内容不能为空' })
    return
  }
  const summary = String(req.body?.summary ?? '').trim() || content.slice(0, 80)
  const id = newId()
  getDb()
    .prepare('INSERT INTO scratch_notes (id, content, summary, created_at) VALUES (?, ?, ?, ?)')
    .run(id, content, summary, now())
  res.status(201).json({ id, content, summary, createdAt: now() })
})

scratchRouter.put('/scratch/:id', (req, res) => {
  const body = req.body as { content?: string; summary?: string }
  const row = getDb().prepare('SELECT * FROM scratch_notes WHERE id = ?').get(req.params.id) as
    | ScratchRow
    | undefined
  if (!row) {
    res.status(404).json({ error: '随记不存在' })
    return
  }
  const content = body.content === undefined ? row.content : String(body.content).trim()
  const summary =
    body.summary === undefined
      ? row.summary
      : String(body.summary).trim() || content.slice(0, 80)
  getDb()
    .prepare('UPDATE scratch_notes SET content = ?, summary = ? WHERE id = ?')
    .run(content, summary, req.params.id)
  res.json({ id: req.params.id, content, summary, createdAt: row.created_at })
})

scratchRouter.delete('/scratch/:id', (req, res) => {
  const result = getDb().prepare('DELETE FROM scratch_notes WHERE id = ?').run(req.params.id)
  if (result.changes === 0) {
    res.status(404).json({ error: '随记不存在' })
    return
  }
  res.status(204).end()
})
