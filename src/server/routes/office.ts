import { Router } from 'express'
import { execFileSync, spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import JSZip from 'jszip'
import mammoth from 'mammoth'
import * as XLSX from 'xlsx'
import { resolveInSandbox } from '../sandbox'
import { DATA_ROOT } from '../paths'
import type { SlideDetail, SlideImage, SlideText } from '../../shared/types'

export const officeRouter = Router()

// XML 实体解码（&amp; &lt; &gt; &quot; &#39;）
function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
}

const EMU_PER_PX = 9525 // 96 dpi

// ---------- pptx：按页提取文本 ----------
export async function parsePptx(zip: JSZip): Promise<{ slides: string[][] }> {
  const slideFiles = slideXmlFiles(zip)
  const slides: string[][] = []
  for (const f of slideFiles) {
    const xml = await zip.file(f)!.async('string')
    const texts = [...xml.matchAll(/<a:t[^>]*>([^<]*)<\/a:t>/g)]
      .map((m) => decodeXml(m[1]).trim())
      .filter(Boolean)
    slides.push(texts)
  }
  return { slides }
}

// ---------- pptx：版面级解析（文本位置 + 图片 + 演讲者备注），用于汇报模式 ----------
export async function parsePptxDetailed(zip: JSZip): Promise<{ slides: SlideDetail[]; notes: string[] }> {
  const slideFiles = slideXmlFiles(zip)
  const slides: SlideDetail[] = []
  // 演讲者备注：ppt/notesSlides/notesSlideN.xml 与 slideN.xml 一一对应
  const notesByNum = new Map<number, string>()
  for (const f of Object.keys(zip.files)) {
    const m = f.match(/^ppt\/notesSlides\/notesSlide(\d+)\.xml$/)
    if (!m) continue
    const xml = await zip.file(f)!.async('string').catch(() => '')
    const texts = [...xml.matchAll(/<a:t[^>]*>([^<]*)<\/a:t>/g)]
      .map((t) => decodeXml(t[1]).trim())
      .filter(Boolean)
    if (texts.length > 0) notesByNum.set(Number(m[1]), texts.join('\n'))
  }
  const notes = slideFiles.map((f) => notesByNum.get(Number(f.match(/\d+/)?.[0])) ?? '')
  for (const f of slideFiles) {
    const xml = await zip.file(f)!.async('string')
    const num = f.match(/\d+/)?.[0] ?? '0'
    // 图片关系: ppt/slides/_rels/slideN.xml.rels
    const relsXml = await zip
      .file(`ppt/slides/_rels/slide${num}.xml.rels`)
      ?.async('string')
      .catch(() => '')
    const relMap = new Map<string, string>()
    for (const rel of relsXml?.matchAll(/<Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g) ?? []) {
      relMap.set(rel[1], rel[2])
    }

    const texts: SlideText[] = []
    const images: SlideImage[] = []
    const emu = (v: string | undefined, fallback = 0): number => (v ? Number(v) : fallback)

    // 文本块（含位置与字号）
    for (const sp of xml.matchAll(/<p:sp[ >][\s\S]*?<\/p:sp>/g)) {
      const block = sp[0]
      const xfrm = block.match(/<a:xfrm>[\s\S]*?<a:off x="(-?\d+)" y="(-?\d+)"\/>[\s\S]*?<a:ext cx="(-?\d+)" cy="(-?\d+)"\/>[\s\S]*?<\/a:xfrm>/)
      if (!xfrm) continue
      const text = [...block.matchAll(/<a:t[^>]*>([^<]*)<\/a:t>/g)]
        .map((m) => decodeXml(m[1]))
        .join('')
        .trim()
      if (!text) continue
      const sizeMatch = block.match(/<a:rPr[^>]*sz="(\d+)"/)
      const size = sizeMatch ? Number(sizeMatch[1]) / 100 : 18
      texts.push({
        x: emu(xfrm[1]),
        y: emu(xfrm[2]),
        cx: emu(xfrm[3]),
        cy: emu(xfrm[4]),
        text,
        size
      })
    }

    // 图片
    for (const pic of xml.matchAll(/<p:pic[ >][\s\S]*?<\/p:pic>/g)) {
      const block = pic[0]
      const xfrm = block.match(/<a:xfrm>[\s\S]*?<a:off x="(-?\d+)" y="(-?\d+)"\/>[\s\S]*?<a:ext cx="(-?\d+)" cy="(-?\d+)"\/>[\s\S]*?<\/a:xfrm>/)
      const embed = block.match(/<a:blip[^>]*r:embed="([^"]+)"/)
      if (!xfrm || !embed) continue
      const target = relMap.get(embed[1])
      if (!target) continue
      const mediaName = basename(target.replace(/\\/g, '/'))
      const imgFile = zip.file(`ppt/media/${mediaName}`)
      if (!imgFile) continue
      const buf = await imgFile.async('base64')
      const ext = mediaName.split('.').pop()?.toLowerCase() ?? 'png'
      images.push({
        x: emu(xfrm[1]),
        y: emu(xfrm[2]),
        cx: emu(xfrm[3]),
        cy: emu(xfrm[4]),
        src: `data:image/${ext === 'jpg' ? 'jpeg' : ext};base64,${buf}`
      })
    }

    slides.push({ texts, images })
  }
  return { slides, notes }
}

