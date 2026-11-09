/**
 * WhatsApp webhook — entry compartido (mismo WABA).
 *
 * Dos flujos independientes (política: src/lib/whatsappFlowRouting.ts):
 * - OpsRouter: evidencia, act:/chk:/tchk:, keywords ops (no-AI), ayuda operativa
 * - AgentRouter: aiop:, texto libre Gemini (OKRS/Super Admin), Más información+AI
 *
 * send-action / followup-dispatcher son solo Ops. Assistant vive en /api/whatsapp-assistant.
 */
// @ts-nocheck — Dashboard solo sube index.ts; el bundler Deno exige specifier npm:
import { createClient } from 'npm:@supabase/supabase-js@2'

declare const Deno: {
  env: { get(key: string): string | undefined }
  serve: (handler: (req: Request) => Response | Promise<Response>) => void
}

function adminClient() {
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) throw new Error('missing_supabase_admin')
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}

function whatsappConfig() {
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

function normalizePhone(raw: string | null | undefined): string | null {
  const digits = (raw ?? '').replace(/\D/g, '')
  if (digits.length < 10 || digits.length > 15) return null
  return digits
}

/** Meta MX: tablero guarda 52XXXXXXXXXX; inbound llega como 521XXXXXXXXXX. */
function phoneVariants(raw: string | null | undefined): string[] {
  const digits = (raw ?? '').replace(/\D/g, '')
  if (digits.length < 10 || digits.length > 15) return []
  const out = new Set<string>([digits])
  if (digits.length === 10) {
    out.add(`52${digits}`)
    out.add(`521${digits}`)
  }
  if (digits.length === 12 && digits.startsWith('52') && !digits.startsWith('521')) {
    const local = digits.slice(2)
    out.add(local)
    out.add(`521${local}`)
  }
  if (digits.length === 13 && digits.startsWith('521')) {
    const local = digits.slice(3)
    out.add(local)
    out.add(`52${local}`)
  }
  return [...out]
}

function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, key: string) => vars[key] ?? '')
}

