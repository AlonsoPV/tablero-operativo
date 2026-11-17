import type { CopilotToolResult } from '../../src/features/ai-support/copilot/types.js'
import { serializeToolResultForModel } from './assistantOpsRuntime.js'
import {
  classifyDenialReason,
  classifyDeniedMessage,
  type DenialReasonClass,
  type GuideToolErrorCode,
} from './guideToolResult.js'

export const RETELL_READ_TOOLS = [
  'get_my_actions',
  'get_action_details',
  'get_team_actions',
  'get_pending_verifications',
  'get_okr_progress',
  'search_people',
  'get_dashboard_summary',
  'get_org_chart',
  'get_module_data',
  'search_board',
] as const

export const RETELL_WRITE_TOOLS = [
  'create_action',
  'update_action',
  'add_action_comment',
  'update_checklist_item',
  'mark_action_done',
  'verify_action',
  'confirm_pending_op',
  'cancel_pending_op',
] as const

const ALLOWED = new Set<string>([...RETELL_READ_TOOLS, ...RETELL_WRITE_TOOLS])

const IDENTITY_ARG_KEYS = ['usuario_id', 'user_id', 'auth_user_id', 'session_id', 'guide_session_id']

export type RetellToolStatus =
  | 'ok'
  | 'empty'
  | 'denied'
  | 'error'
  | 'needs_clarification'
  | 'needs_confirmation'

export type ConsultLogEntry = {
  tool: string
  status: RetellToolStatus
  at: string
  summary: string
  error_code?: GuideToolErrorCode | null
  denial_reason?: DenialReasonClass | null
}

export function isRetellBoardTool(name: string) {
  return ALLOWED.has(name)
}

export function isRetellWriteTool(name: string) {
  return (RETELL_WRITE_TOOLS as readonly string[]).includes(name)
}

export function stripModelIdentity(args: Record<string, unknown>) {
  const next: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(args)) {
    if (IDENTITY_ARG_KEYS.includes(key)) continue
    next[key] = value
  }
  return next
}

function asObjectArgs(raw: unknown): Record<string, unknown> {
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as unknown
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {}
    } catch {
      return {}
    }
  }
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}
}

function asId(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

export function readRetellToolCall(body: {
  name?: unknown
  args?: unknown
  arguments?: unknown
  call?: { metadata?: unknown; retell_llm_dynamic_variables?: unknown }
}) {
  const metadata = (body.call?.metadata ?? {}) as {
    guide_session_id?: unknown
    product?: unknown
    usuario_id?: unknown
  }
  const dyn = (body.call?.retell_llm_dynamic_variables ?? {}) as { session_id?: unknown }
  const sessionId =
    asId(metadata.guide_session_id) || asId(dyn.session_id)
  const product = typeof metadata.product === 'string' ? metadata.product : ''
  const modelUsuarioId = asId(metadata.usuario_id)
  const rawArgs = asObjectArgs(body.args ?? body.arguments)
  const named = typeof body.name === 'string' ? body.name.trim() : ''
  const nested = typeof rawArgs.tool === 'string' ? rawArgs.tool.trim() : ''
  const tool = isRetellBoardTool(named) ? named : nested
  const args = stripModelIdentity(rawArgs)
  delete args.tool
  return { sessionId, product, modelUsuarioId, tool, args }
}

function payloadIsEmpty(data: unknown): boolean {
  if (data == null) return true
  if (Array.isArray(data)) return data.length === 0
  if (typeof data !== 'object') return false
  const arrays = Object.values(data as Record<string, unknown>).filter(Array.isArray) as unknown[][]
  if (arrays.length === 0) return false
  return arrays.every((list) => list.length === 0)
}

/** Ítems máximos en payloads de voz (totales + muestra corta). */
export const VOICE_SLIM_ITEM_LIMIT = 8

const VOICE_SLIM_KEEP_KEYS = new Set([
  'id',
  'title',
  'titulo',
  'titulo_accion',
  'nombre',
  'nombre_okr',
  'label',
  'estado',
  'status',
  'fecha',
  'due_date',
  'end_date',
  'start_date',
  'prioridad',
  'progress',
  'overall_progress',
  'current',
  'current_value',
  'target',
  'target_value',
  'unit',
  'scope',
  'area',
  'without_initiatives',
  'insufficient_krs',
  'krs',
  'key_results',
])

function slimRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(row)) {
    if (!VOICE_SLIM_KEEP_KEYS.has(key)) continue
    if (Array.isArray(value)) {
      out[key] = value.slice(0, VOICE_SLIM_ITEM_LIMIT).map((item) =>
        item && typeof item === 'object' && !Array.isArray(item)
          ? slimRow(item as Record<string, unknown>)
          : item
      )
      continue
    }
    if (value && typeof value === 'object') {
      out[key] = slimRow(value as Record<string, unknown>)
      continue
    }
    out[key] = value
  }
  return out
}

