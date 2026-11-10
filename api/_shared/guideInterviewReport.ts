import { createHmac, timingSafeEqual } from 'node:crypto'

export type GuideReportStatus = 'pending' | 'processing' | 'ready' | 'failed' | 'insufficient'

export type GuideTranscriptTurn = {
  role: 'user' | 'assistant'
  content: string
}

export type TranscriptDepth = 'empty' | 'thin' | 'ready'

export type ReportDecision = 'return_existing' | 'wait' | 'insufficient' | 'generate' | 'busy'

const PROCESSING_STALE_MS = 120_000
const MIN_USER_CHARS = 40

export function verifyRetellSignature(rawBody: string, apiKey: string, signature: string | null | undefined) {
  const provided = (signature ?? '').trim()
  const key = apiKey.trim()
  if (!rawBody || !key || !provided) return false

  const digestOf = (payload: string) => createHmac('sha256', key).update(payload).digest('hex')
  const candidates = [digestOf(rawBody)]

  const versioned = provided.match(/(?:^|[,\s])d=([a-f0-9]+)/i) ?? provided.match(/(?:^|[,\s])v1=([a-f0-9]+)/i)
  const timestamp = provided.match(/(?:^|[,\s])t=(\d+)/)
  if (timestamp) candidates.push(digestOf(`${timestamp[1]}.${rawBody}`))

  const expectedList = candidates
  const actualHex = (versioned?.[1] ?? provided).trim().toLowerCase()
  if (!/^[a-f0-9]+$/i.test(actualHex)) return false

  const actual = Buffer.from(actualHex, 'hex')
  return expectedList.some((expectedHex) => {
    const expected = Buffer.from(expectedHex, 'hex')
    if (expected.length !== actual.length) return false
    return timingSafeEqual(expected, actual)
  })
}

export function transcriptDepth(turns: GuideTranscriptTurn[]): TranscriptDepth {
  const userText = turns
    .filter((turn) => turn.role === 'user')
    .map((turn) => turn.content.trim())
    .filter(Boolean)
    .join(' ')
  if (!userText) return 'empty'
  if (userText.length < MIN_USER_CHARS) return 'thin'
  return 'ready'
}

export function decideReportAction(input: {
  event: 'call_ended' | 'call_analyzed' | 'client' | 'retry'
  current: GuideReportStatus | null
  depth: TranscriptDepth
  hasJournal: boolean
  processingAgeMs?: number
}): ReportDecision {
  if (input.current === 'ready') return 'return_existing'
  if (input.current === 'insufficient' && input.hasJournal && input.event !== 'retry') return 'return_existing'
  if (
    input.current === 'processing' &&
    (input.processingAgeMs ?? 0) < PROCESSING_STALE_MS &&
    input.event !== 'retry'
  ) {
    return 'busy'
  }
  if (input.depth === 'ready') return 'generate'
  if (input.event === 'call_ended' || input.event === 'client') return 'wait'
  return 'insufficient'
}

export function turnsFromRetellCall(call: unknown): GuideTranscriptTurn[] {
  if (!call || typeof call !== 'object') return []
  const row = call as {
    transcript_object?: unknown
    transcript_with_tool_calls?: unknown
    transcript?: unknown
  }
  const objectTurns = Array.isArray(row.transcript_object)
    ? row.transcript_object
    : Array.isArray(row.transcript_with_tool_calls)
      ? row.transcript_with_tool_calls
      : null
  if (objectTurns) {
    return objectTurns
      .map((item) => {
        if (!item || typeof item !== 'object') return null
        const turn = item as { role?: unknown; content?: unknown }
        const role = turn.role === 'agent' || turn.role === 'assistant' ? 'assistant' : turn.role === 'user' ? 'user' : null
        const content = typeof turn.content === 'string' ? turn.content.trim() : ''
        if (!role || !content) return null
        return { role, content: content.slice(0, 8000) } satisfies GuideTranscriptTurn
      })
      .filter((turn): turn is GuideTranscriptTurn => Boolean(turn))
  }
  if (typeof row.transcript !== 'string' || !row.transcript.trim()) return []
  return row.transcript
    .split('\n')
    .map((line) => {
      const match = line.match(/^(Agent|User|Guia|Usuario)\s*:\s*(.+)$/i)
      if (!match) return null
      const who = match[1]!.toLowerCase()
      const role = who === 'user' || who === 'usuario' ? 'user' : 'assistant'
      const content = match[2]!.trim().slice(0, 8000)
      if (!content) return null
      return { role, content } satisfies GuideTranscriptTurn
    })
    .filter((turn): turn is GuideTranscriptTurn => Boolean(turn))
}

export type ReportSection = { title: string | null; body: string }

