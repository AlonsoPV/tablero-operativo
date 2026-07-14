import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { usersAdminService } from '../services/users.service'
import type { UpdateUserInput, UserProfile } from '../types/user.types'
import { currentUserQueryKey } from './useCurrentUser'
import { userDetailQueryKey } from './useUser'
import { usersQueryKey } from './useUsers'

export function useUpdateUser() {
  const queryClient = useQueryClient()
  const { user: authUser, refetch: refetchAuth } = useAuth()

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateUserInput }) =>
      usersAdminService.update(id, input),
    onSuccess: async (updatedUser, variables) => {
      queryClient.setQueriesData<UserProfile[]>(
        {
          predicate: ({ queryKey }) =>
            queryKey[0] === usersQueryKey[0] &&
            queryKey[1] === usersQueryKey[1] &&
            queryKey[2] !== 'detail',
        },
        (currentUsers) => {
          if (!currentUsers) return currentUsers
          return currentUsers.map((user) =>
            user.id === updatedUser.id ? { ...user, ...updatedUser } : user
          )
        }
      )
      queryClient.setQueryData(userDetailQueryKey(updatedUser.id), updatedUser)

      if (authUser?.id && updatedUser.user_id === authUser.id) {
        queryClient.setQueryData(currentUserQueryKey(authUser.id), updatedUser)
        await refetchAuth().catch((error) => {
          console.warn('No pudimos refrescar el perfil activo despues de actualizar usuario.', error)
        })
      }

      queryClient.invalidateQueries({ queryKey: usersQueryKey })
      queryClient.invalidateQueries({ queryKey: ['users', 'current'] })
      queryClient.invalidateQueries({ queryKey: ['org-chart'] })
      if ('manager_user_id' in variables.input || 'direct_report_ids' in variables.input) {
        queryClient.invalidateQueries({
          queryKey: ['disciplina', 'org-chart-score', updatedUser.id],
        })
        queryClient.invalidateQueries({
          queryKey: ['disciplina', 'org-chart-scores-visible'],
        })
      }
    },
  })
}
