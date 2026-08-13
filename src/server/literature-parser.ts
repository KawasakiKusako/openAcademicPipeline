// Literature import parsers: BibTeX, RIS (Zotero/EndNote), JSON, free text.

export interface ParsedRef {
  title: string
  authors: string[]
  year: number | null
  venue: string
  doi: string
  url: string
  abstract: string
  notes: string
}

function clean(s: unknown): string {
  if (typeof s !== 'string') return ''
  return s
    .replace(/[{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function parseAuthors(s: string): string[] {
  return s
    .split(/\s+and\s+/i)
    .map((a) => clean(a).replace(/,$/, '').trim())
    .filter(Boolean)
}

// ---- BibTeX (.bib) ----
export function parseBibTeX(text: string): ParsedRef[] {
  const refs: ParsedRef[] = []
  const re = /@(\w+)\s*\{[^,]*,\s*([\s\S]*?)\n\}/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const body = m[2]
    const field = (name: string): string => {
      const fm = body.match(new RegExp(`${name}\\s*=\\s*[{"]([\\s\\S]*?)[}"]\\s*,?`, 'i'))
      return fm ? clean(fm[1]) : ''
    }
    const title = field('title')
    if (!title) continue
    refs.push({
      title,
      authors: parseAuthors(field('author')),
      year: Number(field('year')) || null,
      venue: field('journal') || field('booktitle') || field('publisher'),
      doi: field('doi'),
      url: field('url'),
      abstract: field('abstract'),
      notes: ''
    })
  }
  return refs
}

// ---- RIS (Zotero/EndNote .ris) ----
export function parseRIS(text: string): ParsedRef[] {
  const refs: ParsedRef[] = []
  const blocks = ('\n' + text).split(/\nTY\s*-/i).slice(1)
  for (const block of blocks) {
    const field = (tag: string): string => {
      const re = new RegExp(`^${tag}\\s*-\\s*(.+)$`, 'im')
      const m = block.match(re)
      return m ? clean(m[1]) : ''
    }
    const all = (tag: string): string[] => {
      const re = new RegExp(`^${tag}\\s*-\\s*(.+)$`, 'gim')
      const out: string[] = []
      let mm: RegExpExecArray | null
      while ((mm = re.exec(block)) !== null) out.push(clean(mm[1]))
      return out
    }
    const title = field('TI') || field('T1')
    if (!title) continue
    refs.push({
      title,
      authors: all('AU') ?? all('A1'),
      year: Number(field('PY')?.slice(0, 4)) || null,
      venue: field('JO') || field('JF') || field('T2'),
      doi: field('DO'),
      url: field('UR') || field('L1'),
      abstract: field('AB') || field('N2'),
      notes: field('N1') ?? ''
    })
  }
  return refs
}

// ---- JSON (structured array or single object) ----
export function parseLiteratureJson(text: string): ParsedRef[] {
  const data = JSON.parse(text) as unknown
  const list = Array.isArray(data) ? data : [data]
  return list
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    .map((item) => ({
      title: clean(item.title ?? item.Title),
      authors: Array.isArray(item.authors)
        ? item.authors.map((a) => clean(a)).filter(Boolean)
        : parseAuthors(String(item.authors ?? item.author ?? '')),
      year: Number(item.year ?? item.Year) || null,
      venue: clean(item.venue ?? item.journal ?? item.journalTitle),
      doi: clean(item.doi ?? item.DOI),
      url: clean(item.url ?? item.URL),
      abstract: clean(item.abstract ?? item.Abstract),
      notes: clean(item.notes ?? item.note ?? '')
    }))
    .filter((r) => r.title)
}

// ---- Free text (unstructured: pasted references / list) ----
export function parseFreeText(text: string): ParsedRef[] {
  const refs: ParsedRef[] = []
  const lines = text.split(/\r?\n/)
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue
    // numbered list like "1. Title. Authors. Year. Venue"
    const noNum = trimmed.replace(/^\d+[.)]\s*/, '')
    // DOI detection
    const doiM = noNum.match(/\b(10\.\d{4,9}\/[-._;()/:A-Z0-9]+)\b/i)
    // year detection
    const yearM = noNum.match(/[（(]?\b(19|20)\d{2}\b[)）]?/)
    // title = part before the first period after reasonable length
    const parts = noNum.split(/\.\s+/)
    const title = parts[0] && parts[0].length > 4 ? parts[0] : noNum.slice(0, 120)
    const authors = parts[1] && parts[1].length < 200 ? parseAuthors(parts[1]) : []
    refs.push({
      title,
      authors,
      year: yearM ? Number(yearM[0].replace(/[（()]/g, '')) : null,
      venue: parts[2] && parts[2].length < 200 ? parts[2] : '',
      doi: doiM ? doiM[1] : '',
      url: '',
      abstract: '',
      notes: ''
    })
  }
  return refs.filter((r) => r.title.length > 4)
}

// Auto-detect format and parse
export function parseLiterature(text: string, hint?: string): ParsedRef[] {
  const trimmed = text.trim()
  if (!trimmed) return []
  const fmt = hint ?? detectFormat(trimmed)
  try {
    switch (fmt) {
      case 'bibtex':
        return parseBibTeX(trimmed)
      case 'ris':
        return parseRIS(trimmed)
      case 'json':
        return parseLiteratureJson(trimmed)
      case 'text':
        return parseFreeText(trimmed)
      default:
        return parseFreeText(trimmed)
    }
  } catch {
    return parseFreeText(trimmed)
  }
}

export function detectFormat(text: string): string {
  const t = text.trim()
  if (t.startsWith('{') || t.startsWith('[')) {
    try {
      JSON.parse(t)
      return 'json'
    } catch {
      // fall through
    }
  }
  if (/^\s*@\w+\s*\{/.test(t)) return 'bibtex'
  if (/\nTY\s*-/i.test('\n' + t)) return 'ris'
  return 'text'
}
