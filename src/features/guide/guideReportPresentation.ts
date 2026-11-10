import { parseReportBlocks, type ReportBlock } from '@/features/guide/reportBlocks'

const CDMX_TZ = 'America/Mexico_City'

export type GuideReportSource = {
  id?: string | null
  session_id?: string | null
  topic?: string | null
  created_at?: string | null
  executive_report?: string | null
  summary?: string | null
  learning?: string | null
  intention?: string | null
  agent_inferences?: string | null
  reflection_question?: string | null
}

export type GuideReportSection = {
  title: string
  body: string
  kind: 'lead' | 'finding' | 'action' | 'note' | 'closing'
}

export type GuideReportPresentation = {
  brand: string
  title: string
  topic: string
  interviewAtLabel: string
  generatedAtLabel: string
  sessionLabel: string | null
  entryId: string | null
  interviewDateKey: string | null
  sections: GuideReportSection[]
  limitations: string[]
}

export type GuideReportValidation = {
  ok: boolean
  errors: string[]
  warnings: string[]
  presentation: GuideReportPresentation | null
}

const SKIP_SECTION = /para aprobar|trabajo creado/i
const BANNER_TITLE = /^reporte ejecutivo$/i

function sectionKind(title: string): GuideReportSection['kind'] {
  if (/situacion|diagnostico|hallazgo/i.test(title)) return 'finding'
  if (/prioridad|recomend|accion|decision|oportun/i.test(title)) return 'action'
  if (/proximo|cierre|siguiente/i.test(title)) return 'closing'
  if (/aprendizaje|intencion|interpret|pensar|nota/i.test(title)) return 'note'
  return 'lead'
}

/** Fecha/hora absoluta → etiqueta legible en America/Mexico_City. */
export function formatReportDateTimeCDMX(iso: string | null | undefined) {
  if (!iso?.trim()) return null
  const date = new Date(iso)
  if (!Number.isFinite(date.getTime())) return null
  return date.toLocaleString('es-MX', {
    timeZone: CDMX_TZ,
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

/** Clave calendario YYYY-MM-DD en CDMX para nombres de archivo. */
export function reportDateKeyCDMX(iso: string | null | undefined) {
  if (!iso?.trim()) return null
  const date = new Date(iso)
  if (!Number.isFinite(date.getTime())) return null
  return date.toLocaleDateString('en-CA', { timeZone: CDMX_TZ })
}

export function sanitizePdfFilenamePart(value: string, max = 48) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, max)
    .replace(/_+$/g, '')
}

export function buildGuideReportFilename(input: {
  interviewAt?: string | null
  entryId?: string | null
  topic?: string | null
}) {
  const dateKey = reportDateKeyCDMX(input.interviewAt) || 'sin-fecha'
  const idPart = (input.entryId || '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 8)
  const topicPart = sanitizePdfFilenamePart(input.topic || '', 24)
  const tail = [topicPart, idPart].filter(Boolean).join('_') || 'informe'
  return `Shaman_Informe_${dateKey}_${tail}.pdf`
}

function normalizeBlocks(source: GuideReportSource): ReportBlock[] {
  const fromReport = source.executive_report?.trim()
    ? parseReportBlocks(source.executive_report).filter(
        (block) => !SKIP_SECTION.test(block.title || '')
      )
    : []

  const blocks = fromReport
    .map((block) => ({
      title:
        block.title && BANNER_TITLE.test(block.title.trim())
          ? null
          : block.title,
      body: block.body.trim(),
    }))
    .filter((block) => block.body.length > 0)

  if (blocks.length === 0 && source.summary?.trim()) {
    blocks.push({ title: 'Situacion', body: source.summary.trim() })
  }
  return blocks
}

export function buildGuideReportPresentation(
  source: GuideReportSource,
  generatedAtIso: string
): GuideReportPresentation {
  const blocks = normalizeBlocks(source)
  const sections: GuideReportSection[] = blocks.map((block, index) => {
    const title = (block.title || (index === 0 ? 'Situacion' : 'Detalle')).trim()
    return {
      title,
      body: block.body,
      kind: sectionKind(title),
    }
  })

  if (source.learning?.trim()) {
    sections.push({
      title: 'Aprendizaje',
      body: source.learning.trim(),
      kind: 'note',
    })
  }
  if (source.intention?.trim()) {
    sections.push({
      title: 'Intencion',
      body: source.intention.trim(),
      kind: 'note',
    })
  }

  const limitations: string[] = []
  if (!source.executive_report?.trim() && source.summary?.trim()) {
    limitations.push('El informe usa el resumen almacenado; no hay reporte ejecutivo estructurado.')
  }
  if (sections.length === 0) {
    limitations.push('No hay secciones con contenido suficiente para exportar.')
  }

  const topic = source.topic?.trim() || 'Sesion con Guia'
  const interviewAtLabel =
    formatReportDateTimeCDMX(source.created_at) || 'Fecha de entrevista no disponible'
  const generatedAtLabel =
    formatReportDateTimeCDMX(generatedAtIso) || 'Fecha de generacion no disponible'
  const sessionClean = source.session_id?.replace(/[^a-zA-Z0-9]/g, '') || ''
  const sessionShort = sessionClean ? sessionClean.slice(-8) : null

  return {
    brand: 'Scrumban · Shaman',
    title: 'Informe ejecutivo',
    topic,
    interviewAtLabel,
    generatedAtLabel,
    sessionLabel: sessionShort ? `Ref. sesion ${sessionShort}` : null,
    entryId: source.id ?? null,
    interviewDateKey: reportDateKeyCDMX(source.created_at),
    sections,
    limitations,
  }
}

export function validateGuideReportForPdf(
  source: GuideReportSource,
  generatedAtIso: string
): GuideReportValidation {
  const errors: string[] = []
  const warnings: string[] = []

  if (!source.executive_report?.trim() && !source.summary?.trim()) {
    errors.push('No hay informe almacenado para exportar.')
  }
  if (source.created_at && !Number.isFinite(new Date(source.created_at).getTime())) {
    warnings.push('La fecha de entrevista no es valida; se omitira en el PDF.')
  }

  const presentation = buildGuideReportPresentation(source, generatedAtIso)
  if (presentation.sections.length === 0) {
    errors.push('El informe no tiene contenido exportable.')
  }
  for (const note of presentation.limitations) warnings.push(note)

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    presentation: errors.length === 0 ? presentation : null,
  }
}
