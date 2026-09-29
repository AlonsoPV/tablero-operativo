export interface Objective {
  id: string
  nombre_okr: string
  descripcion: string | null
  scope: 'company' | 'team'
  area_id: string | null
  owner_user_id: string | null
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
}

export interface CheckIn {
  id: string
  key_result_id: string
  value: number
  note: string | null
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

/** Results are measured independently of action completion, including decreasing targets. */
export function krProgress(
  kr: Pick<
    KeyResult,
    'baseline_value' | 'target_value' | 'current_value' | 'computed_progress'
  >
): number {
  if (kr.computed_progress != null)
    return Math.max(0, Math.min(100, kr.computed_progress))
  const {
    baseline_value: baseline,
    target_value: target,
    current_value: current,
  } = kr
  if (baseline == null || current == null || baseline === target) return 0
  const value = ((current - baseline) / (target - baseline)) * 100
  return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0
}

export function objectiveProgress(results: KeyResult[]): number {
  return results.length
    ? results.reduce((total, kr) => total + krProgress(kr), 0) / results.length
    : 0
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
