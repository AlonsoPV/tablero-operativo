/**
 * Servicio de usuarios (tabla usuarios).
 * Spec §4, §15 RLS: cada usuario ve solo su perfil; admins ven todo.
 * TODO: Spec §17 — policy de lectura actual puede impedir listar responsables
 * en dropdowns; revisar vista pública de nombres o policy más amplia.
 */

import { SUPABASE_ANON_KEY, SUPABASE_URL, supabase } from '@/lib/supabase/client'
import { fetchWithTimeout } from '@/lib/fetchWithTimeout'
import type { Usuario } from '@/types'

const TABLE = 'usuarios'
const __DEV__ = import.meta.env.DEV
const PROFILE_SELECT =
  'id,user_id,nombre,rol,area,activo,manager_user_id,onboarding_completed,created_at,updated_at'

function devLog(message: string, payload?: unknown) {
  if (!__DEV__) return
  if (payload === undefined) {
    console.log(`[usuarios] ${message}`)
    return
  }
  console.log(`[usuarios] ${message}`, payload)
}

async function loadAreaNames(userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('usuario_areas')
    .select('is_primary, areas(nombre)')
    .eq('user_id', userId)

  if (error || !data) return []

  type Row = { is_primary: boolean; areas: { nombre: string } | { nombre: string }[] | null }
  const rows = data as unknown as Row[]

  return rows
    .map((row) => {
      const area = Array.isArray(row.areas) ? row.areas[0] : row.areas
      return { nombre: area?.nombre ?? null, isPrimary: row.is_primary }
    })
    .filter((row): row is { nombre: string; isPrimary: boolean } => Boolean(row.nombre))
    .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.nombre.localeCompare(b.nombre, 'es'))
    .map((row) => row.nombre)
}

async function enrichUsuario(profile: Usuario | null): Promise<Usuario | null> {
  if (!profile) return null
  const areas = await loadAreaNames(profile.id)
  return {
    ...profile,
    areas: areas.length > 0 ? areas : profile.area ? [profile.area] : [],
  }
}

export const usuariosService = {
  async getByAuthIdWithAccessToken(authUserId: string, accessToken: string): Promise<Usuario | null> {
    const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now()
    const url = new URL(`${SUPABASE_URL}/rest/v1/${TABLE}`)
    url.searchParams.set('select', PROFILE_SELECT)
    url.searchParams.set('user_id', `eq.${authUserId}`)
    url.searchParams.set('limit', '1')

    const response = await fetchWithTimeout(url, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    })

    if (!response.ok) {
      throw new Error(`PROFILE_FETCH_FAILED_${response.status}`)
    }

    const rows = (await response.json()) as Usuario[]
    const profile = await enrichUsuario(rows[0] ?? null)
    const elapsedMs = Math.round(
      (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startedAt
    )

    devLog('getByAuthIdWithAccessToken resolved', {
      authUserId,
      found: !!profile,
      elapsedMs,
    })
    return profile
  },

  /** Perfil por auth user id; null si no hay fila (evita error HTTP de .single() con 0 filas). */
  async getByAuthId(authUserId: string): Promise<Usuario | null> {
    const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now()
    const { data, error } = await supabase
      .from(TABLE)
      .select(PROFILE_SELECT)
      .eq('user_id', authUserId)
      .maybeSingle()

    const elapsedMs = Math.round(
      (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startedAt
    )

    if (error) throw error
    const profile = await enrichUsuario((data as Usuario) ?? null)
    devLog('getByAuthId resolved', {
      authUserId,
      found: !!profile,
      elapsedMs,
    })
    return profile
  },

  async getById(id: string) {
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .eq('id', id)
      .single()
    if (error) throw error
    return (await enrichUsuario(data as Usuario)) as Usuario
  },

  /** Perfil interno por correo de auth (RPC; admin de tickets). */
  async getIdByAuthEmail(email: string): Promise<string | null> {
    const normalized = email.trim().toLowerCase()
    if (!normalized) return null
    const { data, error } = await supabase.rpc('usuario_id_by_auth_email', { p_email: normalized })
    if (error) throw error
    return typeof data === 'string' ? data : null
  },

  /** Lista de usuarios (sujeto a RLS; admins pueden ver todos). TODO: uso en dropdowns. */
  async list() {
    const { data, error } = await supabase
      .from(TABLE)
      .select('id, nombre, rol, area')
      .eq('activo', true)
      .order('nombre')
    if (error) throw error
    return (data ?? []) as Pick<Usuario, 'id' | 'nombre' | 'rol' | 'area'>[]
  },

  async updateOnboardingCompleted(usuarioId: string) {
    const { data, error } = await supabase
      .from(TABLE)
      .update({ onboarding_completed: true })
      .eq('id', usuarioId)
      .select()
      .single()
    if (error) throw error
    return data as Usuario
  },
}