function slideXmlFiles(zip: JSZip): string[] {
  return Object.keys(zip.files)
    .filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f))
    .sort((a, b) => Number(a.match(/\d+/)?.[0]) - Number(b.match(/\d+/)?.[0]))
}

// ---------- docx：mammoth 渲染为 HTML（保留样式/表格/图片） ----------
async function parseDocx(buf: Buffer): Promise<{ html: string }> {
  const result = await mammoth.convertToHtml({ buffer: buf })
  return { html: result.value }
}

// ---------- xlsx：SheetJS 解析为二维数组 ----------
async function parseXlsx(buf: Buffer): Promise<{ sheets: { name: string; rows: string[][] }[] }> {
  const wb = XLSX.read(buf, { type: 'buffer' })
  const sheets: { name: string; rows: string[][] }[] = []
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name]
    const rows = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, raw: false, defval: '' }) as string[][]
    // 截断尾部空行
    while (rows.length > 0 && rows[rows.length - 1].every((c) => c === '')) rows.pop()
    if (rows.length > 0) sheets.push({ name, rows })
  }
  return { sheets }
}

// ---------- 高保真渲染引擎检测：PowerPoint COM（首选）→ LibreOffice（回退） ----------

// 通过注册表检测 PowerPoint（Office 2013+ 的 InstallRoot）
function findPowerPoint(): string | null {
  try {
    const script = `
      $ErrorActionPreference = 'SilentlyContinue'
      foreach ($root in 'HKLM:\\SOFTWARE\\Microsoft\\Office','HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Office','HKCU:\\SOFTWARE\\Microsoft\\Office') {
        Get-ChildItem $root | Where-Object { $_.PSChildName -match '^\\d+\\.\\d+$' } | ForEach-Object {
          $p = Get-ItemProperty ($_.PSPath + '\\PowerPoint\\InstallRoot') -ErrorAction SilentlyContinue
          if ($p.Path) { Write-Output $p.Path; exit }
        }
      }`
    const out = execFileSync(
      'powershell.exe',
      ['-NoProfile', '-Command', script],
      { timeout: 10_000, windowsHide: true }
    )
    const dir = String(out).trim().split(/\r?\n/)[0]
    if (dir) {
      const exe = join(dir, 'POWERPNT.EXE')
      if (existsSync(exe)) return exe
    }
  } catch {
    // 未安装或检测失败
  }
  return null
}

// 系统安装的 LibreOffice（可选回退引擎）
function findSoffice(): string | null {
  const candidates = [
    'C:/Program Files/LibreOffice/program/soffice.exe',
    'C:/Program Files (x86)/LibreOffice/program/soffice.exe',
    'D:/Program Files/LibreOffice/program/soffice.exe',
    'D:/Program Files (x86)/LibreOffice/program/soffice.exe',
    'E:/LibreOffice/program/soffice.exe',
    'C:/LibreOffice/program/soffice.exe'
  ]
  for (const c of candidates) {
    if (existsSync(c)) return c
  }
  return null
}

// GET /api/office/render-status — 高保真渲染引擎可用性
officeRouter.get('/office/render-status', (_req, res) => {
  res.json({ powerpoint: findPowerPoint() !== null, libreoffice: findSoffice() !== null })
})

// PowerPoint COM 导出 PDF（PowerShell 调用，隐藏窗口后台执行）
function convertWithPowerPoint(abs: string, outPdf: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const esc = (p: string): string => p.replace(/'/g, "''")
    const script = `
      $ErrorActionPreference = 'Stop'
      $pp = New-Object -ComObject PowerPoint.Application
      try {
        $pres = $pp.Presentations.Open('${esc(abs)}', $true, $false, $false)
        $pres.SaveAs('${esc(outPdf)}', 32)
        $pres.Close()
      } finally {
        $pp.Quit()
      }`
    const child = spawn(
      'powershell.exe',
      ['-NoProfile', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { windowsHide: true }
    )
    let err = ''
    child.stderr?.setEncoding('utf-8')
    child.stderr?.on('data', (c: string) => (err += c))
    const timer = setTimeout(() => {
      child.kill()
      reject(new Error('PowerPoint 导出超时'))
    }, 240_000)
    child.on('error', (e) => {
      clearTimeout(timer)
      reject(new Error(`无法启动 PowerShell：${e.message}`))
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code !== 0) {
        reject(new Error(`PowerPoint 导出失败（退出码 ${code}）${err ? `：${err.slice(0, 200)}` : ''}`))
        return
      }
      resolve()
    })
  })
}

// LibreOffice 导出 PDF（使用 OAP 专属 profile，不污染用户配置；同一 profile 需串行执行）
let loProfile: string | null = null
function libreOfficeProfile(): string {
  if (!loProfile) {
    loProfile = `file:///${join(DATA_ROOT, 'libreoffice-profile').replace(/\\/g, '/')}`
  }
  return loProfile
}

