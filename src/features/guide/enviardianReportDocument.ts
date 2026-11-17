/**
 * Documento canónico del informe ejecutivo Enviardian (v3).
 * Persistido como JSON en guide_journal.executive_report.
 * Web, PDF y WhatsApp leen el mismo modelo; v2 texto se adapta.
 */

export const ENVIARDIAN_REPORT_DOC_VERSION = 'enviardian-informe-v3' as const

export type EvidenceKind = 'verified' | 'said' | 'hypothesis' | 'recommendation'

export type ReportCommitmentStatus = 'confirmed' | 'proposal' | 'pending'

export type ReportDateKind = 'explicit' | 'inferred' | 'missing'

export type EnviardianTechnicalAttention = {
  code: string
  message: string
  tool?: string
  at?: string
  retryable?: boolean
}

export type EnviardianCommunicationDraftRef = {
  pendingOpId: string
  channel: 'email' | 'whatsapp' | 'event' | 'other'
  status: string
  purpose?: string
  recipientHint?: string
}

export type EnviardianKeyFinding = {
  title: string
  detail: string
  businessImpact?: string
  evidence: EvidenceKind
  source?: string
}

export type EnviardianVerifiedMetric = {
  label: string
  value: string
  unit?: string
  asOf?: string
  sourceTool?: string
}

export type EnviardianRisk = {
  risk: string
  consequence?: string
  mitigation?: string
  opportunity?: string
}

export type EnviardianCommitment = {
  action: string
  ownerHint?: string
  dueDateHint?: string
  dueDateKind?: ReportDateKind
  status: ReportCommitmentStatus
}

/** Acciones de la sesion: ejecutadas vs pendientes vs recomendaciones no ejecutadas. */
export type EnviardianSessionActionStatus =
  | 'executed'
  | 'pending_confirmation'
  | 'commitment'
  | 'recommendation'

export type EnviardianSessionAction = {
  title: string
  status: EnviardianSessionActionStatus
  id?: string
  href?: string
  ownerHint?: string
  dueDateHint?: string
  kind?: 'action' | 'initiative' | 'recommendation'
}

export type EnviardianReportDocument = {
  version: typeof ENVIARDIAN_REPORT_DOC_VERSION
  metadata: {
    topic: string
    participant?: string
    startedAt?: string
    closedAt?: string
    durationLabel?: string
    sessionId?: string
    generationStatus: 'ready' | 'insufficient' | 'partial'
    interviewOnly?: boolean
    consultFailed?: boolean
  }
  executive_summary: {
    text: string
    headlineFinding?: string
    nextStep?: string
  }
  key_findings: EnviardianKeyFinding[]
  verified_metrics: EnviardianVerifiedMetric[]
  risks: EnviardianRisk[]
  confirmed_decisions: string[]
  pending_decisions: string[]
  recommendations: string[]
  confirmed_commitments: EnviardianCommitment[]
  session_actions: EnviardianSessionAction[]
  evidence_sources: string[]
  /** Fallas de tools/integración; no son hallazgos de negocio. */
  technical_attention?: EnviardianTechnicalAttention[]
  /** Refs a assistant_pending_ops (fuente de verdad de borradores). */
  communication_drafts?: EnviardianCommunicationDraftRef[]
  counts?: {
    findings: number
    pendingDecisions: number
    commitments: number
    technicalAttention?: number
    communicationDrafts?: number
  }
}

function asString(value: unknown, max = 2000) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function asStringList(value: unknown, maxItems = 8, maxLen = 500): string[] {
  if (!Array.isArray(value)) {
    const single = asString(value, maxLen)
    return single ? [single] : []
  }
  return value
    .map((item) => asString(item, maxLen))
    .filter(Boolean)
    .slice(0, maxItems)
}

function asEvidence(value: unknown): EvidenceKind {
  const raw = asString(value, 40).toLowerCase()
  if (raw === 'verified' || raw === 'verificado') return 'verified'
  if (raw === 'hypothesis' || raw === 'hipotesis' || raw === 'hipótesis') return 'hypothesis'
  if (raw === 'recommendation' || raw === 'recomendacion' || raw === 'recomendación') return 'recommendation'
  return 'said'
}

