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
          { type: 'reply', reply: { id: `${buttonIdPrefix}:progress`, title: 'En proceso' } },
          { type: 'reply', reply: { id: `${buttonIdPrefix}:support`, title: 'Requiero apoyo' } },
        ],
      },
    },
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

async function logDispatcherDelivery(
  supabase: ReturnType<typeof adminClient>,
  params: {
    accionId?: string | null
    teamActionId?: string | null
    usuarioId: string
    waId: string
    messageId: string | null
    ok: boolean
    errorRaw?: string
    payload: Record<string, unknown>
    bodyText: string
  }
) {
  await supabase.from('action_delivery_log').insert({
    accion_id: params.accionId ?? null,
    team_action_id: params.teamActionId ?? null,
    usuario_id: params.usuarioId,
    channel: 'whatsapp',
    external_chat_id: params.waId,
    external_message_id: params.messageId,
    delivery_status: params.ok ? 'sent' : 'failed',
    error_message: params.ok ? null : (params.errorRaw ?? null)?.slice(0, 2000),
    sent_at: params.ok ? new Date().toISOString() : null,
    payload: params.payload,
  })

  if (params.messageId) {
    const { data: existing } = await supabase
      .from('whatsapp_messages')
      .select('id')
      .eq('meta_message_id', params.messageId)
      .maybeSingle()
    if (existing?.id) return
  }

  await supabase.from('whatsapp_messages').insert({
    wa_id: params.waId,
    usuario_id: params.usuarioId,
    direction: 'outbound',
    source: 'automation',
    message_kind: 'checkpoint_followup',
    body_text: params.bodyText,
    meta_message_id: params.messageId,
    delivery_status: params.ok ? 'sent' : 'failed',
    error_message: params.ok ? null : (params.errorRaw ?? null)?.slice(0, 2000),
    sent_at: params.ok ? new Date().toISOString() : null,
    failed_at: params.ok ? null : new Date().toISOString(),
    payload: {
      ...params.payload,
      legacy_table: 'action_delivery_log',
    },
  })
}

type JobRow = {
  id: string
  scope: 'corporate' | 'team'
  usuario_id: string
  wa_id: string
  accion_id: string | null
  checkpoint_id: string | null
  team_action_id: string | null
  checklist_index: number | null
  attempts: number
  status: string
  payload: Record<string, unknown> | null
}

function jobTargetType(job: JobRow): 'action' | 'checkpoint_legacy' | 'team' {
  if (job.scope === 'team') return 'team'
  const payloadType = typeof job.payload?.target_type === 'string' ? job.payload.target_type : ''
  if (payloadType === 'action' || !job.checkpoint_id) return 'action'
  return 'checkpoint_legacy'
}

function jobReminderStage(job: JobRow): string {
  return typeof job.payload?.reminder_stage === 'string' && job.payload.reminder_stage
    ? job.payload.reminder_stage
    : 'configured_delay'
}

function fitInteractiveBody(text: string) {
  const clean = text.trim()
  if (clean.length <= 1024) return clean
  return `${clean.slice(0, 1000).trim()}…`
}

function buildActionFollowupBody(input: {
  titulo: string
  pendingLines: string[]
}) {
  const list =
    input.pendingLines.length > 0
      ? input.pendingLines.map((line, i) => `${i + 1}. ${line}`).join('\n')
      : '1. (sin checkpoints pendientes)'
  return fitInteractiveBody(
    [
      `Seguimiento: ${input.titulo}`,
      '',
      'Pendientes:',
      list,
      '',
      'Responde con el boton: Realizada, En proceso o Requiero apoyo.',
    ].join('\n')
  )
}

