import { describe, expect, it } from 'vitest'
import { ROUTES } from '@/constants'
import {
  canAccessRouteByRole,
  canManageAcademyModulesByRole,
  isDirectionByRole,
} from './permissions'

describe('role route permissions', () => {
  it('allows Direccion to use analyst views plus users, academy modules and catalogs', () => {
    const role = 'Direccion'

    expect(isDirectionByRole(role)).toBe(true)
    expect(canAccessRouteByRole(role, ROUTES.DASHBOARD)).toBe(true)
    expect(canAccessRouteByRole(role, ROUTES.KANBAN)).toBe(true)
    expect(canAccessRouteByRole(role, ROUTES.ACADEMIA)).toBe(true)
    expect(canAccessRouteByRole(role, ROUTES.DISCIPLINA)).toBe(true)
    expect(canAccessRouteByRole(role, ROUTES.CALENDARIO)).toBe(true)
    expect(canAccessRouteByRole(role, ROUTES.NOTIFICACIONES)).toBe(true)
    expect(canAccessRouteByRole(role, ROUTES.SETTINGS_PROFILE)).toBe(true)
    expect(canAccessRouteByRole(role, ROUTES.SETTINGS_USERS)).toBe(true)
    expect(canAccessRouteByRole(role, '/settings/users/example-id')).toBe(true)
    expect(canAccessRouteByRole(role, ROUTES.SETTINGS_ACADEMY_MODULES)).toBe(true)
    expect(canAccessRouteByRole(role, ROUTES.SETTINGS_CATALOGS)).toBe(true)
    expect(canAccessRouteByRole(role, ROUTES.SETTINGS_CATALOGS_KPIS)).toBe(true)
    expect(canManageAcademyModulesByRole(role)).toBe(true)
  })

  it('keeps Direccion out of non-analyst operational modules', () => {
    const role = 'Direccion'

    expect(canAccessRouteByRole(role, ROUTES.ESTRATEGIA)).toBe(false)
    expect(canAccessRouteByRole(role, ROUTES.DASHBOARD_KPIS)).toBe(false)
    expect(canAccessRouteByRole(role, ROUTES.REPORTES)).toBe(false)
    expect(canAccessRouteByRole(role, ROUTES.AI_ASSIST)).toBe(false)
  })

  it('keeps Analista limited to profile inside settings', () => {
    const role = 'Analista'

    expect(canAccessRouteByRole(role, ROUTES.SETTINGS_PROFILE)).toBe(true)
    expect(canAccessRouteByRole(role, ROUTES.SETTINGS_USERS)).toBe(false)
    expect(canAccessRouteByRole(role, ROUTES.SETTINGS_ACADEMY_MODULES)).toBe(false)
    expect(canAccessRouteByRole(role, ROUTES.SETTINGS_CATALOGS)).toBe(false)
  })

  it('treats extended analyst catalog names as analyst roles', () => {
    const role = 'Analista O2C'

    expect(canAccessRouteByRole(role, ROUTES.DASHBOARD)).toBe(true)
    expect(canAccessRouteByRole(role, ROUTES.SETTINGS_USERS)).toBe(false)
  })
})
