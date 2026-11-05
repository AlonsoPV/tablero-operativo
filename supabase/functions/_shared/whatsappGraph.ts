/**
 * Referencia de helpers WhatsApp.
 * Las Edge Functions desplegables son autocontenidas en su `index.ts`
 * (el Dashboard solo sube ese archivo).
 */
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'

export type WhatsAppScope = 'corporate' | 'team'
export type WhatsAppMessageType = 'initial' | 'checkpoint_followup' | 'commitment_close'

export function adminClient(): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) throw new Error('missing_supabase_admin')
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}

export function whatsappConfig() {
  const accessToken = Deno.env.get('WHATSAPP_ACCESS_TOKEN')?.trim() || ''
  const phoneNumberId = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID')?.trim() || ''
  const graphVersion = Deno.env.get('WHATSAPP_GRAPH_VERSION')?.trim() || 'v20.0'
  const templateName = Deno.env.get('WHATSAPP_INITIAL_TEMPLATE_NAME')?.trim() || 'nueva_actividad_what2do'
  const templateLanguage = Deno.env.get('WHATSAPP_INITIAL_TEMPLATE_LANGUAGE')?.trim() || 'en'
  if (!accessToken || !phoneNumberId) {
    throw new Error('missing_whatsapp_secrets')
  }
  return { accessToken, phoneNumberId, graphVersion, templateName, templateLanguage }
}

export function normalizePhone(raw: string | null | undefined): string | null {
  const digits = (raw ?? '').replace(/\D/g, '')
  if (digits.length < 10 || digits.length > 15) return null
  return digits
}

export function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, key: string) => vars[key] ?? '')
}

export async function loadFollowupSettings(supabase: SupabaseClient) {
  const { data } = await supabase
    .from('whatsapp_followup_settings')
    .select(
      'followup_delay_minutes,followups_per_day,initial_text_template,checkpoint_followup_template,commitment_close_template'
    )
    .eq('id', 'default')
    .maybeSingle()
  return {
    followup_delay_minutes: data?.followup_delay_minutes ?? 5,
    followups_per_day: data?.followups_per_day ?? 1,
    initial_text_template:
      data?.initial_text_template ??
      'Hola {{responsable_nombre}}. Nueva actividad: {{titulo_accion}}. Compromiso: {{fecha_compromiso}}.{{checklist_bloque}}',
    checkpoint_followup_template:
      data?.checkpoint_followup_template ??
      'Seguimiento: {{titulo_accion}}. Checkpoint: {{checkpoint_texto}}. Responde con el boton correspondiente.',
    commitment_close_template:
      data?.commitment_close_template ??
      'Cierre de compromiso: {{titulo_accion}}. Fecha: {{fecha_compromiso}}. Gracias.',
  }
}

export async function findWhatsAppIdentity(supabase: SupabaseClient, usuarioId: string) {
  const { data } = await supabase
    .from('user_channel_identities')
    .select('id,usuario_id,external_user_id,external_chat_id,status')
    .eq('channel', 'whatsapp')
    .eq('usuario_id', usuarioId)
    .eq('status', 'active')
    .maybeSingle()
  return data
}

export async function hasOpenSession(supabase: SupabaseClient, waId: string): Promise<boolean> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { data } = await supabase
    .from('external_inbound_messages')
    .select('id,created_at')
    .eq('channel', 'whatsapp')
    .eq('external_user_id', waId)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(1)
  return Boolean(data && data.length > 0)
}

export async function graphSendMessage(body: Record<string, unknown>) {
  const { accessToken, phoneNumberId, graphVersion } = whatsappConfig()
  const url = `https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  const raw = await response.text()
  let json: Record<string, unknown> = {}
  try {
    json = raw ? (JSON.parse(raw) as Record<string, unknown>) : {}
  } catch {
    json = { raw }
  }
  return { ok: response.ok, status: response.status, json, raw }
}

export function interactiveFollowupPayload(to: string, bodyText: string, buttonIdPrefix: string) {
  return {
    messaging_product: 'whatsapp',
    to,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: bodyText.slice(0, 1024) },
      action: {
        buttons: [
          { type: 'reply', reply: { id: `${buttonIdPrefix}:done`, title: 'Realizada' } },
          { type: 'reply', reply: { id: `${buttonIdPrefix}:progress`, title: 'En proceso' } },
          { type: 'reply', reply: { id: `${buttonIdPrefix}:support`, title: 'Requiero apoyo' } },
        ],
      },
    },
  }
}

export function textPayload(to: string, text: string) {
  return {
    messaging_product: 'whatsapp',
    to,
    type: 'text',
    text: { preview_url: false, body: text.slice(0, 4090) },
  }
}

/** "Hoy es: {{1}}" → ahora en CDMX (YYYY-MM-DD HH:mm). */
export function formatNowForTemplate() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date())
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}`
}

/**
 * Body de la plantilla Meta inicial aprobada:
 *   Hoy es: {{1}}
 *   ¡Hola {{2}}!
 * Solo 2 params: fecha/hora actual, nombre.
 */
export function initialTemplateBodyParams(input: { fecha?: string | null; nombre?: string | null }) {
  return [
    (input.fecha || formatNowForTemplate()).slice(0, 1024),
    (input.nombre || 'usuario').slice(0, 1024),
  ]
}

export function templatePayload(
  to: string,
  templateName: string,
  language: string,
  bodyParams: string[]
) {
  return {
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: {
      name: templateName,
      language: { code: language },
      components: bodyParams.length
        ? [
            {
              type: 'body',
              parameters: bodyParams.map((text) => ({ type: 'text', text: text.slice(0, 1024) })),
            },
          ]
        : [],
    },
  }
}

export function extractMessageId(json: Record<string, unknown>): string | null {
  const messages = json.messages
  if (!Array.isArray(messages) || messages.length === 0) return null
  const first = messages[0] as { id?: unknown }
  return typeof first.id === 'string' ? first.id : null
}