function convertWithLibreOffice(soffice: string, abs: string, outDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(soffice, [
      '--headless',
      '-env:UserInstallation=' + libreOfficeProfile(),
      '--convert-to',
      'pdf',
      '--outdir',
      outDir,
      abs
    ])
    const timer = setTimeout(() => {
      child.kill()
      reject(new Error('LibreOffice 转换超时'))
    }, 180_000)
    child.on('error', (e) => {
      clearTimeout(timer)
      reject(new Error(`无法启动 LibreOffice：${e.message}`))
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code !== 0) {
        reject(new Error(`LibreOffice 转换失败（退出码 ${code}）`))
        return
      }
      resolve()
    })
  })
}

// 转换并发锁：同一输出文件同时只转换一次，其余请求复用同一个 Promise
const convertLocks = new Map<string, Promise<string>>()

// POST /api/office/convert-pdf — 高保真转 PDF。
// 引擎顺序：LibreOffice（直接 spawn soffice，不经 PowerShell/终端，杀软不拦）→ PowerPoint COM（回退）。
// 输出到沙盒 _oap_preview/，返回沙盒相对路径（前端用 /file/raw 展示）。
officeRouter.post('/office/convert-pdf', (req, res) => {
  const path = String(req.body?.path ?? '')
  const projectId = req.body?.projectId ? String(req.body.projectId) : null
  if (!path) {
    res.status(400).json({ error: '缺少文件路径' })
    return
  }
  let abs: string
  try {
    abs = projectId ? resolveInSandbox(projectId, path) : path
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : '无效路径' })
    return
  }
  const outDir = join(dirname(abs), '_oap_preview')
  const outName = basename(abs).replace(/\.[^.]+$/, '') + '.pdf'
  const outPdf = join(outDir, outName)

  const convert = async (): Promise<string> => {
    mkdirSync(outDir, { recursive: true })
    // 旧 PDF 先删除（PowerPoint SaveAs 对已存在文件报错）
    if (existsSync(outPdf)) rmSync(outPdf, { force: true })
    const soffice = findSoffice()
    if (soffice) {
      await convertWithLibreOffice(soffice, abs, outDir)
    } else {
      const ppt = findPowerPoint()
      if (!ppt) throw new Error('未检测到 LibreOffice 或 PowerPoint，无法高保真渲染')
      await convertWithPowerPoint(abs, outPdf)
    }
    // 完成后验证产物存在，避免前端读到 ENOENT
    if (!existsSync(outPdf)) {
      throw new Error('转换完成但未找到输出文件（PDF 可能被安全软件拦截）')
    }
    return `_oap_preview/${outName}`
  }

  // 并发去重：同一输出文件的进行中转换直接复用
  const existing = convertLocks.get(outPdf)
  const task = existing ?? convert()
  convertLocks.set(outPdf, task)
  task
    .then((pdfPath) => res.json({ pdfPath }))
    .catch((err: Error) => res.status(500).json({ error: err.message }))
    .finally(() => {
      // 完成后清理锁（给后续再次转换机会）
      if (convertLocks.get(outPdf) === task) convertLocks.delete(outPdf)
    })
})

// POST /api/office/preview — 解析 pptx/docx/xlsx 为可渲染结构。
// 沙盒内文件传 projectId + 相对路径；汇报模式传绝对路径（无 projectId）。
officeRouter.post('/office/preview', async (req, res) => {
  const path = String(req.body?.path ?? '')
  const projectId = req.body?.projectId ? String(req.body.projectId) : null
  const detailed = req.body?.detailed === true
  if (!path) {
    res.status(400).json({ error: '缺少文件路径' })
    return
  }
  try {
    // 关键：沙盒文件必须经 resolveInSandbox 解析为绝对路径，否则 ENOENT
    const abs = projectId ? resolveInSandbox(projectId, path) : path
    const buf = readFileSync(abs)
    const name = path.split(/[\\/]/).pop() ?? '文件'
    if (/\.pptx$/i.test(path)) {
      const zip = await JSZip.loadAsync(buf)
      const parsed = detailed ? await parsePptxDetailed(zip) : await parsePptx(zip)
      const slides = parsed.slides
      if (slides.length === 0) throw new Error('未找到幻灯片内容')
      const notes = 'notes' in parsed ? parsed.notes : []
      res.json({ type: 'pptx', name, slides, notes, count: slides.length, detailed })
    } else if (/\.docx$/i.test(path)) {
      const { html } = await parseDocx(buf)
      if (!html.trim()) throw new Error('未解析到文档内容')
      res.json({ type: 'docx', name, html })
    } else if (/\.xlsx$/i.test(path)) {
      const { sheets } = await parseXlsx(buf)
      if (sheets.length === 0) throw new Error('未找到工作表内容')
      res.json({ type: 'xlsx', name, sheets })
    } else {
      res.status(400).json({ error: '仅支持 .pptx / .docx / .xlsx' })
    }
  } catch (err) {
    res.status(500).json({ error: `解析失败：${err instanceof Error ? err.message : String(err)}` })
  }
})

export { EMU_PER_PX }
