import { isDirectionByRole, isExcludedFromOrgChartByRole } from '@/features/auth/lib/permissions'
import { resolveOrgProfilePoints, type OrgChartGamificationScore } from '@/features/disciplina/utils/actionGamification'

export type OrgGovernanceUser = {
  id: string
  nombre: string
  rol: string
  activo: boolean
  manager_user_id: string | null
}

export type OrgGovernanceStats = {
  eligibleUsers: number
  completeProfiles: number
  completePct: number
  usersWithoutManager: number
  leadersWithoutTeam: number
  hierarchyChanges30d: number
  pointsFromCompleteProfiles: number
}

/** Perfil completo: tiene jefe, o es root con equipo (Supervisa a cuando aplica). */
export function isOrgProfileComplete(
  user: OrgGovernanceUser,
  users: OrgGovernanceUser[]
): boolean {
  if (!user.activo || isExcludedFromOrgChartByRole(user.rol)) return false
  if (user.manager_user_id) return true
  return users.some(
    (candidate) =>
      candidate.manager_user_id === user.id &&
      candidate.activo &&
      !isExcludedFromOrgChartByRole(candidate.rol)
  )
}

export function buildOrgGovernanceStats(
  users: OrgGovernanceUser[],
  scores: ReadonlyMap<string, OrgChartGamificationScore> = new Map(),
  hierarchyChanges30d = 0
): OrgGovernanceStats {
  const eligible = users.filter(
    (user) => user.activo && !isExcludedFromOrgChartByRole(user.rol)
  )
  const completeProfiles = eligible.filter((user) => isOrgProfileComplete(user, eligible)).length
  const usersWithoutManager = eligible.filter((user) => user.manager_user_id == null).length
  const leadersWithoutTeam = eligible.filter((user) => {
    if (!isDirectionByRole(user.rol)) return false
    return !eligible.some((candidate) => candidate.manager_user_id === user.id)
  }).length

  const pointsFromCompleteProfiles = eligible.reduce((sum, user) => {
    const points = resolveOrgProfilePoints(scores.get(user.id))
    return sum + (points === 15 ? 15 : 0)
  }, 0)

  return {
    eligibleUsers: eligible.length,
    completeProfiles,
    completePct:
      eligible.length === 0 ? 0 : Math.round((1000 * completeProfiles) / eligible.length) / 10,
    usersWithoutManager,
    leadersWithoutTeam,
    hierarchyChanges30d,
    pointsFromCompleteProfiles,
  }
}
