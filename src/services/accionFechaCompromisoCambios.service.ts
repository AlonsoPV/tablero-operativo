import { supabase } from '@/lib/supabase/client'
import {
  getFechaCompromisoChangeReason,
  type FechaCompromisoChangeReasonKey,
} from '@/features/operations/constants/fechaCompromisoChangeReasons'

export type AccionFechaCompromisoOrigen = 'kanban' | 'team_kanban'

export type AccionFechaCompromisoCambio = {
  id: string
  origen: AccionFechaCompromisoOrigen
  accion_id: string
  accion_titulo: string
  motivo_key: FechaCompromisoChangeReasonKey
  motivo_label: string
  fecha_anterior: string
  fecha_nueva: string
  changed_by: string | null
  changed_by_nombre: string | null
  created_at: string
}

export type CreateAccionFechaCompromisoCambioInput = {
  origen: AccionFechaCompromisoOrigen
  accionId: string
  accionTitulo: string
  motivoKey: FechaCompromisoChangeReasonKey
  fechaAnterior: string
  fechaNueva: string
  changedBy?: string | null
  changedByNombre?: string | null
}

const SELECT_FIELDS =
  'id,origen,accion_id,accion_titulo,motivo_key,motivo_label,fecha_anterior,fecha_nueva,changed_by,changed_by_nombre,created_at'

export const accionFechaCompromisoCambiosService = {
  async create(input: CreateAccionFechaCompromisoCambioInput) {
    const reason = getFechaCompromisoChangeReason(input.motivoKey)
    if (!reason) throw new Error('Selecciona un motivo valido para cambiar la fecha compromiso.')

    let changedBy = input.changedBy ?? null
    let changedByNombre = input.changedByNombre?.trim().slice(0, 160) || null

    if (!changedBy) {
      const { data: authData } = await supabase.auth.getUser()
      const authUserId = authData.user?.id
      if (authUserId) {
        const { data: profile } = await supabase
          .from('usuarios')
          .select('id,nombre')
          .eq('user_id', authUserId)
          .maybeSingle()

        changedBy = profile?.id ?? null
        changedByNombre = changedByNombre ?? profile?.nombre?.trim().slice(0, 160) ?? null
      }
    }

    const { data, error } = await supabase
      .from('accion_fecha_compromiso_cambios')
      .insert({
        origen: input.origen,
        accion_id: input.accionId,
        accion_titulo: input.accionTitulo.trim().slice(0, 180),
        motivo_key: reason.key,
        motivo_label: reason.label,
        fecha_anterior: input.fechaAnterior,
        fecha_nueva: input.fechaNueva,
        changed_by: changedBy,
        changed_by_nombre: changedByNombre,
      })
      .select(SELECT_FIELDS)
      .single()

    if (error) throw new Error(error.message)
    return data as AccionFechaCompromisoCambio
  },

  async listRecent(limit = 50) {
    const safeLimit = Math.min(Math.max(limit, 1), 200)
    const { data, error } = await supabase
      .from('accion_fecha_compromiso_cambios')
      .select(SELECT_FIELDS)
      .order('created_at', { ascending: false })
      .limit(safeLimit)

    if (error) throw new Error(error.message)
    return (data ?? []) as AccionFechaCompromisoCambio[]
  },
}