function unauthorized() {
  return new Response(JSON.stringify({ error: 'unauthorized' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  })
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers':
          'authorization, x-client-info, apikey, content-type, x-dispatcher-secret',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
    })
  }
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const expected = Deno.env.get('WHATSAPP_DISPATCHER_SECRET')?.trim() || ''
  if (!expected) {
    console.error('whatsapp-followup-dispatcher missing WHATSAPP_DISPATCHER_SECRET')
    return unauthorized()
  }
  const provided = req.headers.get('x-dispatcher-secret')?.trim() || ''
  if (provided !== expected) return unauthorized()

  try {
    const supabase = adminClient()
    const settings = await loadFollowupSettings(supabase)
    const { templateName, templateLanguage } = whatsappConfig()
    const nowIso = new Date().toISOString()

    const { data: jobs, error } = await supabase
      .from('whatsapp_followup_jobs')
      .select(
        'id,scope,usuario_id,wa_id,accion_id,checkpoint_id,team_action_id,checklist_index,attempts,status,payload'
      )
      .eq('status', 'pending')
      .lte('scheduled_at', nowIso)
      .order('scheduled_at', { ascending: true })
      .limit(20)

    if (error) throw error
    const results: Array<Record<string, unknown>> = []

    for (const job of (jobs ?? []) as JobRow[]) {
      const { data: claimed } = await supabase
        .from('whatsapp_followup_jobs')
        .update({
          status: 'processing',
          attempts: (job.attempts ?? 0) + 1,
          last_attempt_at: nowIso,
        })
        .eq('id', job.id)
        .eq('status', 'pending')
        .select('id')
        .maybeSingle()

      if (!claimed?.id) {
        results.push({ id: job.id, status: 'skipped', reason: 'already_claimed' })
        continue
      }

      try {
        const outcome = await processJob(supabase, job, settings, templateName, templateLanguage)
        results.push({ id: job.id, ...outcome })
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        await supabase
          .from('whatsapp_followup_jobs')
          .update({ status: 'failed', error_message: message.slice(0, 2000) })
          .eq('id', job.id)
        results.push({ id: job.id, status: 'failed', error: message })
      }
    }

    return json({ ok: true, processed: results.length, results })
  } catch (error) {
    console.error('whatsapp-followup-dispatcher error', error)
    return json(
      { error: 'dispatcher_failed', detail: error instanceof Error ? error.message : String(error) },
      500
    )
  }
})

async function cancelDuplicateActionJobs(
  supabase: ReturnType<typeof adminClient>,
  job: JobRow
) {
  if (!job.accion_id) return
  const stage = jobReminderStage(job)
  const { data: siblings } = await supabase
    .from('whatsapp_followup_jobs')
    .select('id,payload')
    .eq('scope', 'corporate')
    .eq('accion_id', job.accion_id)
    .eq('usuario_id', job.usuario_id)
    .eq('status', 'pending')
    .neq('id', job.id)

  for (const sibling of siblings ?? []) {
    const payload = (sibling.payload ?? {}) as Record<string, unknown>
    const siblingStage =
      typeof payload.reminder_stage === 'string' ? payload.reminder_stage : 'configured_delay'
    const siblingType = typeof payload.target_type === 'string' ? payload.target_type : ''
    if (siblingType === 'action' && siblingStage === stage) {
      await cancel(supabase, sibling.id as string, 'duplicate_action_stage')
    }
  }
}

