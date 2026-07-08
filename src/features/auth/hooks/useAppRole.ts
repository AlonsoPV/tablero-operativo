import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { supabase } from '@/lib/supabase/client'
import type { AppRole } from '@/features/auth/lib/permissions'

export function useAppRole() {
  const { user, isAuthenticated } = useAuth()

  return useQuery({
    queryKey: ['auth', 'app-role', user?.id ?? null],
    queryFn: async (): Promise<AppRole | null> => {
      const { data, error } = await supabase
        .from('user_roles')
        .select('app_role')
        .eq('user_id', user!.id)
        .maybeSingle()

      if (error) throw error
      const role = data?.app_role
      return role === 'admin' || role === 'super_admin' || role === 'viewer' ? role : null
    },
    enabled: Boolean(user?.id && isAuthenticated),
    staleTime: 5 * 60 * 1000,
  })
}
