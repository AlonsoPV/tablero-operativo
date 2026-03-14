/**
 * Servicio del centro de notificaciones (tabla notificaciones).
 * Spec §5.9, §11: tiempo real, filtro por tipo/prioridad, leído/no leído.
 */

import { supabase } from '@/lib/supabase/client'
import type { Notificacion } from '@/types'

const TABLE = 'notificaciones'

export interface CreateNotificacionInput {
  usuario_id: string
  tipo: string
  prioridad?: 'Normal' | 'Alta' | 'Urgente'
  payload?: Record<string, unknown>
}

export const notificacionesService = {
  async create(input: CreateNotificacionInput) {
    const { data, error } = await supabase
      .from(TABLE)
      .insert({
        usuario_id: input.usuario_id,
        tipo: input.tipo,
        prioridad: input.prioridad ?? 'Normal',
        payload: input.payload ?? null,
      })
      .select()
      .single()
    if (error) throw error
    return data as Notificacion
  },

  async listByUsuario(usuarioId: string, options?: { leido?: boolean }) {
    let q = supabase
      .from(TABLE)
      .select('*')
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

  subscribe(usuarioId: string, callback: (payload: unknown) => void) {
    return supabase
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
      .subscribe()
  },
}
