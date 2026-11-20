/**
 * Capa de presentación posterior a la consulta y la autorización: convierte el contrato tipado
 * (AnswerFacts) en Directo, Reporte o Análisis. Nunca consulta, nunca decide permisos y nunca
 * agrega datos: sólo selecciona y ordena lo que el contrato ya trae, igual en todos los formatos.
 * Los canales (web, WhatsApp, voz) adaptan marcado y longitud sobre la misma estructura.
 */
import type {
  AssistantActionRowView,
  AssistantMetric,
  AssistantOkrRowView,
  AssistantUiPayload,
} from '../../../src/features/ai-support/chatViews/types.js'
import type { AnswerFacts, AnswerFinding, AnswerItem, ResolvedFormat } from './answerContract.js'
import { DEEPEN_HINT } from './responseFormat.js'
import { formatAsOf, type AgentResponse } from './respond.js'

export type RenderedSection = {
  /** Vacío = sin encabezado. */
  title: string
  lines: string[]
  /** Líneas que conserva la voz (por defecto 1). */
  voice?: number
  /** Advertencias de `lines` que la voz nunca omite, aunque haya que acortar lo demás. */
  critical?: string[]
  /** Las líneas pueden recortarse en canales con límite de longitud; las advertencias, no. */
  shrinkable?: boolean
}

export type RenderedAnswer = {
  format: ResolvedFormat
  sections: RenderedSection[]
  asOf: string | null
  /** Sólo para modo Automático ambiguo: invita a profundizar. */
  hint: string | null
}

const SHOWN_ITEMS = 5

/** Sólo hay presentación por formato cuando existen datos autorizados. */
export function hasFormattableFacts(response: AgentResponse): response is AgentResponse & { facts: AnswerFacts } {
  return Boolean(response.facts) && (response.status === 'ok' || response.status === 'partial')
}

function itemLine(item: AnswerItem): string {
  switch (item.kind) {
    case 'action': {
      const flags = item.flags.length ? `, ${item.flags.join(', ')}` : ''
      const owner = item.owner ? ` · ${item.owner}` : ''
      return `${item.title} (${item.status ?? 'sin estado'}, ${item.date ?? 'sin fecha'}${flags})${owner}`
    }
    case 'okr':
      return `${item.title}: ${item.progress == null ? 'sin datos suficientes' : `${Math.round(item.progress)}% de avance`}${item.withoutInitiatives ? ' · sin iniciativas' : ''}`
    case 'group':
      return `${item.title}: ${item.count}`
  }
}

function findingLine(finding: AnswerFinding): string {
  switch (finding.basis) {
    case 'inference':
      return `Inferencia: ${finding.text}`
    case 'hypothesis':
      return `Hipótesis (no comprobada): ${finding.text}`
    default:
      return finding.text
  }
}

function bullets(lines: string[]): string[] {
  return lines.map((line) => `- ${line}`)
}

function unique(lines: string[]): string[] {
  return [...new Set(lines.filter((line) => line.trim().length > 0))]
}

function direct(facts: AnswerFacts): RenderedSection[] {
  const first = facts.findings[0]
  const lines = unique([
    facts.primary?.text ?? '',
    first ? findingLine(first) : '',
    facts.recommendations[0] ?? '',
    ...facts.warnings,
  ])
  return [{ title: '', lines, voice: lines.length, critical: facts.warnings }]
}