function compactVoiceNode(data: unknown, root: boolean): unknown {
  if (data == null) return data
  if (Array.isArray(data)) {
    const items = data.slice(0, VOICE_SLIM_ITEM_LIMIT).map((item) =>
      item && typeof item === 'object' && !Array.isArray(item)
        ? slimRow(item as Record<string, unknown>)
        : item
    )
    const wrapped: Record<string, unknown> = {
      total: data.length,
      truncated: data.length > items.length,
      items,
    }
    if (root) {
      wrapped.as_of = new Date().toISOString()
      wrapped.voice_slim = true
    }
    return wrapped
  }
  if (typeof data !== 'object') return data
  const source = data as Record<string, unknown>
  const out: Record<string, unknown> = root ? { as_of: new Date().toISOString() } : {}
  let truncated = Boolean(source.truncated)
  for (const [key, value] of Object.entries(source)) {
    if (Array.isArray(value)) {
      const clipped = value.slice(0, VOICE_SLIM_ITEM_LIMIT).map((item) =>
        item && typeof item === 'object' && !Array.isArray(item)
          ? slimRow(item as Record<string, unknown>)
          : item
      )
      if (value.length > clipped.length) truncated = true
      out[key] = clipped
      if (!(`${key}_total` in source) && !(key === 'items' && typeof source.total === 'number')) {
        out[`${key}_total`] = value.length
      }
      continue
    }
    if (value && typeof value === 'object') {
      out[key] = compactVoiceNode(value, false)
      continue
    }
    out[key] = value
  }
  out.truncated = truncated
  if (root) out.voice_slim = true
  return out
}

/**
 * Compacta el payload para Retell: totales + ≤8 ítems con campos de voz.
 * No inventa cifras; solo filtra/agrega lo ya verificado en backend.
 */
export function compactVoiceToolData(data: unknown): unknown {
  return compactVoiceNode(data, true)
}

function withSpoken<T extends { spoken: string }>(row: T): T {
  const spoken = typeof row.spoken === 'string' ? row.spoken.trim() : ''
  return {
    ...row,
    spoken: spoken || 'Listo. Podemos continuar con la conversacion.',
  }
}

