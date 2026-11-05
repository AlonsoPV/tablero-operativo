// @ts-nocheck — Dashboard solo sube index.ts; el bundler Deno exige specifier npm:
import { createClient } from 'npm:@supabase/supabase-js@2'

declare const Deno: {
  env: { get(key: string): string | undefined }
  serve: (handler: (req: Request) => Response | Promise<Response>) => void
}

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-api-version, prefer, accept',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json; charset=utf-8',
    },
  })
}

function handleCorsPreflight(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }
  return null
}

type RequireUserResult =
  | { ok: true; data: { user: { id: string }; token: string } }
  | { ok: false; response: Response }

async function requireAuthUser(req: Request): Promise<RequireUserResult> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!supabaseUrl || !serviceRoleKey) {
    return {
      ok: false,
      response: jsonResponse({ error: 'Configuración de servidor incompleta' }, 500),
    }
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return {
      ok: false,
      response: jsonResponse({ error: 'No autorizado' }, 401),
    }
  }

  const token = authHeader.slice(7)
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  })

  const { data: userData, error: userError } = await admin.auth.getUser(token)
  if (userError || !userData.user) {
    return {
      ok: false,
      response: jsonResponse({ error: 'Sesión inválida' }, 401),
    }
  }

  return {
    ok: true,
    data: { user: userData.user, token },
  }
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

function extractMessageId(json: Record<string, unknown>): string | null {
  const messages = json.messages
  if (!Array.isArray(messages) || messages.length === 0) return null
  const first = messages[0] as { id?: unknown }
  return typeof first.id === 'string' ? first.id : null
}

async function hasOpenSession(supabase: ReturnType<typeof adminClient>, waId: string): Promise<boolean> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const variants = phoneVariants(waId)
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

async function findIdentityByUsuario(
  supabase: ReturnType<typeof adminClient>,
  usuarioId: string
) {
  const { data } = await supabase
    .from('user_channel_identities')
    .select('id,usuario_id,external_user_id,display_name,status')
    .eq('channel', 'whatsapp')
    .eq('usuario_id', usuarioId)
    .eq('status', 'active')
    .maybeSingle()
  return data
}

async function findIdentityByWa(supabase: ReturnType<typeof adminClient>, waId: string) {
  const { data } = await supabase
    .from('user_channel_identities')
    .select('id,usuario_id,external_user_id,display_name,status')
    .eq('channel', 'whatsapp')
    .eq('external_user_id', waId)
    .eq('status', 'active')
    .maybeSingle()
  return data
}