function asCommitmentStatus(value: unknown): ReportCommitmentStatus {
  const raw = asString(value, 40).toLowerCase()
  if (raw === 'confirmed' || raw === 'confirmado') return 'confirmed'
  if (raw === 'pending' || raw === 'pendiente') return 'pending'
  if (raw === 'undefined' || raw === 'null' || raw === '') return 'pending'
  if (raw === 'proposal' || raw === 'propuesta') return 'proposal'
  return 'proposal'
}

function asDateKind(value: unknown): ReportDateKind | undefined {
  const raw = asString(value, 40).toLowerCase()
  if (raw === 'explicit' || raw === 'inferred' || raw === 'missing') return raw
  return undefined
}

const TOOLISH_RE =
  /\b(get_okr_progress|get_my_actions|queue_workspace_draft|confirm_pending_op|PERMISSION_DENIED|AUTHENTICATION_FAILED)\b/i

function stripToolishPrefix(text: string): string {
  const m = text.trim().match(/^([a-z0-9_]+)\s*:\s*(.+)$/i)
  if (m && TOOLISH_RE.test(m[1])) return m[2].trim()
  return text.trim()
}

function isTechnicalNarrative(text: string): boolean {
  return TOOLISH_RE.test(text) || /\b(timeout|tool call|stack trace|ECONNRESET)\b/i.test(text)
}

function asSessionActionStatus(value: unknown): EnviardianSessionActionStatus {
  const raw = asString(value, 40).toLowerCase()
  if (raw === 'executed' || raw === 'ejecutada' || raw === 'confirmado' || raw === 'confirmed') return 'executed'
  if (raw === 'pending_confirmation' || raw === 'pending' || raw === 'propuesta' || raw === 'proposal') {
    return 'pending_confirmation'
  }
  if (raw === 'recommendation' || raw === 'recomendacion' || raw === 'recomendación') return 'recommendation'
  return 'commitment'
}

export function sessionActionHref(id: string | null | undefined) {
  if (!id?.trim()) return undefined
  return `/kanban?accion=${encodeURIComponent(id.trim())}`
}

/** Fuente unica: created_work (recomendaciones LLM van al bloque de analisis, no aqui). */
export function buildSessionActions(input: {
  createdWork?: Array<{
    title?: string | null
    id?: string | null
    pending?: boolean
    error?: string | null
    ownerHint?: string | null
    dueDateHint?: string | null
    kind?: string | null
  }> | null
  /** @deprecated Ignorado: las recomendaciones no se convierten en session_actions. */
  recommendations?: string[] | null
}): EnviardianSessionAction[] {
  const actions: EnviardianSessionAction[] = []
  for (const item of input.createdWork ?? []) {
    const title = asString(item.title, 200)
    if (!title || item.error) continue
    const status: EnviardianSessionActionStatus = item.pending ? 'pending_confirmation' : 'executed'
    const id = asString(item.id, 80) || undefined
    actions.push({
      title,
      status,
      id,
      href: id ? sessionActionHref(id) : undefined,
      ownerHint: asString(item.ownerHint, 80) || undefined,
      dueDateHint: asString(item.dueDateHint, 80) || undefined,
      kind: item.kind === 'initiative' ? 'initiative' : 'action',
    })
  }
  return actions.slice(0, 12)
}

function clipWords(text: string, maxWords: number) {
  const words = text.trim().split(/\s+/).filter(Boolean)
  if (words.length <= maxWords) return words.join(' ')
  return `${words.slice(0, maxWords).join(' ')}…`
}

export function isEnviardianReportDocument(value: unknown): value is EnviardianReportDocument {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const row = value as Record<string, unknown>
  return row.version === ENVIARDIAN_REPORT_DOC_VERSION && typeof row.executive_summary === 'object'
}

/** Detecta y parsea JSON v3; null si es texto legacy u otro formato. */
export function tryParseReportDocument(raw: string | null | undefined): EnviardianReportDocument | null {
  if (!raw?.trim()) return null
  const trimmed = raw.trim()
  if (!trimmed.startsWith('{')) return null
  try {
    const parsed = JSON.parse(trimmed) as unknown
    if (!isEnviardianReportDocument(parsed)) return null
    return normalizeReportDocument(parsed)
  } catch {
    return null
  }
}

