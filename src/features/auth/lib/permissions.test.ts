import { describe, expect, it } from 'vitest'
import { ROUTES } from '@/constants'
import {
  canAccessRouteByRole,
  canEditOrgHierarchyByRole,
  canEditOrgUserHierarchy,
  canEditOwnOrgProfileByRole,
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
    expect(isDirectionByRole('Dirección general')).toBe(true)
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

  it('keeps Analista limited to Kanban por Equipos, Disciplina and Calendario', () => {
    const role = 'Analista'

    expect(canAccessRouteByRole(role, ROUTES.TEAM_KANBAN)).toBe(true)
    expect(canAccessRouteByRole(role, ROUTES.DISCIPLINA)).toBe(true)
    expect(canAccessRouteByRole(role, ROUTES.CALENDARIO)).toBe(true)
    expect(canAccessRouteByRole(role, ROUTES.KANBAN)).toBe(false)
    expect(canAccessRouteByRole(role, ROUTES.AI_ASSIST)).toBe(false)
    expect(canAccessRouteByRole(role, ROUTES.ORG_CHART)).toBe(false)
    expect(canAccessRouteByRole(role, ROUTES.DASHBOARD)).toBe(false)
    expect(canAccessRouteByRole(role, ROUTES.ACADEMIA)).toBe(false)
    expect(canAccessRouteByRole(role, ROUTES.TICKETS)).toBe(false)
    expect(canAccessRouteByRole(role, ROUTES.SETTINGS_PROFILE)).toBe(false)
    expect(usesOperationalDashboardByRole(role)).toBe(false)
    expect(getDefaultRouteByRole(role)).toBe(ROUTES.TEAM_KANBAN)
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

  it('keeps Analista limited even if app_role is elevated accidentally', () => {
    expect(canAccessRouteByRole('Analista', ROUTES.TEAM_KANBAN, 'super_admin')).toBe(true)
    expect(canAccessRouteByRole('Analista', ROUTES.DISCIPLINA, 'super_admin')).toBe(true)
    expect(canAccessRouteByRole('Analista', ROUTES.ORG_CHART, 'super_admin')).toBe(false)
    expect(canAccessRouteByRole('Analista', ROUTES.DASHBOARD, 'super_admin')).toBe(false)
    expect(canAccessRouteByRole('Analista', ROUTES.SETTINGS_USERS, 'super_admin')).toBe(false)
  })

  it('allows Kanban por Equipos to Super Admin and Direccion', () => {
    expect(canAccessRouteByRole('super_admin', ROUTES.TEAM_KANBAN)).toBe(true)
    expect(canAccessRouteByRole('Analista', ROUTES.TEAM_KANBAN, 'super_admin')).toBe(true)
    expect(canAccessRouteByRole('Direccion', ROUTES.TEAM_KANBAN)).toBe(true)
    expect(canAccessRouteByRole('Direccion general', ROUTES.TEAM_KANBAN)).toBe(true)
    expect(canAccessRouteByRole('DG', ROUTES.TEAM_KANBAN)).toBe(false)
    expect(canAccessRouteByRole('Sistemas', ROUTES.TEAM_KANBAN, 'admin')).toBe(false)
    expect(canAccessRouteByRole('Operativo', ROUTES.TEAM_KANBAN)).toBe(false)
    expect(canAccessRouteByRole('Analista', ROUTES.TEAM_KANBAN)).toBe(true)
  })

  it('allows Super Admin to view Organigrama without participating as a node', () => {
    expect(canAccessRouteByRole('super_admin', ROUTES.ORG_CHART)).toBe(true)
    expect(canEditOwnOrgProfileByRole('super_admin')).toBe(false)
  })

  it('keeps Analista out of organigrama and profile editing', () => {
    expect(canAccessRouteByRole('Analista', ROUTES.ORG_CHART)).toBe(false)
    expect(canAccessRouteByRole('Analista', ROUTES.ORG_CHART, 'viewer')).toBe(false)
    expect(canEditOwnOrgProfileByRole('Analista')).toBe(false)
  })

  it('allows Dirección and Operativo to edit own org profile', () => {
    expect(canEditOwnOrgProfileByRole('Direccion')).toBe(true)
    expect(canEditOwnOrgProfileByRole('Operativo')).toBe(true)
    expect(canEditOwnOrgProfileByRole('Operativo O2C')).toBe(true)
    expect(canEditOwnOrgProfileByRole('super_admin')).toBe(false)
  })

  it('allows RH and Super Admin to edit anyone hierarchy; Direccion/Operativo only self', () => {
    expect(canEditOrgHierarchyByRole('Direccion')).toBe(false)
    expect(canEditOrgHierarchyByRole('DG')).toBe(false)
    expect(canEditOrgHierarchyByRole('Operativo')).toBe(false)
    expect(canEditOrgHierarchyByRole('Analista')).toBe(false)
    expect(canEditOrgHierarchyByRole('Operativo', 'super_admin')).toBe(true)
    expect(canEditOrgHierarchyByRole(null, 'super_admin')).toBe(true)
    expect(canEditOrgHierarchyByRole('Operativo', 'admin')).toBe(false)
    expect(canEditOrgHierarchyByRole('Operativo', 'viewer')).toBe(false)
    expect(canEditOrgHierarchyByRole('Operativo', null, 'RH')).toBe(true)
    expect(canEditOrgHierarchyByRole('Operativo', null, 'Finanzas', ['RH', 'Finanzas'])).toBe(true)
    expect(canEditOrgHierarchyByRole('Operativo', null, 'Operaciones', ['Finanzas'])).toBe(false)
    expect(canEditOrgHierarchyByRole('super_admin')).toBe(true)
  })

  it('allows editing own hierarchy for Operativo/Direccion and RH editing anyone', () => {
    expect(
      canEditOrgUserHierarchy({
        actorUserId: 'u1',
        targetUserId: 'u1',
        rol: 'Operativo',
        area: 'Operaciones',
      })
    ).toBe(true)
    expect(
      canEditOrgUserHierarchy({
        actorUserId: 'u1',
        targetUserId: 'u1',
        rol: 'Direccion',
        area: 'Planeación',
      })
    ).toBe(true)
    expect(
      canEditOrgUserHierarchy({
        actorUserId: 'u1',
        targetUserId: 'u1',
        rol: 'Analista',
        area: 'Operaciones',
      })
    ).toBe(false)
    expect(
      canEditOrgUserHierarchy({
        actorUserId: 'u1',
        targetUserId: 'u1',
        rol: 'super_admin',
      })
    ).toBe(false)
    expect(
      canEditOrgUserHierarchy({
        actorUserId: 'u1',
        targetUserId: 'u2',
        rol: 'Operativo',
        area: 'Operaciones',
      })
    ).toBe(false)
    expect(
      canEditOrgUserHierarchy({
        actorUserId: 'u1',
        targetUserId: 'u2',
        rol: 'Operativo',
        area: 'RH',
      })
    ).toBe(true)
    expect(
      canEditOrgUserHierarchy({
        actorUserId: 'u1',
        targetUserId: 'u2',
        rol: 'Direccion',
        area: 'Planeación',
      })
    ).toBe(false)
  })
})
