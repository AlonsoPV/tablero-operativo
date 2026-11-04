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
  mine: boolean
}

export type OperationalSnapshot = {
  fetchedAt: string
  today: string
  viewer: {
    usuarioId: string
    rol: string | null
    areas: string[]
    scope: 'own' | 'board'
    canSeeOkrs: boolean
    canSeeTeam: boolean
  }
  counts: {
    open: number
    overdue: number
    dueThisWeek: number
    blocked: number
    red: number
    stale: number
    pendingVerification: number
    taggedOkr: number
    teamOverdue: number
    teamBlocked: number
  }
  mine: OperationalActionItem[]
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