export function serializeReportDocument(doc: EnviardianReportDocument): string {
  return JSON.stringify(normalizeReportDocument(doc)).slice(0, 12000)
}

export function normalizeReportDocument(
  input: Omit<EnviardianReportDocument, 'session_actions'> & {
    session_actions?: EnviardianSessionAction[]
  }
): EnviardianReportDocument {
  const rawFindings = (input.key_findings ?? [])
    .map((item) => ({
      title: stripToolishPrefix(asString(item.title, 120)) || 'Hallazgo',
      detail: stripToolishPrefix(asString(item.detail, 600)),
      businessImpact: asString(item.businessImpact, 300) || undefined,
      evidence: asEvidence(item.evidence),
      source: asString(item.source, 200) || undefined,
    }))
    .filter((item) => item.detail || item.title)

  const technicalFromFindings: EnviardianTechnicalAttention[] = []
  const findings = rawFindings
    .filter((item) => {
      if (isTechnicalNarrative(item.title) || isTechnicalNarrative(item.detail)) {
        technicalFromFindings.push({
          code: 'TECHNICAL_FINDING',
          message: (item.detail || item.title).slice(0, 400),
        })
        return false
      }
      return true
    })
    .slice(0, 5)

  const commitments = (input.confirmed_commitments ?? [])
    .map((item) => ({
      action: stripToolishPrefix(asString(item.action, 200)),
      ownerHint: asString(item.ownerHint, 80) || undefined,
      dueDateHint: asString(item.dueDateHint, 80) || undefined,
      dueDateKind: asDateKind((item as EnviardianCommitment).dueDateKind) || (asString(item.dueDateHint, 80) ? 'inferred' as const : 'missing' as const),
      status: asCommitmentStatus(item.status),
    }))
    .filter((item) => item.action && !isTechnicalNarrative(item.action))
    .slice(0, 6)

  const pendingRaw = asStringList(input.pending_decisions, 6, 300)
  const recommendationsRaw = asStringList(input.recommendations, 3, 400)
  const pending = pendingRaw.filter((line) => !isTechnicalNarrative(line)).map(stripToolishPrefix)
  const recommendations = recommendationsRaw
    .filter((line) => !isTechnicalNarrative(line))
    .map(stripToolishPrefix)
  const summaryText = clipWords(asString(input.executive_summary?.text, 900) || 'Conversacion breve; se conserva lo esencial.', 120)

  const technicalAttention = [
    ...technicalFromFindings,
    ...((input.technical_attention ?? []) as EnviardianTechnicalAttention[]),
  ]
    .map((item) => ({
      code: asString(item.code, 60) || 'UNKNOWN_ERROR',
      message: asString(item.message, 400),
      tool: asString(item.tool, 60) || undefined,
      at: asString(item.at, 40) || undefined,
      retryable: Boolean(item.retryable),
    }))
    .filter((item) => item.message)
    .slice(0, 12)

  const communicationDrafts = (input.communication_drafts ?? [])
    .map((item) => ({
      pendingOpId: asString(item.pendingOpId, 80),
      channel:
        item.channel === 'whatsapp' || item.channel === 'event' || item.channel === 'email'
          ? item.channel
          : ('other' as const),
      status: asString(item.status, 40) || 'pending',
      purpose: asString(item.purpose, 200) || undefined,
      recipientHint: asString(item.recipientHint, 120) || undefined,
    }))
    .filter((item) => item.pendingOpId)
    .slice(0, 12)

  const evidence = asStringList(input.evidence_sources, 12, 400).map(stripToolishPrefix)

  const doc: EnviardianReportDocument = {
    version: ENVIARDIAN_REPORT_DOC_VERSION,
    metadata: {
      topic: asString(input.metadata?.topic, 200) || 'Sesion con Enviardian',
      participant: asString(input.metadata?.participant, 120) || undefined,
      startedAt: asString(input.metadata?.startedAt, 40) || undefined,
      closedAt: asString(input.metadata?.closedAt, 40) || undefined,
      durationLabel: asString(input.metadata?.durationLabel, 40) || undefined,
      sessionId: asString(input.metadata?.sessionId, 80) || undefined,
      generationStatus: input.metadata?.generationStatus === 'insufficient'
        ? 'insufficient'
        : input.metadata?.generationStatus === 'partial'
          ? 'partial'
          : 'ready',
      interviewOnly: Boolean(input.metadata?.interviewOnly),
      consultFailed: Boolean(input.metadata?.consultFailed),
    },
    executive_summary: {
      text: summaryText,
      headlineFinding: (() => {
        const raw =
          asString(input.executive_summary?.headlineFinding, 240) || findings[0]?.title || undefined
        if (!raw || isTechnicalNarrative(raw)) return findings[0]?.title
        return stripToolishPrefix(raw)
      })(),
      nextStep:
        asString(input.executive_summary?.nextStep, 240) ||
        commitments.find((c) => c.status === 'confirmed')?.action ||
        commitments[0]?.action ||
        undefined,
    },
    key_findings: findings,
    verified_metrics: (input.verified_metrics ?? [])
      .map((item) => ({
        label: asString(item.label, 80),
        value: asString(item.value, 80),
        unit: asString(item.unit, 20) || undefined,
        asOf: asString(item.asOf, 40) || undefined,
        sourceTool: asString(item.sourceTool, 60) || undefined,
      }))
      .filter((item) => item.label && item.value)
      .slice(0, 8),
    risks: (input.risks ?? [])
      .map((item) => ({
        risk: asString(item.risk, 240),
        consequence: asString(item.consequence, 240) || undefined,
        mitigation: asString(item.mitigation, 240) || undefined,
        opportunity: asString(item.opportunity, 240) || undefined,
      }))
      .filter((item) => item.risk && !isTechnicalNarrative(item.risk))
      .slice(0, 4),
    confirmed_decisions: asStringList(input.confirmed_decisions, 6, 300).filter(
      (line) => !isTechnicalNarrative(line)
    ),
    pending_decisions: pending,
    recommendations,
    confirmed_commitments: commitments,
    session_actions: (input.session_actions ?? [])
      .map((item) => ({
        title: asString(item.title, 200),
        status: asSessionActionStatus(item.status),
        id: asString(item.id, 80) || undefined,
        href: asString(item.href, 200) || (item.id ? sessionActionHref(String(item.id)) : undefined),
        ownerHint: asString(item.ownerHint, 80) || undefined,
        dueDateHint: asString(item.dueDateHint, 80) || undefined,
        kind:
          item.kind === 'initiative' || item.kind === 'recommendation' || item.kind === 'action'
            ? item.kind
            : undefined,
      }))
      .filter(
        (item) =>
          item.title &&
          !isTechnicalNarrative(item.title) &&
          item.status !== 'recommendation' &&
          item.kind !== 'recommendation'
      )
      .slice(0, 12),
    evidence_sources: evidence,
    technical_attention: technicalAttention,
    communication_drafts: communicationDrafts,
  }

  doc.counts = {
    findings: doc.key_findings.length,
    pendingDecisions: doc.pending_decisions.length,
    commitments: doc.confirmed_commitments.filter((c) => c.status === 'confirmed').length,
    technicalAttention: doc.technical_attention?.length ?? 0,
    communicationDrafts: doc.communication_drafts?.length ?? 0,
  }
  return doc
}

