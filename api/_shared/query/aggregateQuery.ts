/**
 * Agregados de ejecución (conteos por área, responsable o estado). Delega en get_my_actions con
 * group_by: la autorización y los filtros se aplican antes de contar y antes de paginar.
 */
import type { CopilotActor } from '../assistantPending.js'
import type { CopilotToolResult } from '../../../src/features/ai-support/copilot/types.js'
import {
  failedResult,
  type AggregateBucket,
  type AggregateQueryRequest,
  type QueryResult,
} from './contracts.js'
import type { ToolDispatcher } from './kanbanQuery.js'
import { sourcesFor } from './sourceCatalog.js'

const MAX_BUCKETS = 12

function unwrap(data: unknown): Record<string, unknown> {
  if (!data || typeof data !== 'object') return {}
  const record = data as Record<string, unknown>
  const inner = record.payload
  return inner && typeof inner === 'object' ? (inner as Record<string, unknown>) : record
}

export function normalizeAggregateToolResult(
  result: CopilotToolResult,
  request: AggregateQueryRequest,
  labels: Map<string, string> = new Map()
): QueryResult<AggregateBucket> {
  const sources = sourcesFor('aggregate')
  if (result.kind === 'denied') {
    return failedResult({ entity: 'aggregate', status: 'forbidden', scopeApplied: request.scope, sources,
      message: result.error || 'Sin alcance para esta consulta.' })
  }
  if (!result.ok || result.kind === 'error') {
    return failedResult({ entity: 'aggregate', status: 'error', scopeApplied: request.scope, sources,
      message: result.error || 'La consulta agregada falló.' })
  }
  const data = unwrap(result.data)
  const groups = data.groups && typeof data.groups === 'object' ? (data.groups as Record<string, unknown>) : {}
  const all = Object.entries(groups)
    .flatMap(([key, value]) => (typeof value === 'number' && value > 0 ? [{ key, count: value }] : []))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
  const items = all.slice(0, MAX_BUCKETS).map((bucket) => ({
    ...bucket,
    label: bucket.key === 'sin_dato' ? 'Sin dato' : labels.get(bucket.key) ?? bucket.key,
  }))
  const total = typeof data.total === 'number' ? data.total : all.reduce((sum, b) => sum + b.count, 0)
  const loadTruncated = data.load_truncated === true
  const limitations: string[] = []
  if (loadTruncated) limitations.push('La fuente devolvió el máximo de filas permitido; los totales pueden ser mayores.')
  if (all.length > items.length) limitations.push(`Se muestran ${items.length} de ${all.length} grupos.`)
  return {
    status: total === 0 ? 'empty' : loadTruncated ? 'partial' : 'ok',
    entity: 'aggregate',
    items,
    totals: { total, returned: items.length },
    scopeApplied: typeof data.population === 'string' ? data.population : request.scope,
    sources,
    asOf: typeof data.as_of === 'string' ? data.as_of : new Date().toISOString(),
    limitations,
  }
}

async function responsableLabels(actor: CopilotActor, ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map()
  try {
    const { data, error } = await actor.supabase.from('usuarios').select('id,nombre').in('id', ids)
    if (error || !Array.isArray(data)) return new Map()
    return new Map((data as Array<{ id?: string; nombre?: string }>).map((r) => [String(r.id), String(r.nombre ?? '')]))
  } catch {
    return new Map()
  }
}

export async function queryAggregate(
  actor: CopilotActor,
  request: AggregateQueryRequest,
  dispatch: ToolDispatcher
): Promise<QueryResult<AggregateBucket>> {
  let result: CopilotToolResult
  try {
    result = await dispatch(actor, 'get_my_actions', {
      scope: request.scope,
      status_group: request.statusGroup,
      visual: 'none',
      include_count: true,
      group_by: request.groupBy,
      limit: 1,
    })
  } catch {
    return failedResult({ entity: 'aggregate', status: 'error', scopeApplied: request.scope,
      sources: sourcesFor('aggregate'), message: 'La consulta agregada falló.' })
  }
  if (request.groupBy !== 'responsable' || !result.ok) return normalizeAggregateToolResult(result, request)
  const draft = normalizeAggregateToolResult(result, request)
  const labels = await responsableLabels(actor, draft.items.map((b) => b.key).filter((k) => k !== 'sin_dato'))
  return normalizeAggregateToolResult(result, request, labels)
}
