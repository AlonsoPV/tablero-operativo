/**
 * Servicio del centro de notificaciones (tabla notificaciones).
 * Spec §5.9, §11: tiempo real, filtro por tipo/prioridad, leído/no leído.
 */

import type { RealtimeChannel } from '@supabase/supabase-js'
import { SUPABASE_ANON_KEY, SUPABASE_URL, supabase } from '@/lib/supabase/client'
import type { Notificacion } from '@/types'

const TABLE = 'notificaciones'
const NOTIFICACION_SELECT = 'id,usuario_id,tipo,prioridad,leido,payload,created_at'

export interface CreateNotificacionInput {
  usuario_id: string
  tipo: string
  prioridad?: 'Normal' | 'Alta' | 'Urgente'
  payload?: Record<string, unknown>
}

type NotificationEmailResult = {
  ok?: boolean
  skipped?: boolean
  reason?: string
  message?: string
  error?: string
  provider?: string
  email_id?: string | null
}

type SendNotificationEmailOptions = {
  throwOnSkipped?: boolean
}

type CreateNotificacionOptions = {
  throwOnEmailError?: boolean
  throwOnEmailSkipped?: boolean
  awaitEmail?: boolean
}

function notificationEmailDetail(result: NotificationEmailResult | null | undefined): string {
  return [result?.reason, result?.message ?? result?.error].filter(Boolean).join(': ')
}

async function currentAccessToken(): Promise<string> {
  const { data, error } = await supabase.auth.getSession()
  if (error) throw error
  const token = data.session?.access_token
  if (!token) throw new Error('Sesion no disponible para enviar correo de notificacion')
  return token
}

async function invokeNotificationEmail(input: CreateNotificacionInput): Promise<NotificationEmailResult | null> {
  const baseUrl = SUPABASE_URL.replace(/\/+$/, '')
  if (!baseUrl || !SUPABASE_ANON_KEY) {
    throw new Error('Supabase no esta configurado para enviar correos de notificacion')
  }

  const token = await currentAccessToken()
  const response = await fetch(`${baseUrl}/functions/v1/send-notification-email`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      usuario_id: input.usuario_id,
      tipo: input.tipo,
      prioridad: input.prioridad ?? 'Normal',
      payload: input.payload ?? null,
    }),
  })

  const data = (await response.json().catch(() => null)) as NotificationEmailResult | null
  if (!response.ok) {
    const detail =
      notificationEmailDetail(data) ||
      response.statusText ||
      `HTTP ${response.status}`
    throw new Error(detail)
  }

  return data
}

export async function sendNotificationEmail(
  input: CreateNotificacionInput,
  options: SendNotificationEmailOptions = {}
): Promise<NotificationEmailResult | null> {
  const data = await invokeNotificationEmail(input)
  if (data?.skipped === true) {
    const detail = notificationEmailDetail(data) || 'Correo omitido por la funcion de notificaciones'
    console.warn(
      '[notificaciones] La notificacion se creo, pero el correo fue omitido.',
      detail
    )
    if (options.throwOnSkipped) throw new Error(detail)
    return data
  }
  if (data?.ok === false) {
    const detail = notificationEmailDetail(data)
    throw new Error(detail || 'No se pudo enviar el correo de notificacion')
  }
  return data ?? null
}

export const notificacionesService = {
  async sendEmail(input: CreateNotificacionInput): Promise<void> {
    await sendNotificationEmail(input)
  },

  /**
   * Inserta una notificación para otro usuario.
   * No usamos `.select()` tras el insert: la política RLS `notificaciones_select_own` solo permite
   * leer filas donde `usuario_id` es el usuario actual; al notificar al responsable, el insert es válido
   * pero el RETURNING fallaría con 403 en PostgREST.
   */
  async create(input: CreateNotificacionInput, options: CreateNotificacionOptions = {}): Promise<void> {
    const { error } = await supabase.from(TABLE).insert({
      usuario_id: input.usuario_id,
      tipo: input.tipo,
      prioridad: input.prioridad ?? 'Normal',
      payload: input.payload ?? null,
    })
    if (error) throw error

    const sendEmail = async () => {
      try {
        await sendNotificationEmail(input, { throwOnSkipped: options.throwOnEmailSkipped })
      } catch (emailError) {
        console.warn(
          '[notificaciones] La notificacion se creo, pero no se pudo enviar el correo.',
          emailError
        )
        if (options.throwOnEmailError) throw emailError
      }
    }

    if (options.awaitEmail || options.throwOnEmailError || options.throwOnEmailSkipped) {
      await sendEmail()
    } else {
      void sendEmail()
    }
  },

  async listByUsuario(usuarioId: string, options?: { leido?: boolean }) {
    let q = supabase
      .from(TABLE)
      .select(NOTIFICACION_SELECT)
      .eq('usuario_id', usuarioId)
      .order('created_at', { ascending: false })
    if (options?.leido !== undefined) q = q.eq('leido', options.leido)
    const { data, error } = await q.limit(100)
    if (error) throw error
    return (data ?? []) as Notificacion[]
  },

  async markAsRead(id: string) {
    const { error } = await supabase
      .from(TABLE)
      .update({ leido: true })
      .eq('id', id)
    if (error) throw error
  },

  async markAllAsRead(usuarioId: string) {
    const { error } = await supabase
      .from(TABLE)
      .update({ leido: true })
      .eq('usuario_id', usuarioId)
    if (error) throw error
  },

  subscribe(usuarioId: string, callback: (payload: unknown) => void): RealtimeChannel {
    const channel = supabase
      .channel(`notificaciones:${usuarioId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: TABLE,
          filter: `usuario_id=eq.${usuarioId}`,
        },
        (payload) => callback(payload)
      )

    channel.subscribe((status, err) => {
      if (status === 'SUBSCRIBED') return
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        console.warn(
          '[notificaciones] Realtime no disponible; se actualizará el listado de forma periódica.',
          err?.message ?? status
        )
      }
    })

    return channel
  },

  async unsubscribe(channel: RealtimeChannel) {
    await supabase.removeChannel(channel)
  },
}