export function parseReportBlocks(raw: string): ReportSection[] {
  const lines = raw
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  const blocks: ReportSection[] = []
  let current: ReportSection | null = null
  const isHeading = (line: string) => {
    if (line.length > 48) return false
    if (/^REPORTE\b/i.test(line)) return true
    if (/^[A-ZÁÉÍÓÚÑ0-9][A-ZÁÉÍÓÚÑ0-9\s\-—–:]{2,}$/.test(line) && /[A-ZÁÉÍÓÚÑ]/.test(line)) return true
    return false
  }
  const prettyHeading = (line: string) =>
    line
      .replace(/^REPORTE EJECUTIVO\s*[—–-]?\s*GUIA\s*/i, 'Reporte ejecutivo')
      .replace(/\bSITUACION\b/i, 'Situacion')
      .replace(/\bDIAGNOSTICO\b/i, 'Diagnostico')
      .replace(/\bDECISIONES\b/i, 'Decisiones')
      .replace(/\bPARA APROBAR\b/i, 'Para aprobar')
      .replace(/\bTRABAJO CREADO\b/i, 'Trabajo creado')
      .replace(/\bPRIORIDADES\b/i, 'Prioridades')
      .replace(/\bACCIONES\b/i, 'Acciones')
      .replace(/\bRIESGOS\b/i, 'Riesgos')
      .replace(/\bPROXIMOS PASOS\b/i, 'Proximos pasos')
      .replace(/\bCIERRE\b/i, 'Cierre')

  for (const line of lines) {
    if (isHeading(line)) {
      if (current && current.body.trim()) blocks.push(current)
      current = { title: prettyHeading(line), body: '' }
      continue
    }
    if (!current) current = { title: null, body: '' }
    current.body = current.body ? `${current.body}\n${line}` : line
  }
  if (current && (current.title || current.body.trim())) blocks.push(current)
  return blocks.length > 0 ? blocks : [{ title: null, body: raw.trim() }]
}

function sectionBody(blocks: ReportSection[], title: RegExp) {
  return blocks.find((block) => block.title && title.test(block.title))?.body.trim() ?? ''
}

function bulletLines(body: string, limit: number) {
  return body
    .split('\n')
    .map((line) => line.replace(/^\d+\.\s*/, '').replace(/^-\s*/, '').trim())
    .filter(Boolean)
    .slice(0, limit)
}

/** Resumen para WhatsApp a partir del informe ya guardado. No agrega hechos. */
export function buildWhatsappReportMessage(input: {
  topic?: string | null
  executiveReport?: string | null
  summary?: string | null
}) {
  const report = input.executiveReport?.trim() ?? ''
  const blocks = report ? parseReportBlocks(report) : []
  const topic = input.topic?.trim() || ''
  const situation = sectionBody(blocks, /situacion/i) || input.summary?.trim() || ''
  const diagnosis = sectionBody(blocks, /diagnostico/i)
  const priorities = bulletLines(sectionBody(blocks, /prioridad/i), 3)
  const steps = bulletLines(sectionBody(blocks, /proximos pasos/i), 3)
  const findings = bulletLines(diagnosis, 3)

  const lines = ['Resumen de tu sesion con Guia', '']
  if (topic) lines.push(`Tema principal:\n${topic}`, '')
  if (situation) lines.push(`Lo que se dijo:\n${situation}`, '')
  if (findings.length) {
    lines.push('Hallazgos:')
    findings.forEach((item) => lines.push(`- ${item}`))
    lines.push('')
  }
  if (priorities.length) {
    lines.push('Recomendaciones:')
    priorities.forEach((item, index) => lines.push(`${index + 1}. ${item}`))
    lines.push('')
  }
  if (steps.length) {
    lines.push('Proximos pasos:')
    steps.forEach((item) => lines.push(`- ${item}`))
    lines.push('')
  }
  if (!situation && !findings.length && !priorities.length && !steps.length) {
    lines.push('La entrevista no dejo informacion suficiente para un diagnostico.', '')
  }
  lines.push('El informe completo esta en el historial de Scrumban, despues de iniciar sesion.')
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, 1400)
}

export function insufficientExecutiveReport(userWords: string) {
  const quoted = userWords.trim()
  const situation = quoted
    ? `La entrevista termino con poca informacion. Lo dicho por la persona: «${quoted.slice(0, 500)}». No alcanza para un diagnostico.`
    : 'La entrevista termino sin informacion suficiente de la persona entrevistada. No hay diagnostico ni recomendaciones.'
  return [
    'REPORTE EJECUTIVO — GUIA',
    '',
    'SITUACION',
    situation,
    '',
    'DIAGNOSTICO',
    'Informacion insuficiente. No se infieren problemas, acuerdos ni responsables.',
  ].join('\n')
}

export function maskPhone(raw: string | null | undefined) {
  const digits = (raw ?? '').replace(/\D/g, '')
  if (digits.length < 4) return null
  return `···${digits.slice(-4)}`
}
