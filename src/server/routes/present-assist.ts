import { Router } from 'express'
import { readFileSync } from 'node:fs'
import JSZip from 'jszip'
import mammoth from 'mammoth'
import { PDFParse } from 'pdf-parse'
import { resolveInSandbox } from '../sandbox'
import { parsePptx } from './office'

export const presentAssistRouter = Router()

// 每个文件最多提取的字符数（防止 prompt 超长）
const MAX_CHARS = 20000

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
