// @ts-nocheck — Dashboard solo sube index.ts; el bundler Deno exige specifier npm:
import { createClient } from 'npm:@supabase/supabase-js@2'

declare const Deno: {
  env: { get(key: string): string | undefined }
  serve: (handler: (req: Request) => Response | Promise<Response>) => void
}

/** CORS para Edge Functions alineado con invite-user / calculate-distance. */

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

/** Devuelve respuesta OPTIONS o null si debe continuar el handler. */
function handleCorsPreflight(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }
  return null
}

type RequireUserOk = { user: { id: string }; token: string }
type RequireUserResult =
  | { ok: true; data: RequireUserOk }
  | { ok: false; response: Response }

/**
 * Valida Bearer JWT contra Supabase Auth (service role), sin usar verify_jwt del gateway.
 */
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
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  })

  const { data: userData, error: userError } = await adminClient.auth.getUser(token)
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

type WhatsAppScope = 'corporate' | 'team'
type WhatsAppMessageType = 'initial' | 'checkpoint_followup' | 'commitment_close'

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
    .select('id,usuario_id,external_user_id,external_chat_id,display_name,status')
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

/** "Hoy es: {{1}}" → ahora en CDMX (YYYY-MM-DD HH:mm). */
function formatNowForTemplate() {
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

/** Plantilla Meta: {{1}}=fecha/hora actual, {{2}}=nombre (exactamente 2 body params). */
function initialTemplateBodyParams(input: { fecha?: string | null; nombre?: string | null }) {
  return [
    (input.fecha || formatNowForTemplate()).slice(0, 1024),
    (input.nombre || 'usuario').slice(0, 1024),
  ]
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

type SendBody = {
  scope?: WhatsAppScope
  messageType?: WhatsAppMessageType
  accionId?: string
  checkpointId?: string
  teamActionId?: string
  checklistIndex?: number
}

type CorporateAction = {
  id: string
  titulo_accion: string | null
  descripcion_accion: string | null
  estado: string | null
  fecha: string | null
  responsable: string | null
}

type TeamAction = {
  id: string
  titulo: string | null
  descripcion: string | null
  estado_id: string | null
  fecha_limite: string | null
  asignado_a: string | null
  checklist: unknown
  bloqueada?: boolean | null
}

type Checkpoint = {
  id: string
  accion_id: string
  texto: string | null
  completado: boolean | null
  activo: boolean | null
  orden: number | null
}

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req)
  if (preflight) return preflight
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405)

  const auth = await requireAuthUser(req)
  if (auth.ok === false) return auth.response

  let body: SendBody
  try {
    body = (await req.json()) as SendBody
  } catch {
    return jsonResponse({ error: 'invalid_json' }, 400)
  }

  const scope: WhatsAppScope = body.scope === 'team' ? 'team' : 'corporate'
  const messageType: WhatsAppMessageType =
    body.messageType === 'checkpoint_followup' || body.messageType === 'commitment_close'
      ? body.messageType
      : 'initial'

  try {
    const supabase = adminClient()
    const { data: allowed, error: accessError } = await supabase.rpc('whatsapp_inbox_can_access', {
      p_auth_uid: auth.data.user.id,
    })
    if (accessError) {
      console.error('whatsapp-send-action access check', accessError)
      return jsonResponse({ error: 'forbidden' }, 403)
    }
    if (allowed !== true) {
      return jsonResponse({ error: 'forbidden', detail: 'Solo area OKRS o Super Admin.' }, 403)
    }

    const settings = await loadFollowupSettings(supabase)
    const { templateName, templateLanguage } = whatsappConfig()

    if (scope === 'corporate') {
      return await sendCorporate({
        supabase,
        settings,
        templateName,
        templateLanguage,
        messageType,
        accionId: body.accionId,
        checkpointId: body.checkpointId,
      })
    }

    return await sendTeam({
      supabase,
      settings,
      templateName,
      templateLanguage,
      messageType,
      teamActionId: body.teamActionId,
      checklistIndex: body.checklistIndex,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message === 'missing_whatsapp_secrets' || message === 'missing_supabase_admin') {
      return jsonResponse({ error: message }, 500)
    }
    console.error('whatsapp-send-action error', error)
    return jsonResponse({ error: 'send_failed', detail: message }, 500)
  }
})

