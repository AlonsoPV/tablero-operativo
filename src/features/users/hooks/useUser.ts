import { useQuery } from '@tanstack/react-query'
import { usersAdminService } from '../services/users.service'

const QUERY_KEY = ['users', 'admin', 'detail'] as const

export function userDetailQueryKey(id: string | undefined | null) {
  return [...QUERY_KEY, id ?? null] as const
}

export function useUser(id: string | undefined | null) {
  return useQuery({
    queryKey: userDetailQueryKey(id),
    queryFn: () => usersAdminService.getById(id!),
    enabled: !!id,
  })
}
