/**
 * Borradores WhatsApp Enviardián: cola → relleno → confirm → Meta Cloud API.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  clipText,
  type CopilotWorkspacePreview,
} from '../../src/features/ai-support/copilot/googleWorkspace.js'
import {
  COMMUNICATION_WRITE_TTL_MS,
  WHATSAPP_BODY_MAX,
  isCommunicationWriteTool,
} from '../../src/features/ai-support/copilot/communicationTools.js'
import type { CopilotProposal } from '../../src/features/ai-support/copilot/types.js'
import { createPendingOp, type CopilotActor } from './assistantPending.js'
import { readStringEnv } from './http.js'
import { maskPhone } from './guideInterviewReport.js'
import { whatsappPhoneVariants } from './whatsappBidirectional.js'
import { withContentHash, assertWorkspaceHash } from './workspaceHash.js'
import { proposalFromPendingRow } from './assistantGoogleTools.js'
import { resolveWhatsappRecipient } from './resolveCommunicationRecipient.js'

export { resolveCommunicationRecipient, resolveWhatsappRecipient } from './resolveCommunicationRecipient.js'

function asString(value: unknown, max = 400) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

async function hasOpenWindow(supabase: SupabaseClient, waId: string) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const variants = whatsappPhoneVariants(waId)
  if (variants.length === 0) return false
  const { data } = await supabase
    .from('external_inbound_messages')
    .select('id')
    .eq('channel', 'whatsapp')
    .in('external_user_id', variants)
    .gte('created_at', since)
    .limit(1)
  return Boolean(data && data.length > 0)
}

export async function queueWhatsappDraft(
  actor: CopilotActor,
  input: {
    purpose: string
    recipient?: string
    utteredAt?: string
    sessionId?: string | null
    contentInstructions?: string
    conversationContext?: string
  }
): Promise<CopilotProposal> {
  const purpose = input.purpose.trim().slice(0, 500)
  if (!purpose) throw new Error('Indica el proposito del WhatsApp.')
  const contentInstructions = (input.contentInstructions || '').trim().slice(0, 500)
  const conversationContext = (input.conversationContext || '').trim().slice(0, 800)
  const workspace: CopilotWorkspacePreview = {
    kind: 'whatsapp',
    recipientName: input.recipient?.trim() || undefined,
    body: '',
    incomplete: true,
  }
  const payload = withContentHash({
    incomplete: true,
    draft_kind: 'whatsapp',
    recipient_hint: input.recipient || '',
    purpose,
    content_instructions: contentInstructions,
    conversation_context: conversationContext,
    uttered_at: input.utteredAt || new Date().toISOString(),
    body: '',
    to_user_id: '',
    to_phone: '',
  })
  return createPendingOp(actor, {
    tool: 'whatsapp_prepare_send',
    payload,
    ttlMs: COMMUNICATION_WRITE_TTL_MS,
    sessionId: input.sessionId,
    channel: 'retell',
    proposal: {
      title: 'WhatsApp (borrador de llamada)',
      summary: `Quedo un borrador de WhatsApp sobre "${purpose}". Se rellena al terminar la llamada. No se envia solo.`,
      fields: [
        { label: 'Destinatario', to: input.recipient?.trim() || 'Por confirmar' },
        { label: 'Proposito', to: purpose },
      ],
      workspace,
    },
  })
}

export async function executeWhatsappWrite(
  actor: CopilotActor,
  payload: Record<string, unknown>,
  pendingOpId: string
) {
  if (payload.incomplete === true) {
    throw new Error(
      'Este borrador aun no esta listo. Espera el cierre de la llamada o completa el destinatario/cuerpo.'
    )
  }
  if (payload.needs_info === true) {
    throw new Error(
      asString(payload.needs_info_reason, 220) ||
        'Falta informacion del destinatario. Completala antes de enviar.'
    )
  }
  assertWorkspaceHash(payload)

  if (typeof payload.meta_message_id === 'string' && payload.meta_message_id) {
    return {
      id: payload.meta_message_id,
      meta_message_id: payload.meta_message_id,
      phone: asString(payload.to_phone, 40),
    }
  }

  const phone = asString(payload.to_phone, 40)
  const body = asString(payload.body, WHATSAPP_BODY_MAX)
  const toUserId = asString(payload.to_user_id, 80)
  if (!phone || !maskPhone(phone)) {
    throw new Error('Falta un numero de WhatsApp valido.')
  }
  if (!body) throw new Error('El mensaje esta vacio.')

  const windowOpen = await hasOpenWindow(actor.supabase, phone)
  if (!windowOpen) {
    throw new Error(
      'La ventana de 24h de WhatsApp esta cerrada. El destinatario debe escribir primero; no se envio.'
    )
  }

  const accessToken = readStringEnv('WHATSAPP_ACCESS_TOKEN')
  const phoneNumberId = readStringEnv('WHATSAPP_PHONE_NUMBER_ID')
  const graphVersion = readStringEnv('WHATSAPP_GRAPH_VERSION', 'v20.0')
  if (!accessToken || !phoneNumberId) {
    throw new Error('WhatsApp no esta configurado en este entorno.')
  }

  const response = await fetch(
    `https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: phone.replace(/\D/g, ''),
        type: 'text',
        text: { preview_url: false, body },
      }),
    }
  )
  const raw = await response.text()
  let json: { messages?: Array<{ id?: string }>; error?: { message?: string } } = {}
  try {
    json = raw ? (JSON.parse(raw) as typeof json) : {}
  } catch {
    json = {}
  }
  const messageId = json.messages?.[0]?.id ?? null
  const failed = !response.ok || !messageId
  const clientRequestId = `guide-comm:${pendingOpId}`
  const record = {
    wa_id: phone.replace(/\D/g, ''),
    usuario_id: toUserId || actor.usuarioId,
    direction: 'outbound',
    source: 'automation',
    message_kind: 'text',
    body_text: body,
    meta_message_id: messageId,
    client_request_id: clientRequestId,
    delivery_status: failed ? 'failed' : 'sent',
    error_message: failed ? (json.error?.message || `http_${response.status}`).slice(0, 300) : null,
    sent_at: failed ? null : new Date().toISOString(),
    failed_at: failed ? new Date().toISOString() : null,
    payload: { kind: 'guide_communication', pending_op_id: pendingOpId },
  }
  const existing = await actor.supabase
    .from('whatsapp_messages')
    .select('id')
    .eq('client_request_id', clientRequestId)
    .maybeSingle()
  if (existing.data?.id) {
    await actor.supabase.from('whatsapp_messages').update(record).eq('id', existing.data.id)
  } else {
    await actor.supabase.from('whatsapp_messages').insert(record)
  }

  if (failed || !messageId) {
    throw new Error(json.error?.message || 'WhatsApp no confirmo el envio.')
  }

  return {
    id: messageId,
    meta_message_id: messageId,
    phone: maskPhone(phone),
    delivery_status: 'accepted',
    href: undefined,
  }
}

export async function editWhatsappPendingOp(
  actor: CopilotActor,
  opId: string,
  patch: { body?: string; recipientName?: string }
) {
  const { data, error } = await actor.supabase
    .from('assistant_pending_ops')
    .select('id,usuario_id,tool,payload,preview,status')
    .eq('id', opId)
    .maybeSingle()
  if (error || !data) throw new Error('No encontré esa operación pendiente.')
  if (data.usuario_id !== actor.usuarioId) throw new Error('Esa operación no te pertenece.')
  if (!isCommunicationWriteTool(String(data.tool))) throw new Error('Esta operación no se puede editar.')
  if (data.status !== 'pending') throw new Error('Solo se pueden editar borradores pendientes.')

  const payload = {
    ...((data.payload && typeof data.payload === 'object'
      ? data.payload
      : {}) as Record<string, unknown>),
  }
  if (typeof patch.body === 'string') payload.body = clipText(patch.body, WHATSAPP_BODY_MAX)

  let needsInfo = Boolean(payload.needs_info)
  let needsInfoReason = asString(payload.needs_info_reason, 220)
  if (typeof patch.recipientName === 'string' && patch.recipientName.trim()) {
    const hint = patch.recipientName.trim()
    payload.recipient_hint = hint
    const resolved = await resolveWhatsappRecipient(actor.supabase, hint)
    payload.to_user_id = resolved.toUserId || ''
    payload.to_phone = resolved.phone || ''
    if (resolved.name) payload.recipient_hint = resolved.name
    needsInfo = Boolean(resolved.needsInfoReason)
    needsInfoReason = resolved.needsInfoReason || ''
  }

  payload.incomplete = false
  payload.needs_info = needsInfo
  payload.needs_info_reason = needsInfoReason

  const workspace: CopilotWorkspacePreview = {
    kind: 'whatsapp',
    recipientName: asString(payload.recipient_hint, 120) || undefined,
    phone: maskPhone(asString(payload.to_phone, 40)) || undefined,
    toUserId: asString(payload.to_user_id, 80) || undefined,
    body: asString(payload.body, WHATSAPP_BODY_MAX),
    incomplete: false,
    needsInfo,
    needsInfoReason: needsInfoReason || undefined,
  }
  const nextPayload = withContentHash(payload)
  const preview = {
    title: 'Enviar WhatsApp',
    summary: needsInfo
      ? `WhatsApp incompleto: ${needsInfoReason}`
      : `WhatsApp a ${workspace.recipientName || workspace.phone || 'destinatario'}. Revisa y confirma; no se envio solo.`,
    fields: [
      { label: 'Para', to: workspace.recipientName || '—' },
      { label: 'Numero', to: workspace.phone || '—' },
      { label: 'Mensaje', to: clipText(workspace.body || '', 280) },
    ],
    workspace,
  }

  const { error: rpcError } = await actor.supabase.rpc('edit_assistant_pending_op', {
    p_id: opId,
    p_payload: nextPayload,
    p_preview: preview,
  })
  if (rpcError) throw new Error(rpcError.message || 'No se pudo editar.')
  return proposalFromPendingRow({
    id: opId,
    tool: 'whatsapp_prepare_send',
    preview,
    expires_at: new Date(Date.now() + COMMUNICATION_WRITE_TTL_MS).toISOString(),
  })
}