async function resolveUsuarioNombre(
  supabase: ReturnType<typeof adminClient>,
  usuarioId: string | null,
  preferredDisplayName?: string | null
) {
  const preferred = typeof preferredDisplayName === 'string' ? preferredDisplayName.trim() : ''
  if (preferred) return preferred
  if (!usuarioId) return 'usuario'
  const { data } = await supabase
    .from('usuarios')
    .select('nombre,email')
    .eq('id', usuarioId)
    .maybeSingle()
  const nombre = typeof data?.nombre === 'string' ? data.nombre.trim() : ''
  const email = typeof data?.email === 'string' ? data.email.trim() : ''
  return nombre || email || 'usuario'
}

function checklistBlockFromCorporate(checkpoints: Checkpoint[]): string {
  const pending = checkpoints.filter((c) => c.activo !== false && !c.completado)
  if (pending.length === 0) return ''
  const lines = pending
    .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
    .map((c, i) => `${i + 1}. ${c.texto ?? 'Checkpoint'}`)
  return `\nChecklist pendiente:\n${lines.join('\n')}`
}

function parseTeamChecklist(raw: unknown): Array<{ text: string; done: boolean }> {
  if (!Array.isArray(raw)) return []
  return raw.map((item) => {
    if (typeof item === 'string') return { text: item, done: false }
    if (item && typeof item === 'object') {
      const obj = item as Record<string, unknown>
      return {
        text: String(obj.text ?? obj.texto ?? obj.label ?? ''),
        done: Boolean(obj.done ?? obj.hecho ?? false),
      }
    }
    return { text: String(item ?? ''), done: false }
  })
}

function checklistBlockFromTeam(items: Array<{ text: string; done: boolean }>): string {
  const pending = items.filter((i) => !i.done && i.text.trim())
  if (pending.length === 0) return ''
  return `\nChecklist pendiente:\n${pending.map((i, idx) => `${idx + 1}. ${i.text}`).join('\n')}`
}

function outboundPreviewFromRequest(request: unknown, fallback: string): string {
  const req = (request ?? {}) as Record<string, unknown>
  const text = (req.text as { body?: string } | undefined)?.body
  if (text) return text
  const interactive = req.interactive as { body?: { text?: string } } | undefined
  if (interactive?.body?.text) return interactive.body.text
  if (req.type === 'template') {
    const name = (req.template as { name?: string } | undefined)?.name
    return `[Plantilla] ${name || fallback}`
  }
  return fallback
}

async function logDelivery(
  supabase: ReturnType<typeof adminClient>,
  params: {
    accionId?: string | null
    teamActionId?: string | null
    checkpointId?: string | null
    usuarioId: string
    waId: string
    deliveryKind: string
    status: 'queued' | 'sent' | 'failed'
    externalMessageId?: string | null
    error?: string | null
    payload: Record<string, unknown>
  }
) {
  const payload = {
    ...params.payload,
    message_type: params.deliveryKind,
    checkpoint_id: params.checkpointId ?? null,
    wa_id: params.waId,
    source: 'send-action',
  }
  await supabase.from('action_delivery_log').insert({
    accion_id: params.accionId ?? null,
    team_action_id: params.teamActionId ?? null,
    usuario_id: params.usuarioId,
    channel: 'whatsapp',
    external_chat_id: params.waId,
    external_message_id: params.externalMessageId ?? null,
    delivery_status: params.status,
    error_message: params.error ?? null,
    sent_at: params.status === 'sent' ? new Date().toISOString() : null,
    payload,
  })

  try {
    const bodyText = outboundPreviewFromRequest(params.payload.request, params.deliveryKind)
    if (params.externalMessageId) {
      const { data: existing } = await supabase
        .from('whatsapp_messages')
        .select('id')
        .eq('meta_message_id', params.externalMessageId)
        .maybeSingle()
      if (existing?.id) return
    }
    const { error: threadError } = await supabase.from('whatsapp_messages').insert({
      wa_id: params.waId,
      usuario_id: params.usuarioId,
      direction: 'outbound',
      source: 'automation',
      message_kind: params.deliveryKind,
      body_text: bodyText,
      meta_message_id: params.externalMessageId ?? null,
      delivery_status: params.status === 'failed' ? 'failed' : params.status === 'queued' ? 'queued' : 'sent',
      error_message: params.error ?? null,
      sent_at: params.status === 'sent' ? new Date().toISOString() : null,
      failed_at: params.status === 'failed' ? new Date().toISOString() : null,
      payload: {
        ...payload,
        legacy_table: 'action_delivery_log',
      },
    })
    if (threadError) {
      console.error('whatsapp_messages dual-write skipped', threadError)
    }
  } catch (threadErr) {
    // No tumbar el envío si la bandeja aún no está migrada.
    console.error('whatsapp_messages dual-write failed', threadErr)
  }
}

