/**
 * Invoca la edge function send-notification-email con el JWT del actor.
 * Misma firma que src/services/notificaciones.service.ts.
 */

export type NotificationEmailInvokeInput = {
  usuario_id: string
  tipo: string
  prioridad?: 'Normal' | 'Alta' | 'Urgente'
  payload?: Record<string, unknown> | null
  reply_to_caller?: boolean
}

export type NotificationEmailInvokeResult = {
  ok?: boolean
  skipped?: boolean
  reason?: string
  message?: string
  error?: string
  provider?: string
  email_id?: string | null
}

function supabaseUrl() {
  return (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/+$/, '')
}

function anonKey() {
  return process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || ''
}

/** Internal delegation is restricted again by the existing Edge Function to an executing,
 * explicitly approved operation. No user JWT is fabricated or stored. */
export async function invokeApprovedWhatsAppEmail(operationId: string): Promise<NotificationEmailInvokeResult> {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  if (!key || !supabaseUrl()) throw new Error('CONFIGURATION_ERROR: Falta la configuración interna del correo.')
  const response = await fetch(`${supabaseUrl()}/functions/v1/send-notification-email`, {
    method: 'POST', headers: {Authorization: `Bearer ${key}`, apikey: key, 'Content-Type': 'application/json'},
    body: JSON.stringify({assistant_pending_op_id: operationId}), signal: AbortSignal.timeout(20000),
  })
  const data = await response.json().catch(() => null) as NotificationEmailInvokeResult | null
  if (!response.ok || !data?.email_id || data.ok === false || data.skipped) {
    throw new Error(data?.message || 'PROVIDER_ERROR: No se acreditó la aceptación del correo. Consulta el estado antes de reintentar.')
  }
  return data
}

export async function invokeNotificationEmail(
  accessToken: string,
  input: NotificationEmailInvokeInput
): Promise<NotificationEmailInvokeResult> {
  const baseUrl = supabaseUrl()
  const key = anonKey()
  if (!baseUrl || !key) {
    throw new Error('Supabase no esta configurado para enviar correo de notificacion.')
  }
  if (!accessToken) {
    throw new Error('Falta la sesion para enviar el correo de notificacion.')
  }

  const response = await fetch(`${baseUrl}/functions/v1/send-notification-email`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: key,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      usuario_id: input.usuario_id,
      tipo: input.tipo,
      prioridad: input.prioridad ?? 'Normal',
      payload: input.payload ?? null,
      ...(input.reply_to_caller ? { reply_to_caller: true } : {}),
    }),
  })

  const data = (await response.json().catch(() => null)) as NotificationEmailInvokeResult | null
  if (!response.ok) {
    const detail =
      [data?.reason, data?.message ?? data?.error].filter(Boolean).join(': ') ||
      response.statusText ||
      `HTTP ${response.status}`
    throw new Error(detail)
  }

  return data ?? { ok: true }
}
