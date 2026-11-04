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

async function hasOpenSession(supabase: ReturnType<typeof createClient>, waId: string): Promise<boolean> {
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
          { type: 'reply', reply: { id: `${buttonIdPrefix}:progress`, title: 'En progreso' } },
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
  const expected = Deno.env.get('WHATSAPP_VERIFY_TOKEN')?.trim() || ''
  if (mode === 'subscribe' && expected && token === expected && challenge) {
    return new Response(challenge, { status: 200, headers: { 'Content-Type': 'text/plain' } })
  }
  if (mode === 'subscribe') {
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
  const appSecret = Deno.env.get('WHATSAPP_APP_SECRET')?.trim() || ''
  if (!appSecret) {
    console.error('whatsapp-webhook missing WHATSAPP_APP_SECRET')
    return false
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
  kind: 'corporate' | 'team' | null
  checkpointId?: string
  teamActionId?: string
  checklistIndex?: number
  action: 'done' | 'progress' | 'support' | null
} {
  const value = (raw ?? '').trim()
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
    .replace(/\p{M}/gu, '')
  if (!t) return null
  if (/\b(realizada|hecho|done|completad[oa]|lista)\b/.test(t)) return 'done'
  if (/\b(en progreso|en proceso|avance|progress|trabajando)\b/.test(t)) return 'progress'
  if (/\b(requiero apoyo|ayuda|support|bloquead[oa]|apoyo)\b/.test(t)) return 'support'
  return null
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
    patch.error_message = err ? JSON.stringify(err).slice(0, 2000) : 'meta_status_failed'
  } else {
    return
  }

  // No degradar read → delivered, etc.
  const { data: current } = await supabase
    .from('whatsapp_messages')
    .select('id,delivery_status')
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
  }
}

async function replyText(
  supabase: ReturnType<typeof adminClient>,
  to: string,
  body: string,
  usuarioId?: string | null
) {
  try {
    const graphBody = textPayload(to, body)
    const result = await graphSendMessage(graphBody)
    const metaId = extractMessageId(result.json)
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
  return flag === '1' || flag === 'true' || flag === 'yes'
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
      },
    })
  } catch (error) {
    console.error('whatsapp ai reply failed', error)
  }
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
  }
): Promise<boolean> {
  if (!whatsappAiEnabled()) return false
  const { data: allowed, error } = await supabase.rpc('can_use_ai_whatsapp_for_usuario', {
    p_usuario_id: input.usuarioId,
  })
  if (error) {
    console.error('whatsapp-webhook AI access rpc', error.message)
    return false
  }
  if (allowed !== true) return false
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
  const phone = normalizePhone(waId)
  if (!phone) return null
  const { data } = await supabase
    .from('user_channel_identities')
    .select('id,usuario_id,external_user_id')
    .eq('channel', 'whatsapp')
    .eq('status', 'active')
    .eq('external_user_id', phone)
    .maybeSingle()
  return data
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
    return list.find((r) => /bloquead/i.test(r.nombre) && !r.es_cierre)?.id ?? null
  }
  return (
    list.find((r) => /en_ejecucion|ejecucion/i.test(r.nombre) && !r.es_cierre)?.id ??
    list.find((r) => /proceso|progreso|hoy/i.test(r.nombre) && !r.es_cierre)?.id ??
    list.find((r) => !r.es_cierre)?.id ??
    null
  )
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
    .select('id,estado,responsable')
    .eq('id', checkpoint.accion_id)
    .maybeSingle()
  if (!actionRow) return { ok: false as const, reason: 'action_not_found' }

  if (params.action === 'support') {
    await supabase
      .from('acciones_diarias')
      .update({ estado: 'Bloqueado' })
      .eq('id', actionRow.id)
    return { ok: true as const, askResult: false, accionId: actionRow.id }
  }

  if (params.action === 'progress') {
    if (actionRow.estado !== 'Bloqueado') {
      await supabase
        .from('acciones_diarias')
        .update({ estado: 'En_Ejecucion' })
        .eq('id', actionRow.id)
    }
    return { ok: true as const, askResult: false, accionId: actionRow.id }
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
  })

  return { ok: true as const, askResult: true, accionId: actionRow.id }
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
    return { ok: true as const, askResult: false, teamActionId: team.id }
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
  })

  return { ok: true as const, askResult: true, teamActionId: team.id }
}

