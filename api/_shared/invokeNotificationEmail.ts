/**
 * Invoca la edge function send-notification-email con el JWT del actor.
 * Misma firma que src/services/notificaciones.service.ts.
 */

export type NotificationEmailInvokeInput = {
  usuario_id: string
  tipo: string
  prioridad?: 'Normal' | 'Alta' | 'Urgente'
  payload?: Record<string, unknown> | null
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
