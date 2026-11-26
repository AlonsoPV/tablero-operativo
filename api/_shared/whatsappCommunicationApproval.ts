import { whatsappPhoneVariants } from './whatsappBidirectional.js'
import type { CopilotActor } from './assistantPending.js'
import { resolveActor } from './query/resolveActor.js'
import { loadAgentCapabilities } from './query/actorCapabilities.js'
import { authorizeActionPhase } from './actions/contracts.js'
import { resolveR2ExecutionMode } from './actions/executionMode.js'
import { isWhatsAppCommunicationAllowed, whatsappSessionId } from '../../supabase/functions/_shared/whatsappCommunicationGate.js'

export async function assertWhatsAppCommunicationApproval(actor: CopilotActor, row: {
  id: string; usuario_id: string; tool: string; channel?: string | null; session_id?: string | null; payload: Record<string, unknown>; preview?: Record<string, unknown>
}, approval?: { waId: string; operationId: string }) {
  const channel = row.tool === 'whatsapp_prepare_send' ? 'whatsapp' : row.tool === 'notify_user_email' ? 'email' : null
  const recipientId = String(row.payload.to_user_id ?? row.payload.usuario_id ?? '')
  if (!channel || !approval || approval.operationId !== row.id || row.usuario_id !== actor.usuarioId ||
      row.channel !== 'whatsapp' || row.session_id !== await whatsappSessionId(actor.usuarioId, approval.waId) || actor.whatsappId !== approval.waId ||
      resolveR2ExecutionMode(process.env, actor.usuarioId) !== 'pilot' ||
      !isWhatsAppCommunicationAllowed(process.env, actor.usuarioId, recipientId, channel)) {
    throw new Error('EXECUTION_DISABLED: El envío desde WhatsApp no está autorizado para este usuario, destinatario o canal.')
  }
  const workspace=row.preview?.workspace as {kind?:string;toUserId?:string;to?:string[];subject?:string;body?:string;needsInfo?:boolean;incomplete?:boolean}|undefined
  if (workspace?.kind !== channel || workspace.toUserId !== recipientId || workspace.body !== row.payload.body || workspace.needsInfo || workspace.incomplete ||
      (channel==='email' && (workspace.subject !== row.payload.subject || workspace.to?.length !== 1 || workspace.to[0]?.toLowerCase() !== row.payload.to_email))) {
    throw new Error('VALIDATION_FAILED: La vista previa no coincide con el destinatario y contenido aprobados.')
  }
  const {data: identity,error: identityError}=await actor.supabase.from('user_channel_identities')
    .select('usuario_id').eq('channel','whatsapp').in('external_user_id',whatsappPhoneVariants(approval.waId)).eq('status','active').maybeSingle()
  const {data: user,error: userError}=await actor.supabase.from('usuarios').select('id,user_id,rol,activo').eq('id',actor.usuarioId).maybeSingle()
  const {data: allowed,error: accessError}=await actor.supabase.rpc('can_use_ai_whatsapp_for_usuario',{p_usuario_id:actor.usuarioId})
  if (identityError || userError || accessError || identity?.usuario_id !== actor.usuarioId || user?.activo !== true || user.user_id !== actor.authUserId || allowed !== true) {
    throw new Error('PERMISSION_DENIED: La identidad o el acceso de WhatsApp dejó de ser válido.')
  }
  const verified={...actor,rol:user.rol,active:true}
  const capabilities=await loadAgentCapabilities(verified)
  const canonical=resolveActor(verified,{channel:'whatsapp',sessionId:approval.waId,capabilities})
  if ((channel === 'whatsapp' && !canonical.capabilities.whatsappInbox) || !authorizeActionPhase(canonical,'execute',undefined,undefined,actor.usuarioId,'pilot').allowed) throw new Error('PERMISSION_DENIED: Tu rol no permite ejecutar esta operación.')
}
