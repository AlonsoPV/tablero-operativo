import { isWhatsAppCommunicationAllowed } from '../../../supabase/functions/_shared/whatsappCommunicationGate.js'
import { proposalFromPendingRow } from '../assistantGoogleTools.js'
import type { CopilotProposal } from '../../../src/features/ai-support/copilot/types.js'
import type { AgentActor } from '../query/resolveActor.js'
import type { ToolDispatcher } from '../query/index.js'
import { resolveR2ExecutionMode } from '../actions/executionMode.js'
import type { PendingCommunicationProposal } from './communicationComposer.js'

/** Bridge to the existing pending-op/HTTP approval path. Never invokes a provider. */
export async function prepareContextualExecution(
  actor: AgentActor,
  pending: PendingCommunicationProposal,
  dispatch: ToolDispatcher,
  now = Date.now(),
): Promise<{ proposal?: CopilotProposal; message: string }> {
  if (!pending.canSendDirect) {
    return { message: pending.channelLimitation || 'Borrador preparado. El envío directo no está habilitado.' }
  }
  const mode = resolveR2ExecutionMode(process.env, actor.usuarioId)
  const recipientId = pending.recipients.length === 1 ? pending.recipients[0]?.recipientId : null
  const allowedPilot = actor.channel === 'whatsapp' && Boolean(actor.copilot.whatsappId) && mode === 'pilot' &&
    isWhatsAppCommunicationAllowed(process.env,actor.usuarioId,recipientId ?? '',pending.channel)
  if (pending.channel === 'email' && !allowedPilot) return {message:'Borrador preparado. El envío de correo desde este canal no está habilitado.'}
  if ((mode === 'pilot' && !allowedPilot) || mode === 'qa' || mode === 'simulated') {
    return {message: 'Borrador preparado. Los envíos externos están deshabilitados en este modo de ejecución.'}
  }
  if (!allowedPilot && (actor.channel !== 'web' || !actor.copilot.accessToken)) {
    return {message: 'Borrador preparado. Revisa y aprueba el envío desde una sesión web autenticada.'}
  }
  const recipient = pending.recipients.length === 1 ? pending.recipients[0] : null
  if (!recipient?.recipientId || !recipient.messageBody.trim() || recipient.messageBody.length > 1400) {
    return {message: 'No se preparó una operación de envío: revisa un destinatario único y un mensaje de hasta 1400 caracteres.'}
  }
  const bound = pending.execution
  if (bound && bound.version === pending.version) {
    const status = pending.channel === 'whatsapp'
      ? await dispatch(actor.copilot, 'get_whatsapp_operation_status', {pending_op_id: bound.proposal.id})
      : await (async () => {
        const {data,error}=await actor.copilot.supabase.from('assistant_pending_ops')
          .select('id,tool,status,expires_at,preview,result').eq('id',bound.proposal.id).eq('usuario_id',actor.usuarioId).eq('tool','notify_user_email').maybeSingle()
        return {ok:!error && Boolean(data),data:data ? {proposal:proposalFromPendingRow(data),operation_status:data.status,
          attempt:data.result?.email_id ? {delivery_status:'accepted'} : null} : null}
      })()
    if (!status.ok || !status.data) return {message: 'No pude verificar el estado del intento anterior. No se preparó otro envío.'}
    const data = status.data as {proposal?: CopilotProposal; operation_status?: string; attempt?: {delivery_status?: string} | null}
    const canonical = data.proposal
    if (!canonical || canonical.id !== bound.proposal.id || canonical.workspace?.toUserId !== recipient.recipientId ||
      canonical.workspace.body !== recipient.messageBody || (pending.channel === 'email' && canonical.workspace.subject !== recipient.subject) || canonical.workspace.needsInfo || canonical.workspace.incomplete) {
      return {message: 'La aprobación registrada no coincide con este destinatario o contenido. Revisa la operación existente antes de enviar.'}
    }
    const delivery = data.attempt?.delivery_status
    if (delivery) {
      return {message: delivery === 'read' ? 'Meta registra el mensaje como leído.'
        : delivery === 'delivered' ? 'Meta registra el mensaje como entregado.'
        : delivery === 'accepted' ? `${pending.channel === 'email' ? 'El proveedor de correo' : 'Meta'} aceptó el mensaje; la entrega todavía no está confirmada.`
        : `El intento existente figura como «${delivery}». Consulta su resultado antes de reenviar.`}
    }
    if (data.operation_status !== 'pending' || !(Date.parse(canonical.expiresAt) > now)) {
      return {message: `La operación existente figura como «${data.operation_status ?? 'desconocida'}». No se preparó otro envío.`}
    }
    return {proposal: canonical, message: 'Revisa la propuesta de envío vigente. Todavía no se registró un intento de envío.'}
  }
  const result = await dispatch({...actor.copilot, requestId: `contextual:${pending.proposalId}:v${pending.version}`},
    pending.channel === 'email' ? 'notify_user_email' : 'whatsapp_prepare_send',
    {recipient: recipient.recipientName, recipient_id: recipient.recipientId, body: recipient.messageBody, ...(pending.channel === 'email' ? {subject:recipient.subject} : {})})
  if (!result.ok || !result.proposal) {
    return {message: result.error || 'No se pudo preparar el envío. El borrador se conserva y no se envió.'}
  }
  const preview = result.proposal.workspace
  if (preview?.toUserId !== recipient.recipientId || preview.body !== recipient.messageBody || (pending.channel === 'email' && preview.subject !== recipient.subject) || preview.needsInfo || preview.incomplete) {
    await dispatch(actor.copilot, 'cancel_pending_op', {pending_op_id: result.proposal.id})
    return {message: 'No se habilitó el envío: el destinatario o contenido verificado no coincide con el borrador.'}
  }
  pending.execution = {version: pending.version, proposal: result.proposal}
  return {proposal: result.proposal, message: allowedPilot ? 'Revisa el destinatario y el contenido completos y confirma el código vigente. Todavía no se envió.' : `Revisa la tarjeta de envío (${pending.proposalId}, v${pending.version}) y confírmala allí. Todavía no se envió.`}
}

/** Invalidate the old immutable approval before changing any recipient/content/channel. */
export async function revokeContextualExecution(actor: AgentActor, pending: PendingCommunicationProposal, dispatch: ToolDispatcher) {
  if (!pending.execution) return
  const result = await dispatch(actor.copilot, 'cancel_pending_op', {pending_op_id: pending.execution.proposal.id})
  if (!result.ok) throw new Error('No se pudo invalidar la aprobación anterior. Revisa su estado antes de editar o cancelar.')
  delete pending.execution
}