async function loadFollowupSettings(supabase: ReturnType<typeof createClient>) {
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

async function findWhatsAppIdentity(supabase: ReturnType<typeof createClient>, usuarioId: string) {
  const { data } = await supabase
    .from('user_channel_identities')
    .select('id,usuario_id,external_user_id,external_chat_id,status')
    .eq('channel', 'whatsapp')
    .eq('usuario_id', usuarioId)
    .eq('status', 'active')
    .maybeSingle()
  return data
}

async function graphSendMessage(body: Record<string, unknown>) {
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

function interactiveFollowupPayload(to: string, bodyText: string, buttonIdPrefix: string) {
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

function textPayload(to: string, text: string) {
  return {
    messaging_product: 'whatsapp',
    to,
    type: 'text',
    text: { preview_url: false, body: text.slice(0, 4090) },
  }
}

function templatePayload(
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

function extractMessageId(json: Record<string, unknown>): string | null {
  const messages = json.messages
  if (!Array.isArray(messages) || messages.length === 0) return null
  const first = messages[0] as { id?: unknown }
  return typeof first.id === 'string' ? first.id : null
}

type WaMessage = {
  id?: string
  from?: string
  timestamp?: string
  type?: string
  text?: { body?: string }
  button?: { payload?: string; text?: string }
  interactive?: {
    type?: string
    button_reply?: { id?: string; title?: string }
    list_reply?: { id?: string; title?: string }
  }
  image?: { id?: string; mime_type?: string; caption?: string }
  document?: { id?: string; mime_type?: string; filename?: string; caption?: string }
  audio?: { id?: string; mime_type?: string }
  video?: { id?: string; mime_type?: string; caption?: string }
}

function verifyChallenge(url: URL): Response | null {
  const mode = url.searchParams.get('hub.mode')
  const token = url.searchParams.get('hub.verify_token')
  const challenge = url.searchParams.get('hub.challenge')
  const expected =
    Deno.env.get('WHATSAPP_VERIFY_TOKEN')?.trim() ||
    Deno.env.get('token_de_verificacion')?.trim() ||
    ''
  if (mode === 'subscribe' && expected && token === expected && challenge) {
    return new Response(challenge, { status: 200, headers: { 'Content-Type': 'text/plain' } })
  }
  if (mode === 'subscribe') {
    console.error(
      'whatsapp-webhook verify failed',
      JSON.stringify({
        hasExpected: Boolean(expected),
        tokenLen: (token ?? '').length,
        challengeLen: (challenge ?? '').length,
      })
    )
    return new Response('forbidden', { status: 403 })
  }
  return null
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let out = 0
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return out === 0
}

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Meta Cloud API: X-Hub-Signature-256 = sha256=<hmac_hex(app_secret, raw_body)>. */
async function verifyMetaSignature(rawBody: string, signatureHeader: string | null): Promise<boolean> {
  const allowUnsigned = (Deno.env.get('WHATSAPP_WEBHOOK_ALLOW_UNSIGNED') || '').trim() === '1'
  if (allowUnsigned) return true

  const appSecret = Deno.env.get('WHATSAPP_APP_SECRET')?.trim() || ''
  if (!appSecret) {
    // Fail-open: HMAC fail-closed sin App Secret deja inbound en 0 (botón y statuses muertos).
    console.error('whatsapp-webhook missing WHATSAPP_APP_SECRET; accepting without HMAC')
    return true
  }
  const provided = (signatureHeader ?? '').trim()
  const match = /^sha256=([a-fA-F0-9]{64})$/.exec(provided)
  if (!match) return false

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(appSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody))
  return timingSafeEqualHex(toHex(digest).toLowerCase(), match[1].toLowerCase())
}

function parseButtonId(raw: string | null | undefined): {
  kind: 'action' | 'corporate' | 'team' | null
  accionId?: string
  checkpointId?: string
  teamActionId?: string
  checklistIndex?: number
  action: 'done' | 'progress' | 'support' | null
} {
  const value = (raw ?? '').trim()
  const act = /^act:([0-9a-fA-F-]{36}):(done|progress|support)$/i.exec(value)
  if (act) {
    return {
      kind: 'action',
      accionId: act[1],
      action: act[2].toLowerCase() as 'done' | 'progress' | 'support',
    }
  }
  const corp = /^chk:([0-9a-fA-F-]{36}):(done|progress|support)$/i.exec(value)
  if (corp) {
    return {
      kind: 'corporate',
      checkpointId: corp[1],
      action: corp[2].toLowerCase() as 'done' | 'progress' | 'support',
    }
  }
  const team = /^tchk:([0-9a-fA-F-]{36}):(\d+):(done|progress|support)$/i.exec(value)
  if (team) {
    return {
      kind: 'team',
      teamActionId: team[1],
      checklistIndex: Number(team[2]),
      action: team[3].toLowerCase() as 'done' | 'progress' | 'support',
    }
  }
  return { kind: null, action: null }
}

function inferTextAction(text: string): 'done' | 'progress' | 'support' | null {
  const t = text
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
  if (!t) return null
  if (/\b(realizada|realizado|hecho|done|completad[oa]|lista|listo)\b/.test(t)) return 'done'
  if (/\b(en progreso|en proceso|proceso|avance|avanzando|progress|trabajando)\b/.test(t)) {
    return 'progress'
  }
  if (/\b(requiero apoyo|necesito apoyo|necesito ayuda|ayuda|support|bloquead[oa]|apoyo)\b/.test(t)) {
    return 'support'
  }
  return null
}

function isVerActividadesButton(rawId: string | null | undefined, title: string | null | undefined) {
  const fold = (value: string) =>
    value
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[_-]+/g, ' ')
  const id = fold(rawId ?? '')
  const label = fold(title ?? '')
  const haystack = `${id} ${label}`
  if (
    id === 'ver actividades' ||
    id === '/actividades' ||
    id === 'actividades' ||
    id.includes('ver_actividades') ||
    id.includes('mas informacion') ||
    id === 'more info'
  ) {
    return true
  }
  // Plantilla Meta: botón "Más información" (quick reply) o "Ver actividades" / comando /actividades
  return (
    /ver actividades/.test(haystack) ||
    /mas informacion/.test(haystack) ||
    /(^|\s)\/?actividades\b/.test(haystack)
  )
}

function inboundPreview(message: WaMessage): string {
  const type = message.type ?? 'unknown'
  const text = message.text?.body?.trim()
  if (text) return text
  const buttonTitle =
    message.interactive?.button_reply?.title ||
    message.button?.text ||
    message.interactive?.list_reply?.title
  if (buttonTitle) return buttonTitle
  const caption =
    message.image?.caption || message.document?.caption || message.video?.caption || message.document?.filename
  if (caption) return caption
  if (type === 'image') return '[Imagen]'
  if (type === 'document') return '[Documento]'
  if (type === 'audio') return '[Audio]'
  if (type === 'video') return '[Video]'
  if (type === 'interactive' || type === 'button') return '[Botón]'
  return `[${type}]`
}

async function upsertThreadMessage(
  supabase: ReturnType<typeof adminClient>,
  row: Record<string, unknown>
) {
  const metaId = typeof row.meta_message_id === 'string' ? row.meta_message_id : null
  if (metaId) {
    const { data: existing } = await supabase
      .from('whatsapp_messages')
      .select('id')
      .eq('meta_message_id', metaId)
      .maybeSingle()
    if (existing?.id) return existing.id as string
  }
  const { data, error } = await supabase.from('whatsapp_messages').insert(row).select('id').maybeSingle()
  if (error) {
    // Carrera por meta_message_id único
    if (metaId && String(error.message || '').includes('meta_message_id')) {
      const { data: again } = await supabase
        .from('whatsapp_messages')
        .select('id')
        .eq('meta_message_id', metaId)
        .maybeSingle()
      return (again?.id as string | undefined) ?? null
    }
    console.error('whatsapp_messages insert failed', error)
    return null
  }
  return (data?.id as string | undefined) ?? null
}

/** Normaliza error de status webhook Meta a JSON estable (code/title/message). */
function normalizeMetaStatusError(err: unknown): {
  errorMessage: string
  errorCode: number | null
  verdict: 'ERROR_META'
} {
  const root =
    err && typeof err === 'object' && !Array.isArray(err)
      ? (err as Record<string, unknown>)
      : null
  const codeRaw = root?.code
  const errorCode =
    typeof codeRaw === 'number'
      ? codeRaw
      : typeof codeRaw === 'string' && /^\d+$/.test(codeRaw)
        ? Number(codeRaw)
        : null
  const payload = {
    code: errorCode,
    title: typeof root?.title === 'string' ? root.title : null,
    message: typeof root?.message === 'string' ? root.message : null,
    error_data: root?.error_data ?? null,
    href: typeof root?.href === 'string' ? root.href : null,
    verdict: 'ERROR_META' as const,
    source: 'meta_status_webhook',
  }
  return {
    errorMessage: JSON.stringify(payload).slice(0, 2000),
    errorCode,
    verdict: 'ERROR_META',
  }
}

async function applyMetaStatus(
  supabase: ReturnType<typeof adminClient>,
  statusEvent: { id?: string; status?: string; timestamp?: string; errors?: unknown[] }
) {
  const metaId = statusEvent.id
  const status = statusEvent.status
  if (!metaId || !status) return

  const ts = statusEvent.timestamp
    ? new Date(Number(statusEvent.timestamp) * 1000).toISOString()
    : new Date().toISOString()

  const patch: Record<string, unknown> = {}
  let failedNorm: ReturnType<typeof normalizeMetaStatusError> | null = null
  if (status === 'sent') {
    patch.delivery_status = 'sent'
    patch.sent_at = ts
  } else if (status === 'delivered') {
    patch.delivery_status = 'delivered'
    patch.delivered_at = ts
  } else if (status === 'read') {
    patch.delivery_status = 'read'
    patch.read_at = ts
  } else if (status === 'failed') {
    patch.delivery_status = 'failed'
    patch.failed_at = ts
    const err = Array.isArray(statusEvent.errors) ? statusEvent.errors[0] : null
    failedNorm = normalizeMetaStatusError(err ?? { message: 'meta_status_failed' })
    patch.error_message = failedNorm.errorMessage
  } else {
    return
  }

  // No degradar read → delivered, etc.
  const { data: current } = await supabase
    .from('whatsapp_messages')
    .select('id,delivery_status,payload')
    .eq('meta_message_id', metaId)
    .maybeSingle()

  if (current?.id) {
    const rank: Record<string, number> = {
      queued: 0,
      sent: 1,
      delivered: 2,
      read: 3,
      failed: 99,
    }
    const cur = rank[String(current.delivery_status)] ?? 0
    const next = rank[String(patch.delivery_status)] ?? 0
    // Solo avanzar (o marcar failed). No degradar read→delivered ni delivered→sent.
    if (next > cur || patch.delivery_status === 'failed') {
      if (failedNorm) {
        const prevPayload =
          current.payload && typeof current.payload === 'object' && !Array.isArray(current.payload)
            ? (current.payload as Record<string, unknown>)
            : {}
        patch.payload = {
          ...prevPayload,
          delivery_verdict: failedNorm.verdict,
          meta_error_code: failedNorm.errorCode,
          meta_status: 'failed',
        }
      } else if (status === 'delivered' || status === 'read') {
        const prevPayload =
          current.payload && typeof current.payload === 'object' && !Array.isArray(current.payload)
            ? (current.payload as Record<string, unknown>)
            : {}
        patch.payload = {
          ...prevPayload,
          delivery_verdict: 'OK_ENTREGADO',
          meta_status: status,
        }
      }
      await supabase.from('whatsapp_messages').update(patch).eq('id', current.id)
    }
  }

  if (status === 'failed') {
    await supabase
      .from('action_delivery_log')
      .update({
        delivery_status: 'failed',
        error_message: (patch.error_message as string) || 'meta_status_failed',
      })
      .eq('external_message_id', metaId)
      .eq('channel', 'whatsapp')
    console.error('whatsapp meta delivery failed', {
      wamid: metaId,
      code: failedNorm?.errorCode ?? null,
      error: patch.error_message,
    })
  }
}

async function replyText(
  supabase: ReturnType<typeof adminClient>,
  to: string,
  body: string,
  usuarioId?: string | null,
  extras?: Record<string, unknown>
) {
  try {
    const graphBody = textPayload(to, body)
    if (extras?.preview_url === true && graphBody.text) {
      graphBody.text.preview_url = true
    }
    const result = await graphSendMessage(graphBody)
    const metaId = extractMessageId(result.json)
    const flow = typeof extras?.flow === 'string' ? extras.flow : 'ops'
    await upsertThreadMessage(supabase, {
      wa_id: to,
      usuario_id: usuarioId ?? null,
      direction: 'outbound',
      source: 'automation',
      message_kind: 'text',
      body_text: body,
      meta_message_id: metaId,
      delivery_status: result.ok ? 'sent' : 'failed',
      error_message: result.ok ? null : result.raw.slice(0, 2000),
      sent_at: result.ok ? new Date().toISOString() : null,
      failed_at: result.ok ? null : new Date().toISOString(),
      payload: {
        request: graphBody,
        response: result.json,
        source: 'webhook_auto_reply',
        flow,
        ...(extras ?? {}),
      },
    })
  } catch (error) {
    console.error('whatsapp reply failed', error)
  }
}

function parseAiOpButton(raw: string | null | undefined): { opId: string; action: 'confirm' | 'cancel' } | null {
  const match = /^aiop:([0-9a-fA-F-]{36}):(ok|no)$/i.exec((raw ?? '').trim())
  if (!match) return null
  return { opId: match[1], action: match[2].toLowerCase() === 'ok' ? 'confirm' : 'cancel' }
}

function whatsappAiEnabled() {
  const flag = (Deno.env.get('WHATSAPP_AI_ENABLED') || '').trim().toLowerCase()
  if (flag === '0' || flag === 'false' || flag === 'no') return false
  if (flag === '1' || flag === 'true' || flag === 'yes') return true
  // Si el cerebro está configurado, encender aunque falte el flag explícito.
  const secret = Deno.env.get('WHATSAPP_ASSISTANT_SECRET')?.trim() || ''
  const base = (Deno.env.get('APP_URL') || Deno.env.get('VITE_APP_URL') || '').trim()
  return Boolean(secret && base)
}

function interactiveAiOpPayload(to: string, bodyText: string, opId: string) {
  return {
    messaging_product: 'whatsapp',
    to,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: bodyText.slice(0, 1024) },
      action: {
        buttons: [
          { type: 'reply', reply: { id: `aiop:${opId}:ok`, title: 'Confirmar' } },
          { type: 'reply', reply: { id: `aiop:${opId}:no`, title: 'Cancelar' } },
        ],
      },
    },
  }
}

function interactiveChannelSelectorPayload(to: string) {
  const bodyText = [
    '¡Hola! Soy tu asistente operativo de Scrumban.',
    '',
    'Puedo ayudarte a consultar actividades, revisar prioridades, resolver bloqueos y dar seguimiento a tus objetivos.',
    '',
    '¿Cómo prefieres conversar?',
  ].join('\n')
  return {
    messaging_product: 'whatsapp',
    to,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: bodyText.slice(0, 1024) },
      action: {
        buttons: [
          { type: 'reply', reply: { id: 'aich:text', title: 'Por mensaje' } },
          { type: 'reply', reply: { id: 'aich:voice', title: 'Por voz' } },
        ],
      },
    },
  }
}

