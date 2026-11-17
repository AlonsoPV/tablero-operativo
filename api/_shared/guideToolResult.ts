/**
 * Contrato normalizado de respuestas de herramientas Retell/Guía.
 * El agente debe usar `success` + `error.user_message`; no interpretar HTTP 200 como éxito.
 */

export type GuideToolErrorCode =
  | 'AUTHENTICATION_FAILED'
  | 'PERMISSION_DENIED'
  | 'SESSION_NOT_FOUND'
  | 'VALIDATION_FAILED'
  | 'ORGANIZATION_CONTEXT_MISSING'
  | 'DATABASE_ERROR'
  | 'PROVIDER_ERROR'
  | 'TIMEOUT'
  | 'CONFIGURATION_ERROR'
  | 'RATE_LIMITED'
  | 'MISSING_CONTACT'
  | 'AMBIGUOUS_RECIPIENT'
  | 'PERSON_NOT_FOUND'
  | 'RESPONSE_FORMAT_ERROR'
  | 'CHANNEL_UNSPECIFIED'
  | 'TOOL_NOT_FOUND'
  | 'UNKNOWN_ERROR'

export type GuideToolErrorBody = {
  code: GuideToolErrorCode
  retryable: boolean
  user_message: string
}

export type GuideToolSuccessPayload = {
  success: true
  operation_id: string | null
  status: string
  entity_type?: string
  entity_id?: string | null
  message: string
  /** Texto hablado para Retell (compat). */
  result: string
  pending_op_id?: string | null
  pending_op_ids?: string[]
  tool?: string | null
  data?: unknown
  ok?: true
}

export type GuideToolFailurePayload = {
  success: false
  operation_id: string | null
  status: 'error' | 'denied'
  error: GuideToolErrorBody
  /** Texto hablado = user_message (compat Retell). */
  result: string
  pending_op_id?: string | null
  pending_op_ids?: string[]
  tool?: string | null
  data?: unknown
  ok?: false
  ask_channel?: boolean
}

export type GuideToolPayload = GuideToolSuccessPayload | GuideToolFailurePayload

const RETRYABLE: ReadonlySet<GuideToolErrorCode> = new Set([
  'TIMEOUT',
  'RATE_LIMITED',
  'PROVIDER_ERROR',
  'DATABASE_ERROR',
  'UNKNOWN_ERROR',
])

export function isRetryableToolError(code: GuideToolErrorCode) {
  return RETRYABLE.has(code)
}

/** Texto hablable mínimo para Retell; nunca vacío. */
export function ensureSpokenText(
  value: unknown,
  fallback = 'Listo. Podemos continuar con la conversacion.'
): string {
  const text = typeof value === 'string' ? value.trim() : ''
  return text || fallback
}

export function guideToolSuccess(input: {
  message: string
  status: string
  operation_id?: string | null
  entity_type?: string
  entity_id?: string | null
  pending_op_id?: string | null
  pending_op_ids?: string[]
  tool?: string | null
  data?: unknown
}): GuideToolSuccessPayload {
  const operation_id = input.operation_id ?? input.pending_op_id ?? null
  const message = ensureSpokenText(
    input.message,
    'Ya registre la propuesta para que puedas revisarla al terminar.'
  )
  return {
    success: true,
    ok: true,
    operation_id,
    status: input.status,
    entity_type: input.entity_type,
    entity_id: input.entity_id ?? null,
    message,
    result: message,
    pending_op_id: input.pending_op_id ?? operation_id,
    pending_op_ids: input.pending_op_ids ?? (operation_id ? [operation_id] : []),
    tool: input.tool ?? null,
    data: input.data,
  }
}

export function guideToolFailure(input: {
  code: GuideToolErrorCode
  user_message: string
  operation_id?: string | null
  status?: 'error' | 'denied'
  pending_op_id?: string | null
  pending_op_ids?: string[]
  tool?: string | null
  data?: unknown
  ask_channel?: boolean
  retryable?: boolean
}): GuideToolFailurePayload {
  const operation_id = input.operation_id ?? input.pending_op_id ?? null
  const user_message = ensureSpokenText(
    input.user_message,
    'No pude completar esa solicitud. Podemos continuar.'
  )
  return {
    success: false,
    ok: false,
    operation_id,
    status: input.status ?? (input.code === 'PERMISSION_DENIED' ? 'denied' : 'error'),
    error: {
      code: input.code,
      retryable: input.retryable ?? isRetryableToolError(input.code),
      user_message,
    },
    result: user_message,
    pending_op_id: input.pending_op_id ?? null,
    pending_op_ids: input.pending_op_ids ?? [],
    tool: input.tool ?? null,
    data: input.data,
    ask_channel: input.ask_channel,
  }
}

/** Enmascara teléfono dejando últimos 4 dígitos. */
export function maskPhoneForLog(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const digits = value.replace(/\D/g, '')
  if (digits.length < 4) return '***'
  return `***${digits.slice(-4)}`
}

