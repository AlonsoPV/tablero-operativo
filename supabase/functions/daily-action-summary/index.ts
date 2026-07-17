import { createClient } from 'npm:@supabase/supabase-js@2'

type Settings = {
  enabled: boolean
  send_time: string
  timezone: string
  send_days: 'weekdays' | 'mon_sat' | 'every_day'
  recipient_mode: 'all_active' | 'leaders' | 'selected'
  selected_usuario_ids: string[] | null
  send_if_no_pending: boolean
}
type UserProfile = { id: string; user_id: string | null; nombre: string | null; rol: string | null; activo: boolean | null }
type ActionRow = {
  id: string
  titulo_accion: string | null
  fecha: string
  hora_limite: string | null
  evidencia_esperada: string | null
  evidencia_cargada: boolean | null
  estado: string | null
  prioridad: string | null
  prioridad_id: string | null
  completed_at: string | null
}
type Counts = {
  total_open: number
  critical_open: number
  red_today: number
  overdue: number
  due_today: number
  blocked: number
  missing_evidence: number
  recently_closed: number
}
type PrioritizedAction = ActionRow & { priority_reason: string; priority_rank: number }

const SETTINGS_ID = 'default'
const LEADER_ROLES = ['direccion', 'super_admin', 'dg', 'sistemas', 'lider', 'leader']
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json; charset=utf-8',
}

const env = (name: string) => Deno.env.get(name)?.trim() ?? ''
const optionalEnv = env
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: corsHeaders })
const clean = (value: string | null | undefined) =>
  (value ?? '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
const html = (value: string) =>
  value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;')
const isLeader = (role: string | null | undefined) => LEADER_ROLES.some((leader) => clean(role).includes(leader))
const normalizeEmail = (value: unknown) => {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : ''
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : ''
}
const hasGoogleMailSecrets = () =>
  Boolean(optionalEnv('GOOGLE_CLIENT_ID') && optionalEnv('GOOGLE_CLIENT_SECRET') && optionalEnv('GOOGLE_REFRESH_TOKEN'))

function localParts(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now)
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? ''
  const hour = get('hour') === '24' ? '00' : get('hour')
  return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${hour}:${get('minute')}`, weekday: get('weekday').toLowerCase() }
}

function minutes(value: string) {
  const match = value.match(/^(\d{2}):(\d{2})/)
  if (!match) return null
  const h = Number(match[1])
  const m = Number(match[2])
  return h >= 0 && h <= 23 && m >= 0 && m <= 59 ? h * 60 + m : null
}

function isScheduleMatch(settings: Settings, local: ReturnType<typeof localParts>) {
  const dayOk =
    settings.send_days === 'every_day' ||
    (settings.send_days === 'mon_sat' && local.weekday !== 'sun') ||
    (settings.send_days === 'weekdays' && local.weekday !== 'sat' && local.weekday !== 'sun')
  const now = minutes(local.time)
  const target = minutes(settings.send_time)
  const windowMinutes = Number(env('DAILY_SUMMARY_WINDOW_MINUTES')) || 10
  return dayOk && now != null && target != null && now >= target && now < target + windowMinutes
}

function appBaseUrl() {
  const raw = env('APP_BASE_URL') || env('PUBLIC_APP_URL') || env('SITE_URL')
  if (!raw) return 'https://scrumbanemx.vercel.app'
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`)
    return url.origin.replace(/\/+$/, '')
  } catch {
    return null
  }
}

function emptyCounts(): Counts {
  return { total_open: 0, critical_open: 0, red_today: 0, overdue: 0, due_today: 0, blocked: 0, missing_evidence: 0, recently_closed: 0 }
}

function statusKeyFor(action: ActionRow, statusByName: Map<string, string>) {
  return clean(statusByName.get(clean(action.estado)) ?? action.estado)
}

function isClosedAction(action: ActionRow, statusByName: Map<string, string>) {
  return ['hecho', 'verificado', 'cerrado', 'realizado'].includes(statusKeyFor(action, statusByName))
}