export function classifyRetellToolResult(result: CopilotToolResult): {
  status: RetellToolStatus
  spoken: string
  data: unknown
  error_code?: GuideToolErrorCode | null
  denial_reason?: DenialReasonClass | null
} {
  if (result.kind === 'proposal') {
    return withSpoken({
      status: 'needs_confirmation',
      spoken:
        'Ya registre la propuesta para que puedas revisarla al terminar. Resume en una frase. No digas que ya quedo hecha.',
      data: {
        pending_op_id: result.proposal?.id ?? null,
        title: result.proposal?.title ?? null,
        summary: result.proposal?.summary ?? null,
      },
    })
  }
  if (result.kind === 'clarification') {
    return withSpoken({
      status: 'needs_clarification',
      spoken: result.clarification?.question || 'Hay mas de una coincidencia. Pide aclaracion y no elijas.',
      data: result.clarification ?? null,
    })
  }
  if (result.kind === 'denied') {
    const detail = typeof result.error === 'string' ? result.error.trim() : ''
    const error_code = classifyDeniedMessage(detail || 'denied')
    const denial_reason = classifyDenialReason(detail || 'denied')
    if (error_code === 'PERMISSION_DENIED') {
      const permissionSend = /PERMISSION_DENIED|no permite enviar/i.test(detail)
      return withSpoken({
        status: 'denied',
        spoken: permissionSend
          ? 'Este modo no permite enviar comunicaciones. No inventes que se envio.'
          : detail && detail.length < 160
            ? detail
            : 'No tengo permiso para consultar eso. No inventes el resultado.',
        data: null,
        error_code,
        denial_reason,
      })
    }
    const brief =
      detail && detail.length < 160
        ? detail
        : 'No pude completar esa solicitud por un problema de validacion.'
    return withSpoken({
      status: 'error',
      spoken: `${brief} Podemos continuar con la conversacion.`,
      data: null,
      error_code,
      denial_reason,
    })
  }
  if (result.kind === 'error' || result.ok === false) {
    const writeConfirm = result.tool === 'confirm_pending_op' || result.tool === 'cancel_pending_op'
    const detail = typeof result.error === 'string' ? result.error.trim() : ''
    if (writeConfirm && /PERMISSION_DENIED|no permite enviar/i.test(detail)) {
      return withSpoken({
        status: 'denied',
        spoken: 'Este modo no permite enviar comunicaciones. No inventes que se envio.',
        data: null,
        error_code: 'PERMISSION_DENIED',
        denial_reason: 'permission',
      })
    }
    const error_code =
      result.error === 'timeout' ? ('TIMEOUT' as const) : detail ? classifyDeniedMessage(detail) : 'UNKNOWN_ERROR'
    return withSpoken({
      status: 'error',
      spoken:
        result.error === 'timeout'
          ? 'No pude recuperar ese dato a tiempo. No inventes cifras; ofrece reintentar o continuar.'
          : writeConfirm && detail && detail.length < 180
            ? `${detail} No digas que quedo hecha.`
            : writeConfirm
              ? 'No pude confirmar ni cancelar esa operacion. No digas que quedo hecha.'
              : 'No pude consultar el tablero. Prefiero no dar informacion que no pueda confirmar.',
      data: null,
      error_code,
      denial_reason: detail ? classifyDenialReason(detail) : 'other',
    })
  }
  if (result.tool === 'confirm_pending_op') {
    const hint =
      result.data && typeof result.data === 'object' && 'spoken_hint' in result.data
        ? String((result.data as { spoken_hint?: unknown }).spoken_hint || '')
        : ''
    return withSpoken({
      status: 'ok',
      spoken: hint || 'Listo, quedo registrada. Confirma en una frase corta sin leer IDs ni URLs.',
      data: compactVoiceToolData(serializeToolResultForModel(result)),
    })
  }
  if (result.tool === 'cancel_pending_op') {
    return withSpoken({
      status: 'ok',
      spoken: 'Cancelado. No se ejecuto nada.',
      data: compactVoiceToolData(serializeToolResultForModel(result)),
    })
  }
  const serialized = serializeToolResultForModel(result)
  const unwrapped =
    serialized &&
    typeof serialized === 'object' &&
    !Array.isArray(serialized) &&
    'payload' in (serialized as object)
      ? (serialized as { payload?: unknown }).payload
      : serialized

  if (payloadIsEmpty(unwrapped ?? result.data)) {
    const totalZero =
      unwrapped &&
      typeof unwrapped === 'object' &&
      typeof (unwrapped as { total?: unknown }).total === 'number'
        ? (unwrapped as { total: number }).total
        : null
    return withSpoken({
      status: 'empty',
      spoken:
        totalZero === 0
          ? 'Total 0 segun la consulta. No inventes filas ni diagnostiques.'
          : 'La consulta no encontro registros visibles para este usuario. No inventes filas.',
      data: compactVoiceToolData(serialized),
    })
  }

  if (result.tool === 'get_my_actions' && unwrapped && typeof unwrapped === 'object') {
    const row = unwrapped as {
      total?: unknown
      spoken_hint?: unknown
      scope?: unknown
      visual?: unknown
    }
    const total = typeof row.total === 'number' ? row.total : null
    const hint = typeof row.spoken_hint === 'string' ? row.spoken_hint.trim() : ''
    return withSpoken({
      status: 'ok',
      spoken:
        hint ||
        (total != null
          ? `Consulta hecha. Di el total ${total} del campo total; no inventes cifras.`
          : 'Consulta hecha. Responde solo con estos datos; di el campo total.'),
      data: compactVoiceToolData(serialized),
    })
  }

  const hint =
    unwrapped && typeof unwrapped === 'object' && typeof (unwrapped as { spoken_hint?: unknown }).spoken_hint === 'string'
      ? String((unwrapped as { spoken_hint?: string }).spoken_hint || '').trim()
      : ''
  return withSpoken({
    status: 'ok',
    spoken: hint || 'Consulta hecha. Responde solo con estos datos.',
    data: compactVoiceToolData(serialized),
  })
}

