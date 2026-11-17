import {
  evidenceLabel,
  type EnviardianReportDocument,
  type EvidenceKind,
} from '@/features/guide/enviardianReportDocument'
import {
  buildReportViewModel,
  type EnviardianReportViewModel,
} from '@/features/guide/reportViewModel'

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
  /** Resumen de borradores de comunicación al momento del export (sin botones). */
  communications?: Array<{
    channel?: string
    title?: string
    status?: string
    recipient?: string
  }> | null
}

export type GuideReportSection = {
  title: string
  body: string
  kind: 'lead' | 'finding' | 'action' | 'note' | 'closing' | 'risk' | 'metric' | 'ai'
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
  participant?: string | null
  document: EnviardianReportDocument | null
  sections: GuideReportSection[]
  limitations: string[]
}

export type GuideReportValidation = {
  ok: boolean
  errors: string[]
  warnings: string[]
  presentation: GuideReportPresentation | null
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
  return `Enviardian_Informe_${dateKey}_${tail}.pdf`
}

function sectionsFromViewModel(
  vm: EnviardianReportViewModel,
  communications?: GuideReportSource['communications']
): GuideReportSection[] {
  const sections: GuideReportSection[] = []
  const { hero, stats, block1, block2, block3 } = vm

  const leadParts = [
    hero.conclusion,
    ...hero.keyPoints.map((point) => `- ${point}`),
    ...stats
      .filter((stat) => stat.id !== 'pending' || hero.pendingReviewCount === 0)
      .map((stat) => stat.text),
  ].filter(Boolean)
  if (hero.pendingReviewCount > 0) {
    leadParts.push(
      hero.pendingReviewCount === 1
        ? '1 solicitud por revisar'
        : `${hero.pendingReviewCount} solicitudes por revisar`
    )
  }
  sections.push({
    title: 'Resumen ejecutivo',
    body: leadParts.join('\n'),
    kind: 'lead',
  })

  const resultLines: string[] = []
  if (block1.findings.length) {
    resultLines.push('Hallazgos:')
    for (const item of block1.findings) {
      const impact = item.businessImpact ? ` Impacto: ${item.businessImpact}.` : ''
      resultLines.push(
        `- ${item.title}: ${item.detail}${impact} [${evidenceLabel(item.evidence as EvidenceKind)}]`
      )
    }
  }
  if (block1.metrics.length) {
    resultLines.push('Indicadores verificados:')
    for (const metric of block1.metrics) {
      resultLines.push(
        `- ${metric.label}: ${metric.value}${metric.unit ? ` ${metric.unit}` : ''}`
      )
    }
  }
  if (block1.evidenceSources.length) {
    resultLines.push('Fuente de informacion:')
    for (const line of block1.evidenceSources) resultLines.push(`- ${line}`)
  }
  if (block1.technicalAttention.length) {
    resultLines.push('Atencion tecnica (no son hallazgos de negocio):')
    for (const item of block1.technicalAttention) {
      resultLines.push(`- ${item.code}${item.tool ? ` · ${item.tool}` : ''}: ${item.message}`)
    }
  }
  if (resultLines.length) {
    sections.push({
      title: '01 · Resultados de la sesion',
      body: [
        'Que identificamos y que datos lo respaldan.',
        ...resultLines,
      ].join('\n'),
      kind: 'finding',
    })
  }

  const analysisLines: string[] = []
  if (block2.interpretation) analysisLines.push(block2.interpretation)
  if (block2.nextStep) analysisLines.push(`Siguiente paso sugerido: ${block2.nextStep}`)
  if (block2.risks.length) {
    analysisLines.push('Riesgos y oportunidades:')
    for (const risk of block2.risks) {
      const bits = [risk.risk]
      if (risk.consequence) bits.push(`Consecuencia: ${risk.consequence}`)
      if (risk.mitigation) bits.push(`Mitigacion: ${risk.mitigation}`)
      if (risk.opportunity) bits.push(`Oportunidad: ${risk.opportunity}`)
      analysisLines.push(`- ${bits.join(' · ')}`)
    }
  }
  if (block2.recommendations.length) {
    analysisLines.push('Recomendaciones de Enviardian (sugerencias, no decisiones confirmadas):')
    block2.recommendations.forEach((item, index) => {
      if (item.what || item.why || item.outcome) {
        const parts = [`${index + 1}.`]
        if (item.what) parts.push(`Que: ${item.what}`)
        if (item.why) parts.push(`Por que: ${item.why}`)
        if (item.outcome) parts.push(`Resultado: ${item.outcome}`)
        analysisLines.push(parts.join(' '))
      } else {
        analysisLines.push(`${index + 1}. ${item.text}`)
      }
    })
  }
  if (analysisLines.length) {
    sections.push({
      title: '02 · Analisis y recomendaciones',
      body: [
        'Que significan los resultados y que conviene hacer.',
        ...analysisLines,
      ].join('\n'),
      kind: 'ai',
    })
  }

  const followLines: string[] = []
  const pdfComms = communications?.length ? communications : null
  if (pdfComms?.length) {
    followLines.push('Comunicaciones (estado al generar el PDF; la aprobacion se hace en la app):')
    for (const item of pdfComms) {
      const channel = item.channel || 'mensaje'
      const status = item.status || 'pendiente'
      const who = item.recipient ? ` → ${item.recipient}` : ''
      followLines.push(`- [${status}] ${channel}: ${item.title || 'Borrador'}${who}`)
    }
  }
  if (block3.boardProposals.length) {
    followLines.push('Tareas e iniciativas propuestas:')
    for (const item of block3.boardProposals) {
      followLines.push(`- [${item.statusLabel}] ${item.title}`)
    }
  }
  if (block3.orphanCommitments.length) {
    followLines.push('Compromisos registrados:')
    for (const item of block3.orphanCommitments) {
      const who = item.ownerHint || 'Por definir'
      const when = item.dueDateHint || 'Por definir'
      followLines.push(`- [${item.statusLabel}] ${item.title} | ${who} | ${when}`)
    }
  }
  if (block3.pendingDecisions.length) {
    followLines.push('Decisiones pendientes:')
    for (const item of block3.pendingDecisions) followLines.push(`- ${item}`)
  }
  if (block3.executed.length || block3.confirmedDecisions.length) {
    followLines.push('Operaciones ejecutadas:')
    for (const item of block3.executed) followLines.push(`- [${item.statusLabel}] ${item.title}`)
    for (const item of block3.confirmedDecisions) followLines.push(`- [Confirmada] ${item}`)
  }
  if (followLines.length) {
    sections.push({
      title: '03 · Pendientes de aprobacion',
      body: [
        'Que necesita tu revision para continuar.',
        ...followLines,
      ].join('\n'),
      kind: 'action',
    })
  }

  return sections.filter((section) => section.body.trim())
}

