import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js'

/** Stubs para el checker de TypeScript del repo (runtime = Deno en Supabase Edge). */
declare global {
  var Deno: {
    env: { get(key: string): string | undefined }
    serve: (handler: (req: Request) => Response | Promise<Response>) => void
  }
}

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
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

type RequireUserOk = { user: User; token: string }
type RequireUserResult =
  | { ok: true; data: RequireUserOk }
  | { ok: false; response: Response }

async function requireAuthUser(req: Request): Promise<RequireUserResult> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!supabaseUrl || !serviceRoleKey) {
    return {
      ok: false,
      response: jsonResponse({ error: 'Configuracion de servidor incompleta' }, 500),
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
      response: jsonResponse({ error: 'Sesion invalida' }, 401),
    }
  }

  return {
    ok: true,
    data: { user: userData.user, token },
  }
}

type NotificationEmailPayload = {
  usuario_id?: string
  tipo?: string
  prioridad?: 'Normal' | 'Alta' | 'Urgente'
  notification_id?: string | null
  payload?: Record<string, unknown> | null
}

type RecipientProfile = {
  id: string
  user_id: string
  nombre: string | null
  activo: boolean | null
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const FUNCTION_VERSION = 'gmail-from-diagnostics-20260717'

function normalizePriority(value: unknown): 'Normal' | 'Alta' | 'Urgente' {
  return value === 'Alta' || value === 'Urgente' ? value : 'Normal'
}

function textFromPayload(payload: Record<string, unknown> | null | undefined, key: string): string {
  const value = payload?.[key]
  return typeof value === 'string' ? value.trim() : ''
}

function stringListFromPayload(payload: Record<string, unknown> | null | undefined, key: string): string[] {
  const value = payload?.[key]
  if (!Array.isArray(value)) return []
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean)
    .slice(0, 12)
}

function normalizeActionDescription(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ''
  const cleaned = trimmed
    .replace(/^C[oó]mo:\s*/gim, '')
    .replace(/^Quiero:\s*/gim, '')
    .replace(/^Para qu[eé]:\s*/gim, '')
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean)
  return (cleaned.length > 0 ? cleaned : [trimmed]).join('\n\n')
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

const DEFAULT_APP_BASE_URL = 'https://dev-tablero-operativo.vercel.app'

function normalizeAppBaseUrl(value: string | undefined): string | null {
  const trimmed = value?.trim().replace(/\/+$/, '')
  if (!trimmed) return null

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  try {
    const url = new URL(withProtocol)
    const hostname = url.hostname.toLowerCase()
    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1'
    if (!isLocalhost && !hostname.includes('.')) return null
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return url.origin
  } catch {
    return null
  }
}

function appBaseUrl(): string {
  return normalizeAppBaseUrl(
    Deno.env.get('APP_BASE_URL') ||
    Deno.env.get('PUBLIC_APP_URL') ||
    Deno.env.get('SITE_URL')
  ) || DEFAULT_APP_BASE_URL
}

function optionalEnv(name: string): string {
  return Deno.env.get(name)?.trim() ?? ''
}

function hasGoogleMailSecrets(): boolean {
  return Boolean(
    optionalEnv('GOOGLE_CLIENT_ID') &&
      optionalEnv('GOOGLE_CLIENT_SECRET') &&
      optionalEnv('GOOGLE_REFRESH_TOKEN')
  )
}

/** Sin `Database` generado, `ReturnType<typeof createClient>` tipa tablas desconocidas como `never`. */
type AdminClient = SupabaseClient

async function logNotificationEmail(
  adminClient: AdminClient,
  input: {
    notificationId?: string | null
    usuarioId?: string | null
    tipo?: string | null
    prioridad?: string | null
    email?: string | null
    provider?: string | null
    providerAccount?: string | null
    emailId?: string | null
    status: string
    reason?: string | null
    errorMessage?: string | null
    payload?: Record<string, unknown> | null
  }
): Promise<void> {
  const { error } = await adminClient.from('notification_email_logs').insert({
    notification_id: input.notificationId ?? null,
    usuario_id: input.usuarioId ?? null,
    tipo: input.tipo ?? null,
    prioridad: input.prioridad ?? null,
    email: input.email ?? null,
    provider: input.provider ?? null,
    provider_account: input.providerAccount ?? null,
    email_id: input.emailId ?? null,
    status: input.status,
    reason: input.reason ?? null,
    error_message: input.errorMessage?.slice(0, 1000) ?? null,
    payload: input.payload ?? null,
  })
  if (error) {
    console.error('[send-notification-email] log insert failed:', error.message)
  }
}

