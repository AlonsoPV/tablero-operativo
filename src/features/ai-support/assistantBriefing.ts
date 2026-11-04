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
}

export type AssistantQuickActionId =
  | 'priorities'
  | 'blocked'
  | 'verification'
  | 'daily'
  | 'okrs'
  | 'create'

export type AssistantQuickAction = {
  id: AssistantQuickActionId
  label: string
  prompt?: string
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
    }
  }

  if (!input.snapshot) {
    return {
      greeting,
      summary: 'Inicia sesion o recarga para ver tu contexto operativo.',
      priorityTitle: null,
      priorityReason: null,
      priorityRecord: null,
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
  if (top) {
    if (top.estado === 'Retraso' || top.dueBucket === 'overdue') {
      priorityReason = 'Esta vencida o en retraso.'
    } else if (top.estado === 'Bloqueado') {
      priorityReason = 'Esta bloqueada y frena avance.'
    } else if ((top.daysSinceUpdate ?? 0) >= 3) {
      priorityReason = 'Lleva dias sin actualizacion.'
    } else if (top.dueBucket === 'today' || top.dueBucket === 'week') {
      priorityReason = 'Vence pronto.'
    } else {
      priorityReason = 'Es la mas urgente en tu cola actual.'
    }
  }

  return {
    greeting,
    summary: `Hecho: ${summaryParts.join(' · ')}.`,
    priorityTitle: top?.titulo ?? null,
    priorityReason,
    priorityRecord: top ? actionRecordLink(top.id, top.titulo) : null,
  }
}

export function buildAssistantQuickActions(input: {
  snapshot: OperationalSnapshot | null
  canSeeOkrs: boolean
}): AssistantQuickAction[] {
  const c = input.snapshot?.counts
  return [
    {
      id: 'priorities',
      label: 'Mis prioridades',
      prompt: 'Que deberia priorizar hoy?',
      mode: 'consult',
    },
    {
      id: 'blocked',
      label: 'Acciones bloqueadas',
      prompt: 'Que acciones bloqueadas debo atender?',
      mode: 'consult',
      disabled: Boolean(c && c.blocked === 0),
      disabledReason: 'Sin bloqueos ahora',
    },
    {
      id: 'verification',
      label: 'Pendientes de verificacion',
      prompt: 'Que tengo pendiente de verificacion?',
      mode: 'consult',
      disabled: Boolean(c && c.pendingVerification === 0),
      disabledReason: 'Nada por verificar',
    },
    {
      id: 'daily',
      label: 'Preparar mi daily',
      prompt: 'Prepara mi daily con lo critico de hoy: retrasos, bloqueos y lo que vence.',
      mode: 'consult',
    },
    {
      id: 'okrs',
      label: 'Revisar mis OKRs',
      prompt: 'Como van mis OKRs?',
      mode: 'consult',
      disabled: !input.canSeeOkrs,
      disabledReason: 'Sin acceso a OKRs',
    },
    {
      id: 'create',
      label: 'Crear una accion',
      mode: 'create',
    },
  ]
}

export function formatStructuredReplyContent(reply: AssistantStructuredReply): string {
  const lines = [`Hallazgo: ${reply.finding}`]
  if (reply.evidence) lines.push(`Evidencia: ${reply.evidence}`)
  if (reply.recommendation) lines.push(`Recomendacion: ${reply.recommendation}`)
  if (reply.nextAction) lines.push(`Siguiente accion: ${reply.nextAction}`)
  if (reply.record) lines.push(`Registro: ${reply.record.title}`)
  return lines.join('\n')
}
