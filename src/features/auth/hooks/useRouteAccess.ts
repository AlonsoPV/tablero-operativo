import { useCallback } from 'react'
import { useAppRole } from '@/features/auth/hooks/useAppRole'
import { canAccessRouteWithModules } from '@/features/auth/lib/moduleAccess'
import { useCurrentUser } from '@/features/users/hooks/useCurrentUser'
import { useModuleAccess } from './useModuleAccess'

/** Combina rol de negocio (usuarios.rol) y app_role (user_roles) para gates de navegación. */
export function useRouteAccess() {
  const { data: currentUser } = useCurrentUser()
  const { data: appRole } = useAppRole()
  const { data: moduleKeys, isLoading: modulesLoading } = useModuleAccess()

  const canAccessRoute = useCallback(
    (pathname: string) => canAccessRouteWithModules(currentUser?.rol, pathname, appRole, moduleKeys),
    [appRole, currentUser?.rol, moduleKeys]
  )

  return {
    rol: currentUser?.rol,
    appRole: appRole ?? null,
    modulesLoading,
    canAccessRoute,
  }
}
