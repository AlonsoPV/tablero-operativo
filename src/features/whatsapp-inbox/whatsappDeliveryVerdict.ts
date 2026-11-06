/** Clasificación de entrega WhatsApp (Graph accept ≠ entrega al usuario). */

export type WhatsAppDeliveryVerdict =
  | 'OK_ENTREGADO'
  | 'OK_ACEPTADO'
  | 'PENDIENTE_COLA'
  | 'ERROR_META'
  | 'ERROR_GRAPH'
  | 'DESCONOCIDO'

export type ParsedWhatsAppDeliveryError = {
  code: number | null
  title: string | null
  message: string | null
  details: string | null
  raw: string
}

const KNOWN_CODES: Record<number, string> = {
  131026: 'Número no disponible en WhatsApp o no puede recibir.',
  131047: 'Ventana 24h cerrada / se requiere re-engagement.',
  131049: 'Tope de engagement / marketing del destinatario. Esperar ≥24h; revisar categoría Utility.',
  131051: 'Tipo de mensaje no soportado para este destinatario.',
  132000: 'Plantilla con parámetros incorrectos.',
  132001: 'Plantilla no existe o no está aprobada.',
  132015: 'Plantilla pausada por baja calidad.',
  133010: 'Cuenta o número no registrado / no listo.',
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) return Number(value.trim())
  return null
}

/** Parsea error_message de bandeja / webhook / Graph. */
export function parseWhatsAppDeliveryError(
  errorMessage: string | null | undefined
): ParsedWhatsAppDeliveryError {
  const raw = (errorMessage ?? '').trim()
  if (!raw) {
    return { code: null, title: null, message: null, details: null, raw: '' }
  }

  try {
    const parsed = JSON.parse(raw) as unknown
    const root = asRecord(parsed)
    const nested = asRecord(root.error)
    const code = asNumber(root.code) ?? asNumber(nested.code)
    const title = asString(root.title) ?? asString(nested.title) ?? asString(root.error_user_title)
    const message =
      asString(root.message) ??
      asString(nested.message) ??
      asString(root.error_user_msg) ??
      asString(nested.error_user_msg)
    const details =
      asString(asRecord(root.error_data).details) ??
      asString(asRecord(nested.error_data).details) ??
      asString(root.details)
    return { code, title, message, details, raw }
  } catch {
    const codeMatch = raw.match(/"code"\s*:\s*(\d+)/) || raw.match(/\[(\d{5,6})\]/)
    const code = codeMatch ? Number(codeMatch[1]) : null
    return { code, title: null, message: raw.slice(0, 240), details: null, raw }
  }
}

/** Texto corto para UI / logs. */
export function formatWhatsAppDeliveryError(
  errorMessage: string | null | undefined
): string | null {
  const parsed = parseWhatsAppDeliveryError(errorMessage)
  if (!parsed.raw) return null
  const hint = parsed.code != null ? KNOWN_CODES[parsed.code] : null
  const headline = parsed.title || parsed.message || 'Error de entrega WhatsApp'
  if (parsed.code != null) {
    return hint
      ? `[${parsed.code}] ${headline} — ${hint}`
      : `[${parsed.code}] ${headline}`
  }
  return headline
}

export function resolveWhatsAppDeliveryVerdict(input: {
  deliveryStatus: string | null | undefined
  metaMessageId?: string | null
  errorMessage?: string | null
}): {
  verdict: WhatsAppDeliveryVerdict
  label: string
  ok: boolean
  uncertain: boolean
  recommendation: string
  errorCode: number | null
} {
  const status = input.deliveryStatus ?? ''
  const hasWamid = Boolean(input.metaMessageId)
  const parsed = parseWhatsAppDeliveryError(input.errorMessage)

  if (status === 'delivered' || status === 'read') {
    return {
      verdict: 'OK_ENTREGADO',
      label: status === 'read' ? 'Leído' : 'Entregado',
      ok: true,
      uncertain: false,
      recommendation: 'Meta confirmó entrega al dispositivo.',
      errorCode: null,
    }
  }
  if (status === 'queued') {
    return {
      verdict: 'PENDIENTE_COLA',
      label: 'En cola',
      ok: false,
      uncertain: true,
      recommendation: 'Aún no hay aceptación de Graph.',
      errorCode: parsed.code,
    }
  }
  if (status === 'sent' && hasWamid) {
    return {
      verdict: 'OK_ACEPTADO',
      label: 'Aceptado (pendiente entrega)',
      ok: true,
      uncertain: true,
      recommendation: 'Graph aceptó el wamid; falta webhook delivered/read/failed.',
      errorCode: null,
    }
  }
  if (status === 'sent') {
    return {
      verdict: 'OK_ACEPTADO',
      label: 'Enviado',
      ok: true,
      uncertain: true,
      recommendation: 'Marcado enviado sin wamid; revisa logs.',
      errorCode: null,
    }
  }
  if (status === 'failed' && hasWamid) {
    return {
      verdict: 'ERROR_META',
      label: parsed.code != null ? `Error Meta ${parsed.code}` : 'Error Meta',
      ok: false,
      uncertain: false,
      recommendation:
        parsed.code != null && KNOWN_CODES[parsed.code]
          ? KNOWN_CODES[parsed.code]
          : 'Graph aceptó el mensaje pero Meta falló la entrega (webhook statuses).',
      errorCode: parsed.code,
    }
  }
  if (status === 'failed') {
    return {
      verdict: 'ERROR_GRAPH',
      label: parsed.code != null ? `Error Graph ${parsed.code}` : 'Error de envío',
      ok: false,
      uncertain: false,
      recommendation: 'Falló la llamada a Graph. Revisa token, plantilla o payload.',
      errorCode: parsed.code,
    }
  }
  return {
    verdict: 'DESCONOCIDO',
    label: status || 'Sin estado',
    ok: false,
    uncertain: true,
    recommendation: 'Estado no clasificado.',
    errorCode: parsed.code,
  }
}

/** Normaliza error Meta/Graph a string legible para guardar en DB. */
export function serializeWhatsAppDeliveryError(error: unknown): string {
  if (error == null) return 'meta_status_failed'
  if (typeof error === 'string') {
    const formatted = formatWhatsAppDeliveryError(error)
    return (formatted || error).slice(0, 2000)
  }
  try {
    const raw = JSON.stringify(error)
    const formatted = formatWhatsAppDeliveryError(raw)
    return (formatted || raw).slice(0, 2000)
  } catch {
    return String(error).slice(0, 2000)
  }
}
