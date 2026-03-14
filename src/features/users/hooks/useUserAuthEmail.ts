import { useQuery } from '@tanstack/react-query'
import { usersAdminService } from '../services/users.service'

const QUERY_KEY = ['users', 'admin', 'auth-email'] as const

export function useUserAuthEmail(userId: string | undefined | null) {
  return useQuery({
    queryKey: [...QUERY_KEY, userId],
    queryFn: () => usersAdminService.getAuthEmail(userId!),
    enabled: !!userId,
  })
}
