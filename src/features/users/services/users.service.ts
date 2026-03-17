/**
 * Servicio de administración de usuarios (tabla usuarios).
 * Gestiona perfiles; no maneja contraseñas (auth.users).
 */

import { supabase } from '@/lib/supabase/client'
import type { UserProfile, CreateUserInput, UpdateUserInput, UsersFilter } from '../types/user.types'

const TABLE = 'usuarios'

export const usersAdminService = {
  /**
   * Lista usuarios con filtros. Requiere RLS que permita a admins ver todos.
   * Paginación: por ahora devuelve todos; estructura lista para limit/offset después.
   */
  async list(filter: UsersFilter = {}): Promise<UserProfile[]> {
    let q = supabase
      .from(TABLE)
      .select('id, user_id, nombre, rol, area, activo, onboarding_completed, created_at, updated_at')
      .order('nombre', { ascending: true })

    if (filter.rol != null && filter.rol !== '') {
      q = q.eq('rol', filter.rol)
    }
    if (filter.area != null && filter.area !== '') {
      q = q.eq('area', filter.area)
    }
    if (filter.activo !== undefined && filter.activo !== null) {
      q = q.eq('activo', filter.activo)
    }
    if (filter.onboarding_completed !== undefined && filter.onboarding_completed !== null) {
      q = q.eq('onboarding_completed', filter.onboarding_completed)
    }

    const { data, error } = await q
    if (error) throw error

    let list = (data ?? []) as UserProfile[]

    if (filter.search?.trim()) {
      const term = filter.search.trim().toLowerCase()
      list = list.filter(
        (u) =>
          u.nombre.toLowerCase().includes(term) ||
          (u.area?.toLowerCase().includes(term) ?? false)
      )
    }

    return list
  },

  async getById(id: string): Promise<UserProfile | null> {
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .eq('id', id)
      .maybeSingle()
    if (error) throw error
    return data as UserProfile | null
  },

  /** Obtiene el email de auth.users para un user_id. Requiere ser el propio usuario o admin. */
  async getAuthEmail(userId: string): Promise<string | null> {
    const { data, error } = await supabase.rpc('get_auth_user_email', {
      p_user_id: userId,
    })
    if (error) return null
    return (data as string) ?? null
  },

  async update(id: string, input: UpdateUserInput): Promise<UserProfile> {
    const payload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }

    if (input.nombre !== undefined) {
      payload.nombre = input.nombre.trim()
    }
    if (input.rol !== undefined) {
      payload.rol = input.rol
    }
    if (input.area !== undefined) {
      payload.area = input.area?.trim() ?? null
    }
    if (input.activo !== undefined) {
      payload.activo = input.activo
    }
    if (input.onboarding_completed !== undefined) {
      payload.onboarding_completed = input.onboarding_completed
    }

    const { data, error } = await supabase
      .from(TABLE)
      .update(payload)
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return data as UserProfile
  },

  /**
   * Alterna activo. Soft business logic: no borrar, solo desactivar.
   */
  async setActivo(id: string, activo: boolean): Promise<UserProfile> {
    return this.update(id, { activo })
  },

  /**
   * Envía una invitación por correo. La Edge Function crea el usuario en Auth
   * y el trigger de Supabase sincroniza el perfil en public.usuarios.
   */
  async create(input: CreateUserInput): Promise<void> {
    const payload = {
      email: input.email.trim().toLowerCase(),
      nombre: input.nombre.trim(),
      rol: input.rol,
      area: input.area?.trim() ?? null,
      activo: input.activo ?? true,
      onboarding_completed: input.onboarding_completed ?? false,
    }

    const { error } = await supabase.functions.invoke('invite-user', {
      body: payload,
    })

    if (error) throw error
  },
}
