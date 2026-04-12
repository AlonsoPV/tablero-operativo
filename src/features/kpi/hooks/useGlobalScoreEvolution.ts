import { useMemo } from 'react'
import { getO2cProgramMonthIndex, isO2cProgramStartConfigured } from '@/lib/o2cProgramConfig'
import { useGlobalScoreSnapshots } from './useGlobalScoreSnapshots'
import { useO2cGlobalScore } from './useO2cGlobalScore'
import type { GlobalScoreSnapshot } from '../types/kpi.types'
import { DEFAULT_O2C_TARGET_HORIZON, type TargetHorizon } from '../utils/kpiCalculations'
import { deriveMdSpecPortfolio, type MdSpecPortfolioDerived } from '../utils/kpiMdSpecCalculations'
import {
  buildDeltaVsPreviousLine,
  buildTrendInterpretation,
  buildWindowNarrative,
  classifyTrend,
  computeDeltaVsPreviousPct,
  computeDeltaWindowPct,
  filterSnapshotsByCreatedAtRange,
  type GlobalScoreChartRange,
} from '../utils/globalScoreEvolution'

export type UseGlobalScoreEvolutionOptions = {
  /** Máximo de filas a traer para la serie (orden descendente en servidor). */
  snapshotLimit?: number
  /** Ventana temporal aplicada a la gráfica y al texto de variación neta. */
  chartRange?: GlobalScoreChartRange
  /** Alineado con el horizonte de meta del tablero KPIs (por defecto M18). */
  targetHorizon?: TargetHorizon
}

export type GlobalScoreTrend = 'up' | 'down' | 'flat' | null

export type UseGlobalScoreEvolutionResult = ReturnType<typeof useO2cGlobalScore> & {
  snapshotsLoading: boolean
  snapshotsError: boolean
  /** Serie completa, antigua → reciente. */
  snapshotsSortedAsc: GlobalScoreSnapshot[]
  /** Puntos mostrados en la gráfica según `chartRange`. */
  chartSeries: GlobalScoreSnapshot[]
  chartRange: GlobalScoreChartRange
  deltaVsPreviousPct: number | null
  deltaWindowPct: number | null
  trend: GlobalScoreTrend
  deltaVsPreviousLine: string | null
  trendLine: string | null
  windowLine: string | null
  /** Mes de programa 1–18 (null si no hay `VITE_O2C_PROGRAM_START`). */
  programMonthIndex: number | null
  programStartConfigured: boolean
  /** Score y semáforo según docs/KPIs.md §3–§4. */
  mdSpec: MdSpecPortfolioDerived
}

/**
 * Score global actual (pipeline) + historial de snapshots: variación, tendencia y textos ejecutivos.
 * Sin recálculo pesado: derivaciones en `useMemo` sobre listas ya cargadas.
 */
export function useGlobalScoreEvolution(
  options: UseGlobalScoreEvolutionOptions = {}
): UseGlobalScoreEvolutionResult {
  const snapshotLimit = options.snapshotLimit ?? 120
  const chartRange = options.chartRange ?? '90d'
  const targetHorizon = options.targetHorizon ?? DEFAULT_O2C_TARGET_HORIZON

  const o2c = useO2cGlobalScore({ targetHorizon })
  const {
    data: rawSnapshots = [],
    isLoading: snapshotsLoading,
    isError: snapshotsError,
  } = useGlobalScoreSnapshots({ limit: snapshotLimit })

  const snapshotsSortedAsc = useMemo(() => {
    const copy = [...rawSnapshots] as GlobalScoreSnapshot[]
    copy.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    return copy
  }, [rawSnapshots])

  const chartSeries = useMemo(
    () => filterSnapshotsByCreatedAtRange(snapshotsSortedAsc, chartRange),
    [snapshotsSortedAsc, chartRange]
  )

  const deltaVsPreviousPct = useMemo(
    () => computeDeltaVsPreviousPct(snapshotsSortedAsc),
    [snapshotsSortedAsc]
  )

  const deltaWindowPct = useMemo(
    () => computeDeltaWindowPct(snapshotsSortedAsc, chartRange),
    [snapshotsSortedAsc, chartRange]
  )

  const trend = useMemo(() => classifyTrend(deltaVsPreviousPct), [deltaVsPreviousPct])

  const deltaVsPreviousLine = useMemo(() => buildDeltaVsPreviousLine(deltaVsPreviousPct), [deltaVsPreviousPct])

  const trendLine = useMemo(() => buildTrendInterpretation(trend), [trend])

  const windowLine = useMemo(
    () => buildWindowNarrative(deltaWindowPct, chartRange),
    [deltaWindowPct, chartRange]
  )

  const programMonthIndex = getO2cProgramMonthIndex()
  const programStartConfigured = isO2cProgramStartConfigured()

  const mdSpec = useMemo(
    () =>
      deriveMdSpecPortfolio(o2c.metricItems, programMonthIndex, {
        o2cAlignedSemaphores: { targetHorizon },
      }),
    [o2c.metricItems, programMonthIndex, targetHorizon]
  )

  return {
    ...o2c,
    snapshotsLoading,
    snapshotsError,
    snapshotsSortedAsc,
    chartSeries,
    chartRange,
    deltaVsPreviousPct,
    deltaWindowPct,
    trend,
    deltaVsPreviousLine,
    trendLine,
    windowLine,
    programMonthIndex,
    programStartConfigured,
    mdSpec,
  }
}
