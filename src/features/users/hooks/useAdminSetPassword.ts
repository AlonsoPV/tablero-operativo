import { useMutation } from '@tanstack/react-query'
import { usersAdminService } from '../services/users.service'

export function useAdminSetPassword() {
  return useMutation({
    mutationFn: ({ usuarioId, password }: { usuarioId: string; password: string }) =>
      usersAdminService.setPassword(usuarioId, password),
  })
}
