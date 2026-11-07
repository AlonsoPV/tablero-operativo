/**
 * Webhook Meta en Vercel. El Edge `whatsapp-webhook` sigue siendo el callback
 * configurado en la app; este endpoint es el fallback desplegable con git push
 * cuando HMAC/Edge bloquean inbound (0 mensajes, botón de plantilla muerto).
 *
 * Callback: https://scrumbanemx.vercel.app/api/whatsapp-webhook
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { createServiceRoleClient } from './_shared/assistantAuth.js'
import { readStringEnv } from './_shared/http.js'
import {
  inferFollowupTextAction,
  isVerActividadesButton,
  parseFollowupButtonId,
  whatsappPhoneVariants,
} from './_shared/whatsappBidirectional.js'

type WaMessage = {
  id?: string
  from?: string
  type?: string
  text?: { body?: string }
  button?: { payload?: string; text?: string }
  interactive?: {
    button_reply?: { id?: string; title?: string }
    list_reply?: { id?: string; title?: string }
  }
  image?: { id?: string; caption?: string }
  document?: { id?: string; caption?: string; filename?: string }
  audio?: { id?: string }
  video?: { id?: string; caption?: string }
}

function verifyToken(): string {
  return readStringEnv('WHATSAPP_VERIFY_TOKEN') || readStringEnv('token_de_verificacion')
}

function signatureOk(rawBody: string, header: string | null): boolean {
  if (readStringEnv('WHATSAPP_WEBHOOK_ALLOW_UNSIGNED') === '1') return true
  const secret = readStringEnv('WHATSAPP_APP_SECRET')
  if (!secret) return true
  const provided = (header ?? '').trim()
  const match = /^sha256=([a-fA-F0-9]{64})$/.exec(provided)
  if (!match) return false
  const digest = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')
  const a = Buffer.from(digest, 'hex')
  const b = Buffer.from(match[1].toLowerCase(), 'hex')
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

function headerValue(headers: IncomingMessage['headers'], name: string): string | null {
  const wanted = name.toLowerCase()
  for (const [key, value] of Object.entries(headers ?? {})) {
    if (key.toLowerCase() !== wanted) continue
    if (Array.isArray(value)) return value[0] ?? null
    return typeof value === 'string' ? value : null
  }
  return null
}

function requestUrl(req: IncomingMessage): URL {
  const host = headerValue(req.headers, 'host') || 'localhost'
  const proto = headerValue(req.headers, 'x-forwarded-proto') || 'https'
  const path = req.url || '/'
  if (path.startsWith('http')) return new URL(path)
  return new URL(path, `${proto}://${host}`)
}

async function readRawBody(req: IncomingMessage): Promise<string> {
  const body = (req as IncomingMessage & { body?: unknown }).body
  if (typeof body === 'string') return body
  if (body && typeof body === 'object') return JSON.stringify(body)
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks).toString('utf8')
}

function graphConfig() {
  const accessToken = readStringEnv('WHATSAPP_ACCESS_TOKEN')
  const phoneNumberId = readStringEnv('WHATSAPP_PHONE_NUMBER_ID')
  const graphVersion = readStringEnv('WHATSAPP_GRAPH_VERSION') || 'v20.0'
  if (!accessToken || !phoneNumberId) throw new Error('missing_whatsapp_secrets')
  return { accessToken, phoneNumberId, graphVersion }
}

async function graphSend(body: Record<string, unknown>) {
  const { accessToken, phoneNumberId, graphVersion } = graphConfig()
  const response = await fetch(`https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const raw = await response.text()
  let json: Record<string, unknown> = {}
  try {
    json = raw ? (JSON.parse(raw) as Record<string, unknown>) : {}
  } catch {
    json = { raw }
  }
  return { ok: response.ok, json, raw }
}

function extractMessageId(json: Record<string, unknown>): string | null {
  const messages = json.messages
  if (!Array.isArray(messages) || messages.length === 0) return null
  const first = messages[0] as { id?: unknown }
  return typeof first.id === 'string' ? first.id : null
}

function textPayload(to: string, text: string) {
  return {
    messaging_product: 'whatsapp',
    to,
    type: 'text',
    text: { preview_url: false, body: text.slice(0, 4090) },
  }
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

function inboundPreview(message: WaMessage): string {
  const text = message.text?.body?.trim()
  if (text) return text
  const title =
    message.interactive?.button_reply?.title || message.button?.text || message.interactive?.list_reply?.title
  if (title) return title
  return `[${message.type ?? 'mensaje'}]`
}

async function replyText(
  supabase: ReturnType<typeof createServiceRoleClient>,
  to: string,
  body: string,
  usuarioId: string | null
) {
  try {
    const graphBody = textPayload(to, body)
    const result = await graphSend(graphBody)
    await supabase.from('whatsapp_messages').insert({
      wa_id: to,
      usuario_id: usuarioId,
      direction: 'outbound',
      source: 'automation',
      message_kind: 'text',
      body_text: body,
      meta_message_id: extractMessageId(result.json),
      delivery_status: result.ok ? 'sent' : 'failed',
      error_message: result.ok ? null : result.raw.slice(0, 2000),
      sent_at: result.ok ? new Date().toISOString() : null,
      payload: { request: graphBody, response: result.json, source: 'vercel_webhook' },
    })
  } catch (error) {
    console.error('whatsapp vercel reply failed', error)
  }
}

async function findUsuarioByWa(supabase: ReturnType<typeof createServiceRoleClient>, waId: string) {
  const variants = whatsappPhoneVariants(waId)
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

async function sendLatestActionFollowupButtons(
  supabase: ReturnType<typeof createServiceRoleClient>,
  params: { waId: string; usuarioId: string }
) {
  const variants = whatsappPhoneVariants(params.waId)
  const { data: deliveries } = await supabase
    .from('action_delivery_log')
    .select('accion_id,payload,external_chat_id')
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
    .select('texto')
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
  const bodyText = [
    `Seguimiento: ${action.titulo_accion ?? 'Actividad'}`,
    '',
    'Pendientes:',
    list,
    '',
    'Responde con el boton: Realizada, En proceso o Requiero apoyo.',
  ]
    .join('\n')
    .slice(0, 1024)
  const graphBody = interactiveFollowupPayload(params.waId, bodyText, `act:${action.id}`)
  const result = await graphSend(graphBody)
  const metaId = extractMessageId(result.json)
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
      target_type: 'action',
      source: 'template_button',
      wa_id: params.waId,
      request: graphBody,
      response: result.json,
    },
  })
  await supabase.from('whatsapp_messages').insert({
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
    payload: { request: graphBody, response: result.json, source: 'vercel_template_button' },
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

async function applyActionResponse(
  supabase: ReturnType<typeof createServiceRoleClient>,
  params: { accionId: string; action: 'done' | 'progress' | 'support'; usuarioId: string; waId: string }
) {
  const { data: actionRow } = await supabase
    .from('acciones_diarias')
    .select('id,estado,titulo_accion')
    .eq('id', params.accionId)
    .maybeSingle()
  if (!actionRow) return { ok: false as const }

  if (params.action === 'support') {
    await supabase.from('acciones_diarias').update({ estado: 'Retraso' }).eq('id', actionRow.id)
    await replyText(
      supabase,
      params.waId,
      `Registramos que requieres apoyo en ${actionRow.titulo_accion ?? 'la actividad'}. Quedó en Retraso.`,
      params.usuarioId
    )
    return { ok: true as const }
  }

  if (params.action === 'progress') {
    if (actionRow.estado !== 'Bloqueado') {
      await supabase.from('acciones_diarias').update({ estado: 'En_Ejecucion' }).eq('id', actionRow.id)
    }
  } else {
    await supabase
      .from('accion_checkpoints')
      .update({
        completado: true,
        checked_at: new Date().toISOString(),
        checked_by: params.usuarioId,
      })
      .eq('accion_id', actionRow.id)
      .eq('activo', true)
      .eq('completado', false)
    await supabase
      .from('acciones_diarias')
      .update({
        estado: 'Hecho',
        completed_at: new Date().toISOString(),
        completed_by: params.usuarioId,
      })
      .eq('id', actionRow.id)
  }

  await supabase.from('whatsapp_result_requests').insert({
    scope: 'corporate',
    accion_id: actionRow.id,
    usuario_id: params.usuarioId,
    wa_id: params.waId,
    status: 'waiting',
    expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
  })
  await replyText(
    supabase,
    params.waId,
    params.action === 'progress'
      ? '*En proceso*\n\nResponde con el numero de actividad y tu avance. Puedes enviar texto, foto, PDF o Excel.'
      : '*Realizada*\n\nResponde con el resultado. Puedes enviar texto, foto, PDF o Excel.',
    params.usuarioId
  )
  return { ok: true as const }
}

async function maybeAi(
  supabase: ReturnType<typeof createServiceRoleClient>,
  params: { waId: string; usuarioId: string; text: string }
) {
  const { data: allowed } = await supabase.rpc('can_use_ai_whatsapp_for_usuario', {
    p_usuario_id: params.usuarioId,
  })
  if (allowed !== true) return false
  const secret = readStringEnv('WHATSAPP_ASSISTANT_SECRET')
  const base = (readStringEnv('APP_URL') || readStringEnv('VITE_APP_URL') || 'https://scrumbanemx.vercel.app').replace(
    /\/$/,
    ''
  )
  if (!secret) return false
  const response = await fetch(`${base}/api/whatsapp-assistant`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-whatsapp-assistant-secret': secret,
    },
    body: JSON.stringify({
      action: 'chat',
      wa_id: params.waId,
      usuario_id: params.usuarioId,
      text: params.text,
    }),
  })
  const json = (await response.json()) as { text?: string }
  const text = typeof json.text === 'string' && json.text.trim() ? json.text.trim() : 'No pude consultar el tablero ahora.'
  await replyText(supabase, params.waId, text, params.usuarioId)
  return true
}

async function processMessage(
  supabase: ReturnType<typeof createServiceRoleClient>,
  message: WaMessage,
  value: Record<string, unknown>
) {
  const waId = (message.from ?? '').replace(/\D/g, '')
  if (waId.length < 10) return

  if (message.id) {
    const { data: dup } = await supabase
      .from('external_inbound_messages')
      .select('id')
      .eq('channel', 'whatsapp')
      .eq('external_update_id', message.id)
      .maybeSingle()
    if (dup?.id) return
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
    payload: { message, value, source: 'vercel_webhook' },
  })
  if (inboundError) {
    const code = String((inboundError as { code?: string }).code || '')
    if (code === '23505' || String(inboundError.message || '').toLowerCase().includes('duplicate')) return
    throw inboundError
  }

  await supabase.from('whatsapp_messages').insert({
    wa_id: waId,
    usuario_id: identity?.usuario_id ?? null,
    direction: 'inbound',
    source: 'contact',
    message_kind: message.type ?? 'unknown',
    body_text: inboundPreview(message),
    meta_message_id: message.id ?? null,
    delivery_status: 'delivered',
    payload: { message, value, source: 'vercel_webhook' },
  })

  if (!identity?.usuario_id) {
    await replyText(supabase, waId, 'Tu numero no esta vinculado a un usuario del tablero.', null)
    return
  }

  await supabase
    .from('user_channel_identities')
    .update({ last_seen_at: new Date().toISOString(), external_chat_id: waId })
    .eq('id', identity.id)

  const buttonRaw =
    message.interactive?.button_reply?.id || message.button?.payload || message.interactive?.list_reply?.id || null
  const buttonTitle =
    message.interactive?.button_reply?.title || message.button?.text || message.interactive?.list_reply?.title || null

  if (isVerActividadesButton(buttonRaw, buttonTitle)) {
    const sent = await sendLatestActionFollowupButtons(supabase, {
      waId,
      usuarioId: identity.usuario_id,
    })
    if (!sent) {
      await replyText(supabase, waId, 'No tienes actividades abiertas en el tablero.', identity.usuario_id)
    }
    await maybeAi(supabase, {
      waId,
      usuarioId: identity.usuario_id,
      text: 'El usuario toco Mas informacion. Resume sus actividades abiertas y pregunta en que puedes ayudar.',
    })
    return
  }

  const parsed = parseFollowupButtonId(buttonRaw)
  let action = parsed?.action ?? null
  let accionId = parsed?.kind === 'action' ? parsed.accionId : null
  if (!action && message.type === 'text' && message.text?.body) {
    action = inferFollowupTextAction(message.text.body)
    if (action) {
      const { data: last } = await supabase
        .from('action_delivery_log')
        .select('accion_id,payload')
        .eq('channel', 'whatsapp')
        .eq('usuario_id', identity.usuario_id)
        .eq('delivery_status', 'sent')
        .order('created_at', { ascending: false })
        .limit(8)
      const followup = (last ?? []).find((row) => {
        const payload = (row.payload ?? {}) as Record<string, unknown>
        return payload.message_type === 'checkpoint_followup' && row.accion_id
      })
      accionId = followup?.accion_id ?? accionId
    }
  }

  if (action && accionId) {
    await applyActionResponse(supabase, {
      accionId,
      action,
      usuarioId: identity.usuario_id,
      waId,
    })
    return
  }

  const chatText = (message.type === 'text' && message.text?.body?.trim()) || buttonTitle?.trim() || ''
  if (chatText) {
    const ai = await maybeAi(supabase, { waId, usuarioId: identity.usuario_id, text: chatText })
    if (!ai && message.type === 'text') {
      await replyText(
        supabase,
        waId,
        'Puedes reportar avance con Realizada, En proceso o Requiero apoyo, o esperar el recordatorio.',
        identity.usuario_id
      )
    }
  }
}

async function handlePost(rawBody: string, signatureHeader: string | null): Promise<Response> {
  if (!signatureOk(rawBody, signatureHeader)) {
    return new Response('invalid_signature', { status: 401 })
  }
  let payload: Record<string, unknown>
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>
  } catch {
    return new Response('invalid_json', { status: 400 })
  }

  const supabase = createServiceRoleClient()
  const entry = Array.isArray(payload.entry) ? payload.entry : []
  for (const ent of entry) {
    const changes = Array.isArray((ent as { changes?: unknown }).changes)
      ? ((ent as { changes: unknown[] }).changes)
      : []
    for (const change of changes) {
      const value = ((change as { value?: Record<string, unknown> }).value ?? {}) as Record<string, unknown>
      const messages = Array.isArray(value.messages) ? (value.messages as WaMessage[]) : []
      for (const message of messages) {
        await processMessage(supabase, message, value)
      }
    }
  }
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

function handleGet(url: URL): Response {
  const mode = url.searchParams.get('hub.mode')
  const token = url.searchParams.get('hub.verify_token')
  const challenge = url.searchParams.get('hub.challenge')
  const expected = verifyToken()
  if (mode === 'subscribe' && expected && token === expected && challenge) {
    return new Response(challenge, { status: 200, headers: { 'content-type': 'text/plain' } })
  }
  if (mode === 'subscribe') return new Response('forbidden', { status: 403, headers: { 'content-type': 'text/plain' } })
  return new Response('ok', { status: 200, headers: { 'content-type': 'text/plain' } })
}

export default Object.assign(
  async function handler(req: IncomingMessage, res: ServerResponse) {
    try {
      let response: Response
      if ((req.method || 'GET') === 'GET') {
        response = handleGet(requestUrl(req))
      } else if (req.method === 'POST') {
        const raw = await readRawBody(req)
        response = await handlePost(raw, headerValue(req.headers, 'x-hub-signature-256'))
      } else {
        response = new Response('method_not_allowed', { status: 405 })
      }
      res.statusCode = response.status
      response.headers.forEach((value, key) => res.setHeader(key, value))
      res.end(await response.text())
    } catch (error) {
      console.error('whatsapp-webhook vercel', error)
      res.statusCode = 200
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ ok: false }))
    }
  },
  {
    fetch: async (request: Request) => {
      try {
        if (request.method === 'GET') return handleGet(new URL(request.url))
        if (request.method !== 'POST') return new Response('method_not_allowed', { status: 405 })
        const raw = await request.text()
        return await handlePost(raw, request.headers.get('x-hub-signature-256'))
      } catch (error) {
        console.error('whatsapp-webhook vercel', error)
        return new Response(JSON.stringify({ ok: false }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }
    },
  }
)
