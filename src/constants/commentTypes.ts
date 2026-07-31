export const NO_COMMENT_TYPE_VALUE = 'sin_clasificar'

export const COMMENT_TYPE_OPTIONS = [
  { value: 'general', label: 'General' },
  { value: 'avance', label: 'Avance' },
  { value: 'bloqueo', label: 'Bloqueo' },
  { value: 'dependencia', label: 'Dependencia' },
  { value: 'decision', label: 'Decision' },
  { value: 'riesgo', label: 'Riesgo' },
  { value: 'evidencia', label: 'Evidencia' },
  { value: 'cambio', label: 'Cambio relevante' },
] as const

export type CommentTypeValue = (typeof COMMENT_TYPE_OPTIONS)[number]['value']

export function normalizeCommentType(value: string | null | undefined): CommentTypeValue | null {
  const normalized = value?.trim()
  if (!normalized || normalized === NO_COMMENT_TYPE_VALUE) return null
  return COMMENT_TYPE_OPTIONS.some((option) => option.value === normalized)
    ? (normalized as CommentTypeValue)
    : null
}

export function getCommentTypeLabel(value: string | null | undefined): string | null {
  const normalized = normalizeCommentType(value)
  if (!normalized) return null
  return COMMENT_TYPE_OPTIONS.find((option) => option.value === normalized)?.label ?? null
}
