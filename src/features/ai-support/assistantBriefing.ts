import type { OperationalSnapshot } from '@/features/ai-support/operationalContext'
import { ROUTES } from '@/constants'

export type AssistantRecordLink = {
  id: string
  title: string
  kind: 'action' | 'okr'
  href: string
}

export type AssistantStructuredReply = {
  finding: string
  evidence?: string
  recommendation?: string
  nextAction?: string
  record?: AssistantRecordLink
}

export type AssistantBriefingScope = 'personal' | 'organization'

export type AssistantBriefingIndicator = {
  id: string
  label: string
  value: number
  tone: 'primary' | 'danger' | 'warning'
  prompt: string
}

export type AssistantBriefingModel = {
  greeting: string
  summary: string
  scopeKind: AssistantBriefingScope
  scopeLabel: string
  indicators: AssistantBriefingIndicator[]
  priorityTitle: string | null
  priorityReason: string | null
  priorityRecord: AssistantRecordLink | null
  priorityUrgency: 'danger' | 'warning' | 'info' | null
}

export type AssistantQuickActionId =
  | 'priorities'
  | 'blocked'
  | 'verification'
  | 'daily'
  | 'okrs'
  | 'team'
  | 'team_overdue'
  | 'executive'
  | 'risks'
  | 'okr_results'
  | 'decisions'

export type AssistantAudience = 'operativo' | 'lider' | 'direccion'

export type AssistantQuickAction = {
  id: AssistantQuickActionId
  label: string
  prompt: string
  mode: 'consult' | 'create'
  disabled?: boolean
  disabledReason?: string
}

function firstName(nombre: string | null | undefined) {
  const trimmed = nombre?.trim()
  if (!trimmed) return null
  return trimmed.split(/\s+/)[0] ?? null
}

export function actionRecordLink(id: string, title: string): AssistantRecordLink {
  return {
    id,
    title,
    kind: 'action',
    href: `${ROUTES.KANBAN}?accion=${encodeURIComponent(id)}`,
  }
}

export function okrRecordLink(id: string, title: string): AssistantRecordLink {
  return {
    id,
    title,
    kind: 'okr',
    href: `${ROUTES.OKRS}?objective=${encodeURIComponent(id)}`,
  }
}

function emptyBriefing(
  greeting: string,
  summary: string,
  scopeKind: AssistantBriefingScope,
  scopeLabel: string
): AssistantBriefingModel {
  return {
    greeting,
    summary,
    scopeKind,
    scopeLabel,
    indicators: [],
    priorityTitle: null,
    priorityReason: null,
    priorityRecord: null,
    priorityUrgency: null,
  }
}

export function buildAssistantBriefing(input: {
  userName?: string | null
  snapshot: OperationalSnapshot | null
  loading?: boolean
  audience?: AssistantAudience
}): AssistantBriefingModel {
  const name = firstName(input.userName)
  const greeting = name ? `Hola, ${name}.` : 'Hola.'
  const orgScope = input.audience === 'direccion' || input.audience === 'lider'

  if (input.loading && !input.snapshot) {
    return emptyBriefing(greeting, 'Cargando tu situacion operativa…', orgScope ? 'organization' : 'personal', orgScope ? 'Operación de la empresa' : 'Mis acciones')
  }

  if (!input.snapshot) {
    return emptyBriefing(greeting, 'Inicia sesion o recarga para ver tu contexto operativo.', 'personal', 'Mis acciones')
  }

  const c = input.snapshot.counts
  const canSeeOrg = Boolean(input.snapshot.viewer.canSeeTeam && orgScope)
  const scopeKind: AssistantBriefingScope = canSeeOrg ? 'organization' : 'personal'
  const scopeLabel = canSeeOrg ? 'Operación de la empresa' : 'Mis acciones'
  const open = canSeeOrg ? c.boardOpen : c.open
  const overdue = canSeeOrg ? c.teamOverdue : c.overdue
  const blocked = canSeeOrg ? c.teamBlocked : c.blocked
  const dueThisWeek = c.dueThisWeek
  const pendingVerification = c.pendingVerification

  if (open === 0 && pendingVerification === 0) {
    return emptyBriefing(
      greeting,
      canSeeOrg
        ? 'No hay acciones abiertas en el tablero autorizado de la empresa.'
        : 'No tienes acciones abiertas en tus acciones asignadas.',
      scopeKind,
      scopeLabel
    )
  }

  const top = (canSeeOrg ? input.snapshot.boardOpenItems[0] : null) ?? input.snapshot.mine[0] ?? null
  const summaryParts = [
    `${open} abiertas`,
    overdue > 0 ? `${overdue} en retraso` : null,
    blocked > 0 ? `${blocked} bloqueadas` : null,
    !canSeeOrg && dueThisWeek > 0 ? `${dueThisWeek} vencen en 7 dias` : null,
    pendingVerification > 0 ? `${pendingVerification} por verificar` : null,
  ].filter(Boolean)
  const indicators: AssistantBriefingIndicator[] = [
    { id: 'open', label: 'Abiertas', value: open, tone: 'primary' as const, prompt: canSeeOrg ? '¿Cómo está mi empresa hoy?' : 'Cuales acciones tengo abiertas?' },
    overdue > 0
      ? { id: 'overdue', label: 'Atrasadas', value: overdue, tone: 'danger' as const, prompt: canSeeOrg ? '¿Qué requiere mi atención?' : 'Cuales tengo vencidas?' }
      : null,
    blocked > 0
      ? { id: 'blocked', label: 'Bloqueadas', value: blocked, tone: 'warning' as const, prompt: 'Que acciones bloqueadas debo atender?' }
      : !canSeeOrg && dueThisWeek > 0
        ? { id: 'dueThisWeek', label: 'Por vencer', value: dueThisWeek, tone: 'warning' as const, prompt: 'Cuales tengo por vencer?' }
        : null,
  ]
    .filter((row): row is AssistantBriefingIndicator => Boolean(row && row.value > 0))
    .slice(0, 3)

  let priorityReason: string | null = null
  let priorityUrgency: AssistantBriefingModel['priorityUrgency'] = null
  if (top) {
    const okrNote = top.esOkr || top.okrImpactado ? ' Impacta un OKR.' : ''
    if (top.estado === 'Retraso' || top.dueBucket === 'overdue') {
      priorityReason = `Esta vencida o en retraso.${okrNote}`
      priorityUrgency = 'danger'
    } else if (top.estado === 'Bloqueado') {
      priorityReason = `Esta bloqueada y frena avance.${okrNote}`
      priorityUrgency = 'danger'
    } else if (top.dueBucket === 'today') {
      priorityReason = `Vence hoy.${okrNote}`
      priorityUrgency = 'warning'
    } else if ((top.daysSinceUpdate ?? 0) >= 3) {
      priorityReason = `Lleva ${top.daysSinceUpdate} dias sin actualizacion.${okrNote}`
      priorityUrgency = 'warning'
    } else if (top.dueBucket === 'week') {
      priorityReason = `Vence esta semana.${okrNote}`
      priorityUrgency = 'warning'
    } else {
      priorityReason = `Es la mas urgente en tu cola actual.${okrNote}`
      priorityUrgency = 'info'
    }
  }

  const personalNote =
    canSeeOrg && c.open === 0
      ? ' Tus acciones asignadas: 0 (no es el diagnóstico de la empresa).'
      : ''

  return {
    greeting,
    summary: `${scopeLabel}. Hecho: ${summaryParts.join(' · ')}.${personalNote}`,
    scopeKind,
    scopeLabel,
    indicators,
    priorityTitle: top?.titulo ?? null,
    priorityReason,
    priorityRecord: top ? actionRecordLink(top.id, top.titulo) : null,
    priorityUrgency,
  }
}