export type RetellToolPhaseMetrics = {
  channel: 'retell'
  call_id: string | null
  session: string
  invitation_id: string | null
  tool: string
  status: RetellToolStatus | 'timeout'
  access_mode: string
  auth_ms: number
  session_ms: number
  user_ms: number
  dispatch_ms: number
  consult_log_ms: number
  payload_bytes: number
  ms: number
  ignored_model_user: boolean
  /** Tool original si el gate reescribió dashboard/team → get_my_actions. */
  rewrote_from?: string | null
}

export function buildRetellToolMetrics(
  input: Omit<RetellToolPhaseMetrics, 'channel'>
): RetellToolPhaseMetrics {
  return { channel: 'retell', ...input }
}

export function estimatePayloadBytes(data: unknown): number {
  try {
    return Buffer.byteLength(JSON.stringify(data ?? null), 'utf8')
  } catch {
    return 0
  }
}

const TITLE_KEYS = ['title', 'titulo', 'titulo_accion', 'nombre', 'nombre_okr', 'label']

function collectTitles(data: unknown): string[] {
  const titles: string[] = []
  const seen = new Set<string>()
  const push = (value: string) => {
    const title = value.replace(/\s+/g, ' ').trim().slice(0, 80)
    const key = title.toLowerCase()
    if (!title || seen.has(key) || titles.length >= 6) return
    seen.add(key)
    titles.push(title)
  }
  const visit = (value: unknown, depth: number) => {
    if (depth > 4 || titles.length >= 6 || !value || typeof value !== 'object') return
    if (Array.isArray(value)) {
      for (const item of value) visit(item, depth + 1)
      return
    }
    const row = value as Record<string, unknown>
    for (const key of TITLE_KEYS) {
      if (typeof row[key] === 'string') push(row[key])
    }
    for (const nested of Object.values(row)) {
      if (nested && typeof nested === 'object') visit(nested, depth + 1)
    }
  }
  visit(data, 0)
  return titles
}

export function consultSummary(status: RetellToolStatus, data: unknown, detail?: string | null): string {
  if (status === 'error') {
    const msg = typeof detail === 'string' ? detail.trim() : ''
    if (msg && !/^consulta fallida$/i.test(msg)) return msg.slice(0, 240)
    return 'Consulta fallida'
  }
  if (status === 'denied') {
    const msg = typeof detail === 'string' ? detail.trim() : ''
    if (msg && classifyDeniedMessage(msg) === 'PERMISSION_DENIED') return msg.slice(0, 240)
    if (msg) return msg.slice(0, 240)
    return 'Sin permiso'
  }
  if (status === 'empty') return 'Sin registros visibles'
  if (status === 'needs_clarification') {
    const question =
      data && typeof data === 'object' && typeof (data as { question?: unknown }).question === 'string'
        ? (data as { question: string }).question.trim()
        : ''
    return (question || 'Hace falta elegir una opcion').slice(0, 180)
  }
  if (status === 'needs_confirmation') {
    const title =
      data && typeof data === 'object' && typeof (data as { title?: unknown }).title === 'string'
        ? (data as { title: string }).title.trim()
        : ''
    return title ? `Propuesta pendiente: ${title}` : 'Propuesta pendiente, sin escritura en el tablero'
  }
  const titles = collectTitles(data)
  return titles.length > 0 ? titles.join(', ') : 'Consulta con resultado'
}

function readableSummary(summary: string): string {
  const trimmed = summary.trim()
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return trimmed
  try {
    const titles = collectTitles(JSON.parse(trimmed) as unknown)
    if (titles.length > 0) return titles.join(', ')
  } catch {
    return trimmed.slice(0, 240)
  }
  return trimmed.slice(0, 240)
}

export function consultLogEntry(
  tool: string,
  status: RetellToolStatus,
  data: unknown,
  at = new Date().toISOString(),
  meta?: {
    summaryHint?: string | null
    error_code?: GuideToolErrorCode | null
    denial_reason?: DenialReasonClass | null
  }
): ConsultLogEntry {
  const hint = meta?.summaryHint?.trim() || null
  const summary = (hint || consultSummary(status, data, hint)).slice(0, 700)
  const error_code =
    meta?.error_code ??
    (status === 'denied' || status === 'error' ? classifyDeniedMessage(summary || status) : null)
  const denial_reason =
    meta?.denial_reason ??
    (status === 'denied' || status === 'error' ? classifyDenialReason(summary || status) : null)
  return {
    tool,
    status,
    at,
    summary,
    error_code: status === 'denied' || status === 'error' ? error_code : null,
    denial_reason: status === 'denied' || status === 'error' ? denial_reason : null,
  }
}