/** Adapta texto legacy (v2 ALL-CAPS) al documento v3 para UI/PDF. */
export function adaptV2TextToReportDocument(input: {
  executiveReport?: string | null
  summary?: string | null
  topic?: string | null
  createdAt?: string | null
  sessionId?: string | null
}): EnviardianReportDocument {
  const raw = input.executiveReport?.trim() || ''
  const blocks = parseLegacyBlocks(raw)
  const bodyOf = (re: RegExp) => blocks.find((b) => b.title && re.test(b.title))?.body.trim() || ''
  const bullets = (body: string, max = 5) =>
    body
      .split('\n')
      .map((line) => line.replace(/^\d+\.\s*/, '').replace(/^-\s*/, '').trim())
      .filter(Boolean)
      .slice(0, max)

  const summary =
    bodyOf(/resumen ejecutivo/i) ||
    input.summary?.trim() ||
    bodyOf(/^situacion$/i) ||
    bodyOf(/lo dicho|hallazgos/i) ||
    'Conversacion breve; se conserva lo esencial.'
  const situationBody = bodyOf(/^situacion$/i) || bodyOf(/lo dicho|hallazgos/i)
  const diagnosisBody = bodyOf(/diagnostico|lo verificado/i)
  const said = [
    ...bullets(bodyOf(/hallazgos|lo dicho/i)),
    ...bullets(diagnosisBody),
    ...(situationBody && !bullets(situationBody).length ? [situationBody] : []),
  ]
  const verified = bullets(bodyOf(/lo verificado/i)).filter(
    (line) => !/se basa solo en la entrevista|no pude consultar/i.test(line)
  )
  const agreed = bullets(bodyOf(/lo acordado|decisiones y acuerdos|^decisiones$/i)).filter(
    (line) => !/no hubo acuerdos/i.test(line)
  )
  const pending = bullets(bodyOf(/informacion pendiente/i))
  const recommendations = bullets(bodyOf(/recomendaciones|prioridades/i), 3)
  const steps = bullets(bodyOf(/compromisos|plan de accion|proximos pasos/i), 6)

  const findings: EnviardianKeyFinding[] = []
  for (const line of verified.slice(0, 3)) {
    findings.push({
      title: clipTitle(line),
      detail: line.replace(/^Evidencia Scrumban:\s*/i, ''),
      evidence: 'verified',
      source: 'Scrumban',
    })
  }
  for (const line of said) {
    if (findings.length >= 5) break
    if (verified.some((v) => v === line)) continue
    findings.push({ title: clipTitle(line), detail: line.replace(/^Situacion:\s*/i, ''), evidence: 'said' })
  }

  const commitments: EnviardianCommitment[] = steps
    .filter((line) => !/sin acciones en esta entrevista/i.test(line))
    .map((line) => {
      const parts = line.split('|').map((p) => p.trim())
      if (parts.length >= 4) {
        const statusRaw = parts[3] || ''
        const status: ReportCommitmentStatus = /propuesta/i.test(statusRaw)
          ? 'proposal'
          : /por confirmar|por definir/i.test(statusRaw)
            ? 'pending'
            : 'confirmed'
        return {
          action: parts[0] || line,
          ownerHint: parts[1] && !/^por definir$/i.test(parts[1]) ? parts[1] : undefined,
          dueDateHint: parts[2] && !/^por definir$/i.test(parts[2]) ? parts[2] : undefined,
          status,
        }
      }
      return { action: line, status: 'pending' as const }
    })

  return normalizeReportDocument({
    version: ENVIARDIAN_REPORT_DOC_VERSION,
    metadata: {
      topic: input.topic?.trim() || 'Sesion con Enviardian',
      startedAt: input.createdAt || undefined,
      sessionId: input.sessionId || undefined,
      generationStatus: 'ready',
      interviewOnly: verified.length === 0,
    },
    executive_summary: {
      text: summary,
      headlineFinding: findings[0]?.title,
      nextStep: commitments[0]?.action,
    },
    key_findings: findings,
    verified_metrics: [],
    risks: [],
    confirmed_decisions: agreed,
    pending_decisions: pending,
    recommendations,
    confirmed_commitments: commitments,
    session_actions: [
      ...commitments.map((c) => ({
        title: c.action,
        status:
          c.status === 'confirmed'
            ? ('executed' as const)
            : c.status === 'proposal'
              ? ('pending_confirmation' as const)
              : ('commitment' as const),
        ownerHint: c.ownerHint,
        dueDateHint: c.dueDateHint,
        kind: 'action' as const,
      })),
      ...recommendations.map((title) => ({
        title,
        status: 'recommendation' as const,
        kind: 'recommendation' as const,
      })),
    ],
    evidence_sources: verified,
  })
}

