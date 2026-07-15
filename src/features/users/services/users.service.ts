/**
 * Servicio de administración de usuarios (tabla usuarios).
 * Gestiona perfiles; no maneja contraseñas (auth.users).
 *
 * Alta: `create` → Edge Function `invite-user` (service role) → `auth.admin.createUser`
 * + trigger `handle_new_user` → fila en `public.usuarios`. Contraseñas solo en Supabase Auth.
 */

import { supabase } from '@/lib/supabase/client'
import type { UserProfile, CreateUserInput, UpdateUserInput, UsersFilter } from '../types/user.types'

const TABLE = 'usuarios'

type InviteUserResponseBody = { ok?: boolean; message?: string; profile?: UserProfile | null }

function isUnauthorizedListError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const e = error as { code?: string; message?: string }
  const message = e.message?.toLowerCase() ?? ''
  return e.code === '42501' || message.includes('no autorizado') || message.includes('permission denied')
}

function isMissingRpcError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const e = error as { code?: string; message?: string }
  const message = e.message?.toLowerCase() ?? ''
  return e.code === 'PGRST202' || message.includes('could not find the function')
}

function isNoRowsUpdateError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const e = error as { code?: string; message?: string }
  return e.code === 'PGRST116' || (e.message?.includes('0 rows') ?? false)
}

function normalizeAreas(profile: UserProfile): UserProfile {
  const areas =
    profile.areas && profile.areas.length > 0
      ? profile.areas
      : profile.area
        ? [profile.area]
        : []
  return { ...profile, areas }
}

async function enrichProfilesWithRoles(profiles: UserProfile[]): Promise<UserProfile[]> {
  if (profiles.length === 0) return profiles
  const ids = profiles.map((profile) => profile.id)
  const { data, error } = await supabase
    .from('usuario_catalog_roles')
    .select('user_id,role_id,is_primary,catalog_roles(nombre)')
    .in('user_id', ids)

  if (error || !data) return profiles
  type RoleRow = {
    user_id: string
    role_id: string
    is_primary: boolean
    catalog_roles: { nombre: string } | Array<{ nombre: string }> | null
  }
  const grouped = new Map<string, RoleRow[]>()
  for (const row of data as unknown as RoleRow[]) {
    grouped.set(row.user_id, [...(grouped.get(row.user_id) ?? []), row])
  }
  return profiles.map((profile) => {
    const rows = grouped.get(profile.id) ?? []
    const names = rows.map((row) => {
      const role = Array.isArray(row.catalog_roles) ? row.catalog_roles[0] : row.catalog_roles
      return role?.nombre ?? ''
    }).filter(Boolean)
    return {
      ...profile,
      role_ids: rows.map((row) => row.role_id),
      role_names: names.length > 0 ? names : [profile.rol],
      primary_role_id: rows.find((row) => row.is_primary)?.role_id ?? null,
    }
  })
}

async function setRolesViaRpc(
  userId: string,
  roleIds: string[],
  primaryRoleId: string
): Promise<void> {
  const { error } = await supabase.rpc('settings_users_set_roles', {
    p_user_id: userId,
    p_role_ids: roleIds,
    p_primary_role_id: primaryRoleId,
  })
  if (error) {
    if (isMissingRpcError(error)) {
      throw new Error('Falta aplicar la migración de roles múltiples en Supabase.')
    }
    throw error
  }
}

function profileFromRpcRow(data: unknown): UserProfile | null {
  const row = Array.isArray(data) ? data[0] : data
  return row ? normalizeAreas(row as UserProfile) : null
}

async function updateManagerViaRpc(
  id: string,
  managerUserId: string | null
): Promise<UserProfile> {
  const { data, error } = await supabase.rpc('settings_users_update_manager', {
    p_user_id: id,
    p_manager_user_id: managerUserId,
  })

  if (error) {
    if (isMissingRpcError(error)) {
      throw new Error(
        'Falta aplicar la migración de organigrama en Supabase (settings_users_update_manager).'
      )
    }
    throw error
  }

  const profile = profileFromRpcRow(data)
  if (!profile) {
    throw new Error('Usuario no encontrado tras actualizar la jerarquía.')
  }

  return profile
}

async function setAreasViaRpc(
  id: string,
  primaryAreaId: string | null,
  areaIds: string[]
): Promise<UserProfile> {
  const { data, error } = await supabase.rpc('settings_users_set_areas', {
    p_user_id: id,
    p_primary_area_id: primaryAreaId,
    p_area_ids: areaIds,
  })

  if (error) {
    if (isMissingRpcError(error)) {
      throw new Error(
        'Falta aplicar la migración de multi-área en Supabase (settings_users_set_areas).'
      )
    }
    throw error
  }

  const profile = profileFromRpcRow(data)
  if (!profile) {
    throw new Error('Usuario no encontrado tras actualizar las áreas.')
  }
  return profile
}