async function replyChannelSelector(
  supabase: ReturnType<typeof adminClient>,
  to: string,
  usuarioId: string
) {
  try {
    const graphBody = interactiveChannelSelectorPayload(to)
    const result = await graphSendMessage(graphBody)
    const metaId = extractMessageId(result.json)
    await upsertThreadMessage(supabase, {
      wa_id: to,
      usuario_id: usuarioId,
      direction: 'outbound',
      source: 'automation',
      message_kind: 'interactive',
      body_text: 'Selector de canal: Por mensaje / Por voz',
      meta_message_id: metaId,
      delivery_status: result.ok ? 'sent' : 'failed',
      error_message: result.ok ? null : result.raw.slice(0, 2000),
      sent_at: result.ok ? new Date().toISOString() : null,
      failed_at: result.ok ? null : new Date().toISOString(),
      payload: {
        request: graphBody,
        response: result.json,
        source: 'webhook_channel_selector',
        flow: 'agent',
        agent_consult: true,
        event: 'bot_start_selector_sent',
      },
    })
  } catch (error) {
    console.error('whatsapp channel selector failed', error)
  }
}

async function handleAgentChannelText(
  supabase: ReturnType<typeof adminClient>,
  params: { waId: string; usuarioId: string }
) {
  await replyText(
    supabase,
    params.waId,
    [
      'Perfecto. Podemos continuar por aquí.',
      '',
      'Puedes preguntarme por tus pendientes, prioridades, acciones bloqueadas u OKRs. ¿Qué necesitas revisar?',
    ].join('\n'),
    params.usuarioId,
    { flow: 'agent', agent_consult: true, event: 'channel_text_selected' }
  )
}

async function createAndSendVoiceLink(
  supabase: ReturnType<typeof adminClient>,
  params: { waId: string; usuarioId: string }
) {
  const secret = Deno.env.get('WHATSAPP_ASSISTANT_SECRET')?.trim() || ''
  const base = (Deno.env.get('APP_URL') || Deno.env.get('VITE_APP_URL') || '').trim().replace(/\/$/, '')
  if (!secret || !base) {
    await replyText(
      supabase,
      params.waId,
      'No pude generar la liga de voz ahora (configuración incompleta). Intenta Por mensaje o vuelve en unos minutos.',
      params.usuarioId,
      { flow: 'agent', event: 'voice_link_config_missing' }
    )
    return
  }

  try {
    const response = await fetch(`${base}/api/create-guide-user-link`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-whatsapp-assistant-secret': secret,
      },
      body: JSON.stringify({
        usuario_id: params.usuarioId,
        expires_in_days: 7,
        source: 'whatsapp',
      }),
    })
    const json = (await response.json().catch(() => ({}))) as {
      link?: string
      error?: string
    }
    if (!response.ok || !json.link) {
      await replyText(
        supabase,
        params.waId,
        json.error?.slice(0, 180) ||
          'No pude generar la liga de voz ahora. Intenta de nuevo en unos minutos o usa Por mensaje.',
        params.usuarioId,
        { flow: 'agent', event: 'voice_link_error' }
      )
      return
    }
    await replyText(
      supabase,
      params.waId,
      [
        'Perfecto. Puedes hablar conmigo por voz desde este enlace:',
        '',
        json.link,
        '',
        'Al abrirlo, podrás iniciar la conversación con tu asistente operativo.',
      ].join('\n'),
      params.usuarioId,
      {
        flow: 'agent',
        agent_consult: true,
        event: 'voice_link_sent',
        preview_url: true,
      }
    )
  } catch (error) {
    console.error('whatsapp voice link', error)
    await replyText(
      supabase,
      params.waId,
      'No pude generar la liga de voz ahora. Intenta de nuevo en unos minutos.',
      params.usuarioId,
      { flow: 'agent', event: 'voice_link_exception' }
    )
  }
}

async function replyAi(
  supabase: ReturnType<typeof adminClient>,
  to: string,
  body: string,
  usuarioId: string | null,
  proposalId?: string | null
) {
  try {
    const canButtons = Boolean(proposalId && /^[0-9a-fA-F-]{36}$/.test(proposalId))
    const graphBody = canButtons
      ? interactiveAiOpPayload(to, body, proposalId as string)
      : textPayload(to, body)
    const result = await graphSendMessage(graphBody)
    const metaId = extractMessageId(result.json)
    await upsertThreadMessage(supabase, {
      wa_id: to,
      usuario_id: usuarioId ?? null,
      direction: 'outbound',
      source: 'ai',
      message_kind: canButtons ? 'interactive' : 'text',
      body_text: body,
      meta_message_id: metaId,
      delivery_status: result.ok ? 'sent' : 'failed',
      error_message: result.ok ? null : result.raw.slice(0, 2000),
      sent_at: result.ok ? new Date().toISOString() : null,
      failed_at: result.ok ? null : new Date().toISOString(),
      payload: {
        request: graphBody,
        response: result.json,
        source: 'webhook_ai_reply',
        flow: 'agent',
      },
    })
  } catch (error) {
    console.error('whatsapp ai reply failed', error)
  }
}

async function canUseAiWhatsApp(
  supabase: ReturnType<typeof adminClient>,
  usuarioId: string
): Promise<boolean> {
  if (!whatsappAiEnabled()) return false
  const { data: allowed, error } = await supabase.rpc('can_use_ai_whatsapp_for_usuario', {
    p_usuario_id: usuarioId,
  })
  if (error) {
    console.error('whatsapp-webhook AI access rpc', error.message)
    return false
  }
  return allowed === true
}

/** Sesión agent: outbound reciente con flow=agent (p. ej. tras «Consulta al Bot» o reply Gemini). */
async function hasActiveAgentSession(
  supabase: ReturnType<typeof adminClient>,
  waId: string
): Promise<boolean> {
  const variants = phoneVariants(waId)
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  let query = supabase
    .from('whatsapp_messages')
    .select('payload,created_at')
    .eq('direction', 'outbound')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(25)
  if (variants.length > 0) {
    query = query.in('wa_id', variants)
  } else {
    query = query.eq('wa_id', waId)
  }
  const { data, error } = await query
  if (error) {
    console.error('whatsapp-webhook agent session lookup', error.message)
    return false
  }
  return (data ?? []).some((row) => {
    const payload = (row.payload ?? {}) as Record<string, unknown>
    return payload.flow === 'agent' || payload.agent_consult === true
  })
}

type InboundRoute =
  | { kind: 'ops_button'; buttonId: string }
  | { kind: 'agent_aiop'; opId: string; action: 'confirm' | 'cancel' }
  | { kind: 'mas_info' }
  | { kind: 'agent_consult' }
  | { kind: 'agent_channel'; channel: 'text' | 'voice' }
  | { kind: 'ops_keyword'; action: 'done' | 'progress' | 'support'; text: string }
  | { kind: 'agent_free_text'; text: string }
  | { kind: 'ops_help'; text?: string }
  | { kind: 'ignore' }

/**
 * Debe espejar `src/lib/whatsappFlowRouting.ts` (anti-drift).
 * Rutas estructuradas no dependen de canUseAi; el texto libre sí.
 */
/** Etiqueta de hilo para inbound; mas_info cuenta como ops (disparador de gate mixto). */
function inboundFlowForRoute(route: InboundRoute): 'ops' | 'agent' {
  if (
    route.kind === 'agent_aiop' ||
    route.kind === 'agent_free_text' ||
    route.kind === 'agent_consult' ||
    route.kind === 'agent_channel'
  ) {
    return 'agent'
  }
  return 'ops'
}

function foldWaText(text: string | null | undefined) {
  return (text ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[_-]+/g, ' ')
}

function isConsultaAlBotText(text: string | null | undefined): boolean {
  const t = foldWaText(text)
  if (!t) return false
  if (
    t === 'consulta al bot' ||
    t === 'consulta' ||
    t === '/consulta' ||
    t === 'iniciar bot' ||
    t === 'iniciar asistente' ||
    t === 'hablar con el bot'
  ) {
    return true
  }
  return (
    /^\/consulta\b/.test(t) ||
    /\bconsulta al bot\b/.test(t) ||
    /\biniciar bot\b/.test(t) ||
    /\biniciar asistente\b/.test(t) ||
    /\bhablar con el bot\b/.test(t)
  )
}

function parseAiChannelButton(raw: string | null | undefined): 'text' | 'voice' | null {
  const id = (raw ?? '').trim().toLowerCase()
  if (id === 'aich:text' || id === 'aich_text') return 'text'
  if (id === 'aich:voice' || id === 'aich_voice') return 'voice'
  return null
}

function inferAiChannelText(text: string | null | undefined): 'text' | 'voice' | null {
  const t = foldWaText(text)
  if (!t) return null
  if (/\b(por voz|hablar por voz|quiero hablar por voz|prefiero voz|llamada de voz)\b/.test(t)) {
    return 'voice'
  }
  if (
    /\b(por mensaje|prefiero escribir|quiero escribir|hablar por mensaje|seguir por texto)\b/.test(t)
  ) {
    return 'text'
  }
  return null
}

