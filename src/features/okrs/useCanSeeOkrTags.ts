import { canAccessOkrs } from '@/features/auth/lib/permissions'
import { useAccessCapabilities } from '@/features/auth/hooks/useAccessCapabilities'
import { useAppRole } from '@/features/auth/hooks/useAppRole'
import { useCurrentUser } from '@/features/users/hooks/useCurrentUser'

/** Ver tags de alineación OKR: Super Admin, Dirección o área OKRS (lectura transversal). */
export function useCanSeeOkrTags() {
  const { data: user } = useCurrentUser()
  const { data: appRole } = useAppRole()
  return canAccessOkrs(user?.rol, appRole, user?.area, user?.areas)
}

/** Marcar o desmarcar acciones como OKR: misma regla que public.okr_can_tag_actions(). */
export function useCanTagOkrActions() {
  return useAccessCapabilities().adminAllOkrs
}
