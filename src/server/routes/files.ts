import { Router } from 'express'
import { shell } from 'electron'
import {
  readdirSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  rmSync,
  renameSync,
  statSync,
  copyFileSync
} from 'node:fs'
import { join, relative } from 'node:path'

// recursive copy for directories
function copySync(src: string, dest: string): void {
  const st = statSync(src)
  if (st.isDirectory()) {
    mkdirSync(dest, { recursive: true })
    for (const entry of readdirSync(src)) {
      copySync(join(src, entry), join(dest, entry))
    }
  } else {
    copyFileSync(src, dest)
  }
}
import { getDb } from '../db'
import { resolveInSandbox } from '../sandbox'
import type { FileEntry, FileTreeNode } from '../../shared/types'

const MAX_TEXT_SIZE = 2 * 1024 * 1024 // 2MB preview cap
const MAX_TREE_DEPTH = 8
const MAX_TREE_ENTRIES = 800
const EXCLUDED_DIRS = new Set(['node_modules', '.git', '.venv', '__pycache__', '.idea', '.vscode'])

export const filesRouter = Router()

function assertProject(projectId: string): void {
  if (!getDb().prepare('SELECT id FROM projects WHERE id = ?').get(projectId)) {
    const err = new Error('项目不存在') as Error & { status: number }
    err.status = 404
    throw err
  }
}

function listEntries(target: string, rel: string): FileEntry[] {
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
  return entries
}

// List sandbox directory
filesRouter.get('/projects/:id/files', (req, res) => {
  assertProject(req.params.id)
  const rel = String(req.query.path ?? '')
  res.json(listEntries(resolveInSandbox(req.params.id, rel), rel))
})

// Recursive file tree (depth-capped) for the VSCode-style workspace view
filesRouter.get('/projects/:id/tree', (req, res) => {
  assertProject(req.params.id)
  const root = resolveInSandbox(req.params.id, '')
  const counter = { n: 0 }

  const scan = (dir: string, depth: number): FileTreeNode[] => {
    if (depth > MAX_TREE_DEPTH || counter.n >= MAX_TREE_ENTRIES) return []
    const nodes: FileTreeNode[] = []
    let entries: string[]
    try {
      entries = readdirSync(dir)
    } catch {
      return []
    }
    for (const name of entries) {
      if (counter.n >= MAX_TREE_ENTRIES) break
      if (EXCLUDED_DIRS.has(name)) continue
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

// Read a text file (capped at 2MB)
filesRouter.get('/projects/:id/file', (req, res) => {
  assertProject(req.params.id)
  const target = resolveInSandbox(req.params.id, String(req.query.path ?? ''))
  const st = statSync(target)
  if (!st.isFile()) {
    res.status(400).json({ error: '目标不是文件' })
    return
  }
  if (st.size > MAX_TEXT_SIZE) {
    res.status(413).json({ error: `文件超过 ${MAX_TEXT_SIZE / 1024 / 1024}MB 预览上限` })
    return
  }
  res.json({ content: readFileSync(target, 'utf-8') })
})

// Write a text file (creates parent dirs)
filesRouter.put('/projects/:id/file', (req, res) => {
  assertProject(req.params.id)
  const rel = String(req.query.path ?? '')
  if (!rel) {
    res.status(400).json({ error: '缺少文件路径' })
    return
  }
  const target = resolveInSandbox(req.params.id, rel)
  mkdirSync(target.replace(/[^/\\]+$/, ''), { recursive: true })
  const content = req.body?.content
  if (typeof content !== 'string') {
    res.status(400).json({ error: '缺少文件内容' })
    return
  }
  writeFileSync(target, content, 'utf-8')
  res.status(200).json({ ok: true })
})

// Create a directory (recursive)
filesRouter.post('/projects/:id/dirs', (req, res) => {
  assertProject(req.params.id)
  const rel = String(req.query.path ?? '')
  if (!rel) {
    res.status(400).json({ error: '缺少目录路径' })
    return
  }
  mkdirSync(resolveInSandbox(req.params.id, rel), { recursive: true })
  res.status(201).json({ ok: true })
})

// Open a file/folder in the system file explorer (Windows Explorer)
filesRouter.post('/projects/:id/open-external', (req, res) => {
  assertProject(req.params.id)
  const rel = String(req.body?.path ?? '')
  const abs = resolveInSandbox(req.params.id, rel || '.')
  shell.openPath(abs).then((err) => {
    if (err) res.status(500).json({ error: `无法打开：${err}` })
    else res.json({ ok: true })
  })
})

// Resolve a sandbox-relative path to an absolute path (for webview preview etc.)
filesRouter.post('/projects/:id/file/abs', (req, res) => {
  assertProject(req.params.id)
  const rel = String(req.body?.path ?? '')
  if (!rel) {
    res.status(400).json({ error: '缺少文件路径' })
    return
  }
  res.json({ abs: resolveInSandbox(req.params.id, rel) })
})

// Binary file streaming (images / video / audio / pdf preview)
filesRouter.get('/projects/:id/file/raw', (req, res) => {
  assertProject(req.params.id)
  const target = resolveInSandbox(req.params.id, String(req.query.path ?? ''))
  res.sendFile(target)
})

// Copy a file or directory within the sandbox (from -> to)
filesRouter.post('/projects/:id/copy', (req, res) => {
  assertProject(req.params.id)
  const from = String(req.body?.from ?? '')
  const to = String(req.body?.to ?? '')
  if (!from || !to) {
    res.status(400).json({ error: '无效的复制参数' })
    return
  }
  const src = resolveInSandbox(req.params.id, from)
  const dest = resolveInSandbox(req.params.id, to)
  try {
    copySync(src, dest)
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : '复制失败' })
  }
})

// Rename / move a file or directory within the sandbox
filesRouter.put('/projects/:id/rename', (req, res) => {
  assertProject(req.params.id)
  const from = String(req.body?.from ?? '')
  const to = String(req.body?.to ?? '')
  if (!from || !to || from === to) {
    res.status(400).json({ error: '无效的重命名参数' })
    return
  }
  const src = resolveInSandbox(req.params.id, from)
  const dest = resolveInSandbox(req.params.id, to)
  try {
    renameSync(src, dest)
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : '重命名失败' })
  }
})

// Delete a file or directory (recursive)
filesRouter.delete('/projects/:id/file', (req, res) => {
  assertProject(req.params.id)
  const rel = String(req.query.path ?? '')
  if (!rel || rel === '.') {
    res.status(400).json({ error: '不能删除沙盒根目录' })
    return
  }
  rmSync(resolveInSandbox(req.params.id, rel), { recursive: true, force: true })
  res.status(204).end()
})