/** Botones / media que no requieren RPC can_use_ai. null = hay que resolver texto libre. */
function resolveStructuredInboundRoute(input: {
  buttonId?: string | null
  buttonTitle?: string | null
  messageType?: string | null
}): InboundRoute | null {
  const buttonId = input.buttonId?.trim() || null
  const buttonTitle = input.buttonTitle?.trim() || null
  const messageType = input.messageType ?? ''

  const aiOp = parseAiOpButton(buttonId)
  if (aiOp) return { kind: 'agent_aiop', opId: aiOp.opId, action: aiOp.action }

  const channel = parseAiChannelButton(buttonId)
  if (channel) return { kind: 'agent_channel', channel }

  if (isVerActividadesButton(buttonId, buttonTitle)) return { kind: 'mas_info' }

  if (buttonId && /^(act|chk|tchk):/i.test(buttonId)) {
    return { kind: 'ops_button', buttonId }
  }

  if (
    messageType === 'image' ||
    messageType === 'document' ||
    messageType === 'audio' ||
    messageType === 'video'
  ) {
    return { kind: 'ignore' }
  }

  return null
}

function resolveInboundRoute(input: {
  canUseAi: boolean
  agentSessionActive?: boolean
  buttonId?: string | null
  buttonTitle?: string | null
  textBody?: string | null
  messageType?: string | null
}): InboundRoute {
  const structured = resolveStructuredInboundRoute(input)
  if (structured) return structured

  const buttonTitle = input.buttonTitle?.trim() || null
  const textBody = input.textBody?.trim() || null
  const messageType = input.messageType ?? ''
  const agentSessionActive = input.agentSessionActive === true

  const freeText =
    textBody ||
    (messageType === 'button' || messageType === 'interactive' ? buttonTitle : null) ||
    null
  if (!freeText) return { kind: 'ignore' }

  if (isConsultaAlBotText(freeText)) {
    return { kind: 'agent_consult' }
  }

  const channelText = inferAiChannelText(freeText)
  if (channelText) return { kind: 'agent_channel', channel: channelText }

  if (isVerActividadesButton(null, freeText)) {
    return { kind: 'mas_info' }
  }

  const action = inferTextAction(freeText)
  if (action) return { kind: 'ops_keyword', action, text: freeText }

  if (input.canUseAi && agentSessionActive) {
    return { kind: 'agent_free_text', text: freeText }
  }

  return { kind: 'ops_help', text: freeText }
}

async function callWhatsAppAssistant(input: {
  action: 'chat' | 'confirm' | 'cancel'
  waId: string
  usuarioId: string
  text?: string
  opId?: string
}): Promise<{ text: string; proposals?: Array<{ id?: string; title?: string; summary?: string }> } | null> {
  const secret = Deno.env.get('WHATSAPP_ASSISTANT_SECRET')?.trim() || ''
  const base = (Deno.env.get('APP_URL') || Deno.env.get('VITE_APP_URL') || '').trim().replace(/\/$/, '')
  if (!secret || !base) {
    console.error('whatsapp-webhook AI missing APP_URL or WHATSAPP_ASSISTANT_SECRET')
    return null
  }
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 20000)
  try {
    const response = await fetch(`${base}/api/whatsapp-assistant`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-whatsapp-assistant-secret': secret,
      },
      signal: controller.signal,
      body: JSON.stringify({
        action: input.action,
        wa_id: input.waId,
        usuario_id: input.usuarioId,
        text: input.text ?? '',
        op_id: input.opId ?? '',
      }),
    })
    const json = (await response.json()) as {
      text?: unknown
      proposals?: Array<{ id?: string; title?: string; summary?: string }>
      error?: unknown
    }
    const text = typeof json.text === 'string' ? json.text.trim() : ''
    if (!text) return { text: 'No pude consultar el tablero ahora.', proposals: [] }
    return { text, proposals: Array.isArray(json.proposals) ? json.proposals : [] }
  } catch (error) {
    console.error('whatsapp-webhook AI call failed', error)
    return { text: 'No pude consultar el tablero ahora.', proposals: [] }
  } finally {
    clearTimeout(timeout)
  }
}

async function maybeHandleWhatsAppAi(
  supabase: ReturnType<typeof adminClient>,
  input: {
    waId: string
    usuarioId: string
    action: 'chat' | 'confirm' | 'cancel'
    text?: string
    opId?: string
    /** Si ya se llamó a can_use_ai_whatsapp_for_usuario, evitar RPC duplicado. */
    aiAllowed?: boolean
  }
): Promise<boolean> {
  if (!whatsappAiEnabled()) return false
  let allowed = input.aiAllowed
  if (allowed === undefined) {
    const { data: rpcAllowed, error } = await supabase.rpc('can_use_ai_whatsapp_for_usuario', {
      p_usuario_id: input.usuarioId,
    })
    if (error) {
      console.error('whatsapp-webhook AI access rpc', error.message)
      return false
    }
    allowed = rpcAllowed === true
  }
  if (!allowed) return false
  const result = await callWhatsAppAssistant({
    action: input.action,
    waId: input.waId,
    usuarioId: input.usuarioId,
    text: input.text,
    opId: input.opId,
  })
  const text = result?.text || 'No pude consultar el tablero ahora.'
  const proposalId = result?.proposals?.[0]?.id
  await replyAi(supabase, input.waId, text, input.usuarioId, proposalId)
  return true
}

