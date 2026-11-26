/** Off by default. An allowlist is an additional restriction, never a role grant. */
export type CommunicationEnv = Record<string, string | undefined>
const uuid = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i
function list(value: string | undefined) { return (value ?? '').split(',').map(x => x.trim()).filter(Boolean) }
export function isWhatsAppCommunicationAllowed(env: CommunicationEnv, senderId: string, recipientId: string, channel: 'whatsapp' | 'email'): boolean {
  return env.WHATSAPP_COMMUNICATIONS_ENABLED === '1' && uuid.test(senderId) && uuid.test(recipientId) &&
    list(env.WHATSAPP_COMMUNICATIONS_SENDERS).includes(senderId) &&
    list(env.WHATSAPP_COMMUNICATIONS_RECIPIENTS).includes(recipientId) &&
    list(env.WHATSAPP_COMMUNICATIONS_CHANNELS).includes(channel)
}


/** UUID session binding compatible with assistant_pending_ops.session_id (uuid).
 * The external phone remains a channel identity, never a database UUID. */
export async function whatsappSessionId(usuarioId: string, waId: string): Promise<string> {
  if (!uuid.test(usuarioId)) throw new Error('Identidad de sesión WhatsApp inválida')
  let phone = waId.replace(/\D/g, '')
  if (phone.length === 10) phone = `52${phone}`
  if (phone.length === 13 && phone.startsWith('521')) phone = `52${phone.slice(3)}`
  if (phone.length < 10 || phone.length > 15) throw new Error('Identidad de sesión WhatsApp inválida')
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`scrumban:whatsapp:${usuarioId.toLowerCase()}:${phone}`))
  const hex = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2,'0')).join('').slice(0,32)
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-8${hex.slice(13,16)}-${((parseInt(hex[16]!,16)&3)|8).toString(16)}${hex.slice(17,20)}-${hex.slice(20,32)}`
}
