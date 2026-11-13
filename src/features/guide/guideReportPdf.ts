import {
  buildGuideReportFilename,
  validateGuideReportForPdf,
  type GuideReportPresentation,
  type GuideReportSection,
  type GuideReportSource,
} from '@/features/guide/guideReportPresentation'

/** Letter size (carta) in PDF points. */
export const PDF_PAGE_WIDTH = 612
export const PDF_PAGE_HEIGHT = 792

const MARGIN_X = 58
const MARGIN_TOP = 64
const MARGIN_BOTTOM = 56
const CONTENT_WIDTH = PDF_PAGE_WIDTH - MARGIN_X * 2
const HEADER_BAR = 6
const FOOTER_Y = 34

/** Navy used for formal accents — close to product primary, print-safe. */
const COLOR = {
  ink: '0.09 0.11 0.16',
  muted: '0.38 0.41 0.48',
  soft: '0.55 0.58 0.64',
  navy: '0.12 0.25 0.52',
  rule: '0.78 0.81 0.86',
  band: '0.12 0.25 0.52',
} as const

export type PdfLine = {
  text: string
  kind:
    | 'brand'
    | 'docType'
    | 'title'
    | 'topic'
    | 'meta'
    | 'metaLabel'
    | 'heading'
    | 'body'
    | 'bullet'
    | 'muted'
    | 'rule'
    | 'spacer'
  sectionKind?: GuideReportSection['kind']
}

type PlacedLine = PdfLine & {
  x: number
  y: number
  size: number
  bold?: boolean
}

const WIN: Record<string, string> = {
  á: '\\341',
  é: '\\351',
  í: '\\355',
  ó: '\\363',
  ú: '\\372',
  ñ: '\\361',
  Á: '\\301',
  É: '\\311',
  Í: '\\315',
  Ó: '\\323',
  Ú: '\\332',
  Ñ: '\\321',
  ü: '\\374',
  Ü: '\\334',
  '¿': '\\277',
  '¡': '\\241',
  '°': '\\260',
  '–': '-',
  '—': '-',
  '“': '"',
  '”': '"',
  '‘': "'",
  '’': "'",
  '…': '...',
  '•': '-',
  '€': 'EUR',
}

const SIZE: Record<PdfLine['kind'], number> = {
  brand: 8.5,
  docType: 8.5,
  title: 20,
  topic: 12,
  meta: 9,
  metaLabel: 8,
  heading: 10,
  body: 10.5,
  bullet: 10.5,
  muted: 9,
  rule: 9,
  spacer: 9,
}

const LEAD: Record<PdfLine['kind'], number> = {
  brand: 12,
  docType: 12,
  title: 26,
  topic: 18,
  meta: 13,
  metaLabel: 11,
  heading: 16,
  body: 15.5,
  bullet: 15.5,
  muted: 13,
  rule: 12,
  spacer: 10,
}

function approxCharWidth(size: number) {
  return size * 0.5
}

export function wrapPdfText(text: string, width = CONTENT_WIDTH, size = 10.5) {
  const maxChars = Math.max(24, Math.floor(width / approxCharWidth(size)))
  const paragraphs = text.replace(/\r\n/g, '\n').split('\n')
  const lines: string[] = []
  for (const paragraph of paragraphs) {
    const words = paragraph.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean)
    if (!words.length) {
      lines.push('')
      continue
    }
    let current = ''
    for (const word of words) {
      const next = current ? `${current} ${word}` : word
      if (next.length > maxChars && current) {
        lines.push(current)
        current = word
      } else {
        current = next
      }
    }
    if (current) lines.push(current)
  }
  return lines
}

function isListRow(text: string) {
  return /^(\d+\.|[-•])\s+/.test(text.trim())
}

function pushWrappedBody(
  lines: PdfLine[],
  body: string,
  sectionKind: GuideReportSection['kind'],
  muted = false
) {
  const rows = body.replace(/\r\n/g, '\n').split('\n')
  for (const row of rows) {
    const trimmed = row.trim()
    if (!trimmed) {
      lines.push({ kind: 'spacer', text: '' })
      continue
    }
    const list = isListRow(trimmed)
    const indentWidth = list ? CONTENT_WIDTH - 14 : CONTENT_WIDTH
    const wrapped = wrapPdfText(trimmed, indentWidth, muted ? SIZE.muted : SIZE.body)
    wrapped.forEach((part, index) => {
      lines.push({
        kind: muted ? 'muted' : list ? 'bullet' : 'body',
        text: part,
        sectionKind,
      })
      if (list && index === 0 && wrapped.length > 1) {
        /* continuation lines keep bullet kind for indent */
      }
    })
  }
}