function reminderStageForIndex(index: number): string {
  if (index <= 0) return 'configured_delay'
  return `repeat_${index + 1}`
}

/** Jobs a nivel acción (bidireccional.md): checkpoint_id null + target_type=action. */
async function scheduleCorporateFollowups(
  supabase: ReturnType<typeof adminClient>,
  params: {
    accionId: string
    usuarioId: string
    waId: string
    delayMinutes: number
    followupsPerDay: number
  }
) {
  if (params.followupsPerDay <= 0) return
  const delay = Math.max(1, params.delayMinutes)
  const rows: Array<Record<string, unknown>> = []
  for (let i = 0; i < params.followupsPerDay; i++) {
    rows.push({
      scope: 'corporate',
      accion_id: params.accionId,
      checkpoint_id: null,
      usuario_id: params.usuarioId,
      wa_id: params.waId,
      status: 'pending',
      scheduled_at: new Date(Date.now() + delay * (i + 1) * 60_000).toISOString(),
      attempts: 0,
      payload: {
        source: 'initial_send',
        target_type: 'action',
        reminder_stage: reminderStageForIndex(i),
      },
    })
  }
  if (rows.length) await supabase.from('whatsapp_followup_jobs').insert(rows)
}

async function scheduleTeamFollowups(
  supabase: ReturnType<typeof adminClient>,
  params: {
    teamActionId: string
    usuarioId: string
    waId: string
    checklist: Array<{ text: string; done: boolean }>
    delayMinutes: number
    followupsPerDay: number
  }
) {
  if (params.followupsPerDay <= 0) return
  const pendingIndexes = params.checklist
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => !item.done && item.text.trim())
  if (pendingIndexes.length === 0) return
  const delay = Math.max(1, params.delayMinutes)
  const rows: Array<Record<string, unknown>> = []
  for (const { index } of pendingIndexes) {
    for (let i = 0; i < params.followupsPerDay; i++) {
      rows.push({
        scope: 'team',
        team_action_id: params.teamActionId,
        checklist_index: index,
        usuario_id: params.usuarioId,
        wa_id: params.waId,
        status: 'pending',
        scheduled_at: new Date(Date.now() + delay * (i + 1) * 60_000).toISOString(),
        attempts: 0,
        payload: { source: 'initial_send' },
      })
    }
  }
  if (rows.length) await supabase.from('whatsapp_followup_jobs').insert(rows)
}

