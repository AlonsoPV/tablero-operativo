import type { TeamFrequency } from '../types'

export type RecurrenceRule = {
  frecuencia_tipo?: TeamFrequency | null
  frecuencia_dia_semana?: number | null
  frecuencia_dia_mes?: number | null
}

const WEEKDAY_LABELS = ['Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab', 'Dom']

function lastDayOfMonth(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate()
}

function isoWeekday(date: Date) {
  const day = date.getUTCDay()
  return day === 0 ? 7 : day
}

function toUtcDate(value: string) {
  const [year, month, day] = value.slice(0, 10).split('-').map(Number)
  return new Date(Date.UTC(year, (month ?? 1) - 1, day ?? 1))
}

function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10)
}

/** Misma regla que team_kanban_generate_serie en Postgres. */
export function matchesRecurrence(rule: RecurrenceRule, date: Date): boolean {
  const last = lastDayOfMonth(date)
  const monthDay = Math.min(Math.max(rule.frecuencia_dia_mes ?? 1, 1), last)
  switch (rule.frecuencia_tipo) {
    case 'diaria':
      return true
    case 'semanal':
      return isoWeekday(date) === (rule.frecuencia_dia_semana ?? 1)
    case 'mensual':
      return date.getUTCDate() === monthDay
    case 'quincenal':
      return (
        date.getUTCDate() === monthDay ||
        date.getUTCDate() === Math.min((rule.frecuencia_dia_mes ?? 1) + 15, last)
      )
    default:
      return false
  }
}

/**
 * Siguiente fecha de la serie posterior a `fromDate` (YYYY-MM-DD).
 * Con `inclusive` tambien considera `fromDate`.
 * Devuelve null si la regla es invalida o no hay coincidencia en un año.
 */
export function nextOccurrenceDate(
  rule: RecurrenceRule,
  fromDate: string,
  options: { inclusive?: boolean } = {}
): string | null {
  if (!rule.frecuencia_tipo) return null
  const cursor = toUtcDate(fromDate)
  if (options.inclusive && matchesRecurrence(rule, cursor)) return toIsoDate(cursor)
  for (let i = 0; i < 400; i += 1) {
    cursor.setUTCDate(cursor.getUTCDate() + 1)
    if (matchesRecurrence(rule, cursor)) return toIsoDate(cursor)
  }
  return null
}

/**
 * Proxima fecha que la serie generara: despues de la ultima ocurrencia creada o,
 * si aun no hay ninguna, desde el inicio programado.
 */
export function upcomingOccurrenceDate(
  serie: RecurrenceRule & { frecuencia_inicio?: string | null; ultima_ocurrencia?: string | null },
  today: string
): string | null {
  if (serie.ultima_ocurrencia) return nextOccurrenceDate(serie, serie.ultima_ocurrencia)
  const start = serie.frecuencia_inicio?.slice(0, 10)
  const from = start && start > today ? start : today
  return nextOccurrenceDate(serie, from, { inclusive: from !== today })
}

export function formatRecurrenceLabel(rule: RecurrenceRule): string | null {
  if (!rule.frecuencia_tipo) return null
  if (rule.frecuencia_tipo === 'diaria') return 'Diaria'
  if (rule.frecuencia_tipo === 'semanal') {
    const index = Math.min(Math.max(rule.frecuencia_dia_semana ?? 1, 1), 7) - 1
    return `Semanal ${WEEKDAY_LABELS[index]}`
  }
  if (rule.frecuencia_tipo === 'quincenal') {
    return `Quincenal dia ${rule.frecuencia_dia_mes ?? '-'}`
  }
  return `Mensual dia ${rule.frecuencia_dia_mes ?? '-'}`
}