function isCriticalAction(action: ActionRow, priorityById: Map<string, string>, priorityByName: Map<string, string>) {
  const priorityColor = action.prioridad_id ? priorityById.get(action.prioridad_id) : priorityByName.get(clean(action.prioridad))
  const priorityLabel = clean(action.prioridad)
  return priorityColor === 'rojo' || priorityLabel.includes('rojo') || priorityLabel.includes('crit') || priorityLabel.includes('p1')
}

function calculateCounts(
  actions: ActionRow[],
  targetDate: string,
  statusByName: Map<string, string>,
  priorityById: Map<string, string>,
  priorityByName: Map<string, string>
) {
  const counts = emptyCounts()
  for (const action of actions) {
    const statusKey = statusKeyFor(action, statusByName)
    if (isClosedAction(action, statusByName)) {
      if (action.completed_at?.slice(0, 10) === targetDate) counts.recently_closed += 1
      continue
    }

    const isCritical = isCriticalAction(action, priorityById, priorityByName)
    counts.total_open += 1
    if (isCritical) counts.critical_open += 1
    if (action.fecha < targetDate) counts.overdue += 1
    if (action.fecha === targetDate) {
      counts.due_today += 1
      if (isCritical) counts.red_today += 1
    }
    if (statusKey.includes('bloqueado')) counts.blocked += 1
    if ((action.evidencia_esperada ?? '').trim() && action.evidencia_cargada !== true) counts.missing_evidence += 1
  }
  return counts
}

function pending(counts: Counts) {
  return counts.red_today > 0 || counts.overdue > 0
}

function topActions(
  actions: ActionRow[],
  targetDate: string,
  statusByName: Map<string, string>,
  priorityById: Map<string, string>,
  priorityByName: Map<string, string>
): PrioritizedAction[] {
  return actions
    .map((action): PrioritizedAction | null => {
      if (isClosedAction(action, statusByName)) return null
      const isCritical = isCriticalAction(action, priorityById, priorityByName)
      const isOverdue = action.fecha < targetDate
      const isRedToday = isCritical && action.fecha === targetDate
      if (!isOverdue && !isRedToday) return null
      if (isCritical && isOverdue) return { ...action, priority_reason: 'Roja vencida', priority_rank: 0 }
      if (isOverdue) return { ...action, priority_reason: 'Vencida', priority_rank: 1 }
      return { ...action, priority_reason: 'Roja de hoy', priority_rank: 2 }
    })
    .filter((action): action is PrioritizedAction => Boolean(action))
    .sort((a, b) => {
      if (a.priority_rank !== b.priority_rank) return a.priority_rank - b.priority_rank
      return `${a.fecha} ${a.hora_limite ?? ''}`.localeCompare(`${b.fecha} ${b.hora_limite ?? ''}`)
    })
    .slice(0, 6)
}

function base64(value: string): string {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function base64Url(value: string): string {
  return base64(value).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

function mimeHeader(value: string): string {
  return `=?UTF-8?B?${base64(value)}?=`
}

async function googleAccessToken(): Promise<string> {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: optionalEnv('GOOGLE_CLIENT_ID'),
      client_secret: optionalEnv('GOOGLE_CLIENT_SECRET'),
      refresh_token: optionalEnv('GOOGLE_REFRESH_TOKEN'),
      grant_type: 'refresh_token',
    }),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok || typeof data?.access_token !== 'string') {
    throw new Error(data?.error_description || data?.error || 'No se pudo obtener token de Google')
  }
  return data.access_token
}

function gmailRawMessage(input: {
  from: string
  to: string
  subject: string
  html: string
  text: string
  replyTo?: string
}): string {
  const boundary = `tablero_${crypto.randomUUID().replaceAll('-', '')}`
  const headers = [
    `From: ${input.from}`,
    `To: ${input.to}`,
    `Subject: ${mimeHeader(input.subject)}`,
    'MIME-Version: 1.0',
    input.replyTo ? `Reply-To: ${input.replyTo}` : null,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ].filter((line): line is string => Boolean(line))

  return [
    ...headers,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 8bit',
    '',
    input.text,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: 8bit',
    '',
    input.html,
    '',
    `--${boundary}--`,
  ].join('\r\n')
}

