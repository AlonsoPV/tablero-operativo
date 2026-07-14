import { supabase } from '@/lib/supabase/client'
import type { OrgChartGamificationScore } from '../utils/actionGamification'

export interface OrgChartScore extends OrgChartGamificationScore {
  user_id: string
  total_points: number
  last_edited_by: string | null
  updated_at: string
}

function isMigrationPending(error: { code?: string; message?: string } | null): boolean {
  const message = error?.message?.toLowerCase() ?? ''
  return (
    error?.code === '42P01' ||
    error?.code === 'PGRST205' ||
    message.includes('user_org_chart_scores')
  )
}

function mapScore(row: Record<string, unknown>): OrgChartScore {
  const profileComplete =
    typeof row.profile_complete_points === 'number'
      ? row.profile_complete_points
      : (Number(row.reports_to_points) || 0) + (Number(row.supervises_points) || 0)

  return {
    user_id: String(row.user_id),
    profile_complete_points: profileComplete,
    ever_completed: Boolean(row.ever_completed),
    reports_to_points: typeof row.reports_to_points === 'number' ? row.reports_to_points : undefined,
    supervises_points: typeof row.supervises_points === 'number' ? row.supervises_points : undefined,
    total_points: typeof row.total_points === 'number' ? row.total_points : profileComplete,
    last_edited_by: (row.last_edited_by as string | null) ?? null,
    updated_at: String(row.updated_at),
  }
}

const SCORE_SELECT =
  'user_id,reports_to_points,supervises_points,profile_complete_points,ever_completed,total_points,last_edited_by,updated_at'

export const orgChartScoreService = {
  async getByUser(userId: string): Promise<OrgChartScore | null> {
    const { data, error } = await supabase
      .from('user_org_chart_scores')
      .select(SCORE_SELECT)
      .eq('user_id', userId)
      .maybeSingle()

    if (error) {
      if (isMigrationPending(error)) return null
      // Columna nueva aun no aplicada: reintentar select legacy.
      if (error.message?.includes('profile_complete_points')) {
        const legacy = await supabase
          .from('user_org_chart_scores')
          .select('user_id,reports_to_points,supervises_points,total_points,last_edited_by,updated_at')
          .eq('user_id', userId)
          .maybeSingle()
        if (legacy.error) {
          if (isMigrationPending(legacy.error)) return null
          throw legacy.error
        }
        return legacy.data ? mapScore(legacy.data as Record<string, unknown>) : null
      }
      throw error
    }
    return data ? mapScore(data as Record<string, unknown>) : null
  },

  async listVisible(): Promise<OrgChartScore[]> {
    const { data, error } = await supabase.from('user_org_chart_scores').select(SCORE_SELECT)

    if (error) {
      if (isMigrationPending(error)) return []
      if (error.message?.includes('profile_complete_points')) {
        const legacy = await supabase
          .from('user_org_chart_scores')
          .select('user_id,reports_to_points,supervises_points,total_points,last_edited_by,updated_at')
        if (legacy.error) {
          if (isMigrationPending(legacy.error)) return []
          throw legacy.error
        }
        return (legacy.data ?? []).map((row) => mapScore(row as Record<string, unknown>))
      }
      throw error
    }
    return (data ?? []).map((row) => mapScore(row as Record<string, unknown>))
  },

  async governanceStats(): Promise<{
    eligible_users: number
    complete_profiles: number
    complete_pct: number
    users_without_manager: number
    leaders_without_team: number
    hierarchy_changes_30d: number
    points_from_complete_profiles: number
  } | null> {
    const { data, error } = await supabase.rpc('org_chart_governance_stats')
    if (error) {
      if (
        error.code === 'PGRST202' ||
        error.message?.toLowerCase().includes('org_chart_governance_stats')
      ) {
        return null
      }
      throw error
    }
    const row = Array.isArray(data) ? data[0] : data
    if (!row) return null
    return {
      eligible_users: Number(row.eligible_users) || 0,
      complete_profiles: Number(row.complete_profiles) || 0,
      complete_pct: Number(row.complete_pct) || 0,
      users_without_manager: Number(row.users_without_manager) || 0,
      leaders_without_team: Number(row.leaders_without_team) || 0,
      hierarchy_changes_30d: Number(row.hierarchy_changes_30d) || 0,
      points_from_complete_profiles: Number(row.points_from_complete_profiles) || 0,
    }
  },
}
