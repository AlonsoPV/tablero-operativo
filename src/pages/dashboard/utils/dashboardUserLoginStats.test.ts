import { describe, expect, it } from 'vitest'
import {
  formatLoginTimestamp,
  loginBucketDateRangeLabel,
  loginBucketLabel,
  loginBucketPercentage,
  normalizeUserLoginBuckets,
} from './dashboardUserLoginStats'

describe('dashboardUserLoginStats', () => {
  it('normaliza filas, personas y limita accesos al total de usuarios', () => {
    expect(normalizeUserLoginBuckets([
      {
        bucket_start: '2026-07-20',
        bucket_end: '2026-07-26',
        users_logged_in: '12',
        users_total: 10,
        logged_in_users: [
          {
            user_id: 'u1',
            nombre: 'Ana',
            area: 'Ops',
            rol: 'DG',
            last_login_at: '2026-07-21T15:00:00Z',
          },
        ],
        absent_users: [
          { user_id: 'u2', nombre: 'Luis', area: null, rol: 'Operativo' },
        ],
      },
      { bucket_start: null, bucket_end: '2026-07-26' },
    ])).toEqual([
      {
        bucketStart: '2026-07-20',
        bucketEnd: '2026-07-26',
        usersLoggedIn: 10,
        usersTotal: 10,
        loggedInUsers: [
          {
            userId: 'u1',
            nombre: 'Ana',
            area: 'Ops',
            rol: 'DG',
            lastLoginAt: '2026-07-21T15:00:00Z',
          },
        ],
        absentUsers: [
          {
            userId: 'u2',
            nombre: 'Luis',
            area: null,
            rol: 'Operativo',
            lastLoginAt: null,
          },
        ],
      },
    ])
  })

  it('calcula el porcentaje sin dividir entre cero', () => {
    expect(loginBucketPercentage({
      bucketStart: '2026-07-20',
      bucketEnd: '2026-07-26',
      usersLoggedIn: 3,
      usersTotal: 4,
      loggedInUsers: [],
      absentUsers: [],
    })).toBe(75)
    expect(loginBucketPercentage({
      bucketStart: '2026-07-20',
      bucketEnd: '2026-07-26',
      usersLoggedIn: 0,
      usersTotal: 0,
      loggedInUsers: [],
      absentUsers: [],
    })).toBe(0)
  })

  it('crea etiquetas para semanas, quincenas y meses', () => {
    const firstHalf = {
      bucketStart: '2026-07-01',
      bucketEnd: '2026-07-15',
      usersLoggedIn: 1,
      usersTotal: 2,
      loggedInUsers: [],
      absentUsers: [],
    }
    const secondHalf = { ...firstHalf, bucketStart: '2026-07-16', bucketEnd: '2026-07-31' }

    expect(loginBucketLabel(firstHalf, 'weekly')).toContain('jul')
    expect(loginBucketLabel(firstHalf, 'biweekly')).toBe('1ª jul')
    expect(loginBucketLabel(secondHalf, 'biweekly')).toBe('2ª jul')
    expect(loginBucketLabel(firstHalf, 'monthly')).toContain('jul')
    expect(loginBucketDateRangeLabel(firstHalf)).toContain('–')
    expect(formatLoginTimestamp(null)).toBe('Sin hora')
  })
})
