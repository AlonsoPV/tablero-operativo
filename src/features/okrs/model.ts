export interface Objective {
  id: string
  nombre_okr: string
  descripcion: string | null
  scope: 'company' | 'team'
  area_id: string | null
  owner_user_id: string | null
  parent_okr_id?: string | null
  start_date: string | null
  end_date: string | null
  activo: boolean
  can_manage: boolean
}

export interface KeyResult {
  id: string
  okr_id: string
  title: string
  baseline_value: number | null
  target_value: number
  current_value: number | null
  owner_user_id: string | null
  unit: string
  metric_type: string
  direction?: 'increase' | 'decrease' | string | null
  can_update: boolean
  computed_progress?: number
}

export interface Initiative {
  id: string
  key_result_id: string
  action_id: string | null
  team_action_id: string | null
}

export interface ActionOption {
  id: string
  title: string
  kind: 'company' | 'team'
  area_id: string | null
  closed: boolean
  es_okr?: boolean
}

export function isTaggedOkrAction(action: Pick<ActionOption, 'es_okr'>): boolean {
  return action.es_okr === true
}

/** Team actions stay in the OKR's area; company Kanban actions often have no area. */
export function actionMatchesObjectiveArea(
  action: Pick<ActionOption, 'kind' | 'area_id'>,
  objective: Pick<Objective, 'area_id'>
): boolean {
  if (action.kind === 'company') return true
  return !objective.area_id || action.area_id === objective.area_id
}

export interface CheckIn {
  id: string
  key_result_id: string
  value: number
  note: string | null
  confidence?: 'red' | 'yellow' | 'green' | null
  created_at: string
  created_by: string
  baseline_snapshot?: number | null
  target_snapshot?: number | null
  unit_snapshot?: string | null
  title_snapshot?: string | null
  owner_snapshot?: string | null
  period_start_snapshot?: string | null
  period_end_snapshot?: string | null
}

export interface OkrData {
  objectives: Objective[]
  keyResults: KeyResult[]
  initiatives: Initiative[]
  checkIns: CheckIn[]
  users: { id: string; nombre: string }[]
  areas: { id: string; nombre: string; can_manage: boolean }[]
  can_manage_company: boolean
}

export const INSUFFICIENT_PROGRESS_LABEL = 'Sin datos suficientes'

export type KrProgressInput = Pick<
  KeyResult,
  'baseline_value' | 'target_value' | 'current_value' | 'computed_progress'
>

/** Results are measured independently of action completion, including decreasing targets. */
export function krProgress(kr: KrProgressInput): number | null {
  if (kr.computed_progress != null)
    return Math.max(0, Math.min(100, kr.computed_progress))
  const {
    baseline_value: baseline,
    target_value: target,
    current_value: current,
  } = kr
  if (baseline == null || current == null || target == null || baseline === target) return null
  const value = ((current - baseline) / (target - baseline)) * 100
  return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : null
}

export function formatProgressPercent(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return INSUFFICIENT_PROGRESS_LABEL
  return `${Math.round(value)}%`
}

/** Average of measurable key results. Missing data does not count as zero. */
export function objectiveProgress(results: KrProgressInput[]): number | null {
  const measured = results
    .map((kr) => krProgress(kr))
    .filter((value): value is number => value != null)
  if (measured.length === 0) return null
  return measured.reduce((total, value) => total + value, 0) / measured.length
}

export type OkrPaceStatus =
  | 'sin_datos'
  | 'sin_periodo'
  | 'programado'
  | 'archivado'
  | 'finalizado'
  | 'en_ritmo'
  | 'bajo_ritmo'

/** Share of the calendar period already elapsed. Null outside an active dated period. */
export function expectedPeriodProgress(
  objective: Pick<Objective, 'start_date' | 'end_date'>,
  today: string
): number | null {
  if (!objective.start_date || !objective.end_date) return null
  if (today < objective.start_date || today > objective.end_date) return null
  const start = Date.parse(`${objective.start_date}T00:00:00Z`)
  const end = Date.parse(`${objective.end_date}T00:00:00Z`)
  const now = Date.parse(`${today}T00:00:00Z`)
  if (![start, end, now].every(Number.isFinite) || end <= start) return null
  return ((now - start) / (end - start)) * 100
}

/**
 * Pace is a comparison against elapsed time, not a guessed cause.
 * `sin_datos` means the progress itself cannot be calculated.
 */
export function objectivePaceStatus(
  objective: Pick<Objective, 'activo' | 'start_date' | 'end_date'>,
  progress: number | null,
  today: string
): OkrPaceStatus {
  const period = objectivePeriod(objective, today)
  if (period === 'Archivado') return 'archivado'
  if (period === 'Programado') return 'programado'
  if (period === 'Finalizado') return progress == null ? 'sin_datos' : 'finalizado'
  if (period === 'Sin periodo') return progress == null ? 'sin_datos' : 'sin_periodo'
  if (progress == null) return 'sin_datos'
  const expected = expectedPeriodProgress(objective, today)
  if (expected == null) return 'sin_periodo'
  return progress < expected ? 'bajo_ritmo' : 'en_ritmo'
}

export function objectivePeriod(
  objective: Pick<Objective, 'activo' | 'start_date' | 'end_date'>,
  today: string
) {
  if (!objective.activo) return 'Archivado'
  if (!objective.start_date || !objective.end_date) return 'Sin periodo'
  if (today < objective.start_date) return 'Programado'
  if (today > objective.end_date) return 'Finalizado'
  return 'Activo'
}

export function formatMetric(value: number): string {
  return value.toLocaleString('es-MX', { maximumFractionDigits: 2 })
}

export type MeasurementStory = {
  direction: 'up' | 'down' | 'same'
  label: string
}

/** Explains whether a key result must rise or fall from baseline to target. */
export function measurementStory(
  baseline: number,
  target: number,
  unit: string
): MeasurementStory | null {
  if (!Number.isFinite(baseline) || !Number.isFinite(target)) return null
  if (baseline === target) {
    return {
      direction: 'same',
      label: 'La meta debe ser distinta de la línea base.',
    }
  }
  const unitLabel = unit.trim()
  const suffix = unitLabel ? ` ${unitLabel}` : ''
  const verb = target > baseline ? 'Subir' : 'Bajar'
  return {
    direction: target > baseline ? 'up' : 'down',
    label: `${verb} de ${formatMetric(baseline)} a ${formatMetric(target)}${suffix}`,
  }
}

/** Last inclusive day of the quarter or year that contains `start` (YYYY-MM-DD). */
export function suggestedPeriodEnd(
  start: string,
  kind: 'quarter' | 'year'
): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(start)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (month < 1 || month > 12) return null
  const probe = new Date(Date.UTC(year, month - 1, day))
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    return null
  }
  if (kind === 'year') return `${match[1]}-12-31`
  const endMonth = Math.ceil(month / 3) * 3
  const lastDay = new Date(Date.UTC(year, endMonth, 0)).getUTCDate()
  return `${match[1]}-${String(endMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
}
