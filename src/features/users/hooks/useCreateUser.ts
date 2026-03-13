import { useMutation, useQueryClient } from '@tanstack/react-query'
import { usersAdminService } from '../services/users.service'
import type { CreateUserInput } from '../types/user.types'
import { usersQueryKey } from './useUsers'

/**
 * Crear usuario (perfil en tabla usuarios).
 * Requiere user_id de auth.users. En la práctica el alta completa (auth + perfil)
 * se hará vía invitación por email o Edge Function; este hook queda listo para
 * cuando exista ese flujo (p. ej. recibir user_id tras crear en auth).
 */
export function useCreateUser() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: CreateUserInput & { user_id: string }) =>
      usersAdminService.create(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: usersQueryKey })
    },
  })
}
