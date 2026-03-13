import { useQuery } from '@tanstack/react-query'
import { usersAdminService } from '../services/users.service'

const QUERY_KEY = ['users', 'admin', 'detail'] as const

export function useUser(id: string | undefined | null) {
  return useQuery({
    queryKey: [...QUERY_KEY, id],
    queryFn: () => usersAdminService.getById(id!),
    enabled: !!id,
  })
}