function actionUrl(payload: Record<string, unknown> | null | undefined): string {
  const accionId = textFromPayload(payload, 'accion_id')
  if (accionId) return `${appBaseUrl()}/kanban?accion=${encodeURIComponent(accionId)}`
  const reminderDue = textFromPayload(payload, 'fecha_limite')
  if (reminderDue) {
    const date = Number.isFinite(new Date(reminderDue).getTime())
      ? new Date(reminderDue).toISOString().slice(0, 10)
      : ''
    if (date) return `${appBaseUrl()}/calendario?fecha=${encodeURIComponent(date)}&tipo=recordatorios`
  }
  const ticketId = textFromPayload(payload, 'ticket_id')
  if (ticketId) return `${appBaseUrl()}/tickets?ticket=${encodeURIComponent(ticketId)}`
  return `${appBaseUrl()}/notificaciones`
}

function subjectForNotification(tipo: string, prioridad: string, payload: Record<string, unknown> | null): string {
  const explicitTitle = textFromPayload(payload, 'titulo')
  const base =
    explicitTitle ||
    (tipo === 'responsable'
      ? 'Te asignaron una accion'
      : tipo === 'check_responsable'
        ? 'Te asignaron un check por validar'
      : tipo === 'comentario_asignado'
        ? 'Te etiquetaron en un comentario'
        : tipo === 'comentario'
          ? 'Nuevo comentario en una accion'
          : 'Nueva notificacion')
  return prioridad === 'Urgente' ? `[Urgente] ${base}` : base
}

function buildEmailHtml(input: {
  recipientName: string
  tipo: string
  prioridad: string
  payload: Record<string, unknown> | null
  url: string
}): string {
  const title = subjectForNotification(input.tipo, input.prioridad, input.payload)
  const actionTitle = textFromPayload(input.payload, 'titulo_accion')
  const description = normalizeActionDescription(textFromPayload(input.payload, 'descripcion_accion'))
  const message = textFromPayload(input.payload, 'mensaje')
  const responsible = textFromPayload(input.payload, 'responsable_nombre')
  const dueDate = textFromPayload(input.payload, 'fecha_compromiso')
  const checklist = stringListFromPayload(input.payload, 'checklist')
  const actor =
    textFromPayload(input.payload, 'asignador_nombre') ||
    textFromPayload(input.payload, 'autor_nombre') ||
    textFromPayload(input.payload, 'creador_nombre')

  const lines = [
    actionTitle ? `<p><strong>Accion:</strong> ${escapeHtml(actionTitle)}</p>` : '',
    responsible ? `<p><strong>Responsable:</strong> ${escapeHtml(responsible)}</p>` : '',
    dueDate ? `<p><strong>Fecha compromiso:</strong> ${escapeHtml(dueDate)}</p>` : '',
    actor ? `<p><strong>Origen:</strong> ${escapeHtml(actor)}</p>` : '',
    message ? `<p><strong>Mensaje:</strong> ${escapeHtml(message)}</p>` : '',
    description
      ? `<p><strong>Descripcion:</strong></p><p style="white-space:pre-line;color:#475569">${escapeHtml(description).slice(0, 900)}</p>`
      : '',
    checklist.length > 0
      ? `<p><strong>Checklist:</strong></p><ul style="margin:8px 0 0;padding-left:20px;color:#475569">${checklist
          .map((item) => `<li>${escapeHtml(item)}</li>`)
          .join('')}</ul>`
      : '',
  ].filter(Boolean)

  return `<!doctype html>
<html lang="es">
  <body style="margin:0;background:#f8fafc;font-family:Arial,sans-serif;color:#0f172a">
    <div style="max-width:620px;margin:0 auto;padding:28px 18px">
      <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:24px">
        <p style="margin:0 0 10px;color:#64748b;font-size:13px">Tablero operativo</p>
        <h1 style="margin:0 0 16px;font-size:22px;line-height:1.25">${escapeHtml(title)}</h1>
        <p style="margin:0 0 16px">Hola ${escapeHtml(input.recipientName)}, tienes una nueva notificacion.</p>
        ${lines.join('\n        ')}
        <div style="margin-top:24px">
          <a href="${escapeHtml(input.url)}" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;border-radius:8px;padding:11px 16px;font-weight:700">
            Abrir en tablero
          </a>
        </div>
      </div>
    </div>
  </body>
</html>`
}

