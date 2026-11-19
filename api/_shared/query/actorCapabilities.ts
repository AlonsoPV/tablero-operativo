/**
 * Capacidades del actor leídas en servidor (rol, app_role, áreas y módulos de catálogo).
 * Misma derivación que public.access_capabilities_for_usuario; nunca usa datos del cliente ni del modelo.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  resolveAccessCapabilities,
  type AccessCapabilities,
} from '../../../src/features/auth/lib/permissions.js'

type CapabilityIdentity = {
  supabase: SupabaseClient
  authUserId: string
  usuarioId: string
  rol: string | null
  active: boolean
}

type Relation<T> = T | T[] | null | undefined

function list<T>(value: Relation<T>): T[] {
  if (!value) return []
  return Array.isArray(value) ? value : [value]
}

/** Si una lectura falla se conserva sólo lo derivable del rol: nunca se amplía por error. */
export async function loadAgentCapabilities(identity: CapabilityIdentity): Promise<AccessCapabilities> {
  const fallback = resolveAccessCapabilities({ rol: identity.rol, active: identity.active })
  try {
    const [rolesRes, usuarioRes, areasRes, modulesRes] = await Promise.all([
      identity.supabase.from('user_roles').select('app_role').eq('user_id', identity.authUserId),
      identity.supabase.from('usuarios').select('area, activo').eq('id', identity.usuarioId).maybeSingle(),
      identity.supabase.from('usuario_areas').select('areas(nombre)').eq('user_id', identity.usuarioId),
      identity.supabase
        .from('usuario_catalog_roles')
        .select('catalog_roles(activo, catalog_role_modules(module_key))')
        .eq('user_id', identity.usuarioId),
    ])
    if (usuarioRes.error || !usuarioRes.data) return fallback
    const usuario = usuarioRes.data as { area?: string | null; activo?: boolean | null }
    const appRole = rolesRes.error
      ? null
      : String(((rolesRes.data ?? [])[0] as { app_role?: string } | undefined)?.app_role ?? '') || null
    const areas = areasRes.error
      ? []
      : ((areasRes.data ?? []) as Array<{ areas?: Relation<{ nombre?: string }> }>)
          .flatMap((row) => list(row.areas).map((a) => a.nombre))
          .filter((name): name is string => Boolean(name))
    const moduleKeys = modulesRes.error
      ? []
      : ((modulesRes.data ?? []) as Array<{
          catalog_roles?: Relation<{ activo?: boolean; catalog_role_modules?: Array<{ module_key?: string }> }>
        }>).flatMap((row) =>
          list(row.catalog_roles)
            .filter((role) => role.activo !== false)
            .flatMap((role) => (role.catalog_role_modules ?? []).map((m) => m.module_key))
        ).filter((key): key is string => Boolean(key))
    return resolveAccessCapabilities({
      rol: identity.rol,
      appRole,
      area: typeof usuario.area === 'string' ? usuario.area : null,
      areas,
      moduleKeys,
      active: identity.active && usuario.activo !== false,
    })
  } catch {
    return fallback
  }
}

/** Huella estable de las capacidades; si cambia, el contexto conversacional previo se descarta. */
export function capabilityFingerprint(capabilities: AccessCapabilities): string {
  return Object.entries(capabilities)
    .filter(([, value]) => value === true)
    .map(([key]) => key)
    .sort()
    .join(',') || 'none'
}
