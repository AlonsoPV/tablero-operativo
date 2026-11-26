import { isWhatsAppCommunicationAllowed, whatsappSessionId, type CommunicationEnv } from '../_shared/whatsappCommunicationGate.ts'

type Client = { from: (table: string) => any; auth: {admin: {getUserById: (id: string) => Promise<any>}} }
export async function matchesInternalAuthorization(header: string | null, secret: string | undefined) {
  if (!secret || !header?.startsWith('Bearer ')) return false
  const hash = (value: string) => crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  const [a,b]=await Promise.all([hash(header.slice(7)),hash(secret)])
  const left=new Uint8Array(a), right=new Uint8Array(b)
  let difference=0; for(let i=0;i<left.length;i++) difference |= left[i]! ^ right[i]!
  return difference===0
}

/** Derives recipient and content from the reserved operation, never from the request body. */
export async function loadApprovedWhatsAppEmail(client: Client, operationId: string, env: CommunicationEnv) {
  if (!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(operationId)) throw new Error('Operación inválida')
  const {data: row,error}=await client.from('assistant_pending_ops').select('id,usuario_id,tool,status,channel,session_id,payload,expires_at').eq('id',operationId).maybeSingle()
  if (error || !row || row.status!=='executing' || row.tool!=='notify_user_email' || row.channel!=='whatsapp' ||
      !row.session_id || !(Date.parse(row.expires_at)>Date.now()) ||
      !isWhatsAppCommunicationAllowed(env,row.usuario_id,String(row.payload?.usuario_id ?? ''),'email')) throw new Error('Operación no autorizada')
  const {data: identity,error: identityError}=await client.from('user_channel_identities').select('usuario_id,external_user_id')
    .eq('channel','whatsapp').eq('usuario_id',row.usuario_id).eq('status','active').maybeSingle()
  const {data: profile,error: profileError}=await client.from('usuarios').select('user_id,activo').eq('id',row.usuario_id).maybeSingle()
  const {data: permitted,error: permissionError}=await (client as any).rpc('can_use_ai_whatsapp_for_usuario',{p_usuario_id:row.usuario_id})
  if (identityError || profileError || permissionError || identity?.usuario_id !== row.usuario_id || !identity.external_user_id || row.session_id !== await whatsappSessionId(row.usuario_id,identity.external_user_id) || profile?.activo!==true || !profile.user_id || permitted!==true) throw new Error('Emisor no autorizado')
  const {data,error: userError}=await client.auth.admin.getUserById(profile.user_id)
  if(userError || !data?.user) throw new Error('Sesión de emisor no disponible')
  const {data: caps,error: capsError}=await (client as any).rpc('access_capabilities_for_usuario',{p_usuario_id:row.usuario_id})
  if (capsError || caps?.active!==true || (caps.direction===true && caps.super_admin!==true)) throw new Error('Permisos de envío no disponibles')
  const p=row.payload
  if (typeof p.subject!=='string' || !p.subject.trim() || typeof p.body!=='string' || !p.body.trim() ||
      typeof p.to_email!=='string' || p.subject.length>160 || /[\r\n]/.test(p.subject) || p.body.length>4000) throw new Error('Contenido inválido')
  return {row,user:data.user,body:{usuario_id:p.usuario_id,tipo:'assistant_summary',reply_to_caller:true,
    payload:{titulo:p.subject,mensaje:p.body}}}
}

/** The existing audit table owns an immutable primary key per operation.
 * Authenticated clients have SELECT only: a caller cannot erase the attempt by resetting its proposal. */
export async function claimApprovedWhatsAppEmail(client: Client, row: any) {
  const {data,error}=await client.from('notification_email_logs').insert({
    id:row.id,usuario_id:row.payload.usuario_id,tipo:'assistant_summary',prioridad:'Normal',
    status:'queued',reason:'approved_whatsapp_attempt',payload:{pending_op_id:row.id,sender_usuario_id:row.usuario_id},
  }).select('id').single()
  if(error || !data) throw new Error('Ya existe un intento de correo o no se pudo registrarlo. Consulta su resultado antes de reintentar.')
}

export async function recordApprovedWhatsAppEmail(client: Client, operationId: string, emailId?: string) {
  const {data,error}=await client.from('notification_email_logs').update({
    status:emailId ? 'sent' : 'unknown',email_id:emailId ?? null,provider:'gmail',
    reason:emailId ? 'provider_accepted_not_delivered' : 'provider_outcome_unknown',
  }).eq('id',operationId).eq('status','queued').select('id').maybeSingle()
  if(error || !data) throw new Error('No se pudo registrar el resultado. No reenvíes sin revisar el intento.')
}
