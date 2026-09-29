import {
  krProgress,
  objectivePeriod,
  objectiveProgress,
  type CheckIn,
  type KeyResult,
  type Objective,
  type OkrData,
} from './model'

export type ConfigurationDetails = {
  entity: 'objective' | 'key_result'
  event: 'created' | 'updated'
  before: Record<string, unknown> | null
  after: Record<string, unknown>
}
export type ReportEvent = {
  id: string
  created_at: string
  actor_id: string | null
  key_result_id: string | null
} & (
  | { kind: 'measurement'; details: CheckIn & { current_title: string } }
  | { kind: 'configuration'; details: ConfigurationDetails }
)

export function historicalProgress(measurement: CheckIn): number | null {
  if (
    measurement.baseline_snapshot == null ||
    measurement.target_snapshot == null ||
    measurement.baseline_snapshot === measurement.target_snapshot
  )
    return null
  return krProgress({
    baseline_value: measurement.baseline_snapshot,
    target_value: measurement.target_snapshot,
    current_value: measurement.value,
  })
}

export function measurementsFor(results: CheckIn[], krId: string): CheckIn[] {
  return results
    .filter((c) => c.key_result_id === krId)
    .sort(
      (a, b) =>
        b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id)
    )
}

export function comparableChange(history: CheckIn[]): number | null {
  const [last, previous] = history
  if (
    !last ||
    !previous ||
    last.baseline_snapshot !== previous.baseline_snapshot ||
    last.target_snapshot !== previous.target_snapshot ||
    last.unit_snapshot !== previous.unit_snapshot
  )
    return null
  const current = historicalProgress(last)
  const before = historicalProgress(previous)
  return current == null || before == null ? null : current - before
}

export type ReportFilters = {
  search: string
  scope: string
  area: string
  period: string
  owner: string
  dates: string
}
export const emptyReportFilters: ReportFilters = {
  search: '',
  scope: 'all',
  area: 'all',
  period: 'all',
  owner: 'all',
  dates: 'all',
}
export function filterReport(
  objectives: Objective[],
  filters: ReportFilters,
  today: string
) {
  const normalize = (text: string) =>
    text
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase('es')
      .trim()
  return objectives.filter(
    (o) =>
      (!filters.search ||
        normalize(o.nombre_okr).includes(normalize(filters.search))) &&
      (filters.scope === 'all' || o.scope === filters.scope) &&
      (filters.area === 'all' || o.area_id === filters.area) &&
      (filters.period === 'all' ||
        objectivePeriod(o, today) === filters.period) &&
      (filters.owner === 'all' || o.owner_user_id === filters.owner) &&
      (filters.dates === 'all' ||
        `${o.start_date ?? ''}|${o.end_date ?? ''}` === filters.dates)
  )
}

export function reportingSummary(objectives: Objective[], data: OkrData) {
  const measured = objectives
    .map((o) => data.keyResults.filter((k) => k.okr_id === o.id))
    .filter((results) => results.length > 0)
  return {
    average: measured.length
      ? measured.reduce((sum, results) => sum + objectiveProgress(results), 0) /
        measured.length
      : null,
    achieved: measured.filter((results) =>
      results.every((k) => krProgress(k) >= 100)
    ).length,
    missingKrs: objectives.length - measured.length,
    withoutCheckIn: measured
      .flat()
      .filter(
        (k) =>
          k.metric_type.startsWith('manual:') &&
          measurementsFor(data.checkIns, k.id).filter(
            (c) => c.note !== 'Línea base inicial'
          ).length === 0
      ).length,
  }
}

export function reportDate(value: string | null | undefined): string {
  if (!value) return 'Sin fecha'
  return new Date(`${value.slice(0, 10)}T12:00:00Z`).toLocaleDateString(
    'es-MX',
    { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }
  )
}
export function reportTimestamp(value: string) {
  return new Date(value).toLocaleString('es-MX', {
    timeZone: 'America/Mexico_City',
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

export function measurementLabel(kr: KeyResult, history: CheckIn[]) {
  if (!kr.metric_type.startsWith('manual:')) return 'Medición automática'
  const check = history.find((c) => c.note !== 'Línea base inicial')
  return check
    ? reportTimestamp(check.created_at)
    : 'Sin seguimiento registrado'
}

/** Quote every field and neutralize spreadsheet formula prefixes in user text. */
export function csvCell(value: unknown): string {
  let text = value == null ? '' : String(value)
  if (typeof value === 'string' && /^[\s]*[=+\-@]/.test(text)) text = `'${text}`
  return `"${text.replace(/"/g, '""')}"`
}
export function reportCsv(objectives: Objective[], data: OkrData): string {
  const rows: unknown[][] = [
    [
      'Objetivo',
      'Ámbito',
      'Equipo',
      'Responsable objetivo',
      'Inicio',
      'Fin',
      'Archivado',
      'Avance objetivo (%)',
      'KR',
      'Dueño KR',
      'Línea base',
      'Actual',
      'Meta',
      'Unidad',
      'Avance KR (%)',
      'Último seguimiento (CDMX)',
      'Iniciativas vinculadas',
    ],
  ]
  for (const o of objectives) {
    const results = data.keyResults.filter((k) => k.okr_id === o.id)
    for (const k of results.length ? results : [null]) {
      rows.push([
        o.nombre_okr,
        o.scope === 'company' ? 'Empresa' : 'Equipo',
        data.areas.find((a) => a.id === o.area_id)?.nombre,
        data.users.find((u) => u.id === o.owner_user_id)?.nombre,
        o.start_date,
        o.end_date,
        o.activo ? 'No' : 'Sí',
        results.length ? Math.round(objectiveProgress(results)) : '',
        k?.title,
        data.users.find((u) => u.id === k?.owner_user_id)?.nombre,
        k?.baseline_value,
        k?.current_value,
        k?.target_value,
        k?.unit,
        k ? Math.round(krProgress(k)) : '',
        k ? measurementLabel(k, measurementsFor(data.checkIns, k.id)) : '',
        k
          ? data.initiatives.filter((i) => i.key_result_id === k.id).length
          : '',
      ])
    }
  }
  return '\uFEFF' + rows.map((row) => row.map(csvCell).join(',')).join('\r\n')
}
