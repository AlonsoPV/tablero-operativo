import { isAnalystByRole } from '../../src/features/auth/lib/permissions.js'
import { sanitizeRecipientFacingText } from '../../src/features/ai-support/copilot/pendingOpTaxonomy.js'
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
import { isCorporateOverdue } from '../../src/features/metrics/corporateActionMetrics.js'
import type { CopilotProposal } from '../../src/features/ai-support/copilot/types.js'
import { createPendingOp, type CopilotActor } from './assistantPending.js'
import { createServiceRoleClient } from './assistantAuth.js'
import { sendWhatsAppGraphMessage } from '../../supabase/functions/_shared/whatsappTransport.js'
import { readStringEnv } from './http.js'
import { maskPhone } from './guideInterviewReport.js'
import { whatsappPhoneVariants } from './whatsappBidirectional.js'
import { hashWorkspacePayload, withContentHash, assertWorkspaceHash } from './workspaceHash.js'
import { proposalFromPendingRow } from './assistantGoogleTools.js'
import { resolveCommunicationRecipient, resolveLinkedWhatsappPerson } from './resolveCommunicationRecipient.js'

export { resolveCommunicationRecipient, resolveWhatsappRecipient } from './resolveCommunicationRecipient.js'

function asString(value: unknown, max = 400) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

async function hasOpenWindow(supabase: SupabaseClient, waId: string) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const variants = whatsappPhoneVariants(waId)
  if (variants.length === 0) return false
  const { data, error } = await supabase
    .from('external_inbound_messages')
    .select('id')
    .eq('channel', 'whatsapp')
    .in('external_user_id', variants)
    .gte('created_at', since)
    .limit(1)
  if (error) throw new Error('DATABASE_ERROR: No se pudo consultar la ventana de WhatsApp.')
  return Boolean(data && data.length > 0)
}