function buildEmailText(input: {
  recipientName: string
  tipo: string
  prioridad: string
  payload: Record<string, unknown> | null
  url: string
}): string {
  const title = subjectForNotification(input.tipo, input.prioridad, input.payload)
  const actionTitle = textFromPayload(input.payload, 'titulo_accion')
  const message = textFromPayload(input.payload, 'mensaje')
  const description = normalizeActionDescription(textFromPayload(input.payload, 'descripcion_accion'))
  const responsible = textFromPayload(input.payload, 'responsable_nombre')
  const dueDate = textFromPayload(input.payload, 'fecha_compromiso')
  const checklist = stringListFromPayload(input.payload, 'checklist')

  return [
    title,
    '',
    `Hola ${input.recipientName}, tienes una nueva notificacion.`,
    actionTitle ? `Accion: ${actionTitle}` : '',
    responsible ? `Responsable: ${responsible}` : '',
    dueDate ? `Fecha compromiso: ${dueDate}` : '',
    message ? `Mensaje: ${message}` : '',
    description ? `Descripcion:\n${description.slice(0, 900)}` : '',
    checklist.length > 0 ? `Checklist:\n${checklist.map((item) => `- ${item}`).join('\n')}` : '',
    '',
    `Abrir en tablero: ${input.url}`,
  ]
    .filter(Boolean)
    .join('\n')
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

function emailFromAddressHeader(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  if (!trimmed) return null
  const match = trimmed.match(/<([^<>@\s]+@[^<>@\s]+\.[^<>@\s]+)>/)
  if (match?.[1]) return match[1].trim()
  if (/^[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+$/.test(trimmed)) return trimmed
  return null
}

function displayNameFromAddressHeader(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  if (!trimmed) return null
  const match = trimmed.match(/^(.+?)\s*<[^<>]+>$/)
  return match?.[1]?.trim().replace(/^"|"$/g, '') || null
}

function formatAddressHeader(input: {
  configured?: string | null
  fallbackEmail: string
  defaultDisplayName?: string
}): string {
  const configuredEmail = emailFromAddressHeader(input.configured)
  const displayName =
    displayNameFromAddressHeader(input.configured) ||
    (configuredEmail && configuredEmail !== input.configured?.trim() ? null : undefined) ||
    input.defaultDisplayName
  const email = input.fallbackEmail.trim()
  return displayName ? `${mimeHeader(displayName)} <${email}>` : email
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

async function sendWithGoogleMail(input: {
  to: string
  subject: string
  html: string
  text: string
}): Promise<{ provider: 'gmail'; id: string | null; account: string | null; from: string | null }> {
  const token = await googleAccessToken()
  const profileResponse = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
    headers: { Authorization: `Bearer ${token}` },
  })
  const profile = await profileResponse.json().catch(() => ({}))
  const account = typeof profile?.emailAddress === 'string' ? profile.emailAddress : null
  const configuredFrom = optionalEnv('GOOGLE_GMAIL_FROM') || optionalEnv('NOTIFICATION_EMAIL_FROM')
  const configuredFromEmail = emailFromAddressHeader(configuredFrom)
  const fromEmail = account || configuredFromEmail
  if (!fromEmail) throw new Error('No se pudo resolver la cuenta Gmail remitente')
  const from = formatAddressHeader({
    configured: configuredFrom,
    fallbackEmail: fromEmail,
    defaultDisplayName: 'Scrumban EMX',
  })
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
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw: base64Url(raw) }),
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) {
    const message = result?.error?.message || response.statusText || 'No se pudo enviar correo por Gmail'
    const detail = Array.isArray(result?.error?.details)
      ? ` Detalle: ${JSON.stringify(result.error.details).slice(0, 500)}`
      : ''
    throw new Error(`Gmail ${response.status}: ${message}${detail} | account=${account ?? 'unknown'} | from=${from}`)
  }
  return { provider: 'gmail', id: result?.id ?? null, account, from }
}

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req)
  if (preflight) return preflight

  if (req.method === 'GET') {
    return jsonResponse({
      ok: true,
      function: 'send-notification-email',
      version: FUNCTION_VERSION,
    })
  }

  if (req.method !== 'POST') {
    return jsonResponse({ ok: false, message: 'Metodo no permitido' }, 405)
  }

  const auth = await requireAuthUser(req)
  if (!auth.ok) return auth.response

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ ok: false, message: 'Faltan credenciales de Supabase' }, 500)
  }

  const body = (await req.json().catch(() => null)) as NotificationEmailPayload | null
  const usuarioId = body?.usuario_id?.trim() ?? ''
  if (!UUID_RE.test(usuarioId)) {
    return jsonResponse({ ok: false, message: 'usuario_id invalido' }, 400)
  }

  const tipo = body?.tipo?.trim() || 'notificacion'
  const prioridad = normalizePriority(body?.prioridad)
  const notificationId = body?.notification_id && UUID_RE.test(body.notification_id)
    ? body.notification_id
    : null
  const payload = body?.payload && typeof body.payload === 'object' ? body.payload : null

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  })

  const { data: profile, error: profileError } = await adminClient
    .from('usuarios')
    .select('id,user_id,nombre,activo')
    .eq('id', usuarioId)
    .maybeSingle<RecipientProfile>()

  if (profileError) {
    console.error('[send-notification-email] recipient lookup failed:', {
      usuario_id: usuarioId,
      tipo,
      message: profileError.message,
    })
    await logNotificationEmail(adminClient, {
      notificationId,
      usuarioId,
      tipo,
      prioridad,
      status: 'recipient_lookup_error',
      reason: 'No se pudo resolver destinatario',
      errorMessage: profileError.message,
      payload,
    })
    return jsonResponse({ ok: false, message: 'No se pudo resolver destinatario' }, 500)
  }
  if (!profile?.user_id || profile.activo === false) {
    console.warn('[send-notification-email] skipped inactive recipient:', {
      usuario_id: usuarioId,
      tipo,
      has_user_id: Boolean(profile?.user_id),
      activo: profile?.activo ?? null,
    })
    await logNotificationEmail(adminClient, {
      notificationId,
      usuarioId,
      tipo,
      prioridad,
      status: 'skipped_inactive',
      reason: 'Destinatario inactivo o sin acceso',
      payload,
    })
    return jsonResponse({ ok: true, skipped: true, reason: 'Destinatario inactivo o sin acceso' })
  }

  const { data: authUserData, error: authUserError } = await adminClient.auth.admin.getUserById(profile.user_id)
  const email = authUserData.user?.email?.trim()
  if (authUserError || !email) {
    console.warn('[send-notification-email] skipped missing recipient email:', {
      usuario_id: usuarioId,
      tipo,
      auth_user_id: profile.user_id,
      message: authUserError?.message ?? null,
    })
    await logNotificationEmail(adminClient, {
      notificationId,
      usuarioId,
      tipo,
      prioridad,
      email: email ?? null,
      status: 'skipped_no_email',
      reason: 'Destinatario sin email',
      errorMessage: authUserError?.message ?? null,
      payload,
    })
    return jsonResponse({ ok: true, skipped: true, reason: 'Destinatario sin email' })
  }

  const recipientName = profile.nombre?.trim() || email.split('@')[0] || 'usuario'
  const url = actionUrl(payload)
  const subject = subjectForNotification(tipo, prioridad, payload)
  const html = buildEmailHtml({ recipientName, tipo, prioridad, payload, url })
  const text = buildEmailText({ recipientName, tipo, prioridad, payload, url })

  const sendEmail = (to: string) => {
    if (!hasGoogleMailSecrets()) throw new Error('Faltan secretos de Gmail')
    return sendWithGoogleMail({ to, subject, html, text })
  }

  try {
    const result = await sendEmail(email)
    console.info('[send-notification-email] sent:', {
      usuario_id: usuarioId,
      tipo,
      provider: result.provider,
      provider_account: result.account,
      email_id: result.id,
    })
    await logNotificationEmail(adminClient, {
      notificationId,
      usuarioId,
      tipo,
      prioridad,
      email,
      provider: result.provider,
      providerAccount: result.account,
      emailId: result.id,
      status: 'sent',
      payload,
    })

    const ticketsAdminEmail = optionalEnv('TICKETS_ADMIN_EMAIL').trim().toLowerCase()
    const isTicketNotification = tipo.startsWith('ticket_')
    if (
      isTicketNotification &&
      ticketsAdminEmail &&
      ticketsAdminEmail !== email.toLowerCase()
    ) {
      try {
        await sendEmail(ticketsAdminEmail)
      } catch (copyError) {
        console.error('[send-notification-email] ticket admin copy failed:', copyError)
      }
    }

    return jsonResponse({ ok: true, provider: result.provider, email_id: result.id })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo enviar correo de notificacion'
    console.error('[send-notification-email] email provider failed:', {
      usuario_id: usuarioId,
      tipo,
      message,
    })
    await logNotificationEmail(adminClient, {
      notificationId,
      usuarioId,
      tipo,
      prioridad,
      email,
      status: 'provider_error',
      reason: 'email_provider_failed',
      errorMessage: message,
      payload,
    })
    return jsonResponse({
      ok: false,
      skipped: false,
      reason: 'email_provider_failed',
      message,
    }, 502)
  }
})
