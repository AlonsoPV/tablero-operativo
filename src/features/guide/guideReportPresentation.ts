import {
  evidenceLabel,
  resolveReportDocument,
  type EnviardianReportDocument,
  type EvidenceKind,
} from '@/features/guide/enviardianReportDocument'

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

function sectionFromDocument(doc: EnviardianReportDocument): GuideReportSection[] {
  const sections: GuideReportSection[] = []
  const overviewParts = [
    doc.executive_summary.text,
    doc.executive_summary.headlineFinding
      ? `Hallazgo principal: ${doc.executive_summary.headlineFinding}`
      : '',
    doc.pending_decisions.length
      ? `Decisiones pendientes: ${doc.pending_decisions.slice(0, 3).join('; ')}`
      : '',
    doc.executive_summary.nextStep ? `Siguiente paso: ${doc.executive_summary.nextStep}` : '',
  ].filter(Boolean)
  sections.push({
    title: 'Resumen ejecutivo',
    body: overviewParts.join('\n'),
    kind: 'lead',
  })

  if (doc.key_findings.length) {
    sections.push({
      title: 'Hallazgos prioritarios',
      body: doc.key_findings
        .map((item) => {
          const impact = item.businessImpact ? ` Impacto: ${item.businessImpact}.` : ''
          return `- ${item.title}: ${item.detail}${impact} [${evidenceLabel(item.evidence as EvidenceKind)}]`
        })
        .join('\n'),
      kind: 'finding',
    })
  }

  if (doc.verified_metrics.length) {
    sections.push({
      title: 'Indicadores verificados',
      body: doc.verified_metrics
        .map((m) => `- ${m.label}: ${m.value}${m.unit ? ` ${m.unit}` : ''}${m.sourceTool ? ` (${m.sourceTool})` : ''}`)
        .join('\n'),
      kind: 'metric',
    })
  }

  if (doc.confirmed_decisions.length || doc.pending_decisions.length) {
    const lines: string[] = []
    if (doc.confirmed_decisions.length) {
      lines.push('Confirmadas:')
      doc.confirmed_decisions.forEach((item) => lines.push(`- ${item}`))
    }
    if (doc.pending_decisions.length) {
      lines.push('Pendientes:')
      doc.pending_decisions.forEach((item) => lines.push(`- ${item}`))
    }
    sections.push({ title: 'Decisiones', body: lines.join('\n'), kind: 'action' })
  }

  if (doc.recommendations.length) {
    sections.push({
      title: 'Analisis Enviardian (IA)',
      body: [
        'Recomendaciones de IA — no son hechos verificados',
        ...doc.recommendations.map((item, i) => `${i + 1}. ${item}`),
      ].join('\n'),
      kind: 'ai',
    })
  }

  if (doc.session_actions?.length) {
    const label = (status: string) => {
      if (status === 'executed') return 'Ejecutada'
      if (status === 'pending_confirmation') return 'Pendiente de confirmacion'
      if (status === 'recommendation') return 'Recomendacion (no ejecutada)'
      return 'Compromiso'
    }
    sections.push({
      title: 'Acciones',
      body: doc.session_actions
        .map((item) => {
          const link = item.href ? ` · ${item.href}` : item.id ? ` · id ${item.id}` : ''
          return `- [${label(item.status)}] ${item.title}${link}`
        })
        .join('\n'),
      kind: 'action',
    })
  }

  if (doc.confirmed_commitments.length) {
    sections.push({
      title: 'Plan de accion',
      body: [
        'Accion | Responsable | Fecha | Estado',
        ...doc.confirmed_commitments.slice(0, 3).map((c) => {
          const status =
            c.status === 'confirmed' ? 'Confirmado' : c.status === 'proposal' ? 'Propuesta' : 'Por definir'
          return `- ${c.action} | ${c.ownerHint || 'Por definir'} | ${c.dueDateHint || 'Por definir'} | ${status}`
        }),
      ].join('\n'),
      kind: 'action',
    })
  }

  if (doc.risks.length) {
    sections.push({
      title: 'Riesgos y oportunidades',
      body: doc.risks
        .map((r) => {
          const bits = [r.risk]
          if (r.consequence) bits.push(`Consecuencia: ${r.consequence}`)
          if (r.mitigation) bits.push(`Mitigacion: ${r.mitigation}`)
          if (r.opportunity) bits.push(`Oportunidad: ${r.opportunity}`)
          return `- ${bits.join(' · ')}`
        })
        .join('\n'),
      kind: 'risk',
    })
  }

  if (doc.evidence_sources.length) {
    sections.push({
      title: 'Fuentes verificadas',
      body: doc.evidence_sources.map((line) => `- ${line}`).join('\n'),
      kind: 'note',
    })
  }

  if (doc.executive_summary.nextStep) {
    sections.push({
      title: 'Proximo paso',
      body: doc.executive_summary.nextStep,
      kind: 'closing',
    })
  }

  return sections.filter((section) => section.body.trim())
}

export function buildGuideReportPresentation(
  source: GuideReportSource,
  generatedAtIso: string
): GuideReportPresentation {
  const document = resolveReportDocument({
    executiveReport: source.executive_report,
    summary: source.summary,
    topic: source.topic,
    createdAt: source.created_at,
    sessionId: source.session_id,
  })

  const sections = document ? sectionFromDocument(document) : []
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
  const sessionClean = (document?.metadata.sessionId || source.session_id || '').replace(/[^a-zA-Z0-9]/g, '')
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
