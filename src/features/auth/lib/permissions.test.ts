import { describe, expect, it } from 'vitest'
import { ROUTES } from '@/constants'
import {
  canAccessRouteByRole,
  canEditOrgHierarchyByRole,
  canManageAcademyModulesByRole,
  canManageSupportTicketsByRole,
  getDefaultRouteByRole,
  isDirectionByRole,
  usesOperationalDashboardByRole,
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
    expect(canAccessRouteByRole(role, ROUTES.AI_ASSIST)).toBe(true)
    expect(canAccessRouteByRole(role, ROUTES.ORG_CHART)).toBe(true)
    expect(canManageAcademyModulesByRole(role)).toBe(true)
    expect(usesOperationalDashboardByRole(role)).toBe(true)
  })

  it('keeps Direccion out of non-analyst operational modules', () => {
    const role = 'Direccion'

    expect(canAccessRouteByRole(role, ROUTES.ESTRATEGIA)).toBe(false)
    expect(canAccessRouteByRole(role, ROUTES.DASHBOARD_KPIS)).toBe(false)
    expect(canAccessRouteByRole(role, ROUTES.REPORTES)).toBe(false)
  })

  it('keeps Operativo limited to profile inside settings', () => {
    const role = 'Operativo'

    expect(canAccessRouteByRole(role, ROUTES.AI_ASSIST)).toBe(true)
    expect(canAccessRouteByRole(role, ROUTES.ORG_CHART)).toBe(true)
    expect(canAccessRouteByRole(role, ROUTES.SETTINGS_PROFILE)).toBe(true)
    expect(canAccessRouteByRole(role, ROUTES.SETTINGS_USERS)).toBe(false)
    expect(canAccessRouteByRole(role, ROUTES.SETTINGS_ACADEMY_MODULES)).toBe(false)
    expect(canAccessRouteByRole(role, ROUTES.SETTINGS_CATALOGS)).toBe(false)
  })

  it('treats extended operative catalog names as operative roles', () => {
    const role = 'Operativo O2C'

    expect(canAccessRouteByRole(role, ROUTES.DASHBOARD)).toBe(false)
    expect(canAccessRouteByRole(role, ROUTES.KANBAN)).toBe(true)
    expect(canAccessRouteByRole(role, ROUTES.AI_ASSIST)).toBe(true)
    expect(canAccessRouteByRole(role, ROUTES.SETTINGS_USERS)).toBe(false)
    expect(usesOperationalDashboardByRole(role)).toBe(true)
    expect(getDefaultRouteByRole(role)).toBe(ROUTES.KANBAN)
  })

  it('keeps Analista limited to Kanban and AI assistant only', () => {
    const role = 'Analista'

    expect(canAccessRouteByRole(role, ROUTES.KANBAN)).toBe(true)
    expect(canAccessRouteByRole(role, ROUTES.AI_ASSIST)).toBe(true)
    expect(canAccessRouteByRole(role, ROUTES.DASHBOARD)).toBe(false)
    expect(canAccessRouteByRole(role, ROUTES.DISCIPLINA)).toBe(false)
    expect(canAccessRouteByRole(role, ROUTES.CALENDARIO)).toBe(false)
    expect(canAccessRouteByRole(role, ROUTES.ACADEMIA)).toBe(false)
    expect(canAccessRouteByRole(role, ROUTES.TICKETS)).toBe(false)
    expect(canAccessRouteByRole(role, ROUTES.SETTINGS_PROFILE)).toBe(false)
    expect(usesOperationalDashboardByRole(role)).toBe(false)
    expect(getDefaultRouteByRole(role)).toBe(ROUTES.KANBAN)
  })

  it('keeps executive roles on the executive dashboard experience', () => {
    expect(usesOperationalDashboardByRole('DG')).toBe(false)
    expect(usesOperationalDashboardByRole('Sistemas')).toBe(false)
    expect(usesOperationalDashboardByRole('super_admin')).toBe(false)
  })

  it('allows only super_admin catalog role to manage support tickets in UI', () => {
    expect(canManageSupportTicketsByRole('super_admin')).toBe(true)
    expect(canManageSupportTicketsByRole('Direccion')).toBe(false)
    expect(canManageSupportTicketsByRole('Operativo')).toBe(false)
  })

  it('allows app super_admin full route access even with Analista business role', () => {
    expect(canAccessRouteByRole('Analista', ROUTES.ORG_CHART, 'super_admin')).toBe(true)
    expect(canAccessRouteByRole('Analista', ROUTES.DASHBOARD, 'super_admin')).toBe(true)
    expect(canAccessRouteByRole('Analista', ROUTES.SETTINGS_USERS, 'super_admin')).toBe(true)
    expect(canAccessRouteByRole('Analista', ROUTES.ORG_CHART, 'viewer')).toBe(false)
  })

  it('allows hierarchy editing for admin, direction and app super_admin', () => {
    expect(canEditOrgHierarchyByRole('Direccion')).toBe(true)
    expect(canEditOrgHierarchyByRole('DG')).toBe(true)
    expect(canEditOrgHierarchyByRole('Operativo')).toBe(false)
    expect(canEditOrgHierarchyByRole('Analista')).toBe(false)
    expect(canEditOrgHierarchyByRole('Operativo', 'super_admin')).toBe(true)
    expect(canEditOrgHierarchyByRole(null, 'super_admin')).toBe(true)
    expect(canEditOrgHierarchyByRole('Operativo', 'admin')).toBe(true)
    expect(canEditOrgHierarchyByRole('Operativo', 'viewer')).toBe(false)
  })
})