export function buildGuideReportPresentation(
  source: GuideReportSource,
  generatedAtIso: string
): GuideReportPresentation {
  const vm = buildReportViewModel({
    executiveReport: source.executive_report,
    summary: source.summary,
    topic: source.topic,
    createdAt: source.created_at,
    sessionId: source.session_id,
  })

  const document = vm?.document ?? null
  const sections = vm ? sectionsFromViewModel(vm, source.communications) : []

  const limitations: string[] = []
  if (!source.executive_report?.trim() && source.summary?.trim()) {
    limitations.push('El informe usa el resumen almacenado; no hay reporte ejecutivo estructurado.')
  }
  if (document?.metadata.interviewOnly) {
    limitations.push('Este informe se basa solo en la entrevista; no hubo consulta exitosa al tablero.')
  }
  if (document?.metadata.consultFailed) {
    limitations.push('Una consulta al tablero fallo durante la entrevista.')
  }
  if (sections.length === 0) {
    limitations.push('No hay secciones con contenido suficiente para exportar.')
  }

  const topic = document?.metadata.topic || source.topic?.trim() || 'Sesion con Guia'
  const interviewIso = document?.metadata.startedAt || source.created_at
  const interviewAtLabel =
    formatReportDateTimeCDMX(interviewIso) || 'Fecha de entrevista no disponible'
  const generatedAtLabel =
    formatReportDateTimeCDMX(generatedAtIso) || 'Fecha de generacion no disponible'
  const sessionClean = (document?.metadata.sessionId || source.session_id || '').replace(
    /[^a-zA-Z0-9]/g,
    ''
  )
  const sessionShort = sessionClean ? sessionClean.slice(-8) : null

  return {
    brand: 'Scrumban · Enviardian',
    title: 'Informe ejecutivo',
    topic,
    interviewAtLabel,
    generatedAtLabel,
    sessionLabel: sessionShort ? `Ref. sesion ${sessionShort}` : null,
    entryId: source.id ?? null,
    interviewDateKey: reportDateKeyCDMX(interviewIso),
    participant: document?.metadata.participant ?? null,
    document,
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
