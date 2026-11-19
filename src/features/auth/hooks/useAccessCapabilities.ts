import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import {
  isSuperAdminCatalogRole,
  resolveAccessCapabilities,
  type AccessCapabilities,
  type CatalogRoleRef,
} from '@/features/auth/lib/permissions'
import { useCurrentUser } from '@/features/users/hooks/useCurrentUser'
import { useAppRole } from './useAppRole'
import { useModuleAccess } from './useModuleAccess'

/** Rol de catálogo super_admin del propio usuario (RLS: cada usuario lee sus roles). */
function useCatalogSuperAdmin(usuarioId: string | undefined) {
  return useQuery({
    queryKey: ['auth', 'catalog-super-admin', usuarioId ?? null],
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await supabase
        .from('usuario_catalog_roles')
        .select('catalog_roles(nombre, system_key, activo)')
        .eq('user_id', usuarioId!)
      if (error) return false
      return (data ?? []).some((row) => {
        const linked = (row as { catalog_roles?: CatalogRoleRef | CatalogRoleRef[] | null }).catalog_roles
        return (Array.isArray(linked) ? linked : [linked]).some(isSuperAdminCatalogRole)
      })
    },
    enabled: Boolean(usuarioId),
    staleTime: 60 * 1000,
  })
}

/** Capacidades del usuario actual para la UI. El backend y RLS vuelven a validarlas. */
export function useAccessCapabilities(): AccessCapabilities {
  const { data: user } = useCurrentUser()
  const { data: appRole } = useAppRole()
  const { data: moduleKeys } = useModuleAccess()
  const { data: catalogSuperAdmin } = useCatalogSuperAdmin(user?.id)
  return resolveAccessCapabilities({
    rol: user?.rol,
    appRole,
    area: user?.area,
    areas: user?.areas,
    moduleKeys,
    active: user ? user.activo !== false : false,
    catalogSuperAdmin,
  })
}