function report(facts: AnswerFacts): RenderedSection[] {
  const sections: RenderedSection[] = []
  if (facts.primary) sections.push({ title: '', lines: [facts.primary.text], voice: 1 })

  const metricLines = facts.metrics.map((m) => `${m.label}: ${m.value}${m.scope ? ` (${m.scope})` : ''}`)
  if (metricLines.length > 1) {
    // En voz la cifra principal ya dice el total; los indicadores sólo se leen si no hay otra cifra.
    sections.push({ title: 'Indicadores', lines: bullets(metricLines), voice: facts.primary?.value !== undefined ? 0 : 2 })
  }

  const actions = facts.items.filter((i) => i.kind === 'action').slice(0, SHOWN_ITEMS)
  if (actions.length) sections.push({ title: 'Prioridades', lines: bullets(actions.map(itemLine)), voice: 1, shrinkable: true })

  const comparison = facts.items.filter((i) => i.kind !== 'action').slice(0, SHOWN_ITEMS + 3)
  if (comparison.length) sections.push({ title: 'Comparativo', lines: bullets(comparison.map(itemLine)), voice: 1, shrinkable: true })

  const risks = facts.findings.filter((f) => f.risk).map(findingLine)
  if (risks.length) sections.push({ title: 'Riesgos', lines: bullets(risks), voice: 1 })
  const others = facts.findings.filter((f) => !f.risk).map(findingLine)
  if (others.length) sections.push({ title: 'Hallazgos', lines: bullets(others), voice: 1 })

  if (facts.recommendations.length) sections.push({ title: 'Recomendación', lines: facts.recommendations, voice: 1 })
  if (facts.limitations.length) {
    sections.push({ title: 'Limitaciones', lines: facts.limitations, voice: 0, critical: facts.warnings })
  }
  return sections
}

function analysis(facts: AnswerFacts): RenderedSection[] {
  const sections: RenderedSection[] = []
  // Una cifra principal con valor ya cubre el total; si sólo es un resumen, el detalle son los indicadores.
  const summarized = facts.primary !== null && facts.primary.value === undefined && facts.metrics.length > 0
  const lead = facts.primary && !summarized ? [facts.primary.text] : []
  const detail = summarized ? facts.metrics.map((m) => `${m.label}: ${m.value}${m.scope ? ` (${m.scope})` : ''}`) : []
  const evidence = unique([
    ...lead,
    ...detail,
    ...facts.items.slice(0, SHOWN_ITEMS).map(itemLine),
    ...facts.findings.filter((f) => f.basis === 'evidence').map((f) => f.text),
  ])
  if (evidence.length) sections.push({ title: 'Evidencia', lines: bullets(evidence), voice: 2, shrinkable: true })

  const inferences = facts.findings.filter((f) => f.basis === 'inference').map((f) => f.text)
  const hypotheses = facts.findings.filter((f) => f.basis === 'hypothesis').map((f) => f.text)
  if (inferences.length) sections.push({ title: 'Inferencias (no son datos del sistema)', lines: bullets(inferences), voice: 1 })
  if (hypotheses.length) sections.push({ title: 'Hipótesis (no comprobadas)', lines: bullets(hypotheses), voice: 1 })
  if (!inferences.length && !hypotheses.length) {
    sections.push({
      title: 'Inferencias',
      lines: ['Sin inferencias: los datos consultados no permiten proponer causas.'],
      voice: 1,
    })
  }

  if (facts.recommendations.length) sections.push({ title: 'Recomendaciones', lines: bullets(facts.recommendations), voice: 1 })
  if (facts.limitations.length) {
    sections.push({
      title: 'Limitaciones',
      lines: bullets(facts.limitations),
      voice: 0,
      critical: bullets(facts.warnings),
    })
  }
  return sections
}

/**
 * `null` cuando no hay datos que presentar (vacío, sin autorización, error, aclaración,
 * propuesta): esos estados se muestran igual en todos los formatos.
 */
export function renderAnswer(
  response: AgentResponse,
  format: ResolvedFormat,
  options: { offerDetail?: boolean } = {}
): RenderedAnswer | null {
  if (!hasFormattableFacts(response)) return null
  const { facts } = response
  const sections = format === 'direct' ? direct(facts) : format === 'report' ? report(facts) : analysis(facts)
  return {
    format,
    sections,
    asOf: response.asOf,
    hint: format === 'direct' && options.offerDetail ? DEEPEN_HINT : null,
  }
}

export function composeRendered(rendered: RenderedAnswer, options: { headings: boolean }): string {
  const parts = rendered.sections
    .filter((s) => s.lines.length > 0)
    .map((s) => (s.title ? `${s.title}:\n${s.lines.join('\n')}` : s.lines.join('\n')))
  if (rendered.hint) parts.push(rendered.hint)
  const asOf = formatAsOf(rendered.asOf)
  if (asOf) parts.push(options.headings ? `Corte: ${asOf} (CDMX).` : `Corte ${asOf}${asOf.endsWith('.') ? '' : '.'}`)
  return parts.join('\n\n').trim()
}

