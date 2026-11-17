/**
 * Capa de presentacion del informe ejecutivo: 3 bloques, dedupe y conteos reales.
 * Web y PDF leen el mismo view model.
 */
import {
  buildSessionActions,
  evidenceLabel,
  resolveReportDocument,
  type EnviardianCommitment,
  type EnviardianKeyFinding,
  type EnviardianReportDocument,
  type EnviardianRisk,
  type EnviardianSessionAction,
  type EnviardianTechnicalAttention,
  type EnviardianVerifiedMetric,
  type EvidenceKind,
} from '@/features/guide/enviardianReportDocument'
import {
  countActionablePendingOps,
  isBoardPendingTool,
  isCommunicationPendingTool,
  splitPendingOpsByPresentation,
} from '@/features/ai-support/copilot/pendingOpTaxonomy'
import type { GuideCreatedWork } from '@/features/guide/types'

const CDMX_TZ = 'America/Mexico_City'

function formatDateTimeCDMX(iso: string | null | undefined) {
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

export type ReportLiveOp = {
  id: string
  tool?: string
  title?: string
  status?: string
  errorMessage?: string | null
  deliveryStatus?: string | null
  workspace?: {
    needsInfo?: boolean
    incomplete?: boolean
    recipientName?: string
    to?: string[]
    phone?: string
  } | null
}

export type ReportFollowUpKind = 'board' | 'commitment' | 'decision' | 'executed'

export type ReportFollowUpItem = {
  key: string
  kind: ReportFollowUpKind
  title: string
  ownerHint?: string
  dueDateHint?: string
  statusLabel: string
  statusTone: 'pending' | 'executed' | 'proposal' | 'decision'
  href?: string
  id?: string
}

export type ReportRecommendationView = {
  text: string
  what?: string
  why?: string
  outcome?: string
}

export type ReportSessionStat = {
  id: string
  text: string
}

export type EnviardianReportViewModel = {
  document: EnviardianReportDocument
  hero: {
    topic: string
    conclusion: string
    keyPoints: string[]
    dateLabel: string | null
    durationLabel?: string
    participant?: string
    pendingReviewCount: number
  }
  stats: ReportSessionStat[]
  block1: {
    findings: EnviardianKeyFinding[]
    metrics: EnviardianVerifiedMetric[]
    evidenceSources: string[]
    technicalAttention: EnviardianTechnicalAttention[]
    interviewOnly: boolean
    consultFailed: boolean
  }
  block2: {
    interpretation?: string
    nextStep?: string
    risks: EnviardianRisk[]
    recommendations: ReportRecommendationView[]
  }
  block3: {
    /** Ops de comunicación (WA/email/evento) accionables. */
    communicationOps: ReportLiveOp[]
    /** Ops de tablero accionables. */
    boardOps: ReportLiveOp[]
    /** confirmed / cancelled / expired / conflict. */
    historyOps: ReportLiveOp[]
    /** created_work ejecutado (sin duplicar ops). */
    executed: ReportFollowUpItem[]
    /**
     * Narrativa IA (no cuenta como pendiente accionable).
     * Se conserva para referencia; la UI del bloque 3 no la trata como aprobación.
     */
    narrativeNotes: {
      pendingDecisions: string[]
      confirmedDecisions: string[]
      orphanCommitments: ReportFollowUpItem[]
    }
    /** @deprecated usar communicationOps + boardOps */
    communications: ReportLiveOp[]
    /** @deprecated no inflar pendientes con session_actions sin op */
    boardProposals: ReportFollowUpItem[]
    pendingDecisions: string[]
    confirmedDecisions: string[]
    orphanCommitments: ReportFollowUpItem[]
  }
}

function normTitle(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function parseRecommendationText(text: string): ReportRecommendationView {
  const trimmed = text.trim()
  if (!trimmed) return { text: '' }

  const porque = trimmed.match(/^(.+?)\s+(?:porque|por que|debido a que)\s+(.+)$/i)
  if (porque) {
    const rest = porque[2]!.trim()
    const para = rest.match(/^(.+?)\s+(?:para|con el fin de)\s+(.+)$/i)
    if (para) {
      return {
        text: trimmed,
        what: porque[1]!.trim(),
        why: para[1]!.trim(),
        outcome: para[2]!.trim(),
      }
    }
    return { text: trimmed, what: porque[1]!.trim(), why: rest }
  }

  const paraOnly = trimmed.match(/^(.+?)\s+para\s+(.+)$/i)
  if (paraOnly && paraOnly[1]!.length > 12) {
    return {
      text: trimmed,
      what: paraOnly[1]!.trim(),
      outcome: paraOnly[2]!.trim(),
    }
  }

  return { text: trimmed }
}

function sessionActionStatusLabel(status: EnviardianSessionAction['status']) {
  if (status === 'executed') return 'Ejecutada'
  if (status === 'pending_confirmation') return 'Pendiente de aprobacion'
  if (status === 'commitment') return 'Compromiso'
  return 'Sugerencia'
}

function commitmentStatusLabel(status: EnviardianCommitment['status']) {
  if (status === 'confirmed') return 'Confirmado'
  if (status === 'proposal') return 'Propuesta'
  return 'Por confirmar'
}

function buildKeyPoints(doc: EnviardianReportDocument): string[] {
  const points: string[] = []
  const headline = doc.executive_summary.headlineFinding?.trim()
  if (headline) points.push(headline)
  for (const finding of doc.key_findings) {
    if (points.length >= 3) break
    const title = finding.title.trim()
    if (!title || points.some((p) => normTitle(p) === normTitle(title))) continue
    points.push(title)
  }
  if (points.length < 3 && doc.pending_decisions[0]) {
    points.push(`Pendiente: ${doc.pending_decisions[0]}`)
  }
  return points.slice(0, 3)
}

function buildStats(input: {
  findings: number
  metrics: number
  pendingReview: number
  executed: number
  recommendations: number
}): ReportSessionStat[] {
  const stats: ReportSessionStat[] = []
  if (input.findings > 0) {
    stats.push({
      id: 'findings',
      text:
        input.findings === 1
          ? '1 hallazgo identificado'
          : `${input.findings} hallazgos identificados`,
    })
  }
  if (input.metrics > 0) {
    stats.push({
      id: 'metrics',
      text:
        input.metrics === 1
          ? '1 indicador verificado en Scrumban'
          : `${input.metrics} indicadores verificados en Scrumban`,
    })
  }
  if (input.pendingReview > 0) {
    stats.push({
      id: 'pending',
      text:
        input.pendingReview === 1
          ? '1 solicitud por revisar'
          : `${input.pendingReview} solicitudes por revisar`,
    })
  }
  if (input.executed > 0) {
    stats.push({
      id: 'executed',
      text:
        input.executed === 1
          ? '1 operacion ejecutada'
          : `${input.executed} operaciones ejecutadas`,
    })
  }
  if (input.recommendations > 0 && stats.length < 4) {
    stats.push({
      id: 'recs',
      text:
        input.recommendations === 1
          ? '1 sugerencia de Enviardian'
          : `${input.recommendations} sugerencias de Enviardian`,
    })
  }
  return stats.slice(0, 4)
}

export function buildReportViewModel(input: {
  executiveReport?: string | null
  summary?: string | null
  topic?: string | null
  createdAt?: string | null
  sessionId?: string | null
  createdWork?: GuideCreatedWork[] | null
  communications?: ReportLiveOp[] | null
}): EnviardianReportViewModel | null {
  const document = resolveReportDocument({
    executiveReport: input.executiveReport,
    summary: input.summary,
    topic: input.topic,
    createdAt: input.createdAt,
    sessionId: input.sessionId,
  })
  if (!document) return null

  const communications = (input.communications ?? []).filter((op) => op.id)
  const split = splitPendingOpsByPresentation(communications)
  const communicationOps = split.communications
  const boardOps = [...split.board, ...split.other]
  const historyOps = split.history

  const sessionActions =
    document.session_actions?.length > 0
      ? document.session_actions.filter((a) => a.status !== 'recommendation' && a.kind !== 'recommendation')
      : buildSessionActions({ createdWork: input.createdWork })

  const claimedTitles = new Set<string>()
  const claim = (title: string) => {
    const key = normTitle(title)
    if (!key || claimedTitles.has(key)) return false
    claimedTitles.add(key)
    return true
  }

  for (const op of communications) {
    if (op.title) claim(op.title)
  }

  /** Solo trabajo ya ejecutado en tablero; pendientes viven en boardOps (pending_ops). */
  const executed: ReportFollowUpItem[] = []
  const boardProposals: ReportFollowUpItem[] = []

  for (const action of sessionActions) {
    if (action.status !== 'executed') continue
    if (!claim(action.title)) continue
    executed.push({
      key: action.id || `action:${normTitle(action.title)}`,
      kind: 'executed',
      title: action.title,
      ownerHint: action.ownerHint,
      dueDateHint: action.dueDateHint,
      statusLabel: sessionActionStatusLabel(action.status),
      statusTone: 'executed',
      href: action.href,
      id: action.id,
    })
  }

  const orphanCommitments: ReportFollowUpItem[] = []
  for (const commitment of document.confirmed_commitments) {
    if (!claim(commitment.action)) continue
    orphanCommitments.push({
      key: `commitment:${normTitle(commitment.action)}`,
      kind: 'commitment',
      title: commitment.action,
      ownerHint: commitment.ownerHint,
      dueDateHint: commitment.dueDateHint,
      statusLabel: commitmentStatusLabel(commitment.status),
      statusTone:
        commitment.status === 'confirmed'
          ? 'executed'
          : commitment.status === 'proposal'
            ? 'proposal'
            : 'pending',
    })
  }

  const pendingDecisions = document.pending_decisions.filter((line) => claim(line))
  const confirmedDecisions = document.confirmed_decisions.filter((line) => claim(`decision:${line}`))

  /** Contador exclusivo de ops persistidas, únicas y accionables. */
  const pendingReviewCount = countActionablePendingOps(communications)

  const recommendations = document.recommendations.map(parseRecommendationText).filter((r) => r.text)

  const dateIso = document.metadata.startedAt || input.createdAt
  const conclusion =
    document.executive_summary.headlineFinding?.trim() ||
    document.key_findings[0]?.title ||
    document.executive_summary.text.split(/[.!?]/)[0]?.trim() ||
    'Sesion registrada'

  return {
    document,
    hero: {
      topic: document.metadata.topic,
      conclusion,
      keyPoints: buildKeyPoints(document),
      dateLabel: formatDateTimeCDMX(dateIso),
      durationLabel: document.metadata.durationLabel,
      participant: document.metadata.participant,
      pendingReviewCount,
    },
    stats: buildStats({
      findings: document.key_findings.length,
      metrics: document.verified_metrics.length,
      pendingReview: pendingReviewCount,
      executed: executed.length,
      recommendations: recommendations.length,
    }),
    block1: {
      findings: document.key_findings,
      metrics: document.verified_metrics,
      evidenceSources: document.evidence_sources,
      technicalAttention: document.technical_attention ?? [],
      interviewOnly: Boolean(document.metadata.interviewOnly),
      consultFailed: Boolean(document.metadata.consultFailed),
    },
    block2: {
      interpretation:
        document.executive_summary.text.trim() !== conclusion
          ? document.executive_summary.text
          : undefined,
      nextStep: document.executive_summary.nextStep,
      risks: document.risks,
      recommendations,
    },
    block3: {
      communicationOps,
      boardOps,
      historyOps,
      executed,
      narrativeNotes: {
        pendingDecisions,
        confirmedDecisions,
        orphanCommitments,
      },
      communications,
      boardProposals,
      pendingDecisions,
      confirmedDecisions,
      orphanCommitments,
    },
  }
}

export function evidenceKindLabel(kind: EvidenceKind) {
  return evidenceLabel(kind)
}

export function countPendingReview(vm: EnviardianReportViewModel) {
  return vm.hero.pendingReviewCount
}

export function hasFollowUpContent(vm: EnviardianReportViewModel) {
  const b = vm.block3
  return (
    b.communicationOps.length > 0 ||
    b.boardOps.length > 0 ||
    b.historyOps.length > 0 ||
    b.executed.length > 0
  )
}

export function isCommunicationOp(op: ReportLiveOp) {
  return isCommunicationPendingTool(op.tool)
}

export function isBoardOp(op: ReportLiveOp) {
  return isBoardPendingTool(op.tool)
}
