/**
 * Consultas OKR sobre el contrato compartido. Delega en get_okr_progress
 * (gate de módulo okrs + RPC okr_dashboard) y normaliza la salida.
 */
import type { CopilotActor } from '../assistantPending.js'
import type { CopilotToolResult } from '../../../src/features/ai-support/copilot/types.js'
import { failedResult, type OkrItem, type OkrsQueryRequest, type QueryResult } from './contracts.js'
import type { ToolDispatcher } from './kanbanQuery.js'
import { sourcesFor } from './sourceCatalog.js'

function unwrap(data: unknown): Record<string, unknown> {
  if (!data || typeof data !== 'object') return {}
  const record = data as Record<string, unknown>
  const inner = record.payload
  return inner && typeof inner === 'object' ? (inner as Record<string, unknown>) : record
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function toOkrItem(raw: unknown): OkrItem | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  const id = str(row.id)
  if (!id) return null
  const krs = Array.isArray(row.krs) ? row.krs : []
  return {
    id,
    name: str(row.nombre) ?? 'Objetivo',
    progress: num(row.progress),
    withoutInitiatives: row.without_initiatives === true,
    insufficientKrs: num(row.insufficient_krs) ?? 0,
    keyResults: krs.flatMap((kr) => {
      if (!kr || typeof kr !== 'object') return []
      const k = kr as Record<string, unknown>
      const krId = str(k.id)
      if (!krId) return []
      const progress = num(k.progress)
      return [{
        id: krId,
        title: str(k.title) ?? 'KR',
        actual: num(k.actual),
        meta: num(k.meta),
        unidad: str(k.unidad),
        progress,
        measurable: progress != null,
      }]
    }),
  }
}

export function normalizeOkrToolResult(result: CopilotToolResult): QueryResult<OkrItem> {
  const sources = sourcesFor('okrs')
  if (result.kind === 'denied') {
    return failedResult({
      entity: 'okrs',
      status: 'forbidden',
      scopeApplied: 'okrs_autorizados',
      sources,
      message: result.error || 'No tienes acceso a OKRs.',
    })
  }
  if (!result.ok || result.kind === 'error') {
    return failedResult({
      entity: 'okrs',
      status: 'error',
      scopeApplied: 'okrs_autorizados',
      sources,
      message: result.error || 'La consulta de OKRs falló.',
    })
  }
  const data = unwrap(result.data)
  const items = (Array.isArray(data.items) ? data.items : []).flatMap((raw) => {
    const item = toOkrItem(raw)
    return item ? [item] : []
  })
  const total = num(data.objectives) ?? items.length
  const insufficient = num(data.insufficient_krs) ?? 0
  const truncated = data.truncated === true
  const limitations: string[] = []
  if (truncated) limitations.push(`Se muestran ${items.length} de ${total} objetivos.`)
  if (insufficient > 0) {
    limitations.push(`${insufficient} KR sin datos suficientes para medir avance; no se estima su valor.`)
  }
  return {
    status: total === 0 ? 'empty' : truncated ? 'partial' : 'ok',
    entity: 'okrs',
    items,
    totals: { total, returned: items.length },
    scopeApplied: 'okrs_autorizados',
    sources,
    asOf: new Date().toISOString(),
    limitations,
  }
}

export async function queryOkrs(
  actor: CopilotActor,
  _request: OkrsQueryRequest,
  dispatch: ToolDispatcher
): Promise<QueryResult<OkrItem>> {
  try {
    return normalizeOkrToolResult(await dispatch(actor, 'get_okr_progress', {}))
  } catch {
    return failedResult({
      entity: 'okrs',
      status: 'error',
      scopeApplied: 'okrs_autorizados',
      sources: sourcesFor('okrs'),
      message: 'La consulta de OKRs falló.',
    })
  }
}