/** Texto para WhatsApp: sin marcado y dentro del límite. Se acorta primero el detalle, no las advertencias. */
export function composeWhatsApp(rendered: RenderedAnswer, max: number): string {
  const plain = (text: string) => text.replace(/[#*_]/g, '')
  const working: RenderedAnswer = { ...rendered, sections: rendered.sections.map((s) => ({ ...s, lines: [...s.lines] })) }
  let text = plain(composeRendered(working, { headings: false }))
  while (text.length > max) {
    const target = working.sections
      .filter((s) => s.shrinkable && s.lines.length > 1)
      .sort((a, b) => b.lines.length - a.lines.length)[0]
    if (!target) break
    target.lines.pop()
    text = plain(composeRendered(working, { headings: false }))
  }
  return text.length <= max ? text : `${text.slice(0, max - 1).trim()}…`
}

const VOICE_MAX_LINES = 6

function spoken(line: string): string {
  const clean = line.replace(/^- /, '').replace(/[#*_]/g, '').replace(/ · /g, ', ').replace(/\s+/g, ' ').trim()
  return /[.!?…»)]$/.test(clean) ? clean : `${clean}.`
}

/** Texto para voz: sin listas ni saltos de línea, con la cifra principal y las advertencias. */
export function composeVoice(rendered: RenderedAnswer): string {
  const critical = unique(rendered.sections.flatMap((s) => (s.critical ?? []).filter((l) => s.lines.includes(l)).map(spoken)))
  const main: string[] = []
  for (const section of rendered.sections) {
    const skip = new Set((section.critical ?? []).map(spoken))
    main.push(...section.lines.slice(0, section.voice ?? 1).map(spoken).filter((l) => !skip.has(l)))
  }
  const room = Math.max(VOICE_MAX_LINES - critical.length, 1)
  return [...main.slice(0, room), ...critical].join(' ')
}

/** Vistas para la web: reutiliza los componentes existentes (resumen operativo, listas y OKR). */
export function buildReportUi(response: AgentResponse & { facts: AnswerFacts }, text: string): AssistantUiPayload {
  const { facts } = response
  const metrics: AssistantMetric[] = facts.metrics.map((m) => ({
    id: m.id,
    label: m.label,
    value: m.value,
    tone: m.tone,
    scope: m.scope,
  }))
  for (const item of facts.items) {
    if (item.kind === 'group' && metrics.length < 8) {
      metrics.push({ id: item.id, label: item.title, value: item.count })
    }
  }
  const actions: AssistantActionRowView[] = facts.items
    .filter((i): i is Extract<AnswerItem, { kind: 'action' }> => i.kind === 'action')
    .slice(0, SHOWN_ITEMS)
    .map((i) => ({
      id: i.id,
      title: i.title,
      estado: i.status,
      prioridad: i.priority,
      fecha: i.date,
      responsable: i.owner,
      href: i.href,
    }))
  const okrs: AssistantOkrRowView[] = facts.items
    .filter((i): i is Extract<AnswerItem, { kind: 'okr' }> => i.kind === 'okr')
    .slice(0, 4)
    .map((i) => ({ id: i.id, nombre: i.title, progress: i.progress, krCount: i.krCount, href: i.href }))

  const views: AssistantUiPayload['views'] = [
    {
      type: 'operational_summary',
      summary: facts.primary?.text ?? '',
      metrics,
      actions: actions.length ? actions : undefined,
      okrs: okrs.length ? okrs : undefined,
      recommendation: facts.recommendations[0] ? { text: facts.recommendations[0] } : undefined,
    },
  ]
  const notes = [
    ...facts.findings.filter((f) => f.risk).map((f) => `Riesgo — ${findingLine(f)}`),
    ...facts.limitations.map((l) => `Limitación — ${l}`),
  ]
  if (notes.length) views.push({ type: 'brief', summary: notes.join(' ') })
  return { summary: text, views }
}