async function sendCorporate(params: {
  supabase: ReturnType<typeof adminClient>
  settings: Awaited<ReturnType<typeof loadFollowupSettings>>
  templateName: string
  templateLanguage: string
  messageType: WhatsAppMessageType
  accionId?: string
  checkpointId?: string
}) {
  const { supabase, settings, templateName, templateLanguage, messageType } = params
  if (!params.accionId) return jsonResponse({ error: 'accion_id_required' }, 400)

  const { data: action, error: actionError } = await supabase
    .from('acciones_diarias')
    .select('id,titulo_accion,descripcion_accion,estado,fecha,responsable')
    .eq('id', params.accionId)
    .maybeSingle()
  if (actionError) throw actionError
  if (!action) return jsonResponse({ error: 'action_not_found' }, 404)
  const corporate = action as CorporateAction
  if (!corporate.responsable) return jsonResponse({ error: 'action_unassigned' }, 400)

  const identity = await findWhatsAppIdentity(supabase, corporate.responsable)
  if (!identity?.external_user_id) {
    return jsonResponse({ error: 'whatsapp_identity_missing' }, 400)
  }
  const to = normalizePhone(identity.external_user_id)
  if (!to) return jsonResponse({ error: 'invalid_whatsapp_phone' }, 400)

  const { data: checkpoints } = await supabase
    .from('accion_checkpoints')
    .select('id,accion_id,texto,completado,activo,orden')
    .eq('accion_id', corporate.id)
    .eq('activo', true)
    .order('orden', { ascending: true })

  let checkpoint: Checkpoint | null = null
  if (messageType === 'checkpoint_followup') {
    if (!params.checkpointId) return jsonResponse({ error: 'checkpoint_id_required' }, 400)
    checkpoint =
      ((checkpoints ?? []) as Checkpoint[]).find((c) => c.id === params.checkpointId) ?? null
    if (!checkpoint) {
      const { data: one } = await supabase
        .from('accion_checkpoints')
        .select('id,accion_id,texto,completado,activo,orden')
        .eq('id', params.checkpointId)
        .maybeSingle()
      checkpoint = (one as Checkpoint | null) ?? null
    }
    if (!checkpoint) return jsonResponse({ error: 'checkpoint_not_found' }, 404)
  }

  const responsable = await resolveUsuarioNombre(
    supabase,
    corporate.responsable,
    identity.display_name
  )
  const vars: Record<string, string> = {
    responsable_nombre: responsable,
    titulo_accion: corporate.titulo_accion ?? 'Actividad',
    fecha_compromiso: corporate.fecha ?? 'sin fecha',
    checklist_bloque: checklistBlockFromCorporate((checkpoints ?? []) as Checkpoint[]),
    checkpoint_texto: checkpoint?.texto ?? '',
  }

  const open = await hasOpenSession(supabase, to)
  let graphBody: Record<string, unknown>
  let deliveryKind = messageType

  // Plantilla Meta: {{1}} = "Hoy es", {{2}} = saludo — no uses fecha de compromiso aquí.
  const templateBody = initialTemplateBodyParams({
    fecha: formatNowForTemplate(),
    nombre: vars.responsable_nombre,
  })

  if (messageType === 'commitment_close') {
    const text = renderTemplate(settings.commitment_close_template, vars)
    graphBody = open
      ? textPayload(to, text)
      : templatePayload(to, templateName, templateLanguage, templateBody)
    deliveryKind = 'commitment_close'
  } else if (messageType === 'checkpoint_followup') {
    const text = renderTemplate(settings.checkpoint_followup_template, vars)
    const prefix = `chk:${checkpoint!.id}`
    graphBody = open
      ? interactiveFollowupPayload(to, text, prefix)
      : templatePayload(to, templateName, templateLanguage, templateBody)
    deliveryKind = 'checkpoint_followup'
  } else {
    const text = renderTemplate(settings.initial_text_template, vars)
    graphBody = open
      ? textPayload(to, text)
      : templatePayload(to, templateName, templateLanguage, templateBody)
    deliveryKind = 'initial'
  }

  const result = await graphSendMessage(graphBody)
  const messageId = extractMessageId(result.json)

  await logDelivery(supabase, {
    accionId: corporate.id,
    checkpointId: checkpoint?.id ?? null,
    usuarioId: corporate.responsable,
    waId: to,
    deliveryKind,
    status: result.ok ? 'sent' : 'failed',
    externalMessageId: messageId,
    error: result.ok ? null : result.raw.slice(0, 2000),
    payload: { request: graphBody, response: result.json, open_session: open },
  })

  if (!result.ok) {
    return jsonResponse(
      { error: 'graph_send_failed', status: result.status, detail: result.json },
      502
    )
  }

  if (messageType === 'initial') {
    await scheduleCorporateFollowups(supabase, {
      accionId: corporate.id,
      usuarioId: corporate.responsable,
      waId: to,
      delayMinutes: settings.followup_delay_minutes,
      followupsPerDay: settings.followups_per_day,
    })
  }

  if (messageType === 'commitment_close') {
    await supabase.from('whatsapp_result_requests').insert({
      scope: 'corporate',
      accion_id: corporate.id,
      usuario_id: corporate.responsable,
      wa_id: to,
      status: 'waiting',
    })
  }

  return jsonResponse({
    ok: true,
    scope: 'corporate',
    messageType,
    externalMessageId: messageId,
    openSession: open,
  })
}

