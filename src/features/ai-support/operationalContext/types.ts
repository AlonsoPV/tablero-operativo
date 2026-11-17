import type { BoardAssistantContextPayload } from '@/features/ai-support/buildBoardAssistantContext'

export type AssistantIntent =
  | 'pending'
  | 'prioritize'
  | 'okrs'
  | 'team_delay'
  | 'selected_action'
  | 'selected_okr'
  | 'general'

export type OperationalActionItem = {
  id: string
  titulo: string
  estado: string
  prioridad: string
  color: string
  fecha: string
  hora: string
  esOkr: boolean
  okrImpactado: string
  area: string
  daysSinceUpdate: number | null
  dueBucket: 'overdue' | 'today' | 'week' | 'later' | 'unknown'
  /** responsable === viewer */
  mine: boolean
  /** created_by === viewer */
  createdByMe: boolean
  responsableId: string
  responsableNombre: string
}

export type OperationalSnapshot = {
  fetchedAt: string
  today: string
  truncated?: boolean
  viewer: {
    usuarioId: string
    rol: string | null
    areas: string[]
    scope: 'own' | 'board'
    canSeeOkrs: boolean
    canSeeTeam: boolean
  }
  counts: {
    /** Abiertas asignadas al viewer (responsable). */
    open: number
    overdue: number
    dueThisWeek: number
    blocked: number
    red: number
    stale: number
    pendingVerification: number
    taggedOkr: number
    /** Abiertas creadas por el viewer (created_by). */
    createdOpen: number
    /** Abiertas del tablero completo cuando scope=board; si no, igual a open. */
    boardOpen: number
    teamOverdue: number
    teamBlocked: number
  }
  mine: OperationalActionItem[]
  /** Abiertas que el viewer creo (pueden estar asignadas a otros). */
  created: OperationalActionItem[]
  /** Muestra de abiertas del tablero (solo si canSeeTeam). */
  boardOpenItems: OperationalActionItem[]
  pendingVerification: OperationalActionItem[]
  teamHot: OperationalActionItem[]
  board: BoardAssistantContextPayload
}

export type SlicedAssistantContexts = {
  intent: AssistantIntent
  boardContext: BoardAssistantContextPayload | null
  includeOkrs: boolean
  tokenEstimate: {
    boardChars: number
    approxTokens: number
  }
}