export function presentationToPdfLines(presentation: GuideReportPresentation): PdfLine[] {
  const lines: PdfLine[] = [
    { kind: 'brand', text: presentation.brand.toUpperCase() },
    { kind: 'docType', text: 'DOCUMENTO CONFIDENCIAL' },
    { kind: 'spacer', text: '' },
    { kind: 'title', text: presentation.title },
    { kind: 'topic', text: presentation.topic },
    { kind: 'spacer', text: '' },
    { kind: 'metaLabel', text: 'ENTREVISTA' },
    { kind: 'meta', text: presentation.interviewAtLabel },
    { kind: 'metaLabel', text: 'GENERADO' },
    { kind: 'meta', text: presentation.generatedAtLabel },
  ]
  if (presentation.sessionLabel) {
    lines.push({ kind: 'metaLabel', text: 'REFERENCIA' })
    lines.push({ kind: 'meta', text: presentation.sessionLabel })
  }
  lines.push({ kind: 'rule', text: '' })

  for (const section of presentation.sections) {
    lines.push({ kind: 'spacer', text: '' })
    lines.push({
      kind: 'heading',
      text: section.title.toUpperCase(),
      sectionKind: section.kind,
    })
    pushWrappedBody(lines, section.body, section.kind)
  }

  if (presentation.limitations.length) {
    lines.push({ kind: 'spacer', text: '' })
    lines.push({ kind: 'heading', text: 'NOTA SOBRE ALCANCE', sectionKind: 'note' })
    for (const note of presentation.limitations) {
      pushWrappedBody(lines, note, 'note', true)
    }
  }

  return lines
}

/** @deprecated Prefer buildGuideReportPdfFromSource; kept for tests of pagination. */
export function reportToPdfLines(input: {
  topic?: string | null
  dateLabel: string
  executiveReport?: string | null
  summary?: string | null
  learning?: string | null
  intention?: string | null
  createdAt?: string | null
  id?: string | null
  sessionId?: string | null
  generatedAt?: string | null
}) {
  const validation = validateGuideReportForPdf(
    {
      id: input.id,
      session_id: input.sessionId,
      topic: input.topic,
      created_at: input.createdAt,
      executive_report: input.executiveReport,
      summary: input.summary,
      learning: input.learning,
      intention: input.intention,
    },
    input.generatedAt || input.createdAt || '1970-01-01T00:00:00.000Z'
  )
  if (!validation.presentation) {
    return [
      { kind: 'brand' as const, text: 'SCRUMBAN · SHAMAN' },
      { kind: 'title' as const, text: 'Informe no disponible' },
      { kind: 'body' as const, text: validation.errors[0] || 'Sin contenido.' },
    ]
  }
  const lines = presentationToPdfLines(validation.presentation)
  if (!input.createdAt && input.dateLabel) {
    const idx = lines.findIndex(
      (line, index) =>
        line.kind === 'metaLabel' &&
        line.text === 'ENTREVISTA' &&
        lines[index + 1]?.kind === 'meta'
    )
    if (idx >= 0) lines[idx + 1] = { kind: 'meta', text: input.dateLabel }
  }
  return lines
}

function heightOf(line: PdfLine) {
  if (line.kind === 'rule') return 16
  if (line.kind === 'heading') return LEAD.heading + 8
  if (line.kind === 'title') return LEAD.title + 4
  if (line.kind === 'topic') return LEAD.topic + 2
  if (line.kind === 'spacer') return 8
  if (line.kind === 'metaLabel') return LEAD.metaLabel + 1
  return LEAD[line.kind]
}

export function paginateReportLines(lines: PdfLine[], pageHeight = PDF_PAGE_HEIGHT) {
  const top = pageHeight - MARGIN_TOP
  const bottom = MARGIN_BOTTOM + 18
  const pages: PdfLine[][] = []
  let page: PdfLine[] = []
  let y = top

  const pushPage = () => {
    if (page.length) pages.push(page)
    page = []
    y = top
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!
    const needed = heightOf(line)
    const next = lines[index + 1]
    const keepWithNext =
      line.kind === 'heading' && next && (next.kind === 'body' || next.kind === 'bullet' || next.kind === 'muted')
        ? heightOf(next)
        : line.kind === 'metaLabel' && next?.kind === 'meta'
          ? heightOf(next)
          : 0

    if (y - needed - keepWithNext < bottom && page.length > 0) {
      pushPage()
    }
    page.push(line)
    y -= needed
  }
  pushPage()
  return pages.length > 0 ? pages : [[]]
}