async function sendWithGoogleMail(input: { to: string; subject: string; html: string; text: string }) {
  const token = await googleAccessToken()
  const from = optionalEnv('GOOGLE_GMAIL_FROM') || optionalEnv('NOTIFICATION_EMAIL_FROM') || 'me'
  const raw = gmailRawMessage({
    from,
    to: input.to,
    subject: input.subject,
    html: input.html,
    text: input.text,
    replyTo: optionalEnv('NOTIFICATION_EMAIL_REPLY_TO') || undefined,
  })

  const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw: base64Url(raw) }),
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(result?.error?.message || 'No se pudo enviar correo por Gmail')
  return { provider: 'gmail', id: result?.id ?? null }
}

function buildEmail(input: { name: string; counts: Counts; actions: PrioritizedAction[]; url: string; isTest: boolean }) {
  const subject = `${input.isTest ? '[Prueba] ' : ''}Resumen diario de acciones pendientes`
  const actionList = input.actions.length
    ? input.actions.map((action, index) => `${index + 1}. [${action.priority_reason}] ${action.titulo_accion || 'Accion sin titulo'} (${action.fecha})`).join('\n')
    : 'No hay acciones rojas del dia ni vencidas por cerrar.'
  const text = [
    subject,
    '',
    `Hola ${input.name},`,
    '',
    'Este es tu resumen de acciones para hoy:',
    `- ${input.counts.red_today} acciones rojas del dia`,
    `- ${input.counts.overdue} acciones vencidas`,
    '',
    'Prioridad sugerida:',
    '1. Cierra primero las acciones rojas vencidas.',
    '2. Despues atiende las demas acciones vencidas.',
    '3. Finalmente atiende las acciones rojas con fecha de hoy.',
    '',
    'Que cerrar primero:',
    actionList,
    '',
    `Ver mi dia operativo: ${input.url}`,
  ].join('\n')
  const items = input.actions.length
    ? `<ol>${input.actions.map((action) => `<li><strong>${html(action.priority_reason)}</strong>: ${html(action.titulo_accion || 'Accion sin titulo')} <span style="color:#64748b">(${html(action.fecha)})</span></li>`).join('')}</ol>`
    : '<p style="color:#64748b">No hay acciones rojas del dia ni vencidas por cerrar.</p>'
  const body = `<!doctype html><html lang="es"><body style="margin:0;background:#f8fafc;font-family:Arial,sans-serif;color:#0f172a"><div style="max-width:640px;margin:0 auto;padding:28px 18px"><div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:24px"><p style="margin:0 0 10px;color:#64748b;font-size:13px">SCRUMBAN</p><h1 style="margin:0 0 14px;font-size:22px">${html(subject)}</h1><p>Hola ${html(input.name)},</p><p>Este es tu resumen de acciones para hoy:</p><ul><li>${input.counts.red_today} acciones rojas del dia</li><li>${input.counts.overdue} acciones vencidas</li></ul><h2 style="font-size:16px">Prioridad sugerida</h2><ol><li>Cierra primero las acciones rojas vencidas.</li><li>Despues atiende las demas acciones vencidas.</li><li>Finalmente atiende las acciones rojas con fecha de hoy.</li></ol><h2 style="font-size:16px">Que cerrar primero</h2>${items}<p style="margin-top:24px"><a href="${html(input.url)}" style="display:inline-block;background:#0f172a;color:#fff;text-decoration:none;border-radius:8px;padding:11px 16px;font-weight:700">Ver mi dia operativo</a></p></div></div></body></html>`
  return { subject, text, html: body }
}