/** Enmascara correo: a***@dominio. */
export function maskEmailForLog(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.includes('@')) return undefined
  const [local, domain] = value.split('@')
  if (!local || !domain) return '***@***'
  const head = local.slice(0, 1) || '*'
  return `${head}***@${domain}`
}

export type DenialReasonClass = 'permission' | 'validation' | 'not_found' | 'other'

export type GuideToolLogFields = {
  request_id: string
  call_id?: string | null
  session_id?: string | null
  organization_id?: string | null
  tool_name: string
  operation_id?: string | null
  draft_id?: string | null
  phase: string
  duration_ms?: number
  success?: boolean
  error_code?: GuideToolErrorCode | string | null
  /** permission | validation | not_found | other — sin PII. */
  denial_reason?: DenialReasonClass | string | null
  access_mode?: string | null
  masked_phone?: string
  masked_email?: string
}

export function newGuideRequestId(prefix = 'gtr') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

/** Log estructurado sin credenciales ni PII completa. */
export function logGuideToolEvent(fields: GuideToolLogFields) {
  const payload: Record<string, unknown> = {
    channel: 'guide_tool',
    request_id: fields.request_id,
    call_id: fields.call_id ?? null,
    session_id: fields.session_id ?? null,
    organization_id: fields.organization_id ?? null,
    tool_name: fields.tool_name,
    operation_id: fields.operation_id ?? null,
    draft_id: fields.draft_id ?? null,
    phase: fields.phase,
    duration_ms: fields.duration_ms ?? null,
    success: fields.success ?? null,
    error_code: fields.error_code ?? null,
    denial_reason: fields.denial_reason ?? null,
    access_mode: fields.access_mode ?? null,
  }
  if (fields.masked_phone) payload.masked_phone = fields.masked_phone
  if (fields.masked_email) payload.masked_email = fields.masked_email
  console.info('guide-tool', JSON.stringify(payload))
}

/** Heurística: mapear mensaje de denegación genérico a código tipado. */
export function classifyDeniedMessage(message: string): GuideToolErrorCode {
  const explicit = /^(PERMISSION_DENIED|VALIDATION_FAILED|DATABASE_ERROR|PROVIDER_ERROR|CONFIGURATION_ERROR|TIMEOUT|RATE_LIMITED|MISSING_CONTACT|AMBIGUOUS_RECIPIENT|PERSON_NOT_FOUND):/.exec(message)
  if (explicit) return explicit[1] as GuideToolErrorCode
  const m = message.toLowerCase()
  if (/firma|autentic|api.?key|secret/i.test(m)) return 'AUTHENTICATION_FAILED'
  if (/sesion|sesión|session/i.test(m)) return 'SESSION_NOT_FOUND'
  // Not-found / validation BEFORE permission: "No encontré…" must not become PERMISSION_DENIED.
  if (
    /no encontr[eé]|no existe|no esta activo|no está activo|indica (un |el |la |una )?(nombre|t[ií]tulo|fecha|correo|email|destinatario)|al menos 3 caracteres|recomendaci[oó]n|varias acciones|fecha de compromiso|formato valido|formato válido/i.test(
      m
    )
  ) {
    return 'VALIDATION_FAILED'
  }
  if (/destinatario|falta|valid|canal|whatsapp o correo/i.test(m)) return 'VALIDATION_FAILED'
  if (
    /permiso|solo lectura|no tienes|no puede consultar|no puede crear|permission_denied|no permite enviar|escritura en este modo|read_only|rol analista/i.test(
      m
    )
  ) {
    return 'PERMISSION_DENIED'
  }
  if (/organizacion|organización|org context/i.test(m)) return 'ORGANIZATION_CONTEXT_MISSING'
  if (/timeout|a tiempo/i.test(m)) return 'TIMEOUT'
  if (/proveedor|gmail|whatsapp|provider/i.test(m)) return 'PROVIDER_ERROR'
  if (/base de datos|database|supabase|insert|update/i.test(m)) return 'DATABASE_ERROR'
  return 'UNKNOWN_ERROR'
}

/** Clasifica la razón de denegación para logs (sin PII). */
export function classifyDenialReason(message: string): DenialReasonClass {
  const code = classifyDeniedMessage(message)
  if (code === 'PERMISSION_DENIED') return 'permission'
  if (code === 'VALIDATION_FAILED') {
    return /no encontr[eé]|no existe|no esta activo|no está activo/i.test(message)
      ? 'not_found'
      : 'validation'
  }
  return 'other'
}

/** Mapea status Retell (+ detalle opcional) a código tipado. */
export function statusToErrorCode(status: string, detail?: string | null): GuideToolErrorCode {
  if (status === 'timeout') return 'TIMEOUT'
  if (status === 'denied') {
    if (detail?.trim()) return classifyDeniedMessage(detail)
    return 'PERMISSION_DENIED'
  }
  if (status === 'error' && detail?.trim()) return classifyDeniedMessage(detail)
  return 'UNKNOWN_ERROR'
}
