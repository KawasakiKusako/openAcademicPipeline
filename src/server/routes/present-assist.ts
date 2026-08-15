import { Router } from 'express'
import { readFileSync } from 'node:fs'
import JSZip from 'jszip'
import mammoth from 'mammoth'
import { PDFParse } from 'pdf-parse'
import { resolveInSandbox } from '../sandbox'
import { parsePptx } from './office'
import { getDb } from '../db'

export const presentAssistRouter = Router()

// 每个文件最多提取的字符数（防止 prompt 超长）
const MAX_CHARS = 20000

// POST /api/present-assist/import-project — 组装项目状态概览文本（任务/会话/文件/文献）
presentAssistRouter.post('/present-assist/import-project', (req, res) => {
  const projectId = String(req.body?.projectId ?? '')
  if (!projectId) {
    res.status(400).json({ error: '缺少项目 ID' })
    return
  }
  try {
    const db = getDb()
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as
      | Record<string, unknown>
      | undefined
    if (!project) {
      res.status(404).json({ error: '项目不存在' })
      return
    }
    const tasks = (
      db.prepare('SELECT name, type, status FROM tasks WHERE project_id = ? ORDER BY position').all(projectId) as {
        name: string
        type: string
        status: string
      }[]
    ).slice(0, 30)
    const sessions = (
      db
        .prepare('SELECT title, status, created_at FROM sessions WHERE project_id = ? ORDER BY created_at DESC LIMIT 10')
        .all(projectId) as { title: string; status: string; created_at: string }[]
    )
    const lits = (
      db
        .prepare('SELECT title, year FROM literature WHERE project_id = ? ORDER BY created_at DESC LIMIT 20')
        .all(projectId) as { title: string; year: number | null }[]
    )

    const lines: string[] = [
      `【项目】${String(project.name ?? '')}`,
      `类型：${String(project.type ?? '')}`,
      `描述：${String(project.description ?? '') || '（无）'}`,
      '',
      '【任务】',
      ...(tasks.length ? tasks.map((t) => `- [${t.status}] ${t.name}（${t.type}）`) : ['（无任务）']),
      '',
      '【最近会话】',
      ...(sessions.length ? sessions.map((s) => `- ${s.title}（${s.status}）`) : ['（无会话）']),
      '',
      '【知识库文献】',
      ...(lits.length ? lits.map((l) => `- ${l.title}${l.year ? `（${l.year}）` : ''}`) : ['（无文献）'])
    ]
    const text = lines.join('\n')
    res.json({ name: `[项目状态] ${String(project.name ?? '')}`, text, chars: text.length })
  } catch (err) {
    res.status(500).json({ error: `读取失败：${err instanceof Error ? err.message : String(err)}` })
  }
})

// POST /api/present-assist/import — 提取 pptx/docx/pdf/txt/md 的文本内容（汇报助手上下文）
presentAssistRouter.post('/present-assist/import', async (req, res) => {
  const path = String(req.body?.path ?? '')
  const projectId = req.body?.projectId ? String(req.body.projectId) : null
  if (!path) {
    res.status(400).json({ error: '缺少文件路径' })
    return
  }
  try {
    const abs = projectId ? resolveInSandbox(projectId, path) : path
    const buf = readFileSync(abs)
    const name = path.split(/[\\/]/).pop() ?? '文件'
    let text = ''
    if (/\.pptx$/i.test(path)) {
      const zip = await JSZip.loadAsync(buf)
      const { slides } = await parsePptx(zip)
      text = slides.map((s, i) => `【第 ${i + 1} 页】\n${s.join('\n')}`).join('\n\n')
    } else if (/\.docx$/i.test(path)) {
      const r = await mammoth.extractRawText({ buffer: buf })
      text = r.value
    } else if (/\.pdf$/i.test(path)) {
      const parser = new PDFParse({ data: buf })
      const r = await parser.getText()
      text = r.text ?? ''
    } else if (/\.(txt|md|markdown)$/i.test(path)) {
      text = buf.toString('utf-8')
    } else {
      res.status(400).json({ error: '仅支持 pptx / docx / pdf / txt / md 文件' })
      return
    }
    const chars = text.length
    if (chars > MAX_CHARS) {
      text = text.slice(0, MAX_CHARS) + '\n\n[内容过长已截断]'
    }
    if (!text.trim()) {
      res.status(422).json({ error: '未能从文件中提取到文本（可能是扫描件图片 PDF）' })
      return
    }
    res.json({ name, text, chars })
  } catch (err) {
    res.status(500).json({ error: `解析失败：${err instanceof Error ? err.message : String(err)}` })
  }
})
