import type { SupabaseClient } from '@supabase/supabase-js'
import { buildWhatsappReportMessage, maskPhone } from './guideInterviewReport.js'
import { readStringEnv } from './http.js'
import { whatsappPhoneVariants } from './whatsappBidirectional.js'

type JournalShare = {
  id: string
  usuario_id: string
  topic?: string | null
  summary?: string | null
  executive_report?: string | null
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

export async function shareGuideReport(supabase: SupabaseClient, journal: JournalShare, confirm: boolean) {
  const preview = buildWhatsappReportMessage({
    topic: journal.topic,
    executiveReport: journal.executive_report,
    summary: journal.summary,
  })
  const { data: identity } = await supabase
    .from('user_channel_identities')
    .select('external_user_id,status')
    .eq('channel', 'whatsapp')
    .eq('usuario_id', journal.usuario_id)
    .eq('status', 'active')
    .maybeSingle()
  const phone = typeof identity?.external_user_id === 'string' ? identity.external_user_id : ''
  const masked = maskPhone(phone)
  if (!phone || !masked) {
    return { ok: false as const, code: 'no_recipient', preview, phone: null, messageId: null }
  }
  if (!confirm) {
    return { ok: true as const, code: 'preview', preview, phone: masked, messageId: null }
  }

  const windowOpen = await hasOpenWindow(supabase, phone)
  if (!windowOpen) {
    return { ok: false as const, code: 'window_closed', preview, phone: masked, messageId: null }
  }

  const accessToken = readStringEnv('WHATSAPP_ACCESS_TOKEN')
  const phoneNumberId = readStringEnv('WHATSAPP_PHONE_NUMBER_ID')
  const graphVersion = readStringEnv('WHATSAPP_GRAPH_VERSION', 'v20.0')
  if (!accessToken || !phoneNumberId) {
    return { ok: false as const, code: 'not_configured', preview, phone: masked, messageId: null }
  }

  const response = await fetch(`https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: phone.replace(/\D/g, ''),
      type: 'text',
      text: { preview_url: false, body: preview },
    }),
  })
  const raw = await response.text()
  let json: { messages?: Array<{ id?: string }>; error?: { message?: string } } = {}
  try {
    json = raw ? (JSON.parse(raw) as typeof json) : {}
  } catch {
    json = {}
  }
  const messageId = json.messages?.[0]?.id ?? null
  const failed = !response.ok || !messageId
  const clientRequestId = `guide-report:${journal.id}`
  const record = {
    wa_id: phone.replace(/\D/g, ''),
    usuario_id: journal.usuario_id,
    direction: 'outbound',
    source: 'automation',
    message_kind: 'text',
    body_text: preview,
    meta_message_id: messageId,
    client_request_id: clientRequestId,
    delivery_status: failed ? 'failed' : 'sent',
    error_message: failed ? (json.error?.message || `http_${response.status}`).slice(0, 300) : null,
    sent_at: failed ? null : new Date().toISOString(),
    failed_at: failed ? new Date().toISOString() : null,
    payload: { kind: 'guide_report', journal_id: journal.id },
  }
  const existing = await supabase
    .from('whatsapp_messages')
    .select('id')
    .eq('client_request_id', clientRequestId)
    .maybeSingle()
  if (existing.data?.id) {
    await supabase.from('whatsapp_messages').update(record).eq('id', existing.data.id)
  } else {
    await supabase.from('whatsapp_messages').insert(record)
  }

  if (failed) {
    return { ok: false as const, code: 'provider_failed', preview, phone: masked, messageId: null }
  }
  return { ok: true as const, code: 'sent', preview, phone: masked, messageId }
}
