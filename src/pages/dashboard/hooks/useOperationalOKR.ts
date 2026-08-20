import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import type { AccionDiaria } from '@/types'

export type OperationalOkrStatus = 'in_progress' | 'in_progress_warning' | 'fulfilled' | 'at_risk'
export type OperationalOkrDirection = 'increase' | 'decrease'

export type OperationalOkrKeyResult = {
  id: string
  metric_type: string
  title: string
  description: string
  baseline_value: number | null
  current_value: number
  current_count?: number
  target_value: number
  unit: string
  direction: OperationalOkrDirection
  progress: number
  trend_delta: number | null
  trend_previous: number | null
  action_ids: string[]
  drilldown_title: string
}

export type OperationalOkrMilestone = {
  day: number
  target_value: number
}

export type OperationalOkr = {
  id: string
  title: string
  description: string
  start_date: string
  end_date: string
  period_days: number
  elapsed_days: number
  status: OperationalOkrStatus
  expected_progress: number
  overall_progress: number
}

export type OperationalOkrDashboard = {
  ok: boolean
  message?: string
  okr: OperationalOkr
  milestones: OperationalOkrMilestone[]
  key_results: OperationalOkrKeyResult[]
}

export type OperationalOkrKeyResultView = OperationalOkrKeyResult & {
  actions: AccionDiaria[]
}

export type OperationalOkrView = OperationalOkrDashboard & {
  keyResults: OperationalOkrKeyResultView[]
}

const ACCION_SELECT = [
  'id',
  'fecha',
  'titulo_accion',
  'descripcion_accion',
  'responsable',
  'created_by',
  'updated_by',
  'hora_limite',
  'evidencia_esperada',
  'evidencia_cargada',
  'evidencia_adjunta',
  'estado',
  'kpi_afectado',
  'gap_id',
  'tipo_accion',
  'story_points',
  'catalog_kpi_id',
  'okr_impactado',
  'proceso',
  'area',
  'cliente_id',
  'prioridad',
  'prioridad_id',
  'causa_raiz',
  'responsable_bloqueo',
  'escalado',
  'fecha_escalamiento',
  'notas_escalamiento',
  'repeticion',
  'verificador_dato',
  'verificador_gobierno',
  'completed_at',
  'completed_by',
  'verified_at',
  'verified_by',
  'created_at',
  'updated_at',
  'sprint_id',
].join(',')

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(100, Math.max(0, Math.round(value)))
}

function normalizeDashboard(raw: unknown): OperationalOkrDashboard {
  const data = raw as Partial<OperationalOkrDashboard> | null
  if (!data?.ok || !data.okr) {
    throw new Error(data?.message ?? 'No se pudo cargar el OKR operativo.')
  }
  return {
    ok: true,
    okr: {
      ...data.okr,
      status: data.okr.status,
      overall_progress: clampPercent(data.okr.overall_progress),
      expected_progress: clampPercent(data.okr.expected_progress),
    },
    milestones: Array.isArray(data.milestones) ? data.milestones : [],
    key_results: (Array.isArray(data.key_results) ? data.key_results : []).map((kr) => ({
      ...kr,
      baseline_value: kr.baseline_value == null ? null : Number(kr.baseline_value),
      current_value: Number(kr.current_value ?? 0),
      current_count: kr.current_count == null ? undefined : Number(kr.current_count),
      target_value: Number(kr.target_value ?? 0),
      progress: clampPercent(Number(kr.progress ?? 0)),
      trend_delta: kr.trend_delta == null ? null : Number(kr.trend_delta),
      trend_previous: kr.trend_previous == null ? null : Number(kr.trend_previous),
      action_ids: Array.isArray(kr.action_ids) ? kr.action_ids.filter(Boolean) : [],
    })),
  }
}

async function fetchOperationalOkrDashboard(): Promise<OperationalOkrDashboard> {
  const { data, error } = await supabase.rpc('get_operational_okr_dashboard')
  if (error) throw error
  return normalizeDashboard(data)
}

async function fetchOkrActions(ids: string[]): Promise<AccionDiaria[]> {
  const uniqueIds = [...new Set(ids.filter(Boolean))]
  if (uniqueIds.length === 0) return []
  const { data, error } = await supabase
    .from('acciones_diarias')
    .select(ACCION_SELECT)
    .in('id', uniqueIds)
  if (error) throw error
  return (data ?? []) as unknown as AccionDiaria[]
}

export function useOperationalOKR() {
  const okrQuery = useQuery({
    queryKey: ['dashboard', 'operational-okr'],
    queryFn: fetchOperationalOkrDashboard,
    staleTime: 5 * 60_000,
    retry: 1,
  })

  const actionIds = useMemo(() => {
    const ids = okrQuery.data?.key_results.flatMap((kr) => kr.action_ids) ?? []
    return [...new Set(ids)].sort()
  }, [okrQuery.data])

  const actionsQuery = useQuery({
    queryKey: ['dashboard', 'operational-okr-actions', actionIds],
    queryFn: () => fetchOkrActions(actionIds),
    enabled: actionIds.length > 0,
    staleTime: 5 * 60_000,
    retry: 1,
  })

  const view = useMemo((): OperationalOkrView | null => {
    if (!okrQuery.data) return null
    const actionsById = new Map((actionsQuery.data ?? []).map((action) => [action.id, action]))
    return {
      ...okrQuery.data,
      keyResults: okrQuery.data.key_results.map((kr) => ({
        ...kr,
        actions: kr.action_ids.map((id) => actionsById.get(id)).filter((action): action is AccionDiaria => Boolean(action)),
      })),
    }
  }, [actionsQuery.data, okrQuery.data])

  return {
    data: view,
    isLoading: okrQuery.isLoading || actionsQuery.isLoading,
    isError: okrQuery.isError || actionsQuery.isError,
    error: okrQuery.error ?? actionsQuery.error,
    refetch: okrQuery.refetch,
  }
}
