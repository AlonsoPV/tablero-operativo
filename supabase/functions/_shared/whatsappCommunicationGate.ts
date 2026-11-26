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
