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

export type AssistantBriefingModel = {
  greeting: string
  summary: string
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
  mode: 'consult'
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

export function buildAssistantBriefing(input: {
  userName?: string | null
  snapshot: OperationalSnapshot | null
  loading?: boolean
}): AssistantBriefingModel {
  const name = firstName(input.userName)
  const greeting = name ? `Hola, ${name}.` : 'Hola.'

  if (input.loading && !input.snapshot) {
    return {
      greeting,
      summary: 'Cargando tu situacion operativa…',
      priorityTitle: null,
      priorityReason: null,
      priorityRecord: null,
      priorityUrgency: null,
    }
  }

  if (!input.snapshot) {
    return {
      greeting,
      summary: 'Inicia sesion o recarga para ver tu contexto operativo.',
      priorityTitle: null,
      priorityReason: null,
      priorityRecord: null,
      priorityUrgency: null,
    }
  }

  const c = input.snapshot.counts
  if (c.open === 0 && c.pendingVerification === 0) {
    return {
      greeting,
      summary: 'No tienes acciones abiertas en tu alcance actual.',
      priorityTitle: null,
      priorityReason: null,
      priorityRecord: null,
      priorityUrgency: null,
    }
  }

  const top = input.snapshot.mine[0] ?? null
  const summaryParts = [
    `${c.open} abiertas`,
    c.overdue > 0 ? `${c.overdue} en retraso` : null,
    c.blocked > 0 ? `${c.blocked} bloqueadas` : null,
    c.dueThisWeek > 0 ? `${c.dueThisWeek} vencen en 7 dias` : null,
    c.pendingVerification > 0 ? `${c.pendingVerification} por verificar` : null,
  ].filter(Boolean)

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

  return {
    greeting,
    summary: `Hecho: ${summaryParts.join(' · ')}.`,
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
    label: 'Panorama ejecutivo',
    prompt: 'Dame un panorama ejecutivo del tablero: avance, retrasos, bloqueos y riesgos.',
  },
  risks: {
    label: 'Riesgos y desviaciones',
    prompt: 'Que riesgos y desviaciones hay en el tablero y que conviene atender primero?',
  },
  okr_results: { label: 'Resultados de OKRs', prompt: 'Como van los resultados de los OKRs?' },
  decisions: {
    label: 'Decisiones pendientes',
    prompt: 'Que decisiones o escalamientos estan pendientes y quien debe resolverlos?',
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
