/** Vistas estructuradas del copiloto escrito — alimentadas por tool results o snapshot. */

export type AssistantMetricTone = 'neutral' | 'ok' | 'warning' | 'danger'

export type AssistantMetric = {
  id: string
  label: string
  value: number | string
  tone?: AssistantMetricTone
  scope?: string
}

export type AssistantActionRowView = {
  id: string
  title: string
  estado?: string | null
  prioridad?: string | null
  fecha?: string | null
  responsable?: string | null
  href: string
}

export type AssistantOkrRowView = {
  id: string
  nombre: string
  /** null = sin avance calculable (no inventar 0%). */
  progress: number | null
  krCount: number
  pace?: string | null
  initiativesHint?: string | null
  /** company | team u otro scope del objetivo. */
  scope?: string | null
  href: string
}

export type AssistantRecommendationView = {
  text: string
  nextAction?: string
}

export type AssistantBriefView = {
  type: 'brief'
  summary: string
  metrics?: AssistantMetric[]
  scope?: string
}

export type AssistantActionListView = {
  type: 'action_list'
  summary?: string
  total: number
  visible: number
  truncated: boolean
  scope?: string
  actions: AssistantActionRowView[]
}

export type AssistantOkrListView = {
  type: 'okr_list'
  summary?: string
  total: number
  visible: number
  truncated: boolean
  scope?: string
  okrs: AssistantOkrRowView[]
}

export type AssistantOperationalSummaryView = {
  type: 'operational_summary'
  summary: string
  scope?: string
  metrics: AssistantMetric[]
  actions?: AssistantActionRowView[]
  okrs?: AssistantOkrRowView[]
  recommendation?: AssistantRecommendationView
}

export type AssistantRecommendationBlockView = {
  type: 'recommendation'
  text: string
  nextAction?: string
}

export type AssistantEmptyView = {
  type: 'empty'
  message: string
  scope?: string
}

export type AssistantErrorView = {
  type: 'error'
  message: string
}

export type AssistantReplyView =
  | AssistantBriefView
  | AssistantActionListView
  | AssistantOkrListView
  | AssistantOperationalSummaryView
  | AssistantRecommendationBlockView
  | AssistantEmptyView
  | AssistantErrorView

export type AssistantUiPayload = {
  /** Frase narrativa corta; las listas/métricas van en views. */
  summary?: string
  /** Corte temporal ISO del snapshot operativo. */
  asOf?: string
  /** Fuentes de datos operativos (no conocimiento metodológico). */
  sources?: string[]
  /** Limitaciones explícitas del resultado. */
  limitations?: string[]
  views: AssistantReplyView[]
}
