import { describe, expect, it } from 'vitest'
import {
  buildOrgGovernanceStats,
  isOrgProfileComplete,
} from './orgGovernanceStats'

const users = [
  { id: 'm1', nombre: 'Maria', rol: 'Direccion', activo: true, manager_user_id: null },
  { id: 'j1', nombre: 'Juan', rol: 'Operativo', activo: true, manager_user_id: 'm1' },
  { id: 'a1', nombre: 'Ana', rol: 'Operativo', activo: true, manager_user_id: null },
  { id: 's1', nombre: 'Admin', rol: 'super_admin', activo: true, manager_user_id: null },
]

describe('orgGovernanceStats', () => {
  it('considera completo al que reporta o al lider root con equipo', () => {
    expect(isOrgProfileComplete(users[1], users)).toBe(true)
    expect(isOrgProfileComplete(users[0], users)).toBe(true)
    expect(isOrgProfileComplete(users[2], users)).toBe(false)
    expect(isOrgProfileComplete(users[3], users)).toBe(false)
  })

  it('excluye Super Admin y calcula indicadores base', () => {
    const stats = buildOrgGovernanceStats(users, new Map([
      ['j1', { profile_complete_points: 15 }],
      ['m1', { profile_complete_points: 15 }],
      ['a1', { profile_complete_points: 0 }],
    ]), 4)

    expect(stats.eligibleUsers).toBe(3)
    expect(stats.completeProfiles).toBe(2)
    expect(stats.usersWithoutManager).toBe(2)
    expect(stats.leadersWithoutTeam).toBe(0)
    expect(stats.hierarchyChanges30d).toBe(4)
    expect(stats.pointsFromCompleteProfiles).toBe(30)
  })
})
