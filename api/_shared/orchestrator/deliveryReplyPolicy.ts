/**
 * Política transversal de respuestas conversacionales para comunicaciones
 * (WhatsApp, Asistente principal, Botón flotante, Voz y Correo).
 *
 * Separa el seguimiento técnico interno (que conserva todos los estados:
 * prepared, confirmed, queued, sent_to_provider, accepted, delivered, read,
 * failed, unknown) de los mensajes que ve el usuario.
 */

export type InternalDeliveryState =
  | 'prepared'
  | 'confirmed'
  | 'queued'
  | 'sent_to_provider'
  | 'accepted'
  | 'delivered'
  | 'read'
  | 'failed'
  | 'unknown'

export type CommunicationChannel = 'whatsapp' | 'email'

export type DeliveryReplyInput = {
  channel: CommunicationChannel
  state: InternalDeliveryState
  isSelfRecipient: boolean
  recipientName?: string | null
  surface?: 'whatsapp' | 'web' | 'floating' | 'voice'
}

export type DeliveryReplyDecision = {
  suppressReply: boolean
  text: string
  needsUserAction: boolean
}

function cleanRecipient(name?: string | null): string {
  const trimmed = (name ?? '').trim()
  return trimmed.length > 0 ? trimmed : ''
}

export function normalizeInternalDeliveryState(input: {
  deliveryStatus?: string | null
  operationStatus?: string | null
  hasProviderId?: boolean
  errorMessage?: string | null
}): InternalDeliveryState {
  const raw = (input.deliveryStatus ?? '').trim().toLowerCase()
  if (raw === 'read') return 'read'
  if (raw === 'delivered') return 'delivered'
  if (raw === 'accepted') return 'accepted'
  if (raw === 'sent' || raw === 'sent_to_provider') return 'accepted'
  if (raw === 'queued') return 'queued'
  if (raw === 'failed' || raw === 'provider_error') return 'failed'
  if (raw === 'unknown') return 'unknown'

  const op = (input.operationStatus ?? '').trim().toLowerCase()
  if (op === 'failed' || input.errorMessage) return 'failed'
  if (op === 'pending') return 'prepared'
  if (op === 'confirmed' && input.hasProviderId) return 'accepted'
  if (op === 'confirmed') return 'confirmed'
  return 'unknown'
}

/**
 * Decide la respuesta conversacional inmediata tras confirmar una comunicación.
 * Nunca envía avisos técnicos de infraestructura ni afirma entrega cuando solo
 * existe aceptación del proveedor.
 */
export function formatCommunicationConfirmationReply(
  input: DeliveryReplyInput
): DeliveryReplyDecision {
  const label = input.channel === 'email' ? 'correo' : 'WhatsApp'
  const recipient = cleanRecipient(input.recipientName)
  const target = recipient ? ` a ${recipient}` : ''

  if (input.state === 'failed') {
    return {
      suppressReply: false,
      needsUserAction: true,
      text: `No se pudo enviar el ${label}${target}. Revisa los datos o prepara una nueva propuesta.`,
    }
  }

  if (input.state === 'unknown' || input.state === 'queued' || input.state === 'confirmed') {
    return {
      suppressReply: false,
      needsUserAction: true,
      text: `El envío del ${label}${target} quedó registrado sin confirmación final. Consulta su estado antes de reenviarlo.`,
    }
  }

  if (input.state === 'prepared') {
    return {
      suppressReply: false,
      needsUserAction: true,
      text: `La propuesta de ${label}${target} sigue pendiente de confirmación.`,
    }
  }

  // accepted | sent_to_provider | delivered | read
  if (input.channel === 'whatsapp' && input.isSelfRecipient && input.surface === 'whatsapp') {
    return {
      suppressReply: true,
      needsUserAction: false,
      text: '',
    }
  }

  return {
    suppressReply: false,
    needsUserAction: false,
    text: `Listo, envié el ${label}${target}.`,
  }
}

/**
 * Formatea una respuesta honesta bajo demanda cuando el usuario pregunta
 * explícitamente por el estado de un envío.
 */
export function formatOnDemandDeliveryStatus(input: {
  channel: CommunicationChannel
  state: InternalDeliveryState
  recipientName?: string | null
  timestampLabel?: string | null
}): string {
  const label = input.channel === 'email' ? 'correo' : 'WhatsApp'
  const recipient = cleanRecipient(input.recipientName)
  const target = recipient ? ` a ${recipient}` : ''
  const when = input.timestampLabel ? ` (${input.timestampLabel})` : ''

  switch (input.state) {
    case 'read':
      return `El ${label}${target} fue leído${when}.`
    case 'delivered':
      return `El ${label}${target} fue entregado${when}.`
    case 'accepted':
    case 'sent_to_provider':
      return input.channel === 'email'
        ? `El ${label}${target} fue enviado${when} (sin confirmación de lectura).`
        : `El ${label}${target} fue enviado${when}; la entrega aún no está confirmada.`
    case 'queued':
      return `El ${label}${target} está en cola de envío${when}.`
    case 'prepared':
      return `El ${label}${target} sigue pendiente de confirmación${when}.`
    case 'failed':
      return `Hubo un problema al enviar el ${label}${target}${when}. Puedes revisar los datos y preparar un nuevo envío.`
    case 'confirmed':
    case 'unknown':
    default:
      return `El ${label}${target} quedó registrado con resultado incierto${when}. Verifica antes de reenviar.`
  }
}
