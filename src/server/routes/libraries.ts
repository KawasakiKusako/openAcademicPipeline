import { Router } from 'express'
import { readdirSync, mkdirSync, statSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import { getDb, mapLibrary, newId, now } from '../db'
import type { CreateLibraryInput, FileEntry, FileTreeNode } from '../../shared/types'

const MAX_TEXT_SIZE = 2 * 1024 * 1024
const TREE_MAX_DEPTH = 6
const TREE_MAX_ENTRIES = 500

export const librariesRouter = Router()

// Project libraries + global libraries (projectId IS NULL)
librariesRouter.get('/libraries', (req, res) => {
  const projectId = req.query.projectId as string | undefined
  const db = getDb()
  const rows = projectId
    ? db
        .prepare('SELECT * FROM libraries WHERE project_id = ? OR project_id IS NULL ORDER BY created_at')
        .all(projectId)
    : db.prepare('SELECT * FROM libraries ORDER BY created_at').all()
  res.json(rows.map(mapLibrary))
})

librariesRouter.post('/libraries', (req, res) => {
  const input = req.body as Partial<CreateLibraryInput>
  if (!input.name || !input.name.trim() || !input.path || !input.path.trim()) {
    res.status(400).json({ error: '库名称与路径必填' })
    return
  }
  // Ensure the library directory exists on disk
  mkdirSync(input.path, { recursive: true })

  const ts = now()
  const id = newId()
  getDb()
    .prepare(
      `INSERT INTO libraries (id, project_id, name, path, description, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(id, input.projectId ?? null, input.name.trim(), input.path, input.description ?? '', ts)

  res.status(201).json(
    mapLibrary(getDb().prepare('SELECT * FROM libraries WHERE id = ?').get(id) as Record<string, unknown>)
  )
})

librariesRouter.put('/libraries/:id', (req, res) => {
  const db = getDb()
  const row = db.prepare('SELECT * FROM libraries WHERE id = ?').get(req.params.id)
  if (!row) {
    res.status(404).json({ error: '知识库不存在' })
    return
  }
  const lib = mapLibrary(row as Record<string, unknown>)
  const body = req.body as Partial<CreateLibraryInput>

  db.prepare('UPDATE libraries SET name = ?, description = ? WHERE id = ?').run(
    body.name?.trim() || lib.name,
    body.description ?? lib.description,
    lib.id
  )
  res.json(
    mapLibrary(db.prepare('SELECT * FROM libraries WHERE id = ?').get(lib.id) as Record<string, unknown>)
  )
})

librariesRouter.delete('/libraries/:id', (req, res) => {
  const result = getDb().prepare('DELETE FROM libraries WHERE id = ?').run(req.params.id)
  if (result.changes === 0) {
    res.status(404).json({ error: '知识库不存在' })
    return
  }
  res.status(204).end()
})

// Recursive file tree (for the notes library explorer)
librariesRouter.get('/libraries/:id/tree', (req, res) => {
  const row = getDb().prepare('SELECT * FROM libraries WHERE id = ?').get(req.params.id)
  if (!row) {
    res.status(404).json({ error: '知识库不存在' })
    return
  }
  const lib = mapLibrary(row as Record<string, unknown>)
  const root = resolve(lib.path)
  const counter = { n: 0 }

  const scan = (dir: string, depth: number): FileTreeNode[] => {
    if (depth > TREE_MAX_DEPTH || counter.n >= TREE_MAX_ENTRIES) return []
    const nodes: FileTreeNode[] = []
    let entries: string[]
    try {
      entries = readdirSync(dir)
    } catch {
      return []
    }
    for (const name of entries) {
      if (counter.n >= TREE_MAX_ENTRIES) break
      if (name.startsWith('.') && name !== '.obsidian') continue
      const full = join(dir, name)
      let st
      try {
        st = statSync(full)
      } catch {
        continue
      }
      const rel = relative(root, full).replace(/\\/g, '/')
      counter.n++
      if (st.isDirectory()) {
        nodes.push({ name, path: rel, type: 'dir', children: scan(full, depth + 1) })
      } else {
        nodes.push({ name, path: rel, type: 'file', size: st.size })
      }
    }
    nodes.sort((a, b) =>
      a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'dir' ? -1 : 1
    )
    return nodes
  }

  res.json(scan(root, 0))
})

// Write a text file inside a library
librariesRouter.put('/libraries/:id/file', (req, res) => {
  const row = getDb().prepare('SELECT * FROM libraries WHERE id = ?').get(req.params.id)
  if (!row) {
    res.status(404).json({ error: '知识库不存在' })
    return
  }
  const lib = mapLibrary(row as Record<string, unknown>)
  const root = resolve(lib.path)
  const rel = String(req.query.path ?? '')
  const target = resolve(root, rel)
  if (target !== root && !target.startsWith(root + sep)) {
    res.status(400).json({ error: '路径超出知识库范围' })
    return
  }
  const content = req.body?.content
  if (typeof content !== 'string') {
    res.status(400).json({ error: '缺少文件内容' })
    return
  }
  try {
    writeFileSync(target, content, 'utf-8')
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : '写入失败' })
  }
})

// Read a text file inside a library (notes / Obsidian vault markdown)
librariesRouter.get('/libraries/:id/file', (req, res) => {
  const row = getDb().prepare('SELECT * FROM libraries WHERE id = ?').get(req.params.id)
  if (!row) {
    res.status(404).json({ error: '知识库不存在' })
    return
  }
  const lib = mapLibrary(row as Record<string, unknown>)
  const root = resolve(lib.path)
  const rel = String(req.query.path ?? '')
  const target = resolve(root, rel)
  if (target !== root && !target.startsWith(root + sep)) {
    res.status(400).json({ error: '路径超出知识库范围' })
    return
  }
  try {
    const st = statSync(target)
    if (!st.isFile()) {
      res.status(400).json({ error: '目标不是文件' })
      return
    }
    if (st.size > MAX_TEXT_SIZE) {
      res.status(413).json({ error: '文件过大' })
      return
    }
    res.json({ content: readFileSync(target, 'utf-8') })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : '读取失败' })
  }
})

// Scan a library directory (shallow, one level)
librariesRouter.get('/libraries/:id/entries', (req, res) => {
  const row = getDb().prepare('SELECT * FROM libraries WHERE id = ?').get(req.params.id)
  if (!row) {
    res.status(404).json({ error: '知识库不存在' })
    return
  }
  const lib = mapLibrary(row as Record<string, unknown>)
  const root = resolve(lib.path)
  const rel = String(req.query.path ?? '')
  const target = resolve(root, rel)
  if (target !== root && !target.startsWith(root + sep)) {
    res.status(400).json({ error: '路径超出知识库范围' })
    return
  }

  const entries: FileEntry[] = []
  for (const name of readdirSync(target)) {
    const full = join(target, name)
    const st = statSync(full)
    entries.push({
      name,
      path: rel ? `${rel}/${name}` : name,
      type: st.isDirectory() ? 'dir' : 'file',
      size: st.size,
      modifiedAt: st.mtime.toISOString()
    })
  }
  entries.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'dir' ? -1 : 1))
  res.json(entries)
})