async function sendEmail(to: string, subject: string, bodyHtml: string, text: string) {
  if (!hasGoogleMailSecrets()) throw new Error('Faltan secretos de Gmail')
  return sendWithGoogleMail({ to, subject, html: bodyHtml, text })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders })
  if (req.method !== 'POST') return json({ ok: false, message: 'Metodo no permitido' }, 405)

  const supabaseUrl = env('SUPABASE_URL')
  const serviceRole = env('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceRole) return json({ ok: false, message: 'Faltan credenciales de Supabase' }, 500)
  const admin = createClient(supabaseUrl, serviceRole, { auth: { autoRefreshToken: false, persistSession: false } })

  const body = (await req.json().catch(() => ({}))) as { mode?: string; test_email?: string }
  const isTest = body.mode === 'test'
  const testEmail = isTest ? normalizeEmail(body.test_email) : ''
  if (isTest && body.test_email && !testEmail) return json({ ok: false, message: 'Correo de prueba invalido' }, 400)
  const cronHeader = req.headers.get('x-cron-secret') ?? ''
  const { data: vaultCronSecret } = await admin.rpc('get_daily_action_summary_cron_secret')
  const cronSecret = env('DAILY_ACTION_SUMMARY_CRON_SECRET') || (typeof vaultCronSecret === 'string' ? vaultCronSecret : '')
  const isCron = Boolean(cronSecret && cronHeader === cronSecret)
  let caller: UserProfile | null = null

  if (!isCron) {
    const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') ?? ''
    const auth = token ? await admin.auth.getUser(token) : null
    if (!auth?.data.user) return json({ ok: false, message: 'No autorizado' }, 401)
    const { data: profile } = await admin.from('usuarios').select('id,user_id,nombre,rol,activo').eq('user_id', auth.data.user.id).maybeSingle<UserProfile>()
    if (!profile?.activo || !isLeader(profile.rol)) return json({ ok: false, message: 'No autorizado' }, 403)
    caller = profile
  }
  if (!isCron && !isTest) return json({ ok: false, message: 'Solo el scheduler puede ejecutar envios reales' }, 403)

  const startedAt = new Date()
  const runId = crypto.randomUUID()
  const { data: settings } = await admin.from('daily_action_summary_settings').select('*').eq('id', SETTINGS_ID).maybeSingle<Settings>()
  if (!settings) return json({ ok: false, message: 'Configuracion no disponible' }, 500)
  const setDeliveryStatus = (last_status: string, last_message: string, last_counts = {}) =>
    admin.from('daily_action_summary_settings').update({ last_run_at: new Date().toISOString(), last_status, last_message, last_counts }).eq('id', SETTINGS_ID)
  const setSchedulerStatus = (scheduler_last_status: string, scheduler_last_message: string) =>
    admin
      .from('daily_action_summary_settings')
      .update({
        scheduler_last_checked_at: new Date().toISOString(),
        scheduler_last_status,
        scheduler_last_message,
      })
      .eq('id', SETTINGS_ID)

  let local: ReturnType<typeof localParts>
  try {
    local = localParts(startedAt, settings.timezone)
  } catch {
    await setSchedulerStatus('config_error', 'Zona horaria invalida')
    await setDeliveryStatus('config_error', 'Zona horaria invalida')
    return json({ ok: false, message: 'Zona horaria invalida' }, 400)
  }
  if (!isTest && !settings.enabled) {
    await setSchedulerStatus('skipped_disabled', 'Resumen diario desactivado')
    return json({ ok: true, skipped: true, reason: 'disabled' })
  }
  if (!isTest && !isScheduleMatch(settings, local)) {
    await setSchedulerStatus('skipped_schedule', 'Fuera de horario configurado')
    return json({ ok: true, skipped: true, reason: 'outside_schedule' })
  }
  const baseUrl = appBaseUrl()
  if (!baseUrl) {
    await setSchedulerStatus('config_error', 'APP_BASE_URL faltante o invalido')
    await setDeliveryStatus('config_error', 'APP_BASE_URL faltante o invalido')
    return json({ ok: false, message: 'APP_BASE_URL faltante o invalido' }, 500)
  }

  const { data: statuses } = await admin.from('statuses').select('nombre,estado_key')
  const { data: priorities } = await admin.from('priorities').select('id,nombre,color')
  const statusByName = new Map((statuses ?? []).map((row: { nombre: string | null; estado_key: string | null }) => [clean(row.nombre), row.estado_key ?? row.nombre ?? '']))
  const priorityById = new Map((priorities ?? []).map((row: { id: string; color: string | null }) => [row.id, clean(row.color)]))
  const priorityByName = new Map((priorities ?? []).map((row: { nombre: string | null; color: string | null }) => [clean(row.nombre), clean(row.color)]))

  let users: UserProfile[] = []
  if (isTest) users = caller ? [caller] : []
  else {
    const { data } = await admin.from('usuarios').select('id,user_id,nombre,rol,activo').eq('activo', true)
    users = ((data ?? []) as UserProfile[]).filter((user) =>
      settings.recipient_mode === 'all_active' ||
      (settings.recipient_mode === 'leaders' && isLeader(user.rol)) ||
      (settings.recipient_mode === 'selected' && (settings.selected_usuario_ids ?? []).includes(user.id))
    )
  }
  if (!isTest && settings.recipient_mode === 'selected' && (settings.selected_usuario_ids ?? []).length === 0) {
    await setSchedulerStatus('config_error', 'No hay usuarios seleccionados')
    await setDeliveryStatus('config_error', 'No hay usuarios seleccionados')
    return json({ ok: false, message: 'No hay usuarios seleccionados' }, 400)
  }

  const summary = { sent: 0, omitted_no_pending: 0, skipped: 0, errors: 0 }
  for (const user of users) {
    const baseLog = { run_id: runId, settings_id: SETTINGS_ID, execution_started_at: startedAt.toISOString(), target_date: local.date, usuario_id: user.id, is_test: isTest }
    try {
      if (!user.activo || !user.user_id) {
        await admin.from('daily_action_summary_logs').insert({ ...baseLog, status: 'skipped_inactive' })
        summary.skipped += 1
        continue
      }
      if (!isTest) {
        const { data: duplicate } = await admin.from('daily_action_summary_logs').select('id').eq('settings_id', SETTINGS_ID).eq('usuario_id', user.id).eq('target_date', local.date).eq('is_test', false).in('status', ['sent', 'omitted_no_pending', 'skipped_no_email', 'skipped_inactive']).maybeSingle()
        if (duplicate) {
          await admin.from('daily_action_summary_logs').insert({ ...baseLog, status: 'skipped_duplicate' })
          summary.skipped += 1
          continue
        }
      }
      let email = testEmail
      if (!email) {
        const authUser = await admin.auth.admin.getUserById(user.user_id)
        email = authUser.data.user?.email?.trim() ?? ''
        if (authUser.error || !email) {
          await admin.from('daily_action_summary_logs').insert({ ...baseLog, email: email || null, status: 'skipped_no_email' })
          summary.skipped += 1
          continue
        }
      }
      const { data: actions, error } = await admin.from('acciones_diarias').select('id,titulo_accion,fecha,hora_limite,evidencia_esperada,evidencia_cargada,estado,prioridad,prioridad_id,completed_at').eq('responsable', user.id)
      if (error) throw error
      const rows = (actions ?? []) as ActionRow[]
      const counts = calculateCounts(rows, local.date, statusByName, priorityById, priorityByName)
      if (!isTest && !settings.send_if_no_pending && !pending(counts)) {
        await admin.from('daily_action_summary_logs').insert({ ...baseLog, email, status: 'omitted_no_pending', counts })
        summary.omitted_no_pending += 1
        continue
      }
      const built = buildEmail({
        name: user.nombre?.trim() || email.split('@')[0] || 'usuario',
        counts,
        actions: topActions(rows, local.date, statusByName, priorityById, priorityByName),
        url: `${baseUrl}/disciplina`,
        isTest,
      })
      const sent = await sendEmail(email, built.subject, built.html, built.text)
      await admin.from('daily_action_summary_logs').insert({ ...baseLog, email, status: 'sent', counts, provider: sent.provider, email_id: sent.id })
      summary.sent += 1
    } catch (error) {
      await admin.from('daily_action_summary_logs').insert({ ...baseLog, status: 'error', error_message: (error instanceof Error ? error.message : 'Error desconocido').slice(0, 1000) })
      summary.errors += 1
    }
  }

  const status = summary.errors ? (summary.sent ? 'partial_error' : 'error') : 'sent'
  const message = isTest ? 'Correo de prueba procesado' : `Resumen procesado: ${summary.sent} enviados, ${summary.omitted_no_pending} omitidos sin pendientes, ${summary.skipped} omitidos, ${summary.errors} errores`
  await setDeliveryStatus(status, message, summary)
  await setSchedulerStatus(summary.errors ? 'error' : 'ok', message)
  return json({ ok: summary.errors === 0, is_test: isTest, run_id: runId, target_date: local.date, summary })
})