const QUICK_ACTIONS: Record<AssistantQuickActionId, Omit<AssistantQuickAction, 'id' | 'mode'>> = {
  priorities: { label: 'Mis prioridades', prompt: 'Que deberia priorizar hoy?' },
  daily: {
    label: 'Preparar mi daily',
    prompt: 'Prepara mi daily con lo critico de hoy: retrasos, bloqueos y lo que vence.',
  },
  blocked: { label: 'Revisar bloqueos', prompt: 'Que acciones bloqueadas debo atender?' },
  verification: {
    label: 'Pendientes de verificación',
    prompt: 'Que tengo pendiente de verificacion?',
  },
  okrs: { label: 'Consultar OKRs', prompt: 'Como van mis OKRs?' },
  team: { label: 'Acciones del equipo', prompt: 'Que acciones abiertas tiene todo el equipo?' },
  team_overdue: {
    label: 'Retrasos del equipo',
    prompt: 'Que acciones vencidas o en retraso tiene todo el equipo?',
  },
  executive: {
    label: 'Atención hoy',
    prompt: '¿Qué requiere mi atención hoy?',
  },
  risks: {
    label: 'Analizar ejecución',
    prompt: 'Analizar ejecución de la empresa',
  },
  okr_results: {
    label: 'Avances estratégicos',
    prompt: 'Revisar avances estratégicos',
  },
  decisions: {
    label: 'Compromisos pendientes',
    prompt: 'Revisar compromisos pendientes',
  },
}

const AUDIENCE_ACTIONS: Record<AssistantAudience, AssistantQuickActionId[]> = {
  operativo: ['priorities', 'daily', 'blocked', 'verification'],
  lider: ['team', 'team_overdue', 'verification', 'okrs'],
  direccion: ['executive', 'risks', 'okr_results', 'decisions'],
}

const OKR_ACTIONS = new Set<AssistantQuickActionId>(['okrs', 'okr_results'])
const OKR_FALLBACK: Record<AssistantAudience, AssistantQuickActionId> = {
  operativo: 'priorities',
  lider: 'priorities',
  direccion: 'team_overdue',
}

/** Solo elige contenido: la vista de equipo exige `canSeeTeam` (canViewAllBoardData). */
export function resolveAssistantAudience(input: {
  isDirection: boolean
  isLeader: boolean
  canSeeTeam: boolean
}): AssistantAudience {
  if (!input.canSeeTeam) return 'operativo'
  if (input.isLeader && !input.isDirection) return 'lider'
  return 'direccion'
}

export function buildAssistantQuickActions(input: {
  audience: AssistantAudience
  canSeeOkrs: boolean
}): AssistantQuickAction[] {
  const ids = AUDIENCE_ACTIONS[input.audience]
  if (!ids) {
    throw new Error(`audience de asistente no soportado: ${String(input.audience)}`)
  }
  return ids.map((id) => {
    const resolved = !input.canSeeOkrs && OKR_ACTIONS.has(id) ? OKR_FALLBACK[input.audience] : id
    return { id: resolved, mode: 'consult', ...QUICK_ACTIONS[resolved] }
  })
}

export function formatStructuredReplyContent(reply: AssistantStructuredReply): string {
  const lines = [`Hallazgo: ${reply.finding}`]
  if (reply.evidence) lines.push(`Evidencia: ${reply.evidence}`)
  if (reply.recommendation) lines.push(`Recomendacion: ${reply.recommendation}`)
  if (reply.nextAction) lines.push(`Siguiente accion: ${reply.nextAction}`)
  if (reply.record) lines.push(`Registro: ${reply.record.title}`)
  return lines.join('\n')
}
