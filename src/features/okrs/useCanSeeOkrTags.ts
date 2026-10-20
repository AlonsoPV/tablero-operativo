import { canAccessOkrs } from '@/features/auth/lib/permissions'
import { useAppRole } from '@/features/auth/hooks/useAppRole'
import { useCurrentUser } from '@/features/users/hooks/useCurrentUser'

/** Tags de alineación OKR y marca en acciones: solo área OKRS (o Super Admin). */
export function useCanSeeOkrTags() {
  const { data: user } = useCurrentUser()
  const { data: appRole } = useAppRole()
  return canAccessOkrs(user?.rol, appRole, user?.area, user?.areas)
}
