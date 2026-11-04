/**
 * Carga segura (cliente Supabase + RLS) del material operativo del asistente.
 * No usa service role; solo datos autorizados para la sesion actual.
 */
import { accionesService } from '@/services/acciones.service'
import { supabase } from '@/lib/supabase/client'
import type { AccionDiaria } from '@/types'

const OPEN_STATES = ['Pendiente', 'Hoy', 'En_Ejecucion', 'Bloqueado', 'Retraso'] as const
const MAX_VERIFY_ROWS = 40

export type AssistantOperationalLoad = {
  openActions: AccionDiaria[]
  pendingVerificationActions: AccionDiaria[]
  fetchedAt: string
}

async function listHechoPendingVerification(usuarioId: string): Promise<AccionDiaria[]> {
  const { data, error } = await supabase
    .from('acciones_diarias')
    .select('*')
    .eq('estado', 'Hecho')
    .or(
      `responsable.eq.${usuarioId},verificador_dato.eq.${usuarioId},verificador_gobierno.eq.${usuarioId}`
    )
    .order('updated_at', { ascending: false })
    .limit(MAX_VERIFY_ROWS)

  if (error) {
    // Compat: si RLS/columnas impiden el OR, degradar a responsable.
    const fallback = await accionesService.list({
      estado: 'Hecho',
      responsable: usuarioId,
    })
    return fallback.slice(0, MAX_VERIFY_ROWS)
  }

  return (data ?? []) as AccionDiaria[]
}

export const assistantOperationalContextService = {
  async loadForUser(input: {
    usuarioId: string
    seesAllBoard: boolean
  }): Promise<AssistantOperationalLoad> {
    const fetchedAt = new Date().toISOString()
    const openActions = await accionesService.list({
      ...(input.seesAllBoard ? {} : { responsable: input.usuarioId }),
      estado: [...OPEN_STATES],
    })
    const pendingVerificationActions = await listHechoPendingVerification(input.usuarioId)
    return { openActions, pendingVerificationActions, fetchedAt }
  },
}
