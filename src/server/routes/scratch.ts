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

scratchRouter.delete('/scratch/:id', (req, res) => {
  const result = getDb().prepare('DELETE FROM scratch_notes WHERE id = ?').run(req.params.id)
  if (result.changes === 0) {
    res.status(404).json({ error: '随记不存在' })
    return
  }
  res.status(204).end()
})
