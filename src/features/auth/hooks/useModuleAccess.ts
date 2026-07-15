import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from './useAuth'

function isMissingRpc(error: { code?: string; message?: string } | null) {
  return error?.code === 'PGRST202' || error?.message?.includes('current_user_module_keys')
}

export function useModuleAccess() {
  const { user, isAuthenticated } = useAuth()
  return useQuery({
    queryKey: ['auth', 'module-access', user?.id ?? null],
    queryFn: async (): Promise<string[] | null> => {
      const { data, error } = await supabase.rpc('current_user_module_keys')
      if (isMissingRpc(error)) return null
      if (error) throw error
      return (data ?? []) as string[]
    },
    enabled: Boolean(user?.id && isAuthenticated),
    staleTime: 60 * 1000,
  })
}

