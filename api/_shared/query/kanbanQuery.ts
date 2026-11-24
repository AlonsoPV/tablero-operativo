/**
 * Consultas Kanban sobre el contrato compartido. Delega en get_my_actions
 * (misma autorización y filtros que chat, voz y WhatsApp) y normaliza la salida.
 */
import type { CopilotActor } from '../assistantPending.js'
import type { CopilotToolResult } from '../../../src/features/ai-support/copilot/types.js'
import {
  failedResult,
  type ActionItem,
  type ActionsQueryRequest,
  type QueryResult,
} from './contracts.js'
import { sourcesFor } from './sourceCatalog.js'

export type ToolDispatcher = (
  actor: CopilotActor,
  name: string,
  args: Record<string, unknown>
) => Promise<CopilotToolResult>

function unwrap(data: unknown): Record<string, unknown> | null {
  if (!data || typeof data !== 'object') return null
  const record = data as Record<string, unknown>
  const inner = record.payload
  return inner && typeof inner === 'object' ? (inner as Record<string, unknown>) : record
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function toActionItem(raw: unknown): ActionItem | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  const id = str(row.id)
  if (!id) return null
  return {
    id,
    title: str(row.title) ?? 'Accion',
    estado: str(row.estado),
    fecha: str(row.fecha),
    hora: str(row.hora),
    prioridad: str(row.prioridad),
    href: str(row.href) ?? `/kanban?accion=${encodeURIComponent(id)}`,
    responsableId: str(row.responsable),
    ...(str(row.responsable_nombre) || str(row.responsableNombre)
      ? { responsableNombre: str(row.responsable_nombre) ?? str(row.responsableNombre) }
      : {}),
    ...(str(row.area) ? { area: str(row.area) } : {}),
  }
}

/** Normaliza el resultado de get_my_actions al contrato; exportado para pruebas y adaptadores. */
export function normalizeActionsToolResult(
  result: CopilotToolResult,
  request: ActionsQueryRequest
): QueryResult<ActionItem> {
  const sources = sourcesFor('actions')
  if (result.kind === 'denied') {
    return failedResult({
      entity: 'actions',
      status: 'forbidden',
      scopeApplied: request.scope,
      sources,
      message: result.error || 'Sin alcance para esta consulta.',
    })
  }
  if (!result.ok || result.kind === 'error') {
    return failedResult({
      entity: 'actions',
      status: 'error',
      scopeApplied: request.scope,
      sources,
      message: result.error || 'La consulta de acciones falló.',
    })
  }
  const data = unwrap(result.data) ?? {}
  const items = (Array.isArray(data.items) ? data.items : []).flatMap((raw) => {
    const item = toActionItem(raw)
    return item ? [item] : []
  })
  const total = typeof data.total === 'number' ? data.total : items.length
  const loadTruncated = data.load_truncated === true
  const limitations: string[] = []
  if (loadTruncated) {
    limitations.push('La fuente devolvió el máximo de filas permitido; el total puede ser mayor.')
  }
  if (total > items.length) {
    limitations.push(`Se muestran ${items.length} de ${total}.`)
  }
  return {
    status: total === 0 ? 'empty' : loadTruncated ? 'partial' : 'ok',
    entity: 'actions',
    items,
    totals: { total, returned: items.length },
    scopeApplied: str(data.population) ?? request.scope,
    sources,
    asOf: str(data.as_of) ?? new Date().toISOString(),
    limitations,
  }
}

async function attachResponsableNames(actor: CopilotActor, items: ActionItem[]) {
  const ids = [...new Set(items.map((i) => i.responsableId).filter((v): v is string => Boolean(v)))]
  if (ids.length === 0) return items
  try {
    const { data, error } = await actor.supabase.from('usuarios').select('id,nombre').in('id', ids)
    if (error || !Array.isArray(data)) return items
    const names = new Map(
      (data as Array<{ id?: string; nombre?: string }>).map((row) => [String(row.id), String(row.nombre ?? '')])
    )
    return items.map((item) => ({
      ...item,
      responsableNombre: item.responsableId ? names.get(item.responsableId) || null : null,
    }))
  } catch {
    return items
  }
}

export async function queryActions(
  actor: CopilotActor,
  request: ActionsQueryRequest,
  dispatch: ToolDispatcher
): Promise<QueryResult<ActionItem>> {
  let result: CopilotToolResult
  try {
    result = await dispatch(actor, 'get_my_actions', {
      scope: request.scope,
      status_group: request.statusGroup,
      visual: request.visual,
      include_count: true,
      ...(request.limit != null ? { limit: request.limit } : {}),
      ...(request.responsableId ? { responsable_id: request.responsableId } : {}),
    })
  } catch {
    return failedResult({
      entity: 'actions',
      status: 'error',
      scopeApplied: request.scope,
      sources: sourcesFor('actions'),
      message: 'La consulta de acciones falló.',
    })
  }
  const normalized = normalizeActionsToolResult(result, request)
  if (normalized.items.length === 0) return normalized
  return { ...normalized, items: await attachResponsableNames(actor, normalized.items) }
}