async function downloadWhatsAppMedia(mediaId: string): Promise<{
  bytes: Uint8Array
  mimeType: string
  fileName: string
}> {
  const { accessToken, graphVersion } = whatsappConfig()
  const metaRes = await fetch(`https://graph.facebook.com/${graphVersion}/${mediaId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const meta = (await metaRes.json()) as { url?: string; mime_type?: string }
  if (!metaRes.ok || !meta.url) throw new Error('media_meta_failed')
  const binRes = await fetch(meta.url, { headers: { Authorization: `Bearer ${accessToken}` } })
  if (!binRes.ok) throw new Error('media_download_failed')
  const mimeType = meta.mime_type || binRes.headers.get('content-type') || 'application/octet-stream'
  const bytes = new Uint8Array(await binRes.arrayBuffer())
  const ext =
    mimeType.includes('png')
      ? 'png'
      : mimeType.includes('jpeg') || mimeType.includes('jpg')
        ? 'jpg'
        : mimeType.includes('pdf')
          ? 'pdf'
          : mimeType.includes('csv')
            ? 'csv'
            : mimeType.includes('sheet') || mimeType.includes('excel')
              ? 'xlsx'
              : 'bin'
  return { bytes, mimeType, fileName: `${mediaId}.${ext}` }
}

async function findUsuarioByWa(
  supabase: ReturnType<typeof adminClient>,
  waId: string
) {
  const variants = phoneVariants(waId)
  if (variants.length === 0) return null
  const { data } = await supabase
    .from('user_channel_identities')
    .select('id,usuario_id,external_user_id')
    .eq('channel', 'whatsapp')
    .eq('status', 'active')
    .or(`external_user_id.in.(${variants.join(',')}),external_chat_id.in.(${variants.join(',')})`)
    .limit(1)
  return data?.[0] ?? null
}

async function resolveTeamStateId(
  supabase: ReturnType<typeof adminClient>,
  prefer: 'final' | 'progress' | 'blocked'
): Promise<string | null> {
  const { data: rows } = await supabase
    .from('statuses')
    .select('id,nombre,es_cierre,orden,activo')
    .eq('activo', true)
    .order('orden', { ascending: true })

  const list = rows ?? []
  if (prefer === 'final') {
    return (
      list.find((r) => r.es_cierre && /hecho/i.test(r.nombre))?.id ??
      list.find((r) => r.es_cierre)?.id ??
      null
    )
  }
  if (prefer === 'blocked') {
    // Requiero apoyo → columna Retraso (o alias vencido); Bloqueado solo como fallback.
    return (
      list.find((r) => /retraso|vencid|atrasad/i.test(r.nombre) && !r.es_cierre)?.id ??
      list.find((r) => /bloquead/i.test(r.nombre) && !r.es_cierre)?.id ??
      null
    )
  }
  return (
    list.find((r) => /en_ejecucion|ejecucion/i.test(r.nombre) && !r.es_cierre)?.id ??
    list.find((r) => /proceso|progreso|hoy/i.test(r.nombre) && !r.es_cierre)?.id ??
    list.find((r) => !r.es_cierre)?.id ??
    null
  )
}

async function applyActionResponse(
  supabase: ReturnType<typeof adminClient>,
  params: {
    accionId: string
    action: 'done' | 'progress' | 'support'
    usuarioId: string
    waId: string
  }
) {
  const { data: actionRow } = await supabase
    .from('acciones_diarias')
    .select('id,estado,responsable,titulo_accion')
    .eq('id', params.accionId)
    .maybeSingle()
  if (!actionRow) return { ok: false as const, reason: 'action_not_found' }

  if (params.action === 'support') {
    await supabase.from('acciones_diarias').update({ estado: 'Retraso' }).eq('id', actionRow.id)
    return {
      ok: true as const,
      askResult: false,
      askSupport: true,
      accionId: actionRow.id,
      titulo: actionRow.titulo_accion ?? 'Actividad',
    }
  }

  if (params.action === 'progress') {
    if (actionRow.estado !== 'Bloqueado') {
      await supabase.from('acciones_diarias').update({ estado: 'En_Ejecucion' }).eq('id', actionRow.id)
    }
    await supabase.from('whatsapp_result_requests').insert({
      scope: 'corporate',
      accion_id: actionRow.id,
      checkpoint_id: null,
      usuario_id: params.usuarioId,
      wa_id: params.waId,
      status: 'waiting',
      expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    })
    return {
      ok: true as const,
      askResult: true,
      askSupport: false,
      accionId: actionRow.id,
      titulo: actionRow.titulo_accion ?? 'Actividad',
      resultLabel: 'En proceso' as const,
    }
  }

  // done — todos los checkpoints activos pendientes
  const { data: pending } = await supabase
    .from('accion_checkpoints')
    .select('id')
    .eq('accion_id', actionRow.id)
    .eq('activo', true)
    .eq('completado', false)

  const nowIso = new Date().toISOString()
  for (const cp of pending ?? []) {
    await supabase
      .from('accion_checkpoints')
      .update({
        completado: true,
        checked_at: nowIso,
        checked_by: params.usuarioId,
      })
      .eq('id', cp.id)
  }

  await supabase
    .from('acciones_diarias')
    .update({
      estado: 'Hecho',
      completed_at: nowIso,
      completed_by: params.usuarioId,
    })
    .eq('id', actionRow.id)

  await supabase
    .from('whatsapp_followup_jobs')
    .update({ status: 'canceled', updated_at: nowIso })
    .eq('scope', 'corporate')
    .eq('accion_id', actionRow.id)
    .eq('status', 'pending')

  await supabase.from('whatsapp_result_requests').insert({
    scope: 'corporate',
    accion_id: actionRow.id,
    checkpoint_id: null,
    usuario_id: params.usuarioId,
    wa_id: params.waId,
    status: 'waiting',
    expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
  })

  return {
    ok: true as const,
    askResult: true,
    askSupport: false,
    accionId: actionRow.id,
    titulo: actionRow.titulo_accion ?? 'Actividad',
    resultLabel: 'Realizada' as const,
  }
}

async function handleCorporateAction(
  supabase: ReturnType<typeof adminClient>,
  params: {
    checkpointId: string
    action: 'done' | 'progress' | 'support'
    usuarioId: string
    waId: string
  }
) {
  const { data: checkpoint } = await supabase
    .from('accion_checkpoints')
    .select('id,accion_id,texto,completado,activo')
    .eq('id', params.checkpointId)
    .maybeSingle()
  if (!checkpoint?.accion_id) return { ok: false as const, reason: 'checkpoint_not_found' }

  const { data: actionRow } = await supabase
    .from('acciones_diarias')
    .select('id,estado,responsable,titulo_accion')
    .eq('id', checkpoint.accion_id)
    .maybeSingle()
  if (!actionRow) return { ok: false as const, reason: 'action_not_found' }

  if (params.action === 'support') {
    await supabase
      .from('acciones_diarias')
      .update({ estado: 'Retraso' })
      .eq('id', actionRow.id)
    return {
      ok: true as const,
      askResult: false,
      askSupport: true,
      accionId: actionRow.id,
      titulo: actionRow.titulo_accion ?? 'Actividad',
    }
  }

  if (params.action === 'progress') {
    if (actionRow.estado !== 'Bloqueado') {
      await supabase
        .from('acciones_diarias')
        .update({ estado: 'En_Ejecucion' })
        .eq('id', actionRow.id)
    }
    await supabase.from('whatsapp_result_requests').insert({
      scope: 'corporate',
      accion_id: actionRow.id,
      checkpoint_id: checkpoint.id,
      usuario_id: params.usuarioId,
      wa_id: params.waId,
      status: 'waiting',
      expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    })
    return {
      ok: true as const,
      askResult: true,
      askSupport: false,
      accionId: actionRow.id,
      titulo: actionRow.titulo_accion ?? 'Actividad',
      resultLabel: 'En proceso' as const,
    }
  }

  // done — update directo (service role; RPC exige auth.uid())
  await supabase
    .from('accion_checkpoints')
    .update({
      completado: true,
      checked_at: new Date().toISOString(),
      checked_by: params.usuarioId,
    })
    .eq('id', checkpoint.id)

  const { data: pending } = await supabase
    .from('accion_checkpoints')
    .select('id')
    .eq('accion_id', actionRow.id)
    .eq('activo', true)
    .eq('completado', false)

  const allDone = !pending || pending.length === 0
  await supabase
    .from('acciones_diarias')
    .update({
      estado: allDone ? 'Hecho' : 'En_Ejecucion',
      ...(allDone
        ? { completed_at: new Date().toISOString(), completed_by: params.usuarioId }
        : {}),
    })
    .eq('id', actionRow.id)

  await supabase
    .from('whatsapp_followup_jobs')
    .update({ status: 'canceled', updated_at: new Date().toISOString() })
    .eq('scope', 'corporate')
    .eq('checkpoint_id', checkpoint.id)
    .eq('status', 'pending')

  await supabase.from('whatsapp_result_requests').insert({
    scope: 'corporate',
    accion_id: actionRow.id,
    checkpoint_id: checkpoint.id,
    usuario_id: params.usuarioId,
    wa_id: params.waId,
    status: 'waiting',
    expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
  })

  return {
    ok: true as const,
    askResult: true,
    askSupport: false,
    accionId: actionRow.id,
    titulo: actionRow.titulo_accion ?? 'Actividad',
    resultLabel: 'Realizada' as const,
  }
}

async function handleTeamAction(
  supabase: ReturnType<typeof adminClient>,
  params: {
    teamActionId: string
    checklistIndex: number
    action: 'done' | 'progress' | 'support'
    usuarioId: string
    waId: string
  }
) {
  const { data: team } = await supabase
    .from('acciones_equipo')
    .select('id,area_id,estado_id,asignado_a,checklist,bloqueada')
    .eq('id', params.teamActionId)
    .maybeSingle()
  if (!team) return { ok: false as const, reason: 'team_action_not_found' }

  if (params.action === 'support') {
    const blockedState = await resolveTeamStateId(supabase, 'blocked')
    await supabase
      .from('acciones_equipo')
      .update({
        bloqueada: true,
        ...(blockedState ? { estado_id: blockedState } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq('id', team.id)
    return { ok: true as const, askResult: false, teamActionId: team.id }
  }

  if (params.action === 'progress') {
    if (!team.bloqueada) {
      const progressState = await resolveTeamStateId(supabase, 'progress')
      await supabase
        .from('acciones_equipo')
        .update({
          ...(progressState ? { estado_id: progressState } : {}),
          updated_at: new Date().toISOString(),
        })
        .eq('id', team.id)
    }
    await supabase.from('whatsapp_result_requests').insert({
      scope: 'team',
      team_action_id: team.id,
      checklist_index: params.checklistIndex,
      usuario_id: params.usuarioId,
      wa_id: params.waId,
      status: 'waiting',
      expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    })
    return { ok: true as const, askResult: true, teamActionId: team.id }
  }

  const checklist = Array.isArray(team.checklist) ? [...(team.checklist as Array<Record<string, unknown>>)] : []
  if (params.checklistIndex < 0 || params.checklistIndex >= checklist.length) {
    return { ok: false as const, reason: 'checklist_index_out_of_range' }
  }
  const item = { ...(checklist[params.checklistIndex] ?? {}) }
  item.done = true
  item.checked_at = new Date().toISOString()
  item.checked_by = params.usuarioId
  checklist[params.checklistIndex] = item

  const allDone = checklist.length === 0 || checklist.every((row) => Boolean(row.done))
  const nextState = await resolveTeamStateId(supabase, allDone ? 'final' : 'progress')

  await supabase
    .from('acciones_equipo')
    .update({
      checklist,
      bloqueada: false,
      ...(nextState ? { estado_id: nextState } : {}),
      ...(allDone ? { completed_at: new Date().toISOString() } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq('id', team.id)

  await supabase
    .from('whatsapp_followup_jobs')
    .update({ status: 'canceled', updated_at: new Date().toISOString() })
    .eq('scope', 'team')
    .eq('team_action_id', team.id)
    .eq('checklist_index', params.checklistIndex)
    .eq('status', 'pending')

  await supabase.from('whatsapp_result_requests').insert({
    scope: 'team',
    team_action_id: team.id,
    checklist_index: params.checklistIndex,
    usuario_id: params.usuarioId,
    wa_id: params.waId,
    status: 'waiting',
    expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
  })

  return { ok: true as const, askResult: true, teamActionId: team.id }
}

async function requestResultComment(
  supabase: ReturnType<typeof adminClient>,
  params: {
    waId: string
    usuarioId: string
    label: 'Realizada' | 'En proceso'
    accionId?: string | null
  }
) {
  const lines: string[] = [`*${params.label}*`, '', 'Responde con el numero de actividad y tu avance.', '', '*Actividades*']
  if (params.accionId) {
    const { data: action } = await supabase
      .from('acciones_diarias')
      .select('titulo_accion')
      .eq('id', params.accionId)
      .maybeSingle()
    lines.push(`1. ${action?.titulo_accion ?? 'Actividad'}`)
  } else {
    const { data: openActions } = await supabase
      .from('acciones_diarias')
      .select('titulo_accion,estado')
      .eq('responsable', params.usuarioId)
      .not('estado', 'in', '(Hecho,Verificado)')
      .order('updated_at', { ascending: false })
      .limit(8)
    if (openActions && openActions.length > 0) {
      openActions.forEach((row, i) => {
        lines.push(`${i + 1}. ${row.titulo_accion ?? 'Actividad'}`)
      })
    } else {
      lines.push('1. (sin actividades abiertas)')
    }
  }
  lines.push('', 'Puedes enviar texto, foto, PDF o Excel.')
  await replyText(supabase, params.waId, lines.join('\n'), params.usuarioId)
}

async function sendSupportContactPrompt(
  supabase: ReturnType<typeof adminClient>,
  params: { waId: string; usuarioId: string; titulo?: string }
) {
  const title = params.titulo ? ` (${params.titulo})` : ''
  await replyText(
    supabase,
    params.waId,
    [
      `Registramos que requieres apoyo${title}. La actividad quedó en Retraso.`,
      '',
      'Escribe a tu lider o responde aqui con el bloqueo concreto para dar seguimiento.',
    ].join('\n'),
    params.usuarioId,
    { support_contact_sent: true }
  )
}

function fitInteractiveBody(text: string) {
  const clean = text.trim()
  if (clean.length <= 1024) return clean
  return `${clean.slice(0, 1000).trim()}…`
}

async function sendLatestActionFollowupButtons(
  supabase: ReturnType<typeof adminClient>,
  params: { waId: string; usuarioId: string }
) {
  const variants = phoneVariants(params.waId)
  const { data: deliveries } = await supabase
    .from('action_delivery_log')
    .select('accion_id,payload,created_at,external_chat_id')
    .eq('channel', 'whatsapp')
    .eq('usuario_id', params.usuarioId)
    .eq('delivery_status', 'sent')
    .order('created_at', { ascending: false })
    .limit(15)

  const latestInitial = (deliveries ?? []).find((row) => {
    const payload = (row.payload ?? {}) as Record<string, unknown>
    const phoneOk =
      variants.length === 0 ||
      variants.includes(String(row.external_chat_id ?? '')) ||
      variants.includes(String(payload.wa_id ?? ''))
    return phoneOk && payload.message_type === 'initial' && row.accion_id
  })

  let accionId = latestInitial?.accion_id as string | undefined
  if (!accionId) {
    const { data: openAction } = await supabase
      .from('acciones_diarias')
      .select('id')
      .eq('responsable', params.usuarioId)
      .not('estado', 'in', '(Hecho,Verificado)')
      .order('fecha', { ascending: false })
      .limit(1)
      .maybeSingle()
    accionId = openAction?.id
  }
  if (!accionId) return false

  const { data: action } = await supabase
    .from('acciones_diarias')
    .select('id,titulo_accion,estado')
    .eq('id', accionId)
    .maybeSingle()
  if (!action || action.estado === 'Hecho' || action.estado === 'Verificado') return false

  const { data: pendingCheckpoints } = await supabase
    .from('accion_checkpoints')
    .select('texto,completado,activo,orden')
    .eq('accion_id', action.id)
    .eq('activo', true)
    .eq('completado', false)
    .order('orden', { ascending: true })

  const pendingLines = (pendingCheckpoints ?? []).map((c) =>
    typeof c.texto === 'string' && c.texto.trim() ? c.texto.trim() : 'Checkpoint'
  )
  const list =
    pendingLines.length > 0
      ? pendingLines.map((line, i) => `${i + 1}. ${line}`).join('\n')
      : '1. (sin checkpoints pendientes)'
  const bodyText = fitInteractiveBody(
    [
      `Seguimiento: ${action.titulo_accion ?? 'Actividad'}`,
      '',
      'Pendientes:',
      list,
      '',
      'Responde con el boton: Realizada, En proceso o Requiero apoyo.',
    ].join('\n')
  )
  const graphBody = interactiveFollowupPayload(params.waId, bodyText, `act:${action.id}`)
  const result = await graphSendMessage(graphBody)
  const metaId = extractMessageId(result.json)
  await upsertThreadMessage(supabase, {
    wa_id: params.waId,
    usuario_id: params.usuarioId,
    direction: 'outbound',
    source: 'automation',
    message_kind: 'interactive',
    body_text: bodyText,
    meta_message_id: metaId,
    delivery_status: result.ok ? 'sent' : 'failed',
    error_message: result.ok ? null : result.raw.slice(0, 2000),
    sent_at: result.ok ? new Date().toISOString() : null,
    failed_at: result.ok ? null : new Date().toISOString(),
    payload: {
      request: graphBody,
      response: result.json,
      source: 'template_button_followup',
      message_type: 'checkpoint_followup',
      target_type: 'action',
      flow: 'ops',
    },
  })
  await supabase.from('action_delivery_log').insert({
    accion_id: action.id,
    usuario_id: params.usuarioId,
    channel: 'whatsapp',
    external_chat_id: params.waId,
    external_message_id: metaId,
    delivery_status: result.ok ? 'sent' : 'failed',
    error_message: result.ok ? null : result.raw.slice(0, 2000),
    sent_at: result.ok ? new Date().toISOString() : null,
    payload: {
      message_type: 'checkpoint_followup',
      checkpoint_id: null,
      wa_id: params.waId,
      source: 'template_button',
      target_type: 'action',
      flow: 'ops',
      request: graphBody,
      response: result.json,
    },
  })
  if (result.ok) {
    await supabase
      .from('whatsapp_followup_jobs')
      .update({
        status: 'sent',
        sent_at: new Date().toISOString(),
        error_message: 'sent_on_template_button',
      })
      .eq('accion_id', action.id)
      .eq('usuario_id', params.usuarioId)
      .eq('status', 'pending')
  }
  return result.ok
}

async function handleVerActividades(
  supabase: ReturnType<typeof adminClient>,
  params: { waId: string; usuarioId: string }
) {
  const { data: openActions } = await supabase
    .from('acciones_diarias')
    .select('titulo_accion,estado,fecha')
    .eq('responsable', params.usuarioId)
    .not('estado', 'in', '(Hecho,Verificado)')
    .order('fecha', { ascending: true })
    .limit(12)

  if (!openActions || openActions.length === 0) {
    await replyText(
      supabase,
      params.waId,
      'No tienes actividades abiertas en el tablero.',
      params.usuarioId,
      { flow: 'ops' }
    )
    return
  }

  const lines = ['*Tus actividades abiertas*', '']
  openActions.forEach((row, i) => {
    lines.push(
      `${i + 1}. ${row.titulo_accion ?? 'Actividad'} — ${row.estado ?? '?'} (compromiso: ${row.fecha ?? 's/f'})`
    )
  })
  lines.push(
    '',
    'Usa los botones del recordatorio (Realizada / En proceso / Requiero apoyo) para reportar avance.',
    'Para el asistente, usa el disparador Consulta al Bot.'
  )
  await replyText(supabase, params.waId, lines.join('\n'), params.usuarioId, { flow: 'ops' })
}

/**
 * Botón / disparador "Más información" / "Ver actividades":
 * - Solo Ops (listado o botones follow-up)
 * - No abre Gemini; el asistente entra por «Consulta al Bot»
 */
async function handleMasInformacion(
  supabase: ReturnType<typeof adminClient>,
  params: { waId: string; usuarioId: string; canUseAi: boolean }
) {
  void params.canUseAi
  const sentButtons = await sendLatestActionFollowupButtons(supabase, params)
  if (!sentButtons) {
    await handleVerActividades(supabase, {
      waId: params.waId,
      usuarioId: params.usuarioId,
    })
  }
}

async function handleEvidence(
  supabase: ReturnType<typeof adminClient>,
  params: {
    waId: string
    usuarioId: string
    message: WaMessage
  }
) {
  const nowIso = new Date().toISOString()
  const variants = phoneVariants(params.waId)
  const { data: waiting } = await supabase
    .from('whatsapp_result_requests')
    .select('id,scope,accion_id,team_action_id,checkpoint_id,checklist_index,expires_at')
    .in('wa_id', variants.length ? variants : [params.waId])
    .eq('status', 'waiting')
    .gt('expires_at', nowIso)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!waiting) return false

  const textBody =
    params.message.text?.body?.trim() ||
    params.message.image?.caption?.trim() ||
    params.message.document?.caption?.trim() ||
    ''

  const adjuntos: Array<Record<string, unknown>> = []
  const mediaId =
    params.message.image?.id ||
    params.message.document?.id ||
    params.message.video?.id ||
    params.message.audio?.id ||
    null

  if (mediaId) {
    const media = await downloadWhatsAppMedia(mediaId)
    const pathPrefix =
      waiting.scope === 'team' ? `equipo/${waiting.team_action_id}` : `acciones/${waiting.accion_id}`
    const storagePath = `${pathPrefix}/whatsapp/${Date.now()}_${media.fileName}`
    const { error: uploadError } = await supabase.storage
      .from('evidencias')
      .upload(storagePath, media.bytes, { contentType: media.mimeType, upsert: false })
    if (uploadError) throw uploadError
    adjuntos.push({
      path: storagePath,
      name: media.fileName,
      content_type: media.mimeType,
      source: 'whatsapp',
    })
  }

  const contenido =
    textBody ||
    (adjuntos.length > 0 ? 'Evidencia recibida por WhatsApp.' : 'Respuesta WhatsApp sin contenido.')

  if (waiting.scope === 'team' && waiting.team_action_id) {
    await supabase.from('equipo_accion_comentarios').insert({
      accion_id: waiting.team_action_id,
      contenido,
      created_by: params.usuarioId,
      tipo_comentario: 'evidencia',
      adjuntos,
    })
  } else if (waiting.accion_id) {
    await supabase.from('accion_comentarios').insert({
      accion_id: waiting.accion_id,
      contenido,
      created_by: params.usuarioId,
      tipo_comentario: 'evidencia',
      adjuntos,
    })
    if (adjuntos.length > 0) {
      await supabase
        .from('acciones_diarias')
        .update({ evidencia_cargada: true })
        .eq('id', waiting.accion_id)
    }
  }

  await supabase
    .from('whatsapp_result_requests')
    .update({ status: 'received', updated_at: new Date().toISOString() })
    .eq('id', waiting.id)

  return true
}

async function resolveFallbackTarget(
  supabase: ReturnType<typeof adminClient>,
  waId: string,
  usuarioId: string
) {
  const phone = normalizePhone(waId) || waId
  const variants = phoneVariants(phone)
  const { data: byPhone } = await supabase
    .from('action_delivery_log')
    .select('id,accion_id,team_action_id,payload,created_at,external_chat_id,usuario_id')
    .eq('channel', 'whatsapp')
    .eq('delivery_status', 'sent')
    .in('external_chat_id', variants.length ? variants : [phone])
    .order('created_at', { ascending: false })
    .limit(10)

  let deliveries = byPhone ?? []
  if (deliveries.length === 0) {
    const { data: byUser } = await supabase
      .from('action_delivery_log')
      .select('id,accion_id,team_action_id,payload,created_at,external_chat_id,usuario_id')
      .eq('channel', 'whatsapp')
      .eq('delivery_status', 'sent')
      .eq('usuario_id', usuarioId)
      .order('created_at', { ascending: false })
      .limit(10)
    deliveries = byUser ?? []
  }

  for (const delivery of deliveries) {
    const payload = (delivery.payload ?? {}) as Record<string, unknown>
    if (payload.message_type !== 'checkpoint_followup') continue

    const request = (payload.request ?? {}) as Record<string, unknown>
    const interactive = (request.interactive ?? {}) as Record<string, unknown>
    const actionBlock = (interactive.action ?? {}) as { buttons?: Array<{ reply?: { id?: string } }> }
    const buttonId = actionBlock.buttons?.[0]?.reply?.id ?? ''
    const fromButton = parseButtonId(buttonId)
    if (fromButton.kind === 'action' && fromButton.accionId) {
      return { kind: 'action' as const, accionId: fromButton.accionId }
    }
    if (fromButton.kind === 'corporate' && fromButton.checkpointId) {
      return { kind: 'corporate' as const, checkpointId: fromButton.checkpointId }
    }
    if (fromButton.kind === 'team' && fromButton.teamActionId != null && fromButton.checklistIndex != null) {
      return {
        kind: 'team' as const,
        teamActionId: fromButton.teamActionId,
        checklistIndex: fromButton.checklistIndex,
      }
    }

    if (payload.target_type === 'action' && delivery.accion_id) {
      return { kind: 'action' as const, accionId: delivery.accion_id as string }
    }

    const checkpointId =
      typeof payload.checkpoint_id === 'string' ? payload.checkpoint_id : null
    if (checkpointId) {
      return { kind: 'corporate' as const, checkpointId }
    }
    if (!checkpointId && delivery.accion_id && payload.source === 'followup_job') {
      return { kind: 'action' as const, accionId: delivery.accion_id as string }
    }

    if (delivery.team_action_id) {
      const checklistIndex =
        typeof payload.checklist_index === 'number'
          ? payload.checklist_index
          : Number(payload.checklist_index)
      if (!Number.isNaN(checklistIndex)) {
        return {
          kind: 'team' as const,
          teamActionId: delivery.team_action_id as string,
          checklistIndex,
        }
      }
    }
  }
  return null
}

Deno.serve(async (req) => {
  if (req.method === 'GET') {
    const challenge = verifyChallenge(new URL(req.url))
    if (challenge) return challenge
    return new Response('ok', { status: 200 })
  }

  if (req.method !== 'POST') {
    return new Response('method_not_allowed', { status: 405 })
  }

  const rawBody = await req.text()
  const signatureOk = await verifyMetaSignature(rawBody, req.headers.get('X-Hub-Signature-256'))
  if (!signatureOk) {
    return new Response('invalid_signature', { status: 401 })
  }

  let payload: Record<string, unknown>
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>
  } catch {
    return new Response('invalid_json', { status: 400 })
  }

  try {
    const supabase = adminClient()
    const entry = Array.isArray(payload.entry) ? payload.entry : []
    for (const ent of entry) {
      const changes = Array.isArray((ent as { changes?: unknown }).changes)
        ? ((ent as { changes: unknown[] }).changes)
        : []
      for (const change of changes) {
        const value = (change as { value?: Record<string, unknown> }).value ?? {}

        const statuses = Array.isArray(value.statuses)
          ? (value.statuses as Array<{ id?: string; status?: string; timestamp?: string; errors?: unknown[] }>)
          : []
        for (const statusEvent of statuses) {
          await applyMetaStatus(supabase, statusEvent)
        }

        const messages = Array.isArray(value.messages) ? (value.messages as WaMessage[]) : []
        for (const message of messages) {
          const waId = normalizePhone(message.from)
          if (!waId) continue

          // Dedup por Meta message id (reintentos del webhook).
          if (message.id) {
            const { data: dup } = await supabase
              .from('external_inbound_messages')
              .select('id')
              .eq('channel', 'whatsapp')
              .eq('external_update_id', message.id)
              .maybeSingle()
            if (dup?.id) continue
          }

          const identity = await findUsuarioByWa(supabase, waId)
          const { error: inboundError } = await supabase.from('external_inbound_messages').insert({
            channel: 'whatsapp',
            external_user_id: waId,
            external_chat_id: waId,
            external_message_id: message.id ?? null,
            external_update_id: message.id ?? null,
            usuario_id: identity?.usuario_id ?? null,
            message_type: message.type ?? 'unknown',
            payload: { message, value },
          })
          if (inboundError) {
            // Unique violation = evento repetido
            if (String(inboundError.message || '').toLowerCase().includes('duplicate')) continue
            if (String((inboundError as { code?: string }).code || '') === '23505') continue
            throw inboundError
          }

          if (!identity?.usuario_id) {
            await upsertThreadMessage(supabase, {
              wa_id: waId,
              usuario_id: null,
              direction: 'inbound',
              source: 'contact',
              message_kind: message.type ?? 'unknown',
              body_text: inboundPreview(message),
              meta_message_id: message.id ?? null,
              delivery_status: 'delivered',
              sent_at: new Date().toISOString(),
              delivered_at: new Date().toISOString(),
              payload: {
                message,
                value,
                source: 'webhook_inbound',
                flow: 'ops',
                route_kind: 'unlinked_user',
              },
            })
            await replyText(
              supabase,
              waId,
              'Tu numero no esta vinculado a un usuario del tablero.',
              null,
              { flow: 'ops' }
            )
            continue
          }

          await supabase
            .from('user_channel_identities')
            .update({ last_seen_at: new Date().toISOString(), external_chat_id: waId })
            .eq('id', identity.id)

          const buttonRaw =
            message.interactive?.button_reply?.id ||
            message.button?.payload ||
            message.interactive?.list_reply?.id ||
            null
          const buttonTitle =
            message.interactive?.button_reply?.title ||
            message.button?.text ||
            message.interactive?.list_reply?.title ||
            null

          // --- Shared: evidencia pendiente (Ops) antes de routers ---
          if (
            message.type === 'text' ||
            message.type === 'image' ||
            message.type === 'document' ||
            message.type === 'audio' ||
            message.type === 'video'
          ) {
            const evidenceHandled = await handleEvidence(supabase, {
              waId,
              usuarioId: identity.usuario_id,
              message,
            })
            if (evidenceHandled) {
              await upsertThreadMessage(supabase, {
                wa_id: waId,
                usuario_id: identity.usuario_id,
                direction: 'inbound',
                source: 'contact',
                message_kind: message.type ?? 'unknown',
                body_text: inboundPreview(message),
                meta_message_id: message.id ?? null,
                delivery_status: 'delivered',
                sent_at: new Date().toISOString(),
                delivered_at: new Date().toISOString(),
                payload: {
                  message,
                  value,
                  source: 'webhook_inbound',
                  flow: 'ops',
                  route_kind: 'evidence',
                },
              })
              await replyText(
                supabase,
                waId,
                'Gracias. Registramos tu evidencia en el tablero.',
                identity.usuario_id,
                { flow: 'ops' }
              )
              continue
            }
          }

          const routeInput = {
            buttonId: buttonRaw,
            buttonTitle,
            textBody: message.type === 'text' ? message.text?.body ?? null : null,
            messageType: message.type,
          }
          // Deferir RPC: botones ops / media ignore no consultan can_use_ai.
          const structured = resolveStructuredInboundRoute(routeInput)
          let canUseAi = false
          let agentSessionActive = false
          let route: InboundRoute
          if (
            structured &&
            structured.kind !== 'agent_aiop' &&
            structured.kind !== 'mas_info' &&
            structured.kind !== 'agent_channel'
          ) {
            route = structured
          } else {
            canUseAi = await canUseAiWhatsApp(supabase, identity.usuario_id)
            agentSessionActive = canUseAi ? await hasActiveAgentSession(supabase, waId) : false
            route =
              structured ??
              resolveInboundRoute({ canUseAi, agentSessionActive, ...routeInput })
          }
          const inboundFlow = inboundFlowForRoute(route)

          await upsertThreadMessage(supabase, {
            wa_id: waId,
            usuario_id: identity.usuario_id,
            direction: 'inbound',
            source: 'contact',
            message_kind: message.type ?? 'unknown',
            body_text: inboundPreview(message),
            meta_message_id: message.id ?? null,
            delivery_status: 'delivered',
            sent_at: new Date().toISOString(),
            delivered_at: new Date().toISOString(),
            payload: {
              message,
              value,
              source: 'webhook_inbound',
              flow: inboundFlow,
              route_kind: route.kind,
            },
          })

          // --- AgentRouter: aiop confirm/cancel ---
          if (route.kind === 'agent_aiop') {
            if (!canUseAi) {
              await replyText(
                supabase,
                waId,
                'Usa los botones Realizada, En proceso o Requiero apoyo del recordatorio, o abre el tablero.',
                identity.usuario_id,
                { flow: 'ops' }
              )
              continue
            }
            const aiHandled = await maybeHandleWhatsAppAi(supabase, {
              waId,
              usuarioId: identity.usuario_id,
              action: route.action,
              opId: route.opId,
              aiAllowed: canUseAi,
            })
            if (!aiHandled) {
              await replyText(
                supabase,
                waId,
                'No pude confirmar la operacion ahora. Intenta de nuevo o abre el tablero.',
                identity.usuario_id,
                { flow: 'agent' }
              )
            }
            continue
          }

          // --- Gate Más información (ops list + agent solo si canUseAi) ---
          if (route.kind === 'mas_info') {
            await handleMasInformacion(supabase, {
              waId,
              usuarioId: identity.usuario_id,
              canUseAi,
            })
            continue
          }

          // --- Iniciar bot / Consulta al Bot → selector mensaje|voz ---
          if (route.kind === 'agent_consult') {
            if (!canUseAi) {
              await replyText(
                supabase,
                waId,
                [
                  'El asistente solo está disponible para perfiles OKRS o Super Admin.',
                  '',
                  'Puedes usar: Ver actividades, Reportar avance o Necesito apoyo.',
                ].join('\n'),
                identity.usuario_id,
                { flow: 'ops', event: 'bot_start_denied' }
              )
              continue
            }
            await replyChannelSelector(supabase, waId, identity.usuario_id)
            continue
          }

          if (route.kind === 'agent_channel') {
            if (!canUseAi) {
              await replyText(
                supabase,
                waId,
                'El asistente solo está disponible para perfiles OKRS o Super Admin.',
                identity.usuario_id,
                { flow: 'ops', event: 'channel_denied' }
              )
              continue
            }
            if (route.channel === 'voice') {
              await createAndSendVoiceLink(supabase, {
                waId,
                usuarioId: identity.usuario_id,
              })
            } else {
              await handleAgentChannelText(supabase, {
                waId,
                usuarioId: identity.usuario_id,
              })
            }
            continue
          }

          // --- OpsRouter: botones estructurados o keywords ---
          let action: 'done' | 'progress' | 'support' | null = null
          let kind: 'action' | 'corporate' | 'team' | null = null
          let accionId: string | null = null
          let checkpointId: string | null = null
          let teamActionId: string | null = null
          let checklistIndex: number | null = null
          let operationalMiss = false

          if (route.kind === 'ops_button') {
            const parsed = parseButtonId(route.buttonId)
            action = parsed.action
            kind = parsed.kind
            accionId = parsed.accionId
            checkpointId = parsed.checkpointId
            teamActionId = parsed.teamActionId
            checklistIndex = parsed.checklistIndex
          } else if (route.kind === 'ops_keyword') {
            action = route.action
            const fallback = await resolveFallbackTarget(supabase, waId, identity.usuario_id)
            if (fallback?.kind === 'action') {
              kind = 'action'
              accionId = fallback.accionId
            } else if (fallback?.kind === 'corporate') {
              kind = 'corporate'
              checkpointId = fallback.checkpointId
            } else if (fallback?.kind === 'team') {
              kind = 'team'
              teamActionId = fallback.teamActionId
              checklistIndex = fallback.checklistIndex
            } else {
              operationalMiss = true
            }
          } else if (route.kind === 'agent_free_text') {
            const aiHandled = await maybeHandleWhatsAppAi(supabase, {
              waId,
              usuarioId: identity.usuario_id,
              action: 'chat',
              text: route.text,
              aiAllowed: canUseAi,
            })
            if (!aiHandled) {
              await replyText(
                supabase,
                waId,
                'No pude consultar el asistente ahora. Intenta de nuevo en unos minutos.',
                identity.usuario_id,
                { flow: 'agent' }
              )
            }
            continue
          } else if (route.kind === 'ops_help') {
            await replyText(
              supabase,
              waId,
              'Puedes reportar avance con los botones Realizada, En proceso o Requiero apoyo del recordatorio, o esperar el siguiente seguimiento.',
              identity.usuario_id,
              { flow: 'ops' }
            )
            continue
          } else {
            // ignore (media sin evidencia, etc.)
            continue
          }

          if (operationalMiss) {
            await replyText(
              supabase,
              waId,
              'No hay un seguimiento reciente para asociar tu respuesta. Espera el recordatorio o abre el tablero.',
              identity.usuario_id,
              { flow: 'ops' }
            )
            continue
          }

          if (!action || !kind) continue

          if (kind === 'action' && accionId) {
            const result = await applyActionResponse(supabase, {
              accionId,
              action,
              usuarioId: identity.usuario_id,
              waId,
            })
            if (result.ok) {
              if (result.askSupport) {
                await sendSupportContactPrompt(supabase, {
                  waId,
                  usuarioId: identity.usuario_id,
                  titulo: result.titulo,
                })
              } else if (result.askResult) {
                await requestResultComment(supabase, {
                  waId,
                  usuarioId: identity.usuario_id,
                  label: result.resultLabel ?? 'Realizada',
                  accionId: result.accionId,
                })
              }
            }
          } else if (kind === 'corporate' && checkpointId) {
            const result = await handleCorporateAction(supabase, {
              checkpointId,
              action,
              usuarioId: identity.usuario_id,
              waId,
            })
            if (result.ok) {
              if (result.askSupport) {
                await sendSupportContactPrompt(supabase, {
                  waId,
                  usuarioId: identity.usuario_id,
                  titulo: result.titulo,
                })
              } else if (result.askResult) {
                await requestResultComment(supabase, {
                  waId,
                  usuarioId: identity.usuario_id,
                  label: result.resultLabel ?? 'Realizada',
                  accionId: result.accionId,
                })
              }
            }
          } else if (kind === 'team' && teamActionId != null && checklistIndex != null) {
            const result = await handleTeamAction(supabase, {
              teamActionId,
              checklistIndex,
              action,
              usuarioId: identity.usuario_id,
              waId,
            })
            if (result.ok) {
              if (action === 'support') {
                await sendSupportContactPrompt(supabase, {
                  waId,
                  usuarioId: identity.usuario_id,
                })
              } else if (result.askResult) {
                await requestResultComment(supabase, {
                  waId,
                  usuarioId: identity.usuario_id,
                  label: action === 'progress' ? 'En proceso' : 'Realizada',
                })
              }
            }
          }
        }
      }
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('whatsapp-webhook error', error)
    // Meta reintenta si no es 200; devolvemos 200 tras log para evitar storm,
    // excepto errores de verify.
    return new Response(JSON.stringify({ ok: false }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
