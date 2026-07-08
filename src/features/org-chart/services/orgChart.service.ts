import { supabase } from '@/lib/supabase/client'
import type { OrgChartCommandChainRow, OrgChartUser } from '../types/orgChart.types'

export const orgChartService = {
  async list(): Promise<OrgChartUser[]> {
    const { data, error } = await supabase.rpc('org_chart_list')
    if (error) throw error
    return (data ?? []) as OrgChartUser[]
  },

  async commandChain(userId: string): Promise<OrgChartCommandChainRow[]> {
    const { data, error } = await supabase.rpc('org_chart_command_chain', {
      p_user_id: userId,
    })
    if (error) throw error
    return (data ?? []) as OrgChartCommandChainRow[]
  },
}
