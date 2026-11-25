/**
 * Estado y flujo flexible de la Revisión Ejecutiva Guiada (~15 min).
 * Se ejecuta dentro del orquestador y contexto de sesión existentes (sin sistema de reuniones paralelo).
 * Mientras R2 permanezca OFF, todos los compromisos propuestos son borradores no persistidos.
 */
import type { ExecutiveDiagnosis } from './executiveDiagnosis.js'

export const EXECUTIVE_REVIEW_STAGES = [
  'overview',
  'priorities',
  'risks',
  'decisions',
  'commitments',
  'summary',
] as const

export type ExecutiveReviewStage = (typeof EXECUTIVE_REVIEW_STAGES)[number]

export type ExecutiveDraftCommitment = {
  titulo: string
  responsableSugerido: string
  fechaPropuesta: string | null
  origenAccionId: string | null
  persisted: false
}

export type ExecutiveSessionState = {
  active: true
  startedAt: string
  stage: ExecutiveReviewStage
  focusedPriorityIndex: number | null
  decisions: string[]
  draftCommitments: ExecutiveDraftCommitment[]
  pendingTopics: string[]
  skippedStages: ExecutiveReviewStage[]
}

export const STAGE_METADATA: Record<
  ExecutiveReviewStage,
  { step: number; label: string; minutes: number }
> = {
  overview: { step: 1, label: 'Estado general de la operación', minutes: 2 },
  priorities: { step: 2, label: 'Tres prioridades principales', minutes: 3 },
  risks: { step: 3, label: 'Riesgos, bloqueos y disciplina', minutes: 3 },
  decisions: { step: 4, label: 'Decisiones necesarias', minutes: 3 },
  commitments: { step: 5, label: 'Preparación de compromisos (borrador R2 OFF)', minutes: 2 },
  summary: { step: 6, label: 'Resumen ejecutivo final', minutes: 2 },
}

export function createExecutiveSession(startedAt: string): ExecutiveSessionState {
  return {
    active: true,
    startedAt,
    stage: 'overview',
    focusedPriorityIndex: null,
    decisions: [],
    draftCommitments: [],
    pendingTopics: [],
    skippedStages: [],
  }
}

export function nextExecutiveStage(current: ExecutiveReviewStage): ExecutiveReviewStage {
  const idx = EXECUTIVE_REVIEW_STAGES.indexOf(current)
  if (idx < 0 || idx >= EXECUTIVE_REVIEW_STAGES.length - 1) return 'summary'
  return EXECUTIVE_REVIEW_STAGES[idx + 1]!
}

export function previousExecutiveStage(current: ExecutiveReviewStage): ExecutiveReviewStage {
  const idx = EXECUTIVE_REVIEW_STAGES.indexOf(current)
  if (idx <= 0) return 'overview'
  return EXECUTIVE_REVIEW_STAGES[idx - 1]!
}

export function isExecutiveReviewStage(value: unknown): value is ExecutiveReviewStage {
  return typeof value === 'string' && (EXECUTIVE_REVIEW_STAGES as readonly string[]).includes(value)
}

function plusDays(todayYmd: string, days: number): string {
  const ts = Date.parse(`${todayYmd.slice(0, 10)}T00:00:00Z`)
  if (Number.isNaN(ts)) return todayYmd
  return new Date(ts + days * 86_400_000).toISOString().slice(0, 10)
}

/** Construye borradores de compromisos a partir de las prioridades activas (nunca persiste). */
export function buildDraftCommitmentsFromDiagnosis(
  diagnosis: ExecutiveDiagnosis,
  today: string
): ExecutiveDraftCommitment[] {
  return diagnosis.topPriorities.slice(0, 3).map((p, idx) => ({
    titulo: p.isBlocked
      ? `Desbloquear «${p.action.title}» y definir fecha de resolución`
      : `Confirmar avance y cierre de «${p.action.title}»`,
    responsableSugerido: p.action.responsableNombre ?? 'Por definir',
    fechaPropuesta: plusDays(today, idx === 0 ? 1 : 2),
    origenAccionId: p.action.id,
    persisted: false,
  }))
}

export function buildPendingTopicsFromDiagnosis(diagnosis: ExecutiveDiagnosis): string[] {
  const topics: string[] = []
  if (diagnosis.counts.pendingVerification > 0) {
    topics.push(
      `Validar ${diagnosis.counts.pendingVerification} acción(es) en Hecho pendientes de Verificado.`
    )
  }
  if (diagnosis.counts.withoutDate > 0) {
    topics.push(`Asignar fecha compromiso a ${diagnosis.counts.withoutDate} acción(es) abiertas sin fecha.`)
  }
  if (diagnosis.okrSummary && diagnosis.okrSummary.withoutData.length > 0) {
    topics.push(`Completar avance en ${diagnosis.okrSummary.withoutData.length} OKR(s) sin datos medibles.`)
  }
  return topics
}