async function handleEvidence(
  supabase: ReturnType<typeof adminClient>,
  params: {
    waId: string
    usuarioId: string
    message: WaMessage
  }
) {
  const { data: waiting } = await supabase
    .from('whatsapp_result_requests')
    .select('id,scope,accion_id,team_action_id,checkpoint_id,checklist_index')
    .eq('wa_id', params.waId)
    .eq('status', 'waiting')
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
  const { data: deliveries } = await supabase
    .from('action_delivery_log')
    .select('id,accion_id,team_action_id,payload,created_at')
    .eq('channel', 'whatsapp')
    .eq('usuario_id', usuarioId)
    .eq('delivery_status', 'sent')
    .order('created_at', { ascending: false })
    .limit(10)

  for (const delivery of deliveries ?? []) {
    const payload = (delivery.payload ?? {}) as Record<string, unknown>
    if (payload.message_type !== 'checkpoint_followup') continue
    const checkpointId =
      typeof payload.checkpoint_id === 'string' ? payload.checkpoint_id : null
    if (checkpointId) {
      return { kind: 'corporate' as const, checkpointId }
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
      const request = (payload.request ?? {}) as Record<string, unknown>
      const interactive = (request.interactive ?? {}) as Record<string, unknown>
      const action = (interactive.action ?? {}) as { buttons?: Array<{ reply?: { id?: string } }> }
      const buttonId = action.buttons?.[0]?.reply?.id ?? ''
      const parsed = parseButtonId(buttonId)
      if (parsed.kind === 'team' && parsed.teamActionId != null && parsed.checklistIndex != null) {
        return {
          kind: 'team' as const,
          teamActionId: parsed.teamActionId,
          checklistIndex: parsed.checklistIndex,
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

          await upsertThreadMessage(supabase, {
            wa_id: waId,
            usuario_id: identity?.usuario_id ?? null,
            direction: 'inbound',
            source: 'contact',
            message_kind: message.type ?? 'unknown',
            body_text: inboundPreview(message),
            meta_message_id: message.id ?? null,
            delivery_status: 'delivered',
            sent_at: new Date().toISOString(),
            delivered_at: new Date().toISOString(),
            payload: { message, value, source: 'webhook_inbound' },
          })

          if (!identity?.usuario_id) {
            await replyText(
              supabase,
              waId,
              'Tu numero no esta vinculado a un usuario del tablero.',
              null
            )
            continue
          }

          await supabase
            .from('user_channel_identities')
            .update({ last_seen_at: new Date().toISOString() })
            .eq('id', identity.id)

          const buttonRaw =
            message.interactive?.button_reply?.id ||
            message.button?.payload ||
            message.interactive?.list_reply?.id ||
            null
          const aiOp = parseAiOpButton(buttonRaw)
          if (aiOp) {
            await maybeHandleWhatsAppAi(supabase, {
              waId,
              usuarioId: identity.usuario_id,
              action: aiOp.action,
              opId: aiOp.opId,
            })
            continue
          }

          const parsed = parseButtonId(buttonRaw)
          let action = parsed.action
          let kind = parsed.kind
          let checkpointId = parsed.checkpointId
          let teamActionId = parsed.teamActionId
          let checklistIndex = parsed.checklistIndex

          if (!action && message.type === 'text' && message.text?.body) {
            const evidenceHandled = await handleEvidence(supabase, {
              waId,
              usuarioId: identity.usuario_id,
              message,
            })
            if (evidenceHandled) {
              await replyText(
                supabase,
                waId,
                'Gracias. Registramos tu evidencia en el tablero.',
                identity.usuario_id
              )
              continue
            }
            action = inferTextAction(message.text.body)
            if (action) {
              const fallback = await resolveFallbackTarget(supabase, waId, identity.usuario_id)
              if (fallback?.kind === 'corporate') {
                kind = 'corporate'
                checkpointId = fallback.checkpointId
              } else if (fallback?.kind === 'team') {
                kind = 'team'
                teamActionId = fallback.teamActionId
                checklistIndex = fallback.checklistIndex
              }
            }
          }

          if (
            !action &&
            (message.type === 'image' ||
              message.type === 'document' ||
              message.type === 'audio' ||
              message.type === 'video')
          ) {
            const evidenceHandled = await handleEvidence(supabase, {
              waId,
              usuarioId: identity.usuario_id,
              message,
            })
            if (evidenceHandled) {
              await replyText(
                supabase,
                waId,
                'Gracias. Registramos tu evidencia en el tablero.',
                identity.usuario_id
              )
            }
            continue
          }

          if (!action || !kind) {
            if (message.type === 'text' && message.text?.body) {
              await maybeHandleWhatsAppAi(supabase, {
                waId,
                usuarioId: identity.usuario_id,
                action: 'chat',
                text: message.text.body,
              })
            }
            continue
          }

          if (kind === 'corporate' && checkpointId) {
            const result = await handleCorporateAction(supabase, {
              checkpointId,
              action,
              usuarioId: identity.usuario_id,
              waId,
            })
            if (result.ok) {
              if (result.askResult) {
                await replyText(
                  supabase,
                  waId,
                  'Marcado como realizada. Envia una breve descripcion o un archivo como evidencia.',
                  identity.usuario_id
                )
              } else if (action === 'progress') {
                await replyText(
                  supabase,
                  waId,
                  'Registramos avance: la actividad quedo En ejecucion.',
                  identity.usuario_id
                )
              } else {
                await replyText(
                  supabase,
                  waId,
                  'Registramos que requieres apoyo. La actividad quedo Bloqueada.',
                  identity.usuario_id
                )
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
              if (result.askResult) {
                await replyText(
                  supabase,
                  waId,
                  'Punto marcado como realizado. Envia una breve descripcion o un archivo como evidencia.',
                  identity.usuario_id
                )
              } else if (action === 'progress') {
                await replyText(
                  supabase,
                  waId,
                  'Registramos avance en la actividad de equipo.',
                  identity.usuario_id
                )
              } else {
                await replyText(
                  supabase,
                  waId,
                  'Registramos que requieres apoyo. La actividad quedo bloqueada.',
                  identity.usuario_id
                )
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
