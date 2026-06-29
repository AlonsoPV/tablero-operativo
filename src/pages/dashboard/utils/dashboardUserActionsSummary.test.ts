import { describe, expect, it } from 'vitest'
import type { UserProfile } from '@/features/users/types/user.types'
import {
  buildAreaActionsSummaryRows,
  buildUserActionsSummaryRows,
  filterUsersWithAssignedArea,
  hasAssignedArea,
} from './dashboardUserActionsSummary'

function user(partial: Partial<UserProfile> & Pick<UserProfile, 'id' | 'nombre'>): UserProfile {
  return {
    user_id: partial.id,
    rol: 'Operativo',
    area: null,
    activo: true,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
    ...partial,
  }
}

describe('dashboardUserActionsSummary', () => {
  it('hasAssignedArea solo acepta texto no vacio', () => {
    expect(hasAssignedArea({ area: 'Operaciones' })).toBe(true)
    expect(hasAssignedArea({ area: '  RH  ' })).toBe(true)
    expect(hasAssignedArea({ area: null })).toBe(false)
    expect(hasAssignedArea({ area: '' })).toBe(false)
    expect(hasAssignedArea({ area: '   ' })).toBe(false)
  })

  it('filterUsersWithAssignedArea excluye usuarios sin area y respeta filtro de area', () => {
    const users = [
      user({ id: 'u1', nombre: 'Ana', area: 'Operaciones' }),
      user({ id: 'u2', nombre: 'Bob', area: null }),
      user({ id: 'u3', nombre: 'Cara', area: 'RH' }),
    ]

    expect(filterUsersWithAssignedArea(users)).toHaveLength(2)
    expect(filterUsersWithAssignedArea(users, 'rh')).toEqual([
      user({ id: 'u3', nombre: 'Cara', area: 'RH' }),
    ])
  })

  it('buildUserActionsSummaryRows solo incluye usuarios con area asignada', () => {
    const users = [
      user({ id: 'u1', nombre: 'Ana', area: 'Operaciones' }),
      user({ id: 'u2', nombre: 'Bob', area: null }),
    ]

    const rows = buildUserActionsSummaryRows(users, [], [], '2026-06-15')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      userId: 'u1',
      area: 'Operaciones',
      abiertas: 0,
    })
  })

  it('buildAreaActionsSummaryRows agrega metricas por area', () => {
    const rows = buildAreaActionsSummaryRows([
      {
        userId: 'u1',
        nombre: 'Ana',
        area: 'Operaciones',
        abiertas: 3,
        retraso: 1,
        bloqueadas: 0,
        gamificationPoints: 10,
      },
      {
        userId: 'u2',
        nombre: 'Luis',
        area: 'Operaciones',
        abiertas: 2,
        retraso: 0,
        bloqueadas: 1,
        gamificationPoints: 5,
      },
      {
        userId: 'u3',
        nombre: 'Cara',
        area: 'RH',
        abiertas: 1,
        retraso: 0,
        bloqueadas: 0,
        gamificationPoints: 2,
      },
    ])

    expect(rows).toHaveLength(2)
    expect(rows.find((r) => r.area === 'Operaciones')).toMatchObject({
      usuarios: 2,
      abiertas: 5,
      retraso: 1,
      bloqueadas: 1,
      gamificationPoints: 15,
    })
    expect(rows.find((r) => r.area === 'RH')).toMatchObject({
      usuarios: 1,
      abiertas: 1,
      gamificationPoints: 2,
    })
  })
})
