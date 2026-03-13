import { useQuery } from '@tanstack/react-query'
import { usersAdminService } from '../services/users.service'
import type { UsersFilter } from '../types/user.types'

const QUERY_KEY = ['users', 'admin'] as const

export function useUsers(filter: UsersFilter = {}) {
  return useQuery({
    queryKey: [...QUERY_KEY, filter],
    queryFn: () => usersAdminService.list(filter),
  })
}

export { QUERY_KEY as usersQueryKey }