export async function queueWhatsappDraft(
  actor: CopilotActor,
  input: {
    purpose: string
    recipient?: string
    utteredAt?: string
    sessionId?: string | null
    idempotencyKey?: string
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
    idempotency_key: input.idempotencyKey || '',
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
    requestKey: input.idempotencyKey ? hashWorkspacePayload({ session: input.sessionId, key: input.idempotencyKey }) : undefined,
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

  if (!actor.accessToken) {
    throw new Error('PERMISSION_DENIED: Aprueba el WhatsApp desde una sesión web autenticada.')
  }

  const toUserId = asString(payload.to_user_id, 80)
  const phone = asString(payload.to_phone, 40).replace(/\D/g, '')
  const body = asString(payload.body, WHATSAPP_BODY_MAX)
  if (body !== sanitizeRecipientFacingText(body, WHATSAPP_BODY_MAX)) {
    throw new Error('VALIDATION_FAILED: Revisa y guarda de nuevo el texto del borrador.')
  }
  if (!toUserId || !/^\d{10,15}$/.test(phone) || !body) {
    throw new Error('VALIDATION_FAILED: Revisa el destinatario y el cuerpo del WhatsApp.')
  }

  // La sesión del usuario decide a quién puede ver. El cliente interno solo
  // consulta la ventana y registra el envío para ese destinatario verificado.
  const { data: person, error: personError } = await actor.supabase
    .from('usuarios')
    .select('id')
    .eq('id', toUserId)
    .eq('activo', true)
    .maybeSingle()
  if (personError) throw new Error('DATABASE_ERROR: No se pudo verificar el destinatario.')
  if (!person) throw new Error('PERMISSION_DENIED: El destinatario ya no está disponible.')

  const admin = createServiceRoleClient()
  const clientRequestId = `guide-comm:${pendingOpId}`
  const { data: existing, error: lookupError } = await admin
    .from('whatsapp_messages')
    .select('meta_message_id,delivery_status')
    .eq('client_request_id', clientRequestId)
    .maybeSingle()
  if (lookupError) throw new Error('DATABASE_ERROR: No se pudo consultar el intento anterior.')
  if (existing?.meta_message_id) {
    return {
      id: String(existing.meta_message_id),
      meta_message_id: String(existing.meta_message_id),
      delivery_status: existing.delivery_status === 'sent' ? 'accepted' : String(existing.delivery_status),
    }
  }
  if (existing) {
    throw new Error('PROVIDER_ERROR: Ya existe un intento sin confirmación de Meta. Consulta su estado antes de generar otro envío.')
  }

  const { data: identity, error: identityError } = await admin
    .from('user_channel_identities')
    .select('external_user_id')
    .eq('channel', 'whatsapp')
    .eq('usuario_id', toUserId)
    .eq('status', 'active')
    .maybeSingle()
  if (identityError) throw new Error('DATABASE_ERROR: No se pudo verificar el número de WhatsApp.')
  if (String(identity?.external_user_id ?? '').replace(/\D/g, '') !== phone) {
    throw new Error('MISSING_CONTACT: El número vinculado cambió. Actualiza el destinatario del borrador.')
  }
  if (!(await hasOpenWindow(admin, phone))) {
    throw new Error('VALIDATION_FAILED: La ventana de 24 horas está cerrada. El destinatario debe escribir primero.')
  }
  const accessToken = readStringEnv('WHATSAPP_ACCESS_TOKEN')
  const phoneNumberId = readStringEnv('WHATSAPP_PHONE_NUMBER_ID')
  const graphVersion = readStringEnv('WHATSAPP_GRAPH_VERSION', 'v20.0')
  if (!accessToken || !phoneNumberId) {
    throw new Error('CONFIGURATION_ERROR: Configura WHATSAPP_ACCESS_TOKEN y WHATSAPP_PHONE_NUMBER_ID en el servidor que ejecuta el asistente.')
  }

  const { data: attempt, error: queueError } = await admin
    .from('whatsapp_messages')
    .insert({
      wa_id: phone,
      usuario_id: toUserId,
      operator_usuario_id: actor.usuarioId,
      direction: 'outbound',
      source: 'automation',
      message_kind: 'text',
      body_text: body,
      client_request_id: clientRequestId,
      delivery_status: 'queued',
      payload: { kind: 'guide_communication', pending_op_id: pendingOpId },
    })
    .select('id')
    .single()
  if (queueError || !attempt) {
    throw new Error('DATABASE_ERROR: No se pudo registrar el intento de envío.')
  }

  const response = await sendWhatsAppGraphMessage(
    { accessToken, phoneNumberId, graphVersion },
    {
      messaging_product: 'whatsapp',
      to: phone,
      type: 'text',
      text: { preview_url: false, body },
    }
  ).catch(() => {
    throw new Error('TIMEOUT: Meta no confirmó el resultado. Consulta el estado del intento antes de reenviar.')
  })
  const messages = response.json.messages
  const messageId = Array.isArray(messages) && typeof messages[0]?.id === 'string'
    ? messages[0].id as string
    : null
  const accepted = response.ok && Boolean(messageId)
  const timestamp = new Date().toISOString()
  const { error: logError } = await admin
    .from('whatsapp_messages')
    .update({
      meta_message_id: accepted ? messageId : null,
      delivery_status: accepted ? 'sent' : 'failed',
      error_message: accepted ? null : `graph_http_${response.status}`,
      sent_at: accepted ? timestamp : null,
      failed_at: accepted ? null : timestamp,
    })
    .eq('id', attempt.id)
  if (logError) {
    throw new Error('DATABASE_ERROR: No se pudo guardar el resultado de Meta. Consulta el estado del intento.')
  }
  if (response.status === 429) throw new Error('RATE_LIMITED: Meta limitó el envío.')
  if (!accepted) throw new Error('PROVIDER_ERROR: Meta no aceptó el WhatsApp.')
  return { id: messageId, meta_message_id: messageId, delivery_status: 'accepted' }
}

export async function editWhatsappPendingOp(
  actor: CopilotActor,
  opId: string,
  patch: { body?: string; recipientName?: string; recipientId?: string }
) {
  const { data, error } = await actor.supabase
    .from('assistant_pending_ops')
    .select('id,usuario_id,tool,payload,status,expires_at')
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
  if (typeof patch.body === 'string') payload.body = sanitizeRecipientFacingText(patch.body, WHATSAPP_BODY_MAX)

  let needsInfo = !payload.to_user_id || !payload.to_phone
  let needsInfoReason = needsInfo ? asString(payload.needs_info_reason, 220) : ''
  if (patch.recipientId || patch.recipientName?.trim()) {
    const hint = patch.recipientName?.trim() || ''
    const resolved = patch.recipientId
      ? await resolveLinkedWhatsappPerson(actor.supabase, createServiceRoleClient, patch.recipientId)
      : await resolveDraftRecipient(actor, hint)
    payload.recipient_hint = resolved.name || hint
    if (payload.filter && resolved.toUserId !== payload.to_user_id) {
      payload.body = ''
      payload.action_ids = []
      payload.filter = null
    }
    payload.to_user_id = resolved.toUserId || ''
    payload.to_phone = resolved.phone || ''
    needsInfo = Boolean(resolved.needsInfoReason)
    needsInfoReason = resolved.needsInfoReason || ''
  }

  if (!asString(payload.body, WHATSAPP_BODY_MAX) && !needsInfo) {
    needsInfo = true
    needsInfoReason = 'Falta el cuerpo del WhatsApp.'
  }

  if (needsInfo && !needsInfoReason) needsInfoReason = 'Falta un destinatario con WhatsApp vinculado.'
  payload.incomplete = false
  payload.needs_info = needsInfo
  payload.needs_info_reason = needsInfoReason

  const preview = whatsappPreview(payload)
  const nextPayload = withContentHash(payload)
  const { error: rpcError } = await actor.supabase.rpc('edit_assistant_pending_op', {
    p_id: opId,
    p_payload: nextPayload,
    p_preview: preview,
  })
  if (rpcError?.code === 'PGRST202' || /esta operaci[oó]n no se puede editar/i.test(rpcError?.message ?? '')) {
    throw new Error('CONFIGURATION_ERROR: Supabase no admite editar WhatsApp. Verifica la migración 20261117010000_whatsapp_prepare_pending_ops.sql.')
  }
  if (rpcError) throw new Error(rpcError.message || 'No se pudo editar.')
  return proposalFromPendingRow({
    id: opId,
    tool: 'whatsapp_prepare_send',
    preview,
    expires_at: String(data.expires_at),
  })
}

function resolveDraftRecipient(actor: CopilotActor, hint: string) {
  return resolveCommunicationRecipient(actor.supabase, hint, 'whatsapp', {
    selfId: actor.usuarioId,
    contactClient: actor.accessToken ? createServiceRoleClient : undefined,
  })
}

function whatsappPreview(payload: Record<string, unknown>) {
  const needsInfo = payload.needs_info === true
  const needsInfoReason = asString(payload.needs_info_reason, 220)
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
  return {
    title: 'Enviar WhatsApp',
    summary: needsInfo
      ? `WhatsApp incompleto: ${needsInfoReason}`
      : `WhatsApp a ${workspace.recipientName || workspace.phone || 'destinatario'}. Revisa y confirma; no se envio solo.`,
    fields: [
      { label: 'Para', to: workspace.recipientName || '—' },
      { label: 'Numero', to: workspace.phone || '—' },
      { label: 'Mensaje', to: clipText(workspace.body || '', 280) },
      ...(payload.generated_at ? [{ label: 'Generado', to: asString(payload.generated_at, 40) }] : []),
    ],
    workspace,
  }


}

export async function prepareWhatsappDraft(
  actor: CopilotActor,
  input: { recipient: string; recipientId?: string; body?: string; includeOverdue?: boolean }
) {
  const resolved = input.recipientId
    ? await resolveLinkedWhatsappPerson(actor.supabase, createServiceRoleClient, input.recipientId)
    : await resolveDraftRecipient(actor, input.recipient)
  let body = sanitizeRecipientFacingText(input.body, WHATSAPP_BODY_MAX)
  const generatedAt = new Date()
  const actionIds: string[] = []
  if (input.includeOverdue && resolved.toUserId) {
    if (actor.boardScope !== 'organization' && isAnalystByRole(actor.rol) && resolved.toUserId !== actor.usuarioId) {
      throw new Error('PERMISSION_DENIED: Tu rol solo puede consultar tus propias acciones como responsable.')
    }
    const { data, error } = await actor.supabase
      .from('acciones_diarias')
      .select('id,titulo_accion,fecha,hora_limite,estado')
      .eq('responsable', resolved.toUserId)
      .in('estado', ['Pendiente', 'Hoy', 'En_Ejecucion', 'Bloqueado', 'Retraso'])
      .order('fecha', { nullsFirst: false })
      .order('id')
      .limit(100)
    if (error) throw new Error('DATABASE_ERROR: No se pudieron consultar las acciones.')
    const actions = (data ?? []).filter((row) => isCorporateOverdue(row, generatedAt))
    const lines = [body || `Hola ${resolved.name}. Te comparto tus acciones vencidas en Scrumban:`]
    for (const action of actions) {
      const line = `• ${action.titulo_accion} (${action.fecha ?? 'sin fecha'}, ${action.estado})`
      if (lines.join('\n').length + line.length + 1 > WHATSAPP_BODY_MAX - 65) break
      actionIds.push(String(action.id))
      lines.push(line)
    }
    if (actionIds.length < actions.length || (data?.length ?? 0) >= 100) {
      lines.push('La lista es parcial. Consulta el tablero para ver más.')
    } else if (!actions.length) {
      lines.push('En la consulta del tablero no encontré acciones vencidas a tu cargo.')
    }
    body = sanitizeRecipientFacingText(lines.join('\n'), WHATSAPP_BODY_MAX)
  }
  const needsInfoReason = resolved.needsInfoReason || (!body ? 'Falta el cuerpo del WhatsApp.' : '')
  const payload = withContentHash({
    draft_kind: 'whatsapp',
    recipient_hint: resolved.name || input.recipient,
    to_user_id: resolved.toUserId || '',
    to_phone: resolved.phone || '',
    body,
    needs_info: Boolean(needsInfoReason),
    needs_info_reason: needsInfoReason,
    generated_at: generatedAt.toISOString(),
    action_ids: actionIds,
    filter: input.includeOverdue ? 'assigned_overdue' : null,
  })
  return createPendingOp(actor, {
    tool: 'whatsapp_prepare_send',
    channel: actor.voiceChannel ? 'retell' : 'web',
    requestKey: actor.requestId || actor.guideSessionId
      ? hashWorkspacePayload({
          request: actor.requestId,
          session: actor.guideSessionId,
          recipient: resolved.toUserId || input.recipient.toLowerCase(),
          message: input.body?.trim() || '',
          overdue: input.includeOverdue === true,
        })
      : undefined,
    payload,
    proposal: whatsappPreview(payload),
    ttlMs: COMMUNICATION_WRITE_TTL_MS,
  })
}

export async function readWhatsappStatus(actor: CopilotActor, operationId: string) {
  if (!operationId) throw new Error('VALIDATION_FAILED: Indica cuál borrador quieres consultar.')
  const { data: operation, error } = await actor.supabase
    .from('assistant_pending_ops')
    .select('id,tool,status,expires_at,preview')
    .eq('id', operationId)
    .eq('usuario_id', actor.usuarioId)
    .eq('tool', 'whatsapp_prepare_send')
    .maybeSingle()
  if (error) throw new Error('DATABASE_ERROR: No se pudo consultar el borrador.')
  if (!operation) throw new Error('VALIDATION_FAILED: No encontré ese borrador de WhatsApp.')
  const admin = actor.accessToken ? createServiceRoleClient() : actor.supabase
  const { data: attempt, error: attemptError } = await admin.from('whatsapp_messages')
    .select('delivery_status,sent_at,delivered_at,read_at,failed_at')
    .eq('client_request_id', `guide-comm:${operationId}`)
    .eq('operator_usuario_id', actor.usuarioId)
    .maybeSingle()
  if (attemptError) throw new Error('DATABASE_ERROR: No se pudo consultar el estado de Meta.')
  return {
    proposal: proposalFromPendingRow(operation),
    operation_status: operation.status === 'pending' && Date.parse(operation.expires_at) <= Date.now()
      ? 'expired'
      : operation.status,
    attempt: attempt && {
      ...attempt,
      delivery_status: attempt.delivery_status === 'sent' ? 'accepted' : attempt.delivery_status,
    },
  }
}