async function setDirectReportsViaRpc(
  managerId: string,
  reportIds: string[]
): Promise<UserProfile[]> {
  const { data, error } = await supabase.rpc('settings_users_set_direct_reports', {
    p_manager_id: managerId,
    p_report_ids: reportIds,
  })

  if (error) {
    if (isMissingRpcError(error)) {
      throw new Error(
        'Falta aplicar la migración de organigrama en Supabase (settings_users_set_direct_reports).'
      )
    }
    throw error
  }

  return ((data ?? []) as UserProfile[]).map(normalizeAreas)
}

async function updateOrgHierarchyViaRpc(
  id: string,
  managerUserId: string | null,
  reportIds: string[]
): Promise<UserProfile> {
  const { data, error } = await supabase.rpc('settings_users_update_org_hierarchy', {
    p_user_id: id,
    p_manager_user_id: managerUserId,
    p_report_ids: reportIds,
  })

  if (error) {
    if (isMissingRpcError(error)) {
      throw new Error(
        'Falta aplicar la migración de puntos del organigrama en Supabase (settings_users_update_org_hierarchy).'
      )
    }
    throw error
  }

  const profile = profileFromRpcRow(data)
  if (!profile) throw new Error('Usuario no encontrado tras actualizar la jerarquía.')
  return profile
}

async function refreshOrgChartScore(id: string): Promise<void> {
  const { error } = await supabase.rpc('org_chart_score_refresh', { p_user_id: id })
  if (error) {
    if (isMissingRpcError(error)) {
      throw new Error('Falta aplicar la migración de puntos del organigrama en Supabase.')
    }
    throw error
  }
}

function userMatchesArea(user: UserProfile, area: string): boolean {
  if (user.area === area) return true
  return (user.areas ?? []).includes(area)
}

function applyUserFilters(list: UserProfile[], filter: UsersFilter): UserProfile[] {
  let next = list.map(normalizeAreas)

  if (filter.rol != null && filter.rol !== '') {
    next = next.filter((u) => u.rol === filter.rol || (u.role_names ?? []).includes(filter.rol!))
  }
  if (filter.area != null && filter.area !== '') {
    next = next.filter((u) => userMatchesArea(u, filter.area!))
  }
  if (filter.activo !== undefined && filter.activo !== null) {
    next = next.filter((u) => u.activo === filter.activo)
  }

  if (filter.search?.trim()) {
    const term = filter.search.trim().toLowerCase()
    next = next.filter(
      (u) =>
        u.nombre.toLowerCase().includes(term) ||
        (u.email?.toLowerCase().includes(term) ?? false) ||
        (u.area?.toLowerCase().includes(term) ?? false) ||
        (u.areas ?? []).some((a) => a.toLowerCase().includes(term))
    )
  }

  return next
}

async function listVisibleUsersCatalog(filter: UsersFilter): Promise<UserProfile[]> {
  let query = supabase
    .from(TABLE)
    .select('id,user_id,nombre,rol,area,activo,manager_user_id,created_at,updated_at')
    .order('nombre', { ascending: true })

  if (filter.activo !== undefined && filter.activo !== null) {
    query = query.eq('activo', filter.activo)
  }

  const { data, error } = await query
  if (error) throw error

  const profiles = await enrichProfilesWithRoles(
    ((data ?? []) as Omit<UserProfile, 'email'>[]).map((u) => ({ ...u, email: null })),
  )
  return applyUserFilters(profiles, { ...filter, activo: null })
}

/** Mensajes del API (a veces en inglés) → texto claro para quien administra usuarios. */
function mapInviteUserFacingMessage(raw: string): string {
  const m = raw.trim()
  const low = m.toLowerCase()
  if (/already|exists|registered/i.test(low) && (low.includes('user') || low.includes('email'))) {
    return 'Ese correo ya tiene cuenta. Revisa el listado de usuarios o usa otro correo.'
  }
  if (low.includes('invalid') && low.includes('email')) {
    return 'El correo no es válido. Revísalo e inténtalo de nuevo.'
  }
  if (m === 'No autorizado' || m === 'Sesión inválida') {
    return 'Tu sesión caducó o no tienes permiso. Vuelve a iniciar sesión e inténtalo de nuevo.'
  }
  if (m === 'Solo administradores pueden invitar usuarios') {
    return 'Solo quienes administran la plataforma pueden enviar invitaciones.'
  }
  if (m === 'No se pudo validar permisos' || m === 'Faltan credenciales de Supabase') {
    return 'No pudimos completar la invitación por un fallo del servidor. Inténtalo más tarde o avisa a quien administra el sistema.'
  }
  if (m === 'Correo, nombre y rol son obligatorios') {
    return 'Faltan correo, nombre o rol.'
  }
  return m
}

async function parseInviteFunctionError(
  error: Error,
  data: InviteUserResponseBody | null
): Promise<string> {
  if (data && typeof data.message === 'string' && data.message.trim()) {
    return mapInviteUserFacingMessage(data.message)
  }
  const ctx = (error as { context?: Response }).context
  if (ctx && typeof ctx.json === 'function') {
    try {
      const body: unknown = await ctx.json()
      if (body && typeof body === 'object' && 'message' in body && typeof (body as { message: string }).message === 'string') {
        return mapInviteUserFacingMessage((body as { message: string }).message)
      }
    } catch {
      /* ignore */
    }
  }
  return mapInviteUserFacingMessage(error.message || 'No pudimos enviar la invitación')
}

