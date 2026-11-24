/**
 * Contrato único de consultas del agente (Kanban, OKRs y combinadas).
 * Todos los canales consumen este resultado; ningún adaptador consulta tablas por su cuenta.
 */
import type {
  ActionQueryScope,
  ActionQueryStatusGroup,
  ActionQueryVisual,
} from '../../../src/features/ai-support/actionQuery/types.js'

export type QueryEntity = 'actions' | 'okrs' | 'combined' | 'aggregate'

/**
 * ok: datos completos · empty: consulta válida sin filas · forbidden: el actor no tiene alcance ·
 * partial: datos truncados o una fuente denegada · error: la fuente falló (no se infieren datos).
 */
export type QueryStatus = 'ok' | 'empty' | 'forbidden' | 'partial' | 'error'

export type QuerySourceRef = {
  id: string
  kind: 'table' | 'rpc'
  name: string
}

export type ActionsQueryRequest = {
  entity: 'actions'
  scope: ActionQueryScope
  statusGroup: ActionQueryStatusGroup
  visual: ActionQueryVisual
  limit?: number
  /** Sólo con alcance amplio autorizado; el ID proviene de search_people, no del modelo. */
  responsableId?: string
}

export type OkrsQueryRequest = {
  entity: 'okrs'
  /** Periodo informativo; el RPC devuelve objetivos activos del actor. */
  period?: 'current_quarter' | 'all_active'
}

export type CombinedQueryRequest = {
  entity: 'combined'
  actions: Omit<ActionsQueryRequest, 'entity'>
  okrs: Omit<OkrsQueryRequest, 'entity'>
}

export type AggregateGroupBy = 'area' | 'responsable' | 'estado'

/** Conteos sobre toda la población autorizada (nunca sobre una página de resultados). */
export type AggregateQueryRequest = {
  entity: 'aggregate'
  groupBy: AggregateGroupBy
  statusGroup: ActionQueryStatusGroup
  scope: ActionQueryScope
}

export type AggregateBucket = { key: string; label: string; count: number }

export type QueryRequest = ActionsQueryRequest | OkrsQueryRequest | CombinedQueryRequest | AggregateQueryRequest

export type ActionItem = {
  id: string
  title: string
  estado: string | null
  fecha: string | null
  hora: string | null
  prioridad: string | null
  href: string
  responsableId?: string | null
  responsableNombre?: string | null
  area?: string | null
  updatedAt?: string | null
  evidenciaCargada?: boolean | null
}

export type KeyResultItem = {
  id: string
  title: string
  actual: number | null
  meta: number | null
  unidad: string | null
  progress: number | null
  measurable: boolean
}

export type OkrItem = {
  id: string
  name: string
  progress: number | null
  withoutInitiatives: boolean
  insufficientKrs: number
  keyResults: KeyResultItem[]
}

export type QueryError = {
  code: 'source_failed' | 'denied' | 'invalid_request'
  message: string
}

export type QueryResult<T> = {
  status: QueryStatus
  entity: QueryEntity
  items: T[]
  totals: { total: number; returned: number }
  scopeApplied: string
  sources: QuerySourceRef[]
  asOf: string
  limitations: string[]
  error?: QueryError
}

export type CombinedQueryResult = {
  status: QueryStatus
  entity: 'combined'
  actions: QueryResult<ActionItem>
  okrs: QueryResult<OkrItem>
  asOf: string
  limitations: string[]
}

/** Combina estados: forbidden/error en una parte con datos en la otra produce partial. */
export function combineStatuses(statuses: QueryStatus[]): QueryStatus {
  if (statuses.length === 0) return 'empty'
  if (statuses.every((s) => s === 'forbidden')) return 'forbidden'
  if (statuses.every((s) => s === 'error')) return 'error'
  if (statuses.every((s) => s === 'empty')) return 'empty'
  if (statuses.some((s) => s === 'forbidden' || s === 'error' || s === 'partial')) {
    const hasData = statuses.some((s) => s === 'ok' || s === 'partial')
    return hasData ? 'partial' : statuses.includes('error') ? 'error' : 'forbidden'
  }
  return statuses.includes('ok') ? 'ok' : 'empty'
}

export function failedResult<T>(input: {
  entity: QueryEntity
  status: 'forbidden' | 'error'
  scopeApplied: string
  sources: QuerySourceRef[]
  message: string
  asOf?: string
}): QueryResult<T> {
  return {
    status: input.status,
    entity: input.entity,
    items: [],
    totals: { total: 0, returned: 0 },
    scopeApplied: input.scopeApplied,
    sources: input.sources,
    asOf: input.asOf ?? new Date().toISOString(),
    limitations: [],
    error: {
      code: input.status === 'forbidden' ? 'denied' : 'source_failed',
      message: input.message,
    },
  }
}