function escapePdf(text: string) {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/[^\x20-\x7E]/g, (char) => WIN[char] ?? '')
}

function placePage(lines: PdfLine[]): PlacedLine[] {
  const placed: PlacedLine[] = []
  let y = PDF_PAGE_HEIGHT - MARGIN_TOP
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!
    if (line.kind === 'rule' || line.kind === 'spacer') {
      placed.push({ ...line, x: MARGIN_X, y, size: 1 })
      y -= heightOf(line)
      continue
    }

    const size = SIZE[line.kind]
    const bold =
      line.kind === 'title' ||
      line.kind === 'heading' ||
      line.kind === 'brand' ||
      line.kind === 'topic' ||
      line.kind === 'docType'

    if (line.kind === 'brand') {
      placed.push({ ...line, x: MARGIN_X, y, size, bold })
      const next = lines[index + 1]
      if (next?.kind === 'docType') {
        const docSize = SIZE.docType
        const docWidth = approxCharWidth(docSize) * next.text.length
        placed.push({
          ...next,
          x: Math.max(MARGIN_X + 120, MARGIN_X + CONTENT_WIDTH - docWidth),
          y,
          size: docSize,
          bold: true,
        })
        index += 1
      }
      y -= heightOf(line)
      continue
    }

    if (line.kind === 'docType') {
      // Already paired with brand when present; orphan fallback.
      const docWidth = approxCharWidth(size) * line.text.length
      placed.push({
        ...line,
        x: Math.max(MARGIN_X, MARGIN_X + CONTENT_WIDTH - docWidth),
        y,
        size,
        bold,
      })
      y -= heightOf(line)
      continue
    }

    const x = line.kind === 'bullet' ? MARGIN_X + 12 : MARGIN_X
    placed.push({ ...line, x, y, size, bold })
    y -= heightOf(line)
  }
  return placed
}

function pageChrome(pageNumber: number, pageCount: number, isFirst: boolean) {
  const commands: string[] = []
  // Top brand band
  commands.push(`${COLOR.band} rg`)
  commands.push(`0 ${PDF_PAGE_HEIGHT - HEADER_BAR} ${PDF_PAGE_WIDTH} ${HEADER_BAR} re`)
  commands.push('f')
  // Soft left margin accent on first page
  if (isFirst) {
    commands.push(`${COLOR.navy} rg`)
    commands.push(`0 ${MARGIN_BOTTOM} 3 ${PDF_PAGE_HEIGHT - HEADER_BAR - MARGIN_BOTTOM} re`)
    commands.push('f')
  }
  // Footer rule
  commands.push(`${COLOR.rule} RG`)
  commands.push('0.6 w')
  commands.push(`${MARGIN_X} ${FOOTER_Y + 12} m`)
  commands.push(`${MARGIN_X + CONTENT_WIDTH} ${FOOTER_Y + 12} l`)
  commands.push('S')
  // Footer text
  commands.push('BT')
  commands.push('/F1 8 Tf')
  commands.push(`${COLOR.soft} rg`)
  commands.push(`1 0 0 1 ${MARGIN_X.toFixed(2)} ${FOOTER_Y.toFixed(2)} Tm`)
  commands.push(`(${escapePdf('Scrumban · Enviardian · Uso interno')}) Tj`)
  const pageLabel = `${pageNumber} / ${pageCount}`
  const pageX = MARGIN_X + CONTENT_WIDTH - approxCharWidth(8) * pageLabel.length
  commands.push(`1 0 0 1 ${pageX.toFixed(2)} ${FOOTER_Y.toFixed(2)} Tm`)
  commands.push(`(${escapePdf(pageLabel)}) Tj`)
  commands.push('ET')
  return commands
}