function clipTitle(text: string) {
  const clean = text.replace(/^Situacion:\s*/i, '').replace(/^Evidencia Scrumban:\s*/i, '').trim()
  if (clean.length <= 72) return clean || 'Hallazgo'
  return `${clean.slice(0, 69)}…`
}

function parseLegacyBlocks(raw: string): Array<{ title: string | null; body: string }> {
  if (!raw.trim()) return []
  const lines = raw.replace(/\r\n/g, '\n').split('\n').map((l) => l.trim()).filter(Boolean)
  const blocks: Array<{ title: string | null; body: string }> = []
  let current: { title: string | null; body: string } | null = null
  const isHeading = (line: string) => {
    if (line.length > 48) return false
    if (/^REPORTE\b/i.test(line)) return true
    return /^[A-ZÁÉÍÓÚÑ0-9][A-ZÁÉÍÓÚÑ0-9\s\-—–:]{2,}$/.test(line) && /[A-ZÁÉÍÓÚÑ]/.test(line)
  }
  for (const line of lines) {
    if (isHeading(line)) {
      if (current && current.body.trim()) blocks.push(current)
      current = { title: line, body: '' }
      continue
    }
    if (!current) current = { title: null, body: '' }
    current.body = current.body ? `${current.body}\n${line}` : line
  }
  if (current && (current.title || current.body.trim())) blocks.push(current)
  return blocks
}