export const usersAdminService = {
  /**
   * Lista usuarios con filtros. Requiere RLS que permita a admins ver todos.
   * Paginación: por ahora devuelve todos; estructura lista para limit/offset después.
   */
  async list(filter: UsersFilter = {}): Promise<UserProfile[]> {
    if (filter.activo === true) {
      return listVisibleUsersCatalog(filter)
    }

    const { data, error } = await supabase.rpc('settings_users_list')
    if (error) {
      if (isUnauthorizedListError(error) || isMissingRpcError(error)) {
        return listVisibleUsersCatalog(filter)
      }
      throw error
    }

    return applyUserFilters(await enrichProfilesWithRoles((data ?? []) as UserProfile[]), filter)
  },

  async getById(id: string): Promise<UserProfile | null> {
    const { data: rpcData, error: rpcError } = await supabase.rpc('settings_users_get', {
      p_id: id,
    })

    if (!rpcError && rpcData != null) {
      const row = (Array.isArray(rpcData) ? rpcData[0] : rpcData) as UserProfile | undefined
      if (row) return (await enrichProfilesWithRoles([row]))[0]
    }

    if (rpcError && !isMissingRpcError(rpcError) && !isUnauthorizedListError(rpcError)) {
      throw rpcError
    }

    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .eq('id', id)
      .maybeSingle()
    if (error) throw error
    if (!data) return null
    return (await enrichProfilesWithRoles([data as UserProfile]))[0]
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
    const hasManagerField = 'manager_user_id' in input
    const hasAreasField = 'primary_area_id' in input || 'area_ids' in input
    const hasReportsField = 'direct_report_ids' in input
    const hasRolesField = Boolean(input.primary_role_id && input.role_ids?.length)
    const payload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }

    if (input.nombre !== undefined) {
      payload.nombre = input.nombre.trim()
    }
    if (input.rol !== undefined && !hasRolesField) {
      payload.rol = input.rol
    }
    if ('area' in input && !hasAreasField) {
      payload.area = input.area?.trim() ?? null
    }
    if (input.activo !== undefined) {
      payload.activo = input.activo
    }

    const hasOtherFields = Object.keys(payload).length > 1
    let profile: UserProfile | null = null

    if (hasOtherFields) {
      const { data, error } = await supabase
        .from(TABLE)
        .update(payload)
        .eq('id', id)
        .select()
        .maybeSingle()

      if (error && !isNoRowsUpdateError(error)) {
        throw error
      }

      profile = data ? normalizeAreas(data as UserProfile) : null
    }

    if (hasAreasField) {
      profile = await setAreasViaRpc(
        id,
        input.primary_area_id ?? null,
        input.area_ids ?? []
      )
    }

    if (hasManagerField && hasReportsField) {
      profile = await updateOrgHierarchyViaRpc(
        id,
        input.manager_user_id ?? null,
        input.direct_report_ids ?? []
      )
    } else if (hasManagerField) {
      profile = await updateManagerViaRpc(id, input.manager_user_id ?? null)
      await refreshOrgChartScore(id)
    } else if (hasReportsField) {
      await setDirectReportsViaRpc(id, input.direct_report_ids ?? [])
      await refreshOrgChartScore(id)
      profile = await this.getById(id)
    }

    if (hasRolesField) {
      await setRolesViaRpc(id, input.role_ids!, input.primary_role_id!)
      profile = await this.getById(id)
    }

    if (!profile) {
      throw new Error('No se pudo actualizar el usuario. Verifica tus permisos.')
    }

    return normalizeAreas(profile)
  },

  async setAreas(
    id: string,
    primaryAreaId: string | null,
    areaIds: string[]
  ): Promise<UserProfile> {
    return setAreasViaRpc(id, primaryAreaId, areaIds)
  },

  async setDirectReports(managerId: string, reportIds: string[]): Promise<UserProfile[]> {
    const reports = await setDirectReportsViaRpc(managerId, reportIds)
    await refreshOrgChartScore(managerId)
    return reports
  },

  async setManager(id: string, managerUserId: string | null): Promise<UserProfile> {
    const profile = await updateManagerViaRpc(id, managerUserId)
    await refreshOrgChartScore(id)
    return profile
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
  async create(input: CreateUserInput): Promise<UserProfile | null> {
    const payload = {
      email: input.email.trim().toLowerCase(),
      nombre: input.nombre.trim(),
      rol: input.rol,
      area: input.area?.trim() ?? null,
      activo: input.activo ?? true,
    }

    const { data, error } = await supabase.functions.invoke<InviteUserResponseBody>('invite-user', {
      body: payload,
    })

    if (error) {
      throw new Error(await parseInviteFunctionError(error, data ?? null))
    }
    if (data && data.ok === false && typeof data.message === 'string') {
      throw new Error(mapInviteUserFacingMessage(data.message))
    }
    const profile = data?.profile ?? null
    if (profile && input.primary_role_id && input.role_ids?.length) {
      await setRolesViaRpc(profile.id, input.role_ids, input.primary_role_id)
      return this.getById(profile.id)
    }
    return profile
  },
}