function pageStream(lines: PdfLine[], pageNumber: number, pageCount: number, isFirst: boolean) {
  const placed = placePage(lines)
  const commands = [...pageChrome(pageNumber, pageCount, isFirst), 'BT']
  let currentFont: 'F1' | 'F2' | null = null
  let currentSize: number | null = null

  for (const item of placed) {
    if (item.kind === 'spacer') continue

    if (item.kind === 'rule') {
      commands.push('ET')
      commands.push(`${COLOR.rule} RG`)
      commands.push('0.8 w')
      commands.push(`${MARGIN_X} ${item.y - 2} m`)
      commands.push(`${MARGIN_X + CONTENT_WIDTH} ${item.y - 2} l`)
      commands.push('S')
      commands.push('BT')
      currentFont = null
      currentSize = null
      continue
    }

    if (item.kind === 'heading') {
      commands.push('ET')
      commands.push(`${COLOR.navy} rg`)
      commands.push(`${MARGIN_X} ${item.y - 1} 20 2 re`)
      commands.push('f')
      commands.push('BT')
      currentFont = null
      currentSize = null
    }

    const font = item.bold ? 'F2' : 'F1'
    if (font !== currentFont || item.size !== currentSize) {
      commands.push(`/${font} ${item.size} Tf`)
      currentFont = font
      currentSize = item.size
    }

    if (item.kind === 'heading' || item.kind === 'brand' || item.kind === 'docType') {
      commands.push(`${COLOR.navy} rg`)
    } else if (item.kind === 'muted' || item.kind === 'meta' || item.kind === 'metaLabel') {
      commands.push(`${COLOR.muted} rg`)
    } else {
      commands.push(`${COLOR.ink} rg`)
    }

    const drawX = item.kind === 'heading' ? MARGIN_X + 26 : item.x
    commands.push(`1 0 0 1 ${drawX.toFixed(2)} ${item.y.toFixed(2)} Tm`)
    commands.push(`(${escapePdf(item.text)}) Tj`)
  }
  commands.push('ET')
  return commands.join('\n')
}

