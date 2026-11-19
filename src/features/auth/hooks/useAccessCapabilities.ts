import { resolveAccessCapabilities, type AccessCapabilities } from '@/features/auth/lib/permissions'
import { useCurrentUser } from '@/features/users/hooks/useCurrentUser'
import { useAppRole } from './useAppRole'
import { useModuleAccess } from './useModuleAccess'

/** Capacidades del usuario actual para la UI. El backend y RLS vuelven a validarlas. */
export function useAccessCapabilities(): AccessCapabilities {
  const { data: user } = useCurrentUser()
  const { data: appRole } = useAppRole()
  const { data: moduleKeys } = useModuleAccess()
  return resolveAccessCapabilities({
    rol: user?.rol,
    appRole,
    area: user?.area,
    areas: user?.areas,
    moduleKeys,
    active: user ? user.activo !== false : false,
  })
}
