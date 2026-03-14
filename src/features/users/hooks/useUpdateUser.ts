import { useMutation, useQueryClient } from '@tanstack/react-query'
import { usersAdminService } from '../services/users.service'
import type { UpdateUserInput } from '../types/user.types'
import { usersQueryKey } from './useUsers'

export function useUpdateUser() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateUserInput }) =>
      usersAdminService.update(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: usersQueryKey })
      queryClient.invalidateQueries({ queryKey: ['users', 'current'] })
    },
  })
}
