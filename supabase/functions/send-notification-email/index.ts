import { createClient } from '@supabase/supabase-js'
import { handleCorsPreflight, jsonResponse } from '../_shared/cors.ts'
import { requireAuthUser } from '../_shared/requireUser.ts'

/** Stubs para el checker de TypeScript del repo (runtime = Deno en Supabase Edge). */
declare global {
  var Deno: {
    env: { get(key: string): string | undefined }
    serve: (handler: (req: Request) => Response | Promise<Response>) => void
  }
}

type NotificationEmailPayload = {
  usuario_id?: string
  tipo?: string
  prioridad?: 'Normal' | 'Alta' | 'Urgente'
  payload?: Record<string, unknown> | null
}

type RecipientProfile = {
  id: string
  user_id: string
  nombre: string | null
  activo: boolean | null
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function normalizePriority(value: unknown): 'Normal' | 'Alta' | 'Urgente' {
  return value === 'Alta' || value === 'Urgente' ? value : 'Normal'
}

function textFromPayload(payload: Record<string, unknown> | null | undefined, key: string): string {
  const value = payload?.[key]
  return typeof value === 'string' ? value.trim() : ''
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function appBaseUrl(): string {
  return (
    Deno.env.get('APP_BASE_URL') ||
    Deno.env.get('PUBLIC_APP_URL') ||
    Deno.env.get('SITE_URL') ||
    'https://dev-tablero-operativo.vercel.app'
  ).replace(/\/+$/, '')
}

function actionUrl(payload: Record<string, unknown> | null | undefined): string {
  const accionId = textFromPayload(payload, 'accion_id')
  if (accionId) return `${appBaseUrl()}/kanban?accion=${encodeURIComponent(accionId)}`
  return `${appBaseUrl()}/notificaciones`
}

function subjectForNotification(tipo: string, prioridad: string, payload: Record<string, unknown> | null): string {
  const explicitTitle = textFromPayload(payload, 'titulo')
  const base =
    explicitTitle ||
    (tipo === 'responsable'
      ? 'Te asignaron una accion'
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
  const description = textFromPayload(input.payload, 'descripcion_accion')
  const message = textFromPayload(input.payload, 'mensaje')
  const actor =
    textFromPayload(input.payload, 'asignador_nombre') ||
    textFromPayload(input.payload, 'autor_nombre') ||
    textFromPayload(input.payload, 'creador_nombre')

  const lines = [
    actionTitle ? `<p><strong>Accion:</strong> ${escapeHtml(actionTitle)}</p>` : '',
    actor ? `<p><strong>Origen:</strong> ${escapeHtml(actor)}</p>` : '',
    message ? `<p><strong>Mensaje:</strong> ${escapeHtml(message)}</p>` : '',
    description ? `<p style="color:#475569">${escapeHtml(description).slice(0, 700)}</p>` : '',
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
  const description = textFromPayload(input.payload, 'descripcion_accion')

  return [
    title,
    '',
    `Hola ${input.recipientName}, tienes una nueva notificacion.`,
    actionTitle ? `Accion: ${actionTitle}` : '',
    message ? `Mensaje: ${message}` : '',
    description ? `Detalle: ${description.slice(0, 700)}` : '',
    '',
    `Abrir en tablero: ${input.url}`,
  ]
    .filter(Boolean)
    .join('\n')
}

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req)
  if (preflight) return preflight

  if (req.method !== 'POST') {
    return jsonResponse({ ok: false, message: 'Metodo no permitido' }, 405)
  }

  const auth = await requireAuthUser(req)
  if (!auth.ok) return auth.response

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const resendApiKey = Deno.env.get('RESEND_API_KEY')
  const from = Deno.env.get('NOTIFICATION_EMAIL_FROM')

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ ok: false, message: 'Faltan credenciales de Supabase' }, 500)
  }
  if (!resendApiKey || !from) {
    return jsonResponse({ ok: false, message: 'Faltan secretos de correo' }, 500)
  }

  const body = (await req.json().catch(() => null)) as NotificationEmailPayload | null
  const usuarioId = body?.usuario_id?.trim() ?? ''
  if (!UUID_RE.test(usuarioId)) {
    return jsonResponse({ ok: false, message: 'usuario_id invalido' }, 400)
  }

  const tipo = body?.tipo?.trim() || 'notificacion'
  const prioridad = normalizePriority(body?.prioridad)
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
    return jsonResponse({ ok: false, message: 'No se pudo resolver destinatario' }, 500)
  }
  if (!profile?.user_id || profile.activo === false) {
    return jsonResponse({ ok: true, skipped: true, reason: 'Destinatario inactivo o sin acceso' })
  }

  const { data: authUserData, error: authUserError } = await adminClient.auth.admin.getUserById(profile.user_id)
  const email = authUserData.user?.email?.trim()
  if (authUserError || !email) {
    return jsonResponse({ ok: true, skipped: true, reason: 'Destinatario sin email' })
  }

  const recipientName = profile.nombre?.trim() || email.split('@')[0] || 'usuario'
  const url = actionUrl(payload)
  const subject = subjectForNotification(tipo, prioridad, payload)
  const html = buildEmailHtml({ recipientName, tipo, prioridad, payload, url })
  const text = buildEmailText({ recipientName, tipo, prioridad, payload, url })

  const emailResponse = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [email],
      subject,
      html,
      text,
      reply_to: Deno.env.get('NOTIFICATION_EMAIL_REPLY_TO') || undefined,
    }),
  })

  if (!emailResponse.ok) {
    const details = await emailResponse.text().catch(() => '')
    return jsonResponse(
      { ok: false, message: 'No se pudo enviar correo de notificacion', details },
      502
    )
  }

  const result = await emailResponse.json().catch(() => ({}))
  return jsonResponse({ ok: true, email_id: result?.id ?? null })
})
