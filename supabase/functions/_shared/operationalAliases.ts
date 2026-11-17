/**
 * Aliases operativos para el flujo WhatsApp (Deno).
 * Mantener alineado con OPERATIONAL_DICTIONARY_VERSION = ops-dict-2026-11-17-mvp
 * en src/features/ai-support/operationalSemantics/operationalDictionary.ts
 * (Edge no importa el bundle Vite; esta es la proyección mínima del SSOT).
 */
export const OPERATIONAL_DICTIONARY_VERSION = 'ops-dict-2026-11-17-mvp'

/** Aliases de acción Kanban (consulta / copy). */
export const KANBAN_ACTION_ALIASES = [
  'accion',
  'acciones',
  'tarea',
  'tareas',
  'incidencia',
  'pendiente',
  'compromiso',
  'actividad',
] as const

/** «Rojo» coloquial del tablero ≠ solo vencido. */
export const BOARD_RED_ALIASES = ['en rojo', 'rojas', 'rojos', 'rojo'] as const

/** Vencimiento / Retraso (CDMX). */
export const OVERDUE_ALIASES = ['vencida', 'vencidas', 'vencido', 'en retraso', 'atrasada'] as const

/** Responsable = yo. */
export const RESPONSABLE_ALIASES = [
  'responsable',
  'me asignaron',
  'mis acciones',
  'tengo',
] as const

export function textMentionsKanbanAction(text: string): boolean {
  const t = text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
  return KANBAN_ACTION_ALIASES.some((a) => new RegExp(`\\b${a}\\b`).test(t))
}
