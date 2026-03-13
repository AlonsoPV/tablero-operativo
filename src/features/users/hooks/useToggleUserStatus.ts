import { useMutation, useQueryClient } from '@tanstack/react-query'
import { usersAdminService } from '../services/users.service'
import { usersQueryKey } from './useUsers'

export function useToggleUserStatus() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, activo }: { id: string; activo: boolean }) =>
      usersAdminService.setActivo(id, activo),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: usersQueryKey })
    },
  })
}
