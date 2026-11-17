/** Tools y helpers de comunicaciones Enviardián (WhatsApp) vía assistant_pending_ops. */

export const COMMUNICATION_WRITE_TOOLS = ['whatsapp_prepare_send'] as const

export type CommunicationWriteTool = (typeof COMMUNICATION_WRITE_TOOLS)[number]

export const COMMUNICATION_WRITE_TTL_MS = 7 * 24 * 60 * 60 * 1000

export const WHATSAPP_BODY_MAX = 1400

export function isCommunicationWriteTool(name: string): name is CommunicationWriteTool {
  return (COMMUNICATION_WRITE_TOOLS as readonly string[]).includes(name)
}

export type CommunicationChannel = 'email' | 'whatsapp' | 'event' | 'both' | 'unspecified'

export function normalizeCommunicationChannel(raw: unknown): CommunicationChannel {
  const value = typeof raw === 'string' ? raw.trim().toLowerCase() : ''
  if (value === 'whatsapp' || value === 'wa' || value === 'wasap') return 'whatsapp'
  if (value === 'both' || value === 'ambos') return 'both'
  if (value === 'event' || value === 'calendar') return 'event'
  if (value === 'email' || value === 'correo' || value === 'mail') return 'email'
  if (
    value === 'unspecified' ||
    value === 'mensaje' ||
    value === 'message' ||
    value === 'unknown' ||
    value === ''
  ) {
    return 'unspecified'
  }
  // type legacy sin canal claro
  if (value === 'message' || value === 'msg') return 'unspecified'
  return 'email'
}