function availableTemplates() {
  try {
    const cfg = whatsappConfig()
    return [
      {
        id: 'initial_outreach',
        name: cfg.templateName,
        language: cfg.templateLanguage,
        label: 'Contacto inicial (plantilla Meta aprobada)',
        description:
          'Usar cuando la ventana de 24 h está cerrada. Plantilla Meta: {{1}}=ahora (Hoy es), {{2}}=nombre.',
        bodyParams: [
          { key: 'fecha', label: 'Hoy es — fecha/hora ({{1}})', required: true },
          { key: 'nombre', label: 'Nombre ({{2}})', required: true },
        ],
      },
    ]
  } catch {
    return []
  }
}

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req)
  if (preflight) return preflight

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'method_not_allowed' }, 405)
  }

  const auth = await requireAuthUser(req)
  if (!auth.ok) return auth.response

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return jsonResponse({ error: 'invalid_json' }, 400)
  }

  const action = typeof body.action === 'string' ? body.action : ''
  const supabase = adminClient()

  const { data: allowed } = await supabase.rpc('whatsapp_inbox_can_access', {
    p_auth_uid: auth.data.user.id,
  })
  if (!allowed) {
    return jsonResponse({ error: 'forbidden' }, 403)
  }

  const { data: operatorRow } = await supabase
    .from('usuarios')
    .select('id')
    .eq('user_id', auth.data.user.id)
    .maybeSingle()
  const operatorUsuarioId = operatorRow?.id as string | undefined
  if (!operatorUsuarioId) {
    return jsonResponse({ error: 'usuario_not_found' }, 403)
  }

  try {
    if (action === 'compose_options') {
      const usuarioId = typeof body.usuarioId === 'string' ? body.usuarioId : null
      const waIdRaw = typeof body.waId === 'string' ? body.waId : null
      let waId = normalizePhone(waIdRaw)
      let identity = waId ? await findIdentityByWa(supabase, waId) : null
      if (!identity && usuarioId) {
        identity = await findIdentityByUsuario(supabase, usuarioId)
        waId = normalizePhone(identity?.external_user_id ?? null)
      }
      if (!waId || !identity) {
        return jsonResponse({ error: 'whatsapp_identity_missing' }, 400)
      }
      const openSession = await hasOpenSession(supabase, waId)
      const templates = availableTemplates()
      return jsonResponse({
        ok: true,
        waId,
        usuarioId: identity.usuario_id,
        openSession,
        canSendFreeText: openSession,
        templates: openSession ? [] : templates,
        templateUnavailableReason: openSession
          ? null
          : templates.length === 0
            ? 'No hay plantilla Meta configurada (WHATSAPP_INITIAL_TEMPLATE_NAME / LANGUAGE).'
            : null,
      })
    }

    if (action === 'send') {
      const usuarioId = typeof body.usuarioId === 'string' ? body.usuarioId : null
      const waIdRaw = typeof body.waId === 'string' ? body.waId : null
      const mode = body.mode === 'template' ? 'template' : 'text'
      const text = typeof body.text === 'string' ? body.text.trim() : ''
      const clientRequestId =
        typeof body.clientRequestId === 'string' && body.clientRequestId.trim()
          ? body.clientRequestId.trim().slice(0, 120)
          : null
      const templateParams = Array.isArray(body.templateParams)
        ? (body.templateParams as unknown[]).map((v) => String(v ?? '').trim())
        : []

      if (clientRequestId) {
        const { data: existing } = await supabase
          .from('whatsapp_messages')
          .select('id,wa_id,meta_message_id,delivery_status,body_text,created_at,error_message')
          .eq('client_request_id', clientRequestId)
          .maybeSingle()
        if (existing) {
          return jsonResponse({
            ok: existing.delivery_status !== 'failed',
            deduped: true,
            message: existing,
            uncertain: existing.delivery_status === 'queued',
          })
        }
      }

      let identity = null as Awaited<ReturnType<typeof findIdentityByUsuario>>
      let waId = normalizePhone(waIdRaw)
      if (usuarioId) {
        identity = await findIdentityByUsuario(supabase, usuarioId)
        waId = normalizePhone(identity?.external_user_id ?? null) ?? waId
      } else if (waId) {
        identity = await findIdentityByWa(supabase, waId)
      }

      if (!waId || !identity?.usuario_id) {
        return jsonResponse({ error: 'whatsapp_identity_missing' }, 400)
      }
      if (identity.status !== 'active') {
        return jsonResponse({ error: 'contact_inactive' }, 403)
      }

      const openSession = await hasOpenSession(supabase, waId)
      let graphBody: Record<string, unknown>
      let bodyText = ''
      let messageKind = 'text'

      if (mode === 'text') {
        if (!openSession) {
          return jsonResponse(
            {
              error: 'session_closed',
              detail: 'La ventana de 24 h está cerrada. Usa una plantilla aprobada.',
              openSession: false,
              templates: availableTemplates(),
            },
            409
          )
        }
        if (!text) return jsonResponse({ error: 'text_required' }, 400)
        graphBody = textPayload(waId, text)
        bodyText = text
        messageKind = 'text'
      } else {
        let cfg
        try {
          cfg = whatsappConfig()
        } catch {
          return jsonResponse({ error: 'missing_whatsapp_secrets' }, 500)
        }
        const params = templateParams.filter(Boolean)
        if (params.length < 2) {
          return jsonResponse(
            {
              error: 'template_params_required',
              detail: 'La plantilla requiere 2 campos: fecha/hora y nombre.',
            },
            400
          )
        }
        graphBody = templatePayload(waId, cfg.templateName, cfg.templateLanguage, params.slice(0, 2))
        bodyText = `[Plantilla ${cfg.templateName}] ${params.slice(0, 2).join(' · ')}`
        messageKind = 'template'
      }

      const queuedInsert = {
        wa_id: waId,
        usuario_id: identity.usuario_id,
        direction: 'outbound',
        source: 'operator',
        message_kind: messageKind,
        body_text: bodyText,
        client_request_id: clientRequestId,
        delivery_status: 'queued',
        operator_usuario_id: operatorUsuarioId,
        payload: {
          request: graphBody,
          source: 'inbox_operator',
          open_session: openSession,
        },
        created_at: new Date().toISOString(),
      }

      const { data: queuedRow, error: queuedError } = await supabase
        .from('whatsapp_messages')
        .insert(queuedInsert)
        .select('id,wa_id,meta_message_id,delivery_status,body_text,created_at,client_request_id')
        .single()

      if (queuedError) {
        if (clientRequestId && String(queuedError.message || '').includes('client_request_id')) {
          const { data: existing } = await supabase
            .from('whatsapp_messages')
            .select('id,wa_id,meta_message_id,delivery_status,body_text,created_at,error_message')
            .eq('client_request_id', clientRequestId)
            .maybeSingle()
          if (existing) {
            return jsonResponse({
              ok: existing.delivery_status !== 'failed',
              deduped: true,
              message: existing,
              uncertain: existing.delivery_status === 'queued',
            })
          }
        }
        throw queuedError
      }

      let result
      try {
        result = await graphSendMessage(graphBody)
      } catch (sendErr) {
        await supabase
          .from('whatsapp_messages')
          .update({
            delivery_status: 'failed',
            failed_at: new Date().toISOString(),
            error_message: String(sendErr).slice(0, 2000),
          })
          .eq('id', queuedRow.id)
        return jsonResponse(
          {
            ok: false,
            error: 'graph_send_failed',
            messageId: queuedRow.id,
            detail: String(sendErr),
          },
          502
        )
      }

      const metaId = extractMessageId(result.json)
      if (!result.ok) {
        await supabase
          .from('whatsapp_messages')
          .update({
            delivery_status: 'failed',
            failed_at: new Date().toISOString(),
            error_message: result.raw.slice(0, 2000),
            meta_message_id: metaId,
            payload: {
              request: graphBody,
              response: result.json,
              source: 'inbox_operator',
              open_session: openSession,
            },
          })
          .eq('id', queuedRow.id)
        return jsonResponse(
          {
            ok: false,
            error: 'graph_send_failed',
            status: result.status,
            detail: result.json,
            messageId: queuedRow.id,
          },
          502
        )
      }

      const sentAt = new Date().toISOString()
      await supabase
        .from('whatsapp_messages')
        .update({
          delivery_status: 'sent',
          sent_at: sentAt,
          meta_message_id: metaId,
          error_message: null,
          payload: {
            request: graphBody,
            response: result.json,
            source: 'inbox_operator',
            open_session: openSession,
          },
        })
        .eq('id', queuedRow.id)

      return jsonResponse({
        ok: true,
        waId,
        usuarioId: identity.usuario_id,
        openSession,
        externalMessageId: metaId,
        messageId: queuedRow.id,
      })
    }

    return jsonResponse({ error: 'unknown_action' }, 400)
  } catch (error) {
    console.error('whatsapp-inbox error', error)
    const message = error instanceof Error ? error.message : String(error)
    if (message === 'missing_whatsapp_secrets') {
      return jsonResponse({ error: 'missing_whatsapp_secrets' }, 500)
    }
    return jsonResponse({ error: 'internal_error', detail: message }, 500)
  }
})
