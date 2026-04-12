import type { ImpactRow } from '../hooks/useImpactMatrix'

function escapeCsvCell(value: string): string {
  if (/[",\r\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

export function buildImpactMatrixCsv(rows: ImpactRow[]): string {
  const headers = [
    'Titulo',
    'GAP',
    'Story Points',
    'Total Pts GAP',
    'KPI',
    'Peso KPI %',
    'Impacto %',
    'Estado',
  ]

  const lines = [headers.join(',')]

  for (const r of rows) {
    const values = [
      r.titulo,
      r.gapNombre ?? '',
      r.storyPoints ?? '',
      r.totalPuntosGap,
      r.kpiNombre ?? '',
      r.pesoKpi != null ? (r.pesoKpi * 100).toFixed(1) : '',
      r.impactoPct != null ? (r.impactoPct * 100).toFixed(2) : '',
      r.estado ?? '',
    ].map((v) => escapeCsvCell(String(v)))

    lines.push(values.join(','))
  }

  return lines.join('\r\n')
}

export function downloadImpactMatrixCsv(content: string, filename = 'impact-matrix.csv'): void {
  const bom = '\uFEFF'
  const blob = new Blob([bom + content], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
