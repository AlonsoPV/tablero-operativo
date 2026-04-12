import type { EnrichedKpi } from '../hooks/useKpisDashboardData'

function escapeCsvCell(value: string): string {
  if (/[",\r\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

function statusEs(s: EnrichedKpi['status']): string {
  if (s === 'on_track') return 'En meta'
  if (s === 'at_risk') return 'En riesgo'
  if (s === 'off_track') return 'Fuera de meta'
  return 'Sin datos'
}

/**
 * CSV de la vista actual del tablero KPIs (filas enriquecidas ya filtradas/ordenadas).
 * Separador: coma. Encoding: UTF-8 (BOM opcional en caller).
 */
export function buildKpiDashboardCsv(rows: EnrichedKpi[], horizonLabel: string): string {
  const header = [
    'Nombre',
    'Tipo',
    'Gap',
    'Área',
    'Horizonte_meta',
    'Cumplimiento_decimal_0_1',
    'Cumplimiento_pct',
    'Estado',
    'Peso_decimal_0_1',
    'Peso_pct',
    'Valor_actual',
    'Unidad',
  ]

  const lines = [header.join(',')]

  for (const e of rows) {
    const c = e.compliance
    const pct = c != null && Number.isFinite(c) ? Math.round(c * 1000) / 10 : ''
    const w = e.row.weight
    const wPct = w != null && Number.isFinite(w) ? Math.round(w * 10000) / 100 : ''
    const cur = e.metric.current
    const vals = [
      e.row.nombre,
      e.row.tipo ?? '',
      e.gap?.nombre ?? '',
      e.gap?.area ?? '',
      horizonLabel,
      c != null && Number.isFinite(c) ? String(c) : '',
      pct === '' ? '' : String(pct),
      statusEs(e.status),
      w != null && Number.isFinite(w) ? String(w) : '',
      wPct === '' ? '' : String(wPct),
      cur != null && Number.isFinite(cur) ? String(cur) : '',
      e.row.unidad ?? '',
    ].map((v) => escapeCsvCell(String(v)))
    lines.push(vals.join(','))
  }

  return lines.join('\r\n')
}

export function downloadKpiDashboardCsv(content: string, filename = 'kpi-dashboard.csv'): void {
  const bom = '\uFEFF'
  const blob = new Blob([bom + content], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
