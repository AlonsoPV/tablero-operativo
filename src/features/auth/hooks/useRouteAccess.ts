import { useCallback } from 'react'
import { useAppRole } from '@/features/auth/hooks/useAppRole'
import { canAccessRouteByRole } from '@/features/auth/lib/permissions'
import { useCurrentUser } from '@/features/users/hooks/useCurrentUser'

/** Combina rol de negocio (usuarios.rol) y app_role (user_roles) para gates de navegación. */
export function useRouteAccess() {
  const { data: currentUser } = useCurrentUser()
  const { data: appRole } = useAppRole()

  const canAccessRoute = useCallback(
    (pathname: string) => canAccessRouteByRole(currentUser?.rol, pathname, appRole),
    [appRole, currentUser?.rol]
  )

  return {
    rol: currentUser?.rol,
    appRole: appRole ?? null,
    canAccessRoute,
  }
}