async function sendTeam(params: {
  supabase: ReturnType<typeof adminClient>
  settings: Awaited<ReturnType<typeof loadFollowupSettings>>
  templateName: string
  templateLanguage: string
  messageType: WhatsAppMessageType
  teamActionId?: string
  checklistIndex?: number
}) {
  const { supabase, settings, templateName, templateLanguage, messageType } = params
  if (!params.teamActionId) return jsonResponse({ error: 'team_action_id_required' }, 400)

  const { data: action, error: actionError } = await supabase
    .from('acciones_equipo')
    .select('id,titulo,descripcion,estado_id,fecha_limite,asignado_a,checklist,bloqueada')
    .eq('id', params.teamActionId)
    .maybeSingle()
  if (actionError) throw actionError
  if (!action) return jsonResponse({ error: 'team_action_not_found' }, 404)
  const team = action as TeamAction
  if (!team.asignado_a) return jsonResponse({ error: 'action_unassigned' }, 400)

  const identity = await findWhatsAppIdentity(supabase, team.asignado_a)
  if (!identity?.external_user_id) {
    return jsonResponse({ error: 'whatsapp_identity_missing' }, 400)
  }
  const to = normalizePhone(identity.external_user_id)
  if (!to) return jsonResponse({ error: 'invalid_whatsapp_phone' }, 400)

  const checklist = parseTeamChecklist(team.checklist)
  let checklistIndex: number | null = null
  let checklistText = ''
  if (messageType === 'checkpoint_followup') {
    if (params.checklistIndex == null || Number.isNaN(Number(params.checklistIndex))) {
      return jsonResponse({ error: 'checklist_index_required' }, 400)
    }
    checklistIndex = Number(params.checklistIndex)
    if (checklistIndex < 0 || checklistIndex >= checklist.length) {
      return jsonResponse({ error: 'checklist_index_out_of_range' }, 400)
    }
    checklistText = checklist[checklistIndex]?.text ?? ''
  }

  const responsable = await resolveUsuarioNombre(supabase, team.asignado_a, identity.display_name)
  const fechaCompromiso = team.fecha_limite
    ? String(team.fecha_limite).slice(0, 10)
    : 'sin fecha'
  const vars: Record<string, string> = {
    responsable_nombre: responsable,
    titulo_accion: team.titulo ?? 'Actividad de equipo',
    fecha_compromiso: fechaCompromiso,
    checklist_bloque: checklistBlockFromTeam(checklist),
    checkpoint_texto: checklistText,
  }

  const open = await hasOpenSession(supabase, to)
  let graphBody: Record<string, unknown>
  let deliveryKind = messageType

  const templateBody = initialTemplateBodyParams({
    fecha: formatNowForTemplate(),
    nombre: vars.responsable_nombre,
  })

  if (messageType === 'commitment_close') {
    const text = renderTemplate(settings.commitment_close_template, vars)
    graphBody = open
      ? textPayload(to, text)
      : templatePayload(to, templateName, templateLanguage, templateBody)
    deliveryKind = 'commitment_close'
  } else if (messageType === 'checkpoint_followup') {
    const text = renderTemplate(settings.checkpoint_followup_template, vars)
    const prefix = `tchk:${team.id}:${checklistIndex}`
    graphBody = open
      ? interactiveFollowupPayload(to, text, prefix)
      : templatePayload(to, templateName, templateLanguage, templateBody)
    deliveryKind = 'checkpoint_followup'
  } else {
    const text = renderTemplate(settings.initial_text_template, vars)
    graphBody = open
      ? textPayload(to, text)
      : templatePayload(to, templateName, templateLanguage, templateBody)
    deliveryKind = 'initial'
  }

  const result = await graphSendMessage(graphBody)
  const messageId = extractMessageId(result.json)

  await logDelivery(supabase, {
    teamActionId: team.id,
    usuarioId: team.asignado_a,
    waId: to,
    deliveryKind,
    status: result.ok ? 'sent' : 'failed',
    externalMessageId: messageId,
    error: result.ok ? null : result.raw.slice(0, 2000),
    payload: {
      request: graphBody,
      response: result.json,
      open_session: open,
      checklist_index: checklistIndex,
    },
  })

  if (!result.ok) {
    return jsonResponse(
      { error: 'graph_send_failed', status: result.status, detail: result.json },
      502
    )
  }

  if (messageType === 'initial') {
    await scheduleTeamFollowups(supabase, {
      teamActionId: team.id,
      usuarioId: team.asignado_a,
      waId: to,
      checklist,
      delayMinutes: settings.followup_delay_minutes,
      followupsPerDay: settings.followups_per_day,
    })
  }

  if (messageType === 'commitment_close') {
    await supabase.from('whatsapp_result_requests').insert({
      scope: 'team',
      team_action_id: team.id,
      usuario_id: team.asignado_a,
      wa_id: to,
      status: 'waiting',
    })
  }

  return jsonResponse({
    ok: true,
    scope: 'team',
    messageType,
    externalMessageId: messageId,
    openSession: open,
  })
}