export type VerifiedFactMetric = {
  label: string
  value: string
  unit?: string
  sourceTool: string
  asOf?: string
}

export type TechnicalLogItem = {
  code: string
  message: string
  tool?: string
  at?: string
  retryable?: boolean
}

export type VerifiedFactsFromLog = {
  /** Frases humanizadas sin prefijo de tool (para hallazgos/evidence). */
  lines: string[]
  /** Metadatos de trazabilidad (no mostrar como título ejecutivo). */
  sources: Array<{ tool: string; status: string; summary: string; at?: string }>
  metrics: VerifiedFactMetric[]
  technicalAttention: TechnicalLogItem[]
  hadError: boolean
  hadSuccess: boolean
}

function humanizeOkSummary(tool: string, summary: string): string {
  const clean = readableSummary(summary).trim()
  if (!clean) return ''
  // Nunca prefijar con el nombre de la herramienta en texto ejecutivo.
  if (/get_okr_progress/i.test(tool) && !/\d+\s*%/.test(clean)) {
    return clean
  }
  return clean.replace(new RegExp(`^${tool}\\s*:\\s*`, 'i'), '').trim() || clean
}

function parseMetricHints(tool: string, summary: string, at?: string): VerifiedFactMetric[] {
  if (!/get_okr_progress|get_dashboard_summary|get_module_data/i.test(tool)) return []
  const metrics: VerifiedFactMetric[] = []
  const pct = summary.match(/([\wÁÉÍÓÚáéíóúñÑ][\wÁÉÍÓÚáéíóúñÑ\s/.-]{1,60}?)\s*[:=]?\s*(\d{1,3}(?:[.,]\d+)?)\s*%/)
  if (pct) {
    metrics.push({
      label: pct[1].trim().slice(0, 80),
      value: pct[2].replace(',', '.'),
      unit: '%',
      sourceTool: tool,
      asOf: at,
    })
  }
  return metrics.slice(0, 4)
}

export function verifiedFactsFromLog(log: unknown): VerifiedFactsFromLog {
  const rows = Array.isArray(log) ? log : []
  const lines: string[] = []
  const sources: VerifiedFactsFromLog['sources'] = []
  const metrics: VerifiedFactMetric[] = []
  const technicalAttention: TechnicalLogItem[] = []
  let hadError = false
  let hadSuccess = false
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue
    const item = row as { tool?: unknown; status?: unknown; summary?: unknown; at?: unknown }
    const status = typeof item.status === 'string' ? item.status : ''
    const tool = typeof item.tool === 'string' ? item.tool : 'consulta'
    const at = typeof item.at === 'string' ? item.at : undefined
    const summaryRaw = typeof item.summary === 'string' ? item.summary : ''
    const summary = summaryRaw ? readableSummary(summaryRaw) : ''

    if (status === 'error' || status === 'denied') {
      hadError = true
      const loggedCode =
        typeof (item as { error_code?: unknown }).error_code === 'string'
          ? String((item as { error_code: string }).error_code)
          : null
      const code = loggedCode || classifyDeniedMessage(summary || status)
      const typedCode =
        code === 'PERMISSION_DENIED' || code === 'VALIDATION_FAILED' || code === 'TIMEOUT'
          ? code
          : 'TOOL_ERROR'
      technicalAttention.push({
        code: typedCode,
        message: (summary || `Fallo en ${tool}`).slice(0, 400),
        tool,
        at,
        retryable: status === 'error' && typedCode !== 'VALIDATION_FAILED' && typedCode !== 'PERMISSION_DENIED',
      })
      continue
    }
    if (status !== 'ok') continue
    hadSuccess = true
    sources.push({ tool, status, summary: summary.slice(0, 700), at })
    const human = humanizeOkSummary(tool, summary)
    if (human) lines.push(human)
    for (const metric of parseMetricHints(tool, summary, at)) metrics.push(metric)
  }
  return { lines, sources, metrics, technicalAttention, hadError, hadSuccess }
}

/** Lo verificado del informe sale del registro. El texto del modelo no se conserva. */
export function groundVerifiedLines(logLines: readonly string[], _modelLines: readonly string[] = []): string[] {
  return logLines.map((line) => line.trim()).filter(Boolean)
}
