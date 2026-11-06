import type { WhatsAppThreadMessage } from '@/features/whatsapp-inbox/services/whatsappInbox.service'

export type WhatsAppInteractionKind =
  | 'action_initial'
  | 'action_followup'
  | 'action_close'
  | 'operator'
  | 'assistant'
  | 'user_reply'
  | 'user_button'
  | 'other'

export type WhatsAppThreadMeta = {
  kind: WhatsAppInteractionKind
  label: string
  actionTitle: string | null
  checkpointText: string | null
  isActionOutbound: boolean
  isUserReply: boolean
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function asString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : ''
}

function titleFromBody(text: string) {
  const patterns = [
    /Nueva actividad:\s*(.+?)(?:\.|$)/i,
    /Seguimiento:\s*(.+?)(?:\.|$)/i,
    /Cierre de compromiso:\s*(.+?)(?:\.|$)/i,
    /Actividad:\s*(.+?)(?:\.|$)/i,
  ]
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match?.[1]?.trim()) return match[1].trim().slice(0, 120)
  }
  const plantilla = text.match(/\[Plantilla[^\]]*\]\s*([^·\n]+)(?:\s*·\s*([^·\n]+))?/i)
  if (plantilla?.[2]?.trim()) return plantilla[2].trim().slice(0, 120)
  return null
}

function titleFromTemplate(payload: Record<string, unknown>) {
  const request = asRecord(payload.request)
  const template = asRecord(request.template)
  const components = Array.isArray(template.components) ? template.components : []
  for (const component of components) {
    const row = asRecord(component)
    const parameters = Array.isArray(row.parameters) ? row.parameters : []
    // Plantilla usual: [nombre, titulo_accion, fecha/checkpoint]
    const second = asRecord(parameters[1])
    if (asString(second.text)) return asString(second.text).slice(0, 120)
  }
  return null
}

function checkpointFromBody(text: string) {
  const match = text.match(/Checkpoint:\s*(.+?)(?:\.|$)/i)
  return match?.[1]?.trim().slice(0, 120) || null
}

export function resolveThreadMeta(message: WhatsAppThreadMessage): WhatsAppThreadMeta {
  const payload = asRecord(message.payload)
  const messageType =
    asString(message.message_kind) ||
    asString(payload.message_type) ||
    asString(asRecord(payload.request).type)
  const body = asString(message.body_text)
  const actionTitle = titleFromBody(body) || titleFromTemplate(payload)
  const checkpointText = checkpointFromBody(body) || asString(payload.checkpoint_texto) || null

  if (message.direction === 'inbound') {
    const buttonish =
      messageType === 'interactive' ||
      messageType === 'button' ||
      /^(Realizada|En proceso|En Proceso|Requiero apoyo|Necesito Apoyo)$/i.test(body)
    return {
      kind: buttonish ? 'user_button' : 'user_reply',
      label: buttonish ? 'Respuesta (botón)' : 'Respuesta del usuario',
      actionTitle,
      checkpointText,
      isActionOutbound: false,
      isUserReply: true,
    }
  }

  const haystack = `${messageType} ${body} ${asString(payload.message_type)}`
  if (
    messageType === 'initial' ||
    /nueva_actividad|Nueva actividad|Plantilla nueva_actividad/i.test(haystack)
  ) {
    return {
      kind: 'action_initial',
      label: 'Acción enviada',
      actionTitle,
      checkpointText,
      isActionOutbound: true,
      isUserReply: false,
    }
  }
  if (messageType === 'checkpoint_followup' || /Seguimiento:/i.test(body)) {
    return {
      kind: 'action_followup',
      label: 'Seguimiento de acción',
      actionTitle,
      checkpointText,
      isActionOutbound: true,
      isUserReply: false,
    }
  }
  if (messageType === 'commitment_close' || /Cierre de compromiso/i.test(body)) {
    return {
      kind: 'action_close',
      label: 'Cierre de compromiso',
      actionTitle,
      checkpointText,
      isActionOutbound: true,
      isUserReply: false,
    }
  }
  if (message.source === 'ai' || asString(payload.flow) === 'agent') {
    return {
      kind: 'assistant',
      label: 'Asistente',
      actionTitle,
      checkpointText,
      isActionOutbound: false,
      isUserReply: false,
    }
  }
  if (message.source === 'automation') {
    return {
      kind: 'action_initial',
      label: 'Automatización',
      actionTitle,
      checkpointText,
      isActionOutbound: true,
      isUserReply: false,
    }
  }
  if (message.source === 'operator') {
    return {
      kind: 'operator',
      label: 'Operador',
      actionTitle,
      checkpointText,
      isActionOutbound: false,
      isUserReply: false,
    }
  }

  return {
    kind: message.direction === 'inbound' ? 'user_reply' : 'other',
    label: message.direction === 'inbound' ? 'Respuesta del usuario' : 'Mensaje',
    actionTitle,
    checkpointText,
    isActionOutbound: false,
    isUserReply: message.direction === 'inbound',
  }
}

export function summarizeThread(messages: WhatsAppThreadMessage[]) {
  let actionSends = 0
  let userReplies = 0
  for (const message of messages) {
    const meta = resolveThreadMeta(message)
    if (meta.isActionOutbound) actionSends += 1
    if (meta.isUserReply) userReplies += 1
  }
  return { actionSends, userReplies }
}
