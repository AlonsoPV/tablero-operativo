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

  async update(id: string, input: UpdateUserInput): Promise<UserProfile> {
    const { data, error } = await supabase
      .from(TABLE)
      .update({
        ...input,
        updated_at: new Date().toISOString(),
      })
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
   * Crear perfil en tabla usuarios.
   * TODO: Si el sistema no permite crear auth.users desde el cliente, este flujo
   * es parcial: solo tendría sentido cuando exista invitación por email o creación
   * desde backend/Edge Function que cree auth.users y luego inserte aquí.
   * Por ahora dejamos la firma lista; puede fallar por FK user_id si no existe en auth.users.
   */
  async create(input: CreateUserInput & { user_id: string }): Promise<UserProfile> {
    const { data, error } = await supabase
      .from(TABLE)
      .insert({
        user_id: input.user_id,
        nombre: input.nombre.trim(),
        rol: input.rol,
        area: input.area ?? null,
        activo: input.activo ?? true,
        onboarding_completed: input.onboarding_completed ?? false,
      })
      .select()
      .single()
    if (error) throw error
    return data as UserProfile
  },
}
