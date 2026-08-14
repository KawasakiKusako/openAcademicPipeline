import { Router } from 'express'
import { readFileSync } from 'node:fs'
import JSZip from 'jszip'
import { parsePptx } from './office'

export const presentRouter = Router()

// POST /api/present/pptx — 解析 .pptx：按页提取文本（<a:t>），返回幻灯片文本数组
presentRouter.post('/present/pptx', async (req, res) => {
  const path = String(req.body?.path ?? '')
  if (!/\.pptx$/i.test(path)) {
    res.status(400).json({ error: '仅支持 .pptx 文件' })
    return
  }
  try {
    const buf = readFileSync(path)
    const zip = await JSZip.loadAsync(buf)
    const { slides } = await parsePptx(zip)
    if (slides.length === 0) {
      res.status(422).json({ error: '未在文件中找到幻灯片内容（可能不是有效的 .pptx）' })
      return
    }
    res.json({ slides, count: slides.length })
  } catch (err) {
    res.status(500).json({ error: `解析失败：${err instanceof Error ? err.message : String(err)}` })
  }
})
