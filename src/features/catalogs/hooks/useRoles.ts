import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { rolesService } from '../services/roles.service'
import type { CatalogFilter } from '../types/catalogs.types'
import type { CreateRoleInput, UpdateRoleInput } from '../types/catalogs.types'

const KEY = ['catalogs', 'roles'] as const
const CATALOG_STALE_TIME = 10 * 60 * 1000

export function useRoles(filter: CatalogFilter = {}) {
  return useQuery({
    queryKey: [...KEY, filter],
    queryFn: () => rolesService.list(filter),
    staleTime: CATALOG_STALE_TIME,
    retry: 1,
  })
}

export function useRole(id: string | undefined | null) {
  return useQuery({
    queryKey: [...KEY, id],
    queryFn: () => rolesService.getById(id!),
    enabled: !!id,
    staleTime: CATALOG_STALE_TIME,
    retry: 1,
  })
}

export function useCreateRole() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateRoleInput) => rolesService.create(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY, refetchType: 'active' }),
  })
}

export function useUpdateRole() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateRoleInput }) =>
      rolesService.update(id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY, refetchType: 'active' }),
  })
}

export function useToggleRoleStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, activo }: { id: string; activo: boolean }) =>
      rolesService.setActivo(id, activo),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY, refetchType: 'active' }),
  })
}