export function buildReportPdf(lines: PdfLine[]) {
  const pages = paginateReportLines(lines)
  const objects: string[] = []
  const pageIds: number[] = []
  let nextId = 3
  const fontRegular = nextId
  nextId += 1
  const fontBold = nextId
  nextId += 1

  pages.forEach((page, index) => {
    const contentId = nextId
    nextId += 1
    const pageId = nextId
    nextId += 1
    pageIds.push(pageId)
    const stream = pageStream(page, index + 1, pages.length, index === 0)
    objects[contentId] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`
    objects[pageId] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PDF_PAGE_WIDTH} ${PDF_PAGE_HEIGHT}] /Contents ${contentId} 0 R /Resources << /Font << /F1 ${fontRegular} 0 R /F2 ${fontBold} 0 R >> >> >>`
  })

  objects[fontRegular] =
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'
  objects[fontBold] =
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>'
  objects[2] =
    `<< /Type /Pages /Count ${pageIds.length} /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] >>`

  let body = '%PDF-1.4\n'
  const offsets: number[] = []
  for (let id = 1; id < nextId; id += 1) {
    offsets[id] = body.length
    body += `${id} 0 obj\n${objects[id]}\nendobj\n`
  }
  const xref = body.length
  body += `xref\n0 ${nextId}\n`
  body += '0000000000 65535 f \n'
  for (let id = 1; id < nextId; id += 1) {
    body += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`
  }
  body += `trailer << /Size ${nextId} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
  return body
}

export function buildGuideReportPdfFromSource(
  source: GuideReportSource,
  generatedAtIso = new Date().toISOString()
) {
  const validation = validateGuideReportForPdf(source, generatedAtIso)
  if (!validation.ok || !validation.presentation) {
    return {
      ok: false as const,
      errors: validation.errors,
      warnings: validation.warnings,
      filename: null,
      pdf: null,
      lines: null,
    }
  }
  const lines = presentationToPdfLines(validation.presentation)
  const pdf = buildReportPdf(lines)
  const filename = buildGuideReportFilename({
    interviewAt: source.created_at,
    entryId: source.id,
    topic: source.topic,
  })
  return {
    ok: true as const,
    errors: validation.errors,
    warnings: validation.warnings,
    filename,
    pdf,
    lines,
    presentation: validation.presentation,
  }
}

export function downloadReportPdf(filename: string, lines: PdfLine[]) {
  const pdf = buildReportPdf(lines)
  const blob = new Blob([pdf], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

export function downloadGuideReportPdf(
  source: GuideReportSource,
  generatedAtIso = new Date().toISOString()
) {
  const result = buildGuideReportPdfFromSource(source, generatedAtIso)
  if (!result.ok || !result.pdf || !result.filename) {
    throw new Error(result.errors[0] || 'No se pudo generar el PDF.')
  }
  const blob = new Blob([result.pdf], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = result.filename
  link.click()
  URL.revokeObjectURL(url)
  return result
}

/** HTML twin for visual QA — same sections/order as the PDF. */
export function presentationToPreviewHtml(presentation: GuideReportPresentation) {
  const sections = presentation.sections
    .map(
      (section) => `
      <section style="margin:22px 0 0;padding-left:18px;border-left:3px solid #1f3f8c">
        <h2 style="margin:0 0 8px;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#1f3f8c;font-weight:700">${escapeHtml(section.title)}</h2>
        <p style="margin:0;font-size:13.5px;line-height:1.6;color:#161a22;white-space:pre-wrap">${escapeHtml(section.body)}</p>
      </section>`
    )
    .join('')

  const limitations = presentation.limitations.length
    ? `<section style="margin:22px 0 0;padding-left:18px;border-left:3px solid #8a93a3">
        <h2 style="margin:0 0 8px;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#5b6170;font-weight:700">Nota sobre alcance</h2>
        ${presentation.limitations
          .map(
            (note) =>
              `<p style="margin:0 0 6px;font-size:12px;line-height:1.55;color:#5b6170;white-space:pre-wrap">${escapeHtml(note)}</p>`
          )
          .join('')}
      </section>`
    : ''

  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(presentation.topic)}</title></head>
  <body style="margin:0;background:#e6ebf2;font-family:Helvetica,Arial,sans-serif">
    <article style="position:relative;width:612px;min-height:792px;margin:24px auto;padding:56px 58px 64px;background:#fff;box-sizing:border-box;box-shadow:0 22px 48px rgba(15,23,42,0.14);overflow:hidden">
      <div style="position:absolute;left:0;top:0;right:0;height:6px;background:#1f3f8c"></div>
      <div style="position:absolute;left:0;top:6px;bottom:56px;width:3px;background:#1f3f8c"></div>
      <div style="display:flex;justify-content:space-between;align-items:baseline;gap:16px">
        <p style="margin:0;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#1f3f8c;font-weight:700">${escapeHtml(presentation.brand)}</p>
        <p style="margin:0;font-size:10px;letter-spacing:0.1em;text-transform:uppercase;color:#1f3f8c">Documento confidencial</p>
      </div>
      <h1 style="margin:18px 0 6px;font-size:24px;line-height:1.15;color:#141820">${escapeHtml(presentation.title)}</h1>
      <p style="margin:0 0 18px;font-size:15px;font-weight:700;color:#141820">${escapeHtml(presentation.topic)}</p>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px 24px;margin:0 0 8px">
        <div>
          <p style="margin:0;font-size:9px;letter-spacing:0.1em;text-transform:uppercase;color:#7a8290">Entrevista</p>
          <p style="margin:2px 0 0;font-size:12px;color:#4a5160">${escapeHtml(presentation.interviewAtLabel)}</p>
        </div>
        <div>
          <p style="margin:0;font-size:9px;letter-spacing:0.1em;text-transform:uppercase;color:#7a8290">Generado</p>
          <p style="margin:2px 0 0;font-size:12px;color:#4a5160">${escapeHtml(presentation.generatedAtLabel)}</p>
        </div>
        ${
          presentation.sessionLabel
            ? `<div style="grid-column:1/-1">
          <p style="margin:0;font-size:9px;letter-spacing:0.1em;text-transform:uppercase;color:#7a8290">Referencia</p>
          <p style="margin:2px 0 0;font-size:12px;color:#4a5160">${escapeHtml(presentation.sessionLabel)}</p>
        </div>`
            : ''
        }
      </div>
      <hr style="border:none;border-top:1px solid #c8ced8;margin:16px 0 4px" />
      ${sections}
      ${limitations}
      <div style="position:absolute;left:58px;right:58px;bottom:28px;padding-top:10px;border-top:1px solid #c8ced8;display:flex;justify-content:space-between;font-size:10px;color:#8a93a3">
        <span>Scrumban · Enviardian · Uso interno</span>
        <span>1 / 1</span>
      </div>
    </article>
  </body></html>`
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