export function resolveReportDocument(input: {
  executiveReport?: string | null
  summary?: string | null
  topic?: string | null
  createdAt?: string | null
  sessionId?: string | null
}): EnviardianReportDocument | null {
  const fromJson = tryParseReportDocument(input.executiveReport)
  if (fromJson) return fromJson
  if (input.executiveReport?.trim() || input.summary?.trim()) {
    return adaptV2TextToReportDocument(input)
  }
  return null
}

/** Extrae métricas simples de líneas de consult_log (sin inventar). */
export function metricsFromEvidenceSources(lines: string[]): EnviardianVerifiedMetric[] {
  const metrics: EnviardianVerifiedMetric[] = []
  for (const line of lines) {
    const match = line.match(
      /(?:open|abiertas|vencidas|overdue|blocked|bloqueadas|progress|progreso)[^\d%]*(\d+(?:\.\d+)?%?)/i
    )
    if (!match) continue
    const labelMatch = line.match(/^([^:]+):/)
    metrics.push({
      label: (labelMatch?.[1] || 'Dato verificado').trim().slice(0, 60),
      value: match[1]!,
      sourceTool: labelMatch?.[1]?.split(':')[0]?.trim(),
    })
    if (metrics.length >= 6) break
  }
  return metrics
}

export function evidenceLabel(kind: EvidenceKind): string {
  if (kind === 'verified') return 'Confirmado en Scrumban'
  if (kind === 'hypothesis') return 'Interpretacion de Enviardian'
  if (kind === 'recommendation') return 'Sugerencia de Enviardian'
  return 'Reportado en entrevista'
}

export type BuildReportDocumentInput = {
  topic?: string | null
  summary?: string | null
  sessionId?: string | null
  participant?: string | null
  startedAt?: string | null
  closedAt?: string | null
  durationLabel?: string | null
  interviewOnly?: boolean
  consultFailed?: boolean
  generationStatus?: EnviardianReportDocument['metadata']['generationStatus']
  /** Hallazgos del LLM (sin verified). */
  llmFindings?: Array<{
    title?: string
    detail?: string
    businessImpact?: string
    evidence?: string
  }>
  said?: string[]
  verifiedLines?: string[]
  agreed?: string[]
  pending?: string[]
  recommendations?: string[]
  nextSteps?: string[]
  risks?: Array<{ risk?: string; consequence?: string; mitigation?: string; opportunity?: string }>
  commitments?: Array<{
    action: string
    ownerHint?: string | null
    dueDateHint?: string | null
    status?: ReportCommitmentStatus | string
  }>
  createdWork?: Array<{
    title?: string | null
    id?: string | null
    pending?: boolean
    error?: string | null
    ownerHint?: string | null
    dueDateHint?: string | null
    kind?: string | null
  }> | null
  sessionActions?: EnviardianSessionAction[] | null
  headlineFinding?: string | null
  nextStep?: string | null
  technicalAttention?: EnviardianTechnicalAttention[] | null
  communicationDrafts?: EnviardianCommunicationDraftRef[] | null
  verifiedMetrics?: EnviardianVerifiedMetric[] | null
}

