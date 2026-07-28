import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import {
  normalizeUserLoginBuckets,
  type LoginGranularity,
} from '../utils/dashboardUserLoginStats'

export function useDashboardUserLoginStats(
  granularity: LoginGranularity,
  enabled = true
) {
  return useQuery({
    queryKey: ['dashboard', 'user-login-activity', granularity],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('dashboard_user_login_buckets', {
        p_granularity: granularity,
      })
      if (error) throw error
      return normalizeUserLoginBuckets(data)
    },
    enabled,
    staleTime: 5 * 60_000,
    retry: 1,
  })
}
