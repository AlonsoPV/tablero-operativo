import type {
  AssistantActionRowView,
  AssistantMetric,
  AssistantOkrRowView,
  AssistantReplyView,
  AssistantUiPayload,
} from './types'

/** Rutas literales: este módulo también se empaqueta en api/gemini-chat (sin alias @/). */
const KANBAN_PATH = '/kanban'
const OKRS_PATH = '/okrs'

export type ToolReadCapture = {
  tool: string
  kind: string
  data?: unknown
  error?: string
}

const ACTION_TOOLS = new Set([
  'get_my_actions',
  'get_team_actions',
  'get_pending_verifications',
  'get_action_details',
])

const OKR_TOOLS = new Set(['get_okr_progress'])
const DASHBOARD_TOOLS = new Set(['get_dashboard_summary'])

function unwrapPayload(data: unknown): unknown {
  if (!data || typeof data !== 'object') return data
  const record = data as Record<string, unknown>
  if ('payload' in record) return record.payload
  return data
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function actionHref(id: string, href?: string | null) {
  if (href && href.startsWith('/')) return href
  return `${KANBAN_PATH}?accion=${encodeURIComponent(id)}`
}

function okrHref(id: string) {
  return `${OKRS_PATH}?objective=${encodeURIComponent(id)}`
}

function mapActionItem(raw: unknown): AssistantActionRowView | null {
  const row = asRecord(raw)
  if (!row) return null
  const id = asString(row.id)
  const title = asString(row.title) || asString(row.titulo) || asString(row.titulo_accion)
  if (!id || !title) return null
  return {
    id,
    title,
    estado: asString(row.estado),
    prioridad: asString(row.prioridad),
    fecha: asString(row.fecha),
    responsable: asString(row.responsable) || asString(row.responsable_nombre),
    href: actionHref(id, asString(row.href)),
  }
}

function mapOkrItem(raw: unknown): AssistantOkrRowView | null {
  const row = asRecord(raw)
  if (!row) return null
  const id = asString(row.id)
  const nombre = asString(row.nombre) || asString(row.nombre_okr)
  if (!id || !nombre) return null
  const krs = Array.isArray(row.krs) ? row.krs : []
  const progress = asNumber(row.progress)
  const withoutInitiatives = row.without_initiatives === true
  return {
    id,
    nombre,
    progress,
    krCount: krs.length || asNumber(row.krCount) || 0,
    pace: asString(row.pace),
    initiativesHint: withoutInitiatives ? 'Sin iniciativas vinculadas' : null,
    href: okrHref(id),
  }
}

function paceLabel(pace: string | null | undefined) {
  if (!pace) return null
  const map: Record<string, string> = {
    sin_datos: 'Sin datos',
    sin_periodo: 'Sin periodo',
    programado: 'Programado',
    archivado: 'Archivado',
    finalizado: 'Finalizado',
    en_ritmo: 'En ritmo',
    bajo_ritmo: 'Bajo ritmo',
  }
  return map[pace] ?? pace
}

function lastByTool(captures: ToolReadCapture[]) {
  const map = new Map<string, ToolReadPayload>()
  for (const capture of captures) {
    if (capture.kind === 'denied' || capture.kind === 'error') {
      map.set(capture.tool, { tool: capture.tool, kind: capture.kind, error: capture.error })
      continue
    }
    if (capture.kind !== 'read') continue
    map.set(capture.tool, {
      tool: capture.tool,
      kind: 'read',
      payload: unwrapPayload(capture.data),
    })
  }
  return map
}

type ToolReadPayload = {
  tool: string
  kind: string
  payload?: unknown
  error?: string
}

function buildActionListView(
  tool: string,
  payload: Record<string, unknown>
): AssistantReplyView {
  const itemsRaw = Array.isArray(payload.items)
    ? payload.items
    : payload.action
      ? [payload.action]
      : []
  const actions = itemsRaw.map(mapActionItem).filter((row): row is AssistantActionRowView => Boolean(row))
  const total =
    asNumber(payload.total) ??
    asNumber(payload.count) ??
    (Array.isArray(payload.items) ? payload.items.length : actions.length)
  const truncated = payload.truncated === true || total > actions.length
  const scope =
    asString(payload.population) ||
    asString(payload.scope) ||
    (tool === 'get_team_actions' ? 'Equipo' : tool === 'get_pending_verifications' ? 'Verificacion' : undefined)

  if (total === 0 && actions.length === 0) {
    return {
      type: 'empty',
      message: 'No hay acciones que coincidan con esta consulta.',
      scope: scope ?? undefined,
    }
  }

  if (total <= 1 && actions.length <= 1 && !asString(payload.status_group)) {
    // Single detail or tiny result — still list for scanability
  }

  return {
    type: 'action_list',
    total,
    visible: actions.length,
    truncated,
    scope: scope ?? undefined,
    actions,
  }
}

function buildOkrListView(payload: Record<string, unknown>): AssistantReplyView {
  const itemsRaw = Array.isArray(payload.items) ? payload.items : []
  const okrs = itemsRaw
    .map(mapOkrItem)
    .filter((row): row is AssistantOkrRowView => Boolean(row))
    .map((row) => ({ ...row, pace: paceLabel(row.pace) }))
  const total = asNumber(payload.objectives) ?? okrs.length
  const truncated = payload.truncated === true || total > okrs.length

  if (okrs.length === 0) {
    return {
      type: 'empty',
      message: 'No hay objetivos OKR visibles en tu alcance.',
    }
  }

  return {
    type: 'okr_list',
    summary:
      total > 0
        ? `${total} objetivo(s), ${asNumber(payload.keyResults) ?? '—'} KR(s), ${asNumber(payload.initiatives) ?? '—'} iniciativa(s).`
        : undefined,
    total,
    visible: okrs.length,
    truncated,
    okrs,
  }
}

function buildDashboardViews(payload: Record<string, unknown>): AssistantReplyView[] {
  const scope = asString(payload.scope_note) || asString(payload.scope) || undefined
  const metrics: AssistantMetric[] = [
    { id: 'open', label: 'Abiertas', value: asNumber(payload.open) ?? 0, tone: 'neutral', scope },
    {
      id: 'overdue',
      label: 'Vencidas',
      value: asNumber(payload.overdue) ?? 0,
      tone: (asNumber(payload.overdue) ?? 0) > 0 ? 'danger' : 'ok',
      scope,
    },
    {
      id: 'blocked',
      label: 'Bloqueadas',
      value: asNumber(payload.blocked) ?? 0,
      tone: (asNumber(payload.blocked) ?? 0) > 0 ? 'warning' : 'ok',
      scope,
    },
    {
      id: 'due_today',
      label: 'Vencen hoy',
      value: asNumber(payload.due_today) ?? 0,
      tone: (asNumber(payload.due_today) ?? 0) > 0 ? 'warning' : 'neutral',
      scope,
    },
  ]

  const sample = Array.isArray(payload.sample_overdue) ? payload.sample_overdue : []
  const actions = sample
    .map(mapActionItem)
    .filter((row): row is AssistantActionRowView => Boolean(row))

  const operational = asRecord(payload.operational_okr)
  const okrs: AssistantOkrRowView[] = []
  if (operational && asString(operational.title)) {
    okrs.push({
      id: 'operational-okr',
      nombre: asString(operational.title)!,
      progress: asNumber(operational.progress),
      krCount: Array.isArray(operational.key_results) ? operational.key_results.length : 0,
      pace: asString(operational.status),
      href: OKRS_PATH,
    })
  }

  return [
    {
      type: 'operational_summary',
      summary: `Resumen ${scope ? `(${scope})` : 'operativo'}: ${asNumber(payload.open) ?? 0} abiertas.`,
      scope,
      metrics,
      actions: actions.length ? actions : undefined,
      okrs: okrs.length ? okrs : undefined,
    },
  ]
}

/**
 * Convierte resultados de herramientas de lectura en vistas UI verificables.
 * No inventa registros: solo proyecta lo que ya devolvió el runtime.
 */
export function buildAssistantUiFromToolResults(
  captures: ToolReadCapture[]
): AssistantUiPayload | null {
  if (!captures.length) return null

  const byTool = lastByTool(captures)
  const views: AssistantReplyView[] = []
  const errors: string[] = []

  for (const [tool, entry] of byTool) {
    if (entry.kind === 'denied' || entry.kind === 'error') {
      if (entry.error) errors.push(entry.error)
      continue
    }
    const payload = asRecord(entry.payload)
    if (!payload) continue

    if (ACTION_TOOLS.has(tool)) {
      views.push(buildActionListView(tool, payload))
    } else if (OKR_TOOLS.has(tool)) {
      views.push(buildOkrListView(payload))
    } else if (DASHBOARD_TOOLS.has(tool)) {
      views.push(...buildDashboardViews(payload))
    }
  }

  if (views.length === 0 && errors.length > 0) {
    return {
      views: [{ type: 'error', message: errors[0]! }],
    }
  }

  if (views.length === 0) return null

  // Preferir lista/OKR/resumen frente a empty duplicados
  const ranked = rankViews(views)
  return { views: ranked }
}

function rankViews(views: AssistantReplyView[]): AssistantReplyView[] {
  const score = (view: AssistantReplyView) => {
    switch (view.type) {
      case 'operational_summary':
        return 5
      case 'action_list':
        return 4
      case 'okr_list':
        return 4
      case 'brief':
        return 3
      case 'recommendation':
        return 2
      case 'empty':
        return 1
      case 'error':
        return 0
      default:
        return 0
    }
  }
  return [...views].sort((a, b) => score(b) - score(a)).slice(0, 3)
}

export function unwrapToolPayloadForTests(data: unknown) {
  return unwrapPayload(data)
}
