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

export function stripModelIdentity(args: Record<string, unknown>) {
  const next: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(args)) {
    if (IDENTITY_ARG_KEYS.includes(key)) continue
    next[key] = value
  }
  return next
}

export function readRetellToolCall(body: {
  name?: unknown
  args?: unknown
  arguments?: unknown
  call?: { metadata?: unknown }
}) {
  const metadata = (body.call?.metadata ?? {}) as {
    guide_session_id?: unknown
    product?: unknown
    usuario_id?: unknown
  }
  const sessionId = typeof metadata.guide_session_id === 'string' ? metadata.guide_session_id.trim() : ''
  const product = typeof metadata.product === 'string' ? metadata.product : ''
  const modelUsuarioId = typeof metadata.usuario_id === 'string' ? metadata.usuario_id.trim() : ''
  const rawArgs =
    body.args && typeof body.args === 'object'
      ? (body.args as Record<string, unknown>)
      : body.arguments && typeof body.arguments === 'object'
        ? (body.arguments as Record<string, unknown>)
        : {}
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

export function classifyRetellToolResult(result: CopilotToolResult): {
  status: RetellToolStatus
  spoken: string
  data: unknown
} {
  if (result.kind === 'proposal') {
    return {
      status: 'needs_confirmation',
      spoken:
        'Deje una propuesta para revisar en Scrumban. No se creo ni se modifico nada en el tablero. No digas que ya quedo hecha.',
      data: { pending_op_id: result.proposal?.id ?? null, title: result.proposal?.title ?? null },
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
    return {
      status: 'error',
      spoken: 'No pude consultar el tablero. Prefiero no dar informacion que no pueda confirmar.',
      data: null,
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
    data: serializeToolResultForModel(result),
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