async function processJob(
  supabase: ReturnType<typeof adminClient>,
  job: JobRow,
  settings: Awaited<ReturnType<typeof loadFollowupSettings>>,
  templateName: string,
  templateLanguage: string
) {
  if (job.scope === 'corporate') {
    if (!job.accion_id) {
      await cancel(supabase, job.id, 'missing_corporate_ids')
      return { status: 'canceled', reason: 'missing_corporate_ids' }
    }

    const target = jobTargetType(job)

    const { data: action } = await supabase
      .from('acciones_diarias')
      .select('id,titulo_accion,fecha,responsable,estado')
      .eq('id', job.accion_id)
      .maybeSingle()

    if (!action || action.estado === 'Hecho' || action.estado === 'Verificado') {
      await cancel(supabase, job.id, 'action_closed')
      return { status: 'canceled', reason: 'action_closed' }
    }

    const identity = await findWhatsAppIdentity(supabase, job.usuario_id)
    const to = normalizePhone(identity?.external_user_id || job.wa_id)
    if (!to) {
      await fail(supabase, job.id, 'invalid_phone')
      return { status: 'failed', reason: 'invalid_phone' }
    }

    const { data: user } = await supabase
      .from('usuarios')
      .select('nombre,email')
      .eq('id', job.usuario_id)
      .maybeSingle()

    if (target === 'action') {
      await cancelDuplicateActionJobs(supabase, job)

      const { data: pendingCheckpoints } = await supabase
        .from('accion_checkpoints')
        .select('id,texto,completado,activo,orden')
        .eq('accion_id', job.accion_id)
        .eq('activo', true)
        .eq('completado', false)
        .order('orden', { ascending: true })

      const pendingLines = (pendingCheckpoints ?? []).map(
        (c) => (typeof c.texto === 'string' && c.texto.trim() ? c.texto.trim() : 'Checkpoint')
      )
      const text = buildActionFollowupBody({
        titulo: action.titulo_accion ?? 'Actividad',
        pendingLines,
      })
      const open = await hasOpenSession(supabase, to)
      const graphBody = open
        ? interactiveFollowupPayload(to, text, `act:${action.id}`)
        : templatePayload(to, templateName, templateLanguage, [
            (user?.nombre || user?.email || 'usuario') as string,
            action.titulo_accion ?? 'Actividad',
            action.fecha ?? 'sin fecha',
          ])

      const result = await graphSendMessage(graphBody)
      const messageId = extractMessageId(result.json)

      await logDispatcherDelivery(supabase, {
        accionId: action.id,
        usuarioId: job.usuario_id,
        waId: to,
        messageId,
        ok: result.ok,
        errorRaw: result.raw,
        bodyText: open ? text : `[Plantilla] ${templateName}`,
        payload: {
          message_type: 'checkpoint_followup',
          checkpoint_id: null,
          wa_id: to,
          source: 'followup_job',
          followup_job_id: job.id,
          target_type: 'action',
          reminder_stage: jobReminderStage(job),
          request: graphBody,
          response: result.json,
        },
      })

      if (!result.ok) {
        await fail(supabase, job.id, result.raw.slice(0, 2000))
        return { status: 'failed', reason: 'graph_send_failed' }
      }

      await supabase
        .from('whatsapp_followup_jobs')
        .update({ status: 'sent', sent_at: new Date().toISOString(), error_message: null })
        .eq('id', job.id)
      return { status: 'sent', externalMessageId: messageId, target_type: 'action' }
    }

    // Legacy: un job por checkpoint (chk:)
    if (!job.checkpoint_id) {
      await cancel(supabase, job.id, 'missing_corporate_ids')
      return { status: 'canceled', reason: 'missing_corporate_ids' }
    }

    const { data: checkpoint } = await supabase
      .from('accion_checkpoints')
      .select('id,texto,completado,activo,accion_id')
      .eq('id', job.checkpoint_id)
      .maybeSingle()

    if (!checkpoint || checkpoint.completado || checkpoint.activo === false) {
      await cancel(supabase, job.id, 'checkpoint_done_or_missing')
      return { status: 'canceled', reason: 'checkpoint_done_or_missing' }
    }

    const vars = {
      responsable_nombre: (user?.nombre || user?.email || 'usuario') as string,
      titulo_accion: action.titulo_accion ?? 'Actividad',
      fecha_compromiso: action.fecha ?? 'sin fecha',
      checklist_bloque: '',
      checkpoint_texto: checkpoint.texto ?? '',
    }
    const text = renderTemplate(settings.checkpoint_followup_template, vars)
    const open = await hasOpenSession(supabase, to)
    const graphBody = open
      ? interactiveFollowupPayload(to, text, `chk:${checkpoint.id}`)
      : templatePayload(to, templateName, templateLanguage, [
          vars.responsable_nombre,
          vars.titulo_accion,
          vars.checkpoint_texto || vars.fecha_compromiso,
        ])

    const result = await graphSendMessage(graphBody)
    const messageId = extractMessageId(result.json)

    await logDispatcherDelivery(supabase, {
      accionId: action.id,
      usuarioId: job.usuario_id,
      waId: to,
      messageId,
      ok: result.ok,
      errorRaw: result.raw,
      bodyText: open ? text : `[Plantilla] ${templateName}`,
      payload: {
        message_type: 'checkpoint_followup',
        checkpoint_id: checkpoint.id,
        wa_id: to,
        source: 'followup_job',
        followup_job_id: job.id,
        target_type: 'checkpoint_legacy',
        request: graphBody,
        response: result.json,
      },
    })

    if (!result.ok) {
      await fail(supabase, job.id, result.raw.slice(0, 2000))
      return { status: 'failed', reason: 'graph_send_failed' }
    }

    await supabase
      .from('whatsapp_followup_jobs')
      .update({ status: 'sent', sent_at: new Date().toISOString(), error_message: null })
      .eq('id', job.id)
    return { status: 'sent', externalMessageId: messageId }
  }

  // team
  if (!job.team_action_id || job.checklist_index == null) {
    await cancel(supabase, job.id, 'missing_team_ids')
    return { status: 'canceled', reason: 'missing_team_ids' }
  }

  const { data: team } = await supabase
    .from('acciones_equipo')
    .select('id,titulo,fecha_limite,asignado_a,checklist,completed_at')
    .eq('id', job.team_action_id)
    .maybeSingle()

  if (!team || team.completed_at) {
    await cancel(supabase, job.id, 'team_action_closed')
    return { status: 'canceled', reason: 'team_action_closed' }
  }

  const checklist = Array.isArray(team.checklist) ? team.checklist : []
  const item = checklist[job.checklist_index] as { text?: string; done?: boolean } | undefined
  if (!item || item.done) {
    await cancel(supabase, job.id, 'checklist_done_or_missing')
    return { status: 'canceled', reason: 'checklist_done_or_missing' }
  }

  const identity = await findWhatsAppIdentity(supabase, job.usuario_id)
  const to = normalizePhone(identity?.external_user_id || job.wa_id)
  if (!to) {
    await fail(supabase, job.id, 'invalid_phone')
    return { status: 'failed', reason: 'invalid_phone' }
  }

  const { data: user } = await supabase
    .from('usuarios')
    .select('nombre,email')
    .eq('id', job.usuario_id)
    .maybeSingle()

  const vars = {
    responsable_nombre: (user?.nombre || user?.email || 'usuario') as string,
    titulo_accion: team.titulo ?? 'Actividad de equipo',
    fecha_compromiso: team.fecha_limite ? String(team.fecha_limite).slice(0, 10) : 'sin fecha',
    checklist_bloque: '',
    checkpoint_texto: item.text ?? '',
  }
  const text = renderTemplate(settings.checkpoint_followup_template, vars)
  const open = await hasOpenSession(supabase, to)
  const graphBody = open
    ? interactiveFollowupPayload(to, text, `tchk:${team.id}:${job.checklist_index}`)
    : templatePayload(to, templateName, templateLanguage, [
        vars.responsable_nombre,
        vars.titulo_accion,
        vars.checkpoint_texto || vars.fecha_compromiso,
      ])

  const result = await graphSendMessage(graphBody)
  const messageId = extractMessageId(result.json)

  await logDispatcherDelivery(supabase, {
    teamActionId: team.id,
    usuarioId: job.usuario_id,
    waId: to,
    messageId,
    ok: result.ok,
    errorRaw: result.raw,
    bodyText: open ? text : `[Plantilla] ${templateName}`,
    payload: {
      message_type: 'checkpoint_followup',
      checklist_index: job.checklist_index,
      wa_id: to,
      source: 'followup_job',
      followup_job_id: job.id,
      request: graphBody,
      response: result.json,
    },
  })

  if (!result.ok) {
    await fail(supabase, job.id, result.raw.slice(0, 2000))
    return { status: 'failed', reason: 'graph_send_failed' }
  }

  await supabase
    .from('whatsapp_followup_jobs')
    .update({ status: 'sent', sent_at: new Date().toISOString(), error_message: null })
    .eq('id', job.id)
  return { status: 'sent', externalMessageId: messageId }
}

async function cancel(supabase: ReturnType<typeof adminClient>, id: string, reason: string) {
  await supabase
    .from('whatsapp_followup_jobs')
    .update({ status: 'canceled', error_message: reason })
    .eq('id', id)
}

async function fail(supabase: ReturnType<typeof adminClient>, id: string, reason: string) {
  await supabase
    .from('whatsapp_followup_jobs')
    .update({ status: 'failed', error_message: reason.slice(0, 2000) })
    .eq('id', id)
}