/** Ensambla el documento v3: el servidor impone verified / evidence_sources / metrics. */
export function buildEnviardianReportDocument(input: BuildReportDocumentInput): EnviardianReportDocument {
  const verifiedLines = asStringList(input.verifiedLines, 12, 400).map(stripToolishPrefix)
  const findings: EnviardianKeyFinding[] = []

  for (const line of verifiedLines.slice(0, 2)) {
    const detail = stripToolishPrefix(line)
    findings.push({
      title: clipTitle(detail),
      detail,
      evidence: 'verified',
      source: 'Scrumban',
      businessImpact: undefined,
    })
  }

  const llmFindings = Array.isArray(input.llmFindings) ? input.llmFindings : []
  for (const item of llmFindings) {
    if (findings.length >= 5) break
    const evidence = asEvidence(item.evidence)
    if (evidence === 'verified') continue
    const detail = stripToolishPrefix(asString(item.detail || item.title, 600))
    if (!detail || isTechnicalNarrative(detail) || isTechnicalNarrative(asString(item.title, 120))) continue
    findings.push({
      title: stripToolishPrefix(asString(item.title, 120)) || clipTitle(detail),
      detail,
      businessImpact: asString(item.businessImpact, 300) || undefined,
      evidence,
    })
  }

  if (findings.length === 0) {
    for (const line of asStringList(input.said, 5, 400)) {
      if (isTechnicalNarrative(line)) continue
      findings.push({ title: clipTitle(line), detail: line, evidence: 'said' })
    }
  }

  const commitments: EnviardianCommitment[] = []
  for (const item of input.commitments ?? []) {
    const action = stripToolishPrefix(asString(item.action, 200))
    if (!action || isTechnicalNarrative(action)) continue
    commitments.push({
      action,
      ownerHint: asString(item.ownerHint, 80) || undefined,
      dueDateHint: asString(item.dueDateHint, 80) || undefined,
      dueDateKind: asString(item.dueDateHint, 80) ? 'inferred' : 'missing',
      status: asCommitmentStatus(item.status ?? 'proposal'),
    })
  }
  for (const step of asStringList(input.nextSteps, 3, 240)) {
    if (commitments.length >= 6) break
    if (isTechnicalNarrative(step)) continue
    if (commitments.some((c) => c.action === step)) continue
    commitments.push({ action: step, status: 'pending', dueDateKind: 'missing' })
  }

  const metrics =
    input.verifiedMetrics?.length
      ? input.verifiedMetrics
      : metricsFromEvidenceSources(verifiedLines)

  return normalizeReportDocument({
    version: ENVIARDIAN_REPORT_DOC_VERSION,
    metadata: {
      topic: asString(input.topic, 200) || 'Sesion con Enviardian',
      participant: asString(input.participant, 120) || undefined,
      startedAt: asString(input.startedAt, 40) || undefined,
      closedAt: asString(input.closedAt, 40) || undefined,
      durationLabel: asString(input.durationLabel, 40) || undefined,
      sessionId: asString(input.sessionId, 80) || undefined,
      generationStatus: input.generationStatus ?? 'ready',
      interviewOnly: Boolean(input.interviewOnly),
      consultFailed: Boolean(input.consultFailed),
    },
    executive_summary: {
      text: asString(input.summary, 900) || 'Conversacion breve; se conserva lo esencial.',
      headlineFinding: asString(input.headlineFinding, 240) || findings[0]?.title,
      nextStep:
        asString(input.nextStep, 240) ||
        commitments.find((c) => c.status === 'confirmed')?.action ||
        commitments[0]?.action,
    },
    key_findings: findings,
    verified_metrics: metrics,
    risks: (input.risks ?? [])
      .map((item) => ({
        risk: asString(item.risk, 240),
        consequence: asString(item.consequence, 240) || undefined,
        mitigation: asString(item.mitigation, 240) || undefined,
        opportunity: asString(item.opportunity, 240) || undefined,
      }))
      .filter((item) => item.risk)
      .slice(0, 4),
    confirmed_decisions: asStringList(input.agreed, 6, 300),
    pending_decisions: asStringList(input.pending, 6, 300),
    recommendations: asStringList(input.recommendations, 3, 400),
    confirmed_commitments: commitments,
    session_actions:
      input.sessionActions?.length
        ? input.sessionActions
        : buildSessionActions({
            createdWork: input.createdWork,
          }),
    evidence_sources: verifiedLines,
    technical_attention: input.technicalAttention ?? [],
    communication_drafts: input.communicationDrafts ?? [],
  })
}
