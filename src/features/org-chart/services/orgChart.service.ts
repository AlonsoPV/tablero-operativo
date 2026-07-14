import { supabase } from '@/lib/supabase/client'
import type { OrgChartCommandChainRow, OrgChartUser } from '../types/orgChart.types'

export const orgChartService = {
  async list(): Promise<OrgChartUser[]> {
    const { data, error } = await supabase.rpc('org_chart_list')
    if (error) throw error
    return ((data ?? []) as OrgChartUser[]).map((user) => ({
      ...user,
      areas: user.areas?.length ? user.areas : user.area ? [user.area] : [],
    }))
  },

  /** Cadena visible + candidatos sin líder (para editar jerarquía en perfil). */
  async hierarchyPeers(): Promise<OrgChartUser[]> {
    const { data, error } = await supabase.rpc('settings_users_hierarchy_peers')
    if (error) {
      // Fallback si la migración aún no está aplicada
      return this.list()
    }
    return ((data ?? []) as OrgChartUser[]).map((user) => ({
      ...user,
      areas: user.areas?.length ? user.areas : user.area ? [user.area] : [],
    }))
  },

  async commandChain(userId: string): Promise<OrgChartCommandChainRow[]> {
    const { data, error } = await supabase.rpc('org_chart_command_chain', {
      p_user_id: userId,
    })
    if (error) throw error
    return (data ?? []) as OrgChartCommandChainRow[]
  },
}
