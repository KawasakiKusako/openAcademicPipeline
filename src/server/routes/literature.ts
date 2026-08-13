import { Router } from 'express'
import { getDb, mapLiterature, newId, now } from '../db'
import { parseLiterature } from '../literature-parser'

export const literatureRouter = Router()

// Literature library: global (projectId null) + project-scoped entries

literatureRouter.get('/literature', (req, res) => {
  const q = String(req.query.q ?? '').trim().toLowerCase()
  const projectId = (req.query.projectId as string | undefined) ?? null
  const db = getDb()

  const scope = projectId
    ? '(project_id = ? OR project_id IS NULL)'
    : '1=1'
  const params: (string | null)[] = projectId ? [projectId] : []

  const like = q ? 'AND (lower(title) LIKE ? OR lower(venue) LIKE ? OR lower(doi) LIKE ? OR lower(notes) LIKE ?)' : ''
  if (q) params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`)

  const rows = db
    .prepare(`SELECT * FROM literature WHERE ${scope} ${like} ORDER BY updated_at DESC`)
    .all(...params)
  res.json(rows.map(mapLiterature))
})

literatureRouter.post('/literature', (req, res) => {
  const body = req.body as {
    title?: string
    authors?: string[] | string
    year?: number | null
    venue?: string
    doi?: string
    url?: string
    abstract?: string
    notes?: string
    projectId?: string | null
  }
  if (!body.title || !body.title.trim()) {
    res.status(400).json({ error: '文献标题必填' })
    return
  }

  const authors = Array.isArray(body.authors)
    ? body.authors.map((a) => String(a).trim()).filter(Boolean)
    : typeof body.authors === 'string' && body.authors.trim()
      ? body.authors
          .split(/[,;，；]/)
          .map((a) => a.trim())
          .filter(Boolean)
      : []

  // validate project if scoped
  const projectId = body.projectId ?? null
  if (projectId && !getDb().prepare('SELECT id FROM projects WHERE id = ?').get(projectId)) {
    res.status(400).json({ error: '项目不存在' })
    return
  }

  const ts = now()
  const id = newId()
  getDb()
    .prepare(
      `INSERT INTO literature (id, project_id, title, authors, year, venue, doi, url, abstract, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      projectId,
      body.title.trim(),
      JSON.stringify(authors),
      body.year ?? null,
      body.venue ?? '',
      body.doi ?? '',
      body.url ?? '',
      body.abstract ?? '',
      body.notes ?? '',
      ts,
      ts
    )
  res.status(201).json(
    mapLiterature(
      getDb().prepare('SELECT * FROM literature WHERE id = ?').get(id) as Record<string, unknown>
    )
  )
})

literatureRouter.put('/literature/:id', (req, res) => {
  const db = getDb()
  const row = db.prepare('SELECT * FROM literature WHERE id = ?').get(req.params.id)
  if (!row) {
    res.status(404).json({ error: '文献不存在' })
    return
  }
  const lit = mapLiterature(row as Record<string, unknown>)
  const body = req.body as {
    title?: string
    authors?: string[] | string
    year?: number | null
    venue?: string
    doi?: string
    url?: string
    abstract?: string
    notes?: string
  }

  const authors = Array.isArray(body.authors)
    ? body.authors.map((a) => String(a).trim()).filter(Boolean)
    : lit.authors

  db.prepare(
    `UPDATE literature
     SET title = ?, authors = ?, year = ?, venue = ?, doi = ?, url = ?, abstract = ?, notes = ?, updated_at = ?
     WHERE id = ?`
  ).run(
    body.title?.trim() || lit.title,
    JSON.stringify(authors),
    body.year !== undefined ? body.year : lit.year,
    body.venue ?? lit.venue,
    body.doi ?? lit.doi,
    body.url ?? lit.url,
    body.abstract ?? lit.abstract,
    body.notes ?? lit.notes,
    now(),
    lit.id
  )
  res.json(
    mapLiterature(
      db.prepare('SELECT * FROM literature WHERE id = ?').get(lit.id) as Record<string, unknown>
    )
  )
})

// Batch import: BibTeX / RIS (Zotero/EndNote) / JSON / free text.
// body: { text, format? ('bibtex'|'ris'|'json'|'text'|auto), projectId? }
literatureRouter.post('/literature/import', (req, res) => {
  const body = req.body as { text?: string; format?: string; projectId?: string | null }
  const text = String(body.text ?? '').trim()
  if (!text) {
    res.status(400).json({ error: '导入内容不能为空' })
    return
  }
  const projectId = body.projectId ?? null
  if (projectId && !getDb().prepare('SELECT id FROM projects WHERE id = ?').get(projectId)) {
    res.status(400).json({ error: '项目不存在' })
    return
  }

  const parsed = parseLiterature(text, body.format === 'auto' || !body.format ? undefined : body.format)

  const ts = now()
  const db = getDb()
  const insert = db.prepare(
    `INSERT INTO literature (id, project_id, title, authors, year, venue, doi, url, abstract, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
  let inserted = 0
  let skipped = 0
  for (const ref of parsed) {
    if (!ref.title) {
      skipped++
      continue
    }
    // dedup by title+doi
    const dup = db
      .prepare('SELECT id FROM literature WHERE title = ? OR (doi != \'\' AND doi = ?)')
      .get(ref.title, ref.doi)
    if (dup) {
      skipped++
      continue
    }
    insert.run(
      newId(),
      projectId,
      ref.title,
      JSON.stringify(ref.authors),
      ref.year,
      ref.venue,
      ref.doi,
      ref.url,
      ref.abstract,
      ref.notes,
      ts,
      ts
    )
    inserted++
  }
  res.json({ inserted, skipped, total: parsed.length })
})

literatureRouter.delete('/literature/:id', (req, res) => {
  const result = getDb().prepare('DELETE FROM literature WHERE id = ?').run(req.params.id)
  if (result.changes === 0) {
    res.status(404).json({ error: '文献不存在' })
    return
  }
  res.status(204).end()
})
