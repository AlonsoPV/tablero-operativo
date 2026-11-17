import type { CopilotToolResult } from '../../src/features/ai-support/copilot/types.js'
import { serializeToolResultForModel } from './assistantOpsRuntime.js'

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

export function classifyRetellToolResult(result: CopilotToolResult): {
  status: RetellToolStatus
  spoken: string
  data: unknown
} {
  if (result.kind === 'proposal') {
    return {
      status: 'needs_confirmation',
      spoken:
        'Propuse el cambio. Resume en una frase y pregunta si lo confirmas. No digas que ya quedo hecho hasta que confirm_pending_op responda ok.',
      data: {
        pending_op_id: result.proposal?.id ?? null,
        title: result.proposal?.title ?? null,
        summary: result.proposal?.summary ?? null,
      },
    }
  }
  if (result.kind === 'clarification') {
    return {
      status: 'needs_clarification',
      spoken: result.clarification?.question || 'Hay mas de una coincidencia. Pide aclaracion y no elijas.',
      data: result.clarification ?? null,
    }
  }
  if (result.kind === 'denied') {
    return {
      status: 'denied',
      spoken: 'No tengo permiso para consultar eso. No inventes el resultado.',
      data: null,
    }
  }
  if (result.kind === 'error' || result.ok === false) {
    const writeConfirm = result.tool === 'confirm_pending_op' || result.tool === 'cancel_pending_op'
    return {
      status: 'error',
      spoken:
        result.error === 'timeout'
          ? 'No pude recuperar ese dato a tiempo. No inventes cifras; ofrece reintentar o reformular.'
          : writeConfirm
            ? 'No pude confirmar ni cancelar esa operacion. No digas que quedo hecha.'
            : 'No pude consultar el tablero. Prefiero no dar informacion que no pueda confirmar.',
      data: null,
    }
  }
  if (result.tool === 'confirm_pending_op') {
    const hint =
      result.data && typeof result.data === 'object' && 'spoken_hint' in result.data
        ? String((result.data as { spoken_hint?: unknown }).spoken_hint || '')
        : ''
    return {
      status: 'ok',
      spoken: hint || 'Listo, quedo registrada. Confirma en una frase corta sin leer IDs ni URLs.',
      data: compactVoiceToolData(serializeToolResultForModel(result)),
    }
  }
  if (result.tool === 'cancel_pending_op') {
    return {
      status: 'ok',
      spoken: 'Cancelado. No se ejecuto nada.',
      data: compactVoiceToolData(serializeToolResultForModel(result)),
    }
  }
  if (payloadIsEmpty(result.data)) {
    return {
      status: 'empty',
      spoken: 'La consulta no encontro registros visibles para este usuario. No inventes filas.',
      data: result.data ?? null,
    }
  }
  return {
    status: 'ok',
    spoken: 'Consulta hecha. Responde solo con estos datos.',
    data: compactVoiceToolData(serializeToolResultForModel(result)),
  }
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

export function consultSummary(status: RetellToolStatus, data: unknown): string {
  if (status === 'error') return 'Consulta fallida'
  if (status === 'denied') return 'Sin permiso'
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

export function consultLogEntry(tool: string, status: RetellToolStatus, data: unknown, at = new Date().toISOString()): ConsultLogEntry {
  return { tool, status, at, summary: consultSummary(status, data).slice(0, 700) }
}

export function verifiedFactsFromLog(log: unknown): { lines: string[]; hadError: boolean; hadSuccess: boolean } {
  const rows = Array.isArray(log) ? log : []
  const lines: string[] = []
  let hadError = false
  let hadSuccess = false
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue
    const item = row as { tool?: unknown; status?: unknown; summary?: unknown }
    const status = typeof item.status === 'string' ? item.status : ''
    const tool = typeof item.tool === 'string' ? item.tool : 'consulta'
    if (status === 'error' || status === 'denied') hadError = true
    if (status !== 'ok') continue
    hadSuccess = true
    const summary = typeof item.summary === 'string' ? readableSummary(item.summary) : ''
    if (summary) lines.push(`${tool}: ${summary}`)
  }
  return { lines, hadError, hadSuccess }
}

/** Lo verificado del informe sale del registro. El texto del modelo no se conserva. */
export function groundVerifiedLines(logLines: readonly string[], _modelLines: readonly string[] = []): string[] {
  return logLines.map((line) => line.trim()).filter(Boolean)
}
