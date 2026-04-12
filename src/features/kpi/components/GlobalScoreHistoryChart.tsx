import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ROUTES } from '@/constants'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useGlobalScoreSnapshots } from '../hooks/useGlobalScoreSnapshots'
import type { GlobalScoreSnapshot } from '../types/kpi.types'
import {
  chartRangeLabel,
  filterSnapshotsByCreatedAtRange,
  type GlobalScoreChartRange,
} from '../utils/globalScoreEvolution'

const CHART_H = 148
const PAD_L = 44
const PAD_R = 12
const PAD_T = 8
const PAD_B = 28

const RANGE_OPTIONS: GlobalScoreChartRange[] = ['7d', '30d', '90d', 'all']

function buildPath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return ''
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
}

function formatTickLabel(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  } catch {
    return ''
  }
}

export type GlobalScoreHistoryChartProps = {
  limit?: number
  title?: string
  description?: string
  /**
   * Modo controlado: puntos ya filtrados (p. ej. desde `useGlobalScoreEvolution`).
   * Evita un segundo fetch de snapshots.
   */
  series?: GlobalScoreSnapshot[]
  isLoading?: boolean
  isError?: boolean
  chartRange?: GlobalScoreChartRange
  onChartRangeChange?: (range: GlobalScoreChartRange) => void
}

export function GlobalScoreHistoryChart({
  limit = 90,
  title = 'Evolución del score global',
  description,
  series: seriesProp,
  isLoading: isLoadingProp,
  isError: isErrorProp,
  chartRange: chartRangeProp,
  onChartRangeChange,
}: GlobalScoreHistoryChartProps = {}) {
  const controlled = seriesProp !== undefined
  const [internalRange, setInternalRange] = useState<GlobalScoreChartRange>('90d')

  const {
    data: rawInternal = [],
    isLoading: internalLoading,
    isError: internalError,
  } = useGlobalScoreSnapshots({ limit, enabled: !controlled })

  const sortedInternal = useMemo(() => {
    const copy = [...rawInternal] as GlobalScoreSnapshot[]
    copy.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    return copy
  }, [rawInternal])

  const effectiveRange = controlled ? (chartRangeProp ?? '90d') : internalRange
  const handleRangeChange = controlled ? onChartRangeChange : setInternalRange
  const showRangeControls = typeof handleRangeChange === 'function'

  const series = useMemo(() => {
    if (controlled) return seriesProp ?? []
    return filterSnapshotsByCreatedAtRange(sortedInternal, effectiveRange)
  }, [controlled, seriesProp, sortedInternal, effectiveRange])

  const isLoading = controlled ? Boolean(isLoadingProp) : internalLoading
  const isError = controlled ? Boolean(isErrorProp) : internalError

  const defaultDescription = `Serie desde snapshots (0–100%). Ventana: ${chartRangeLabel(effectiveRange)}. Las mediciones pueden ser por KPI (no es obligatorio registrar todos a la vez).`

  const svg = useMemo(() => {
    const n = series.length
    const innerW = 400
    const innerH = CHART_H - PAD_T - PAD_B
    const w = PAD_L + innerW + PAD_R
    const h = CHART_H

    if (n === 0) {
      return { w, h, body: null as ReactNode }
    }

    const scores = series.map((s) => {
      const v = Number(s.score)
      return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0
    })
    const minS = 0
    const maxS = 1
    const xAt = (i: number) => {
      if (n === 1) return PAD_L + innerW / 2
      return PAD_L + (innerW * i) / (n - 1)
    }
    const yAt = (s: number) => {
      const t = (s - minS) / (maxS - minS || 1)
      return PAD_T + innerH * (1 - t)
    }

    const pts = scores.map((s, i) => ({ x: xAt(i), y: yAt(s) }))
    const d = buildPath(pts)

    const firstLabel = formatTickLabel(series[0]!.created_at)
    const lastLabel = formatTickLabel(series[n - 1]!.created_at)

    const yTicks = [0, 0.25, 0.5, 0.75, 1]

    return {
      w,
      h,
      body: (
        <svg
          width="100%"
          height={h}
          viewBox={`0 0 ${w} ${h}`}
          className="overflow-visible text-muted-foreground"
          role="img"
          aria-label={`Gráfica de evolución del score global con ${n} puntos.`}
        >
          {yTicks.map((yt) => {
            const yy = yAt(yt)
            return (
              <g key={yt}>
                <line
                  x1={PAD_L}
                  y1={yy}
                  x2={PAD_L + innerW}
                  y2={yy}
                  stroke="currentColor"
                  strokeOpacity={0.15}
                  strokeWidth={1}
                />
                <text x={PAD_L - 6} y={yy + 4} textAnchor="end" className="fill-current text-[9px]">
                  {Math.round(yt * 100)}%
                </text>
              </g>
            )
          })}
          <path
            d={d}
            fill="none"
            className="stroke-primary"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {pts.map((p, i) => (
            <circle key={series[i]!.id} cx={p.x} cy={p.y} r={2.5} className="fill-primary" />
          ))}
          <text x={PAD_L} y={h - 8} className="fill-current text-[9px]">
            {firstLabel}
          </text>
          <text x={PAD_L + innerW} y={h - 8} textAnchor="end" className="fill-current text-[9px]">
            {lastLabel}
          </text>
        </svg>
      ),
    }
  }, [series])

  const rangeRow = showRangeControls ? (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Ventana de tiempo">
      {RANGE_OPTIONS.map((r) => (
        <Button
          key={r}
          type="button"
          variant={effectiveRange === r ? 'secondary' : 'outline'}
          size="sm"
          className="h-7 text-[11px]"
          onClick={() => handleRangeChange(r)}
        >
          {r === 'all' ? 'Todo' : chartRangeLabel(r)}
        </Button>
      ))}
    </div>
  ) : null

  return (
    <Card className="min-w-0">
      <CardHeader className="pb-2">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="text-lg">{title}</CardTitle>
            <CardDescription>{description ?? defaultDescription}</CardDescription>
          </div>
          {rangeRow}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Cargando historial…</p>
        ) : isError ? (
          <p className="text-sm text-destructive">No se pudo cargar el historial de snapshots.</p>
        ) : series.length === 0 ? (
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>
              Aún no hay snapshots en esta ventana. Cada vez que registras una{' '}
              <strong className="font-medium text-foreground">medición en el catálogo de KPIs</strong>, se
              recalcula el score global y se puede guardar un punto en esta serie (misma lógica que el valor
              actual del tablero).
            </p>
            <p>
              <strong className="font-medium text-foreground">No hace falta medir todos los KPIs de golpe:</strong>{' '}
              puedes ir registrando{' '}
              <strong className="font-medium text-foreground">uno por uno</strong> cuando tengas dato (cada
              medición actualiza el portafolio y dispara el snapshot). Si necesitas pasar varios en bloque,
              usa la tabla del catálogo y abre medición en cada fila.
            </p>
            <p className="flex flex-wrap gap-x-3 gap-y-1">
              <Link
                to={ROUTES.DASHBOARD_KPIS}
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                Tablero KPIs — registrar por tarjeta
              </Link>
              <span className="text-muted-foreground/80">·</span>
              <Link
                to={ROUTES.SETTINGS_CATALOGS_KPIS}
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                Catálogo KPIs — columna Medición
              </Link>
            </p>
          </div>
        ) : (
          <div className="w-full min-w-0">{svg.body}</div>
        )}
      </CardContent>
    </Card>
  )
}
