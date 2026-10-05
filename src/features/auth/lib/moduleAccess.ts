import { ROUTES } from '@/constants'
import {
  canAccessOkrs,
  canAccessRouteByRole,
  getDefaultRouteByRole,
  isAppSuperAdminByAppRole,
  isAnalystByRole,
  isSuperAdminByRole,
} from './permissions'

export type RouteAccessContext = {
  area?: string | null
  areas?: string[] | null
}

const MODULE_ROUTES: Array<[string, string]> = [
  [ROUTES.OKRS, 'okrs'],
  [ROUTES.DASHBOARD_KPIS, 'kpis'],
  [ROUTES.DASHBOARD_GAPS, 'gaps'],
  [ROUTES.DASHBOARD_IMPACTO, 'impact'],
  [ROUTES.SETTINGS_ACADEMY_MODULES, 'settings_academy'],
  [ROUTES.SETTINGS_CATALOGS, 'settings_catalogs'],
  [ROUTES.SETTINGS_USERS, 'settings_users'],
  [ROUTES.SETTINGS_REMINDERS, 'settings_reminders'],
  [ROUTES.SETTINGS_PROFILE, 'settings_profile'],
  [ROUTES.DASHBOARD_TEAMS, 'team_dashboard'],
  [ROUTES.TEAM_KANBAN, 'team_kanban'],
  [ROUTES.DASHBOARD, 'dashboard'],
  [ROUTES.KANBAN, 'kanban'],
  [ROUTES.TICKETS, 'tickets'],
  [ROUTES.ADMIN_CHALLENGES, 'challenges'],
  [ROUTES.CHALLENGES, 'challenges'],
  [ROUTES.ORG_CHART, 'org_chart'],
  [ROUTES.DISCIPLINA, 'discipline'],
  [ROUTES.CALENDARIO, 'calendar'],
  [ROUTES.NOTIFICACIONES, 'notifications'],
  [ROUTES.ACADEMIA, 'academy'],
  [ROUTES.MANUAL, 'manual'],
  [ROUTES.AI_ASSIST, 'ai_assist'],
  [ROUTES.SPRINTS, 'sprints'],
  [ROUTES.REPORTES, 'reports'],
  [ROUTES.ESTRATEGIA, 'strategy'],
]

const MODULE_DEFAULT_ROUTES: Array<[string, string]> = [
  ['okrs', ROUTES.OKRS],
  ['dashboard', ROUTES.DASHBOARD],
  ['team_dashboard', ROUTES.DASHBOARD_TEAMS],
  ['kanban', ROUTES.KANBAN],
  ['team_kanban', ROUTES.TEAM_KANBAN],
  ['tickets', ROUTES.TICKETS],
  ['challenges', ROUTES.CHALLENGES],
  ['org_chart', ROUTES.ORG_CHART],
  ['discipline', ROUTES.DISCIPLINA],
  ['calendar', ROUTES.CALENDARIO],
  ['notifications', ROUTES.NOTIFICACIONES],
  ['academy', ROUTES.ACADEMIA],
  ['manual', ROUTES.MANUAL],
  ['ai_assist', ROUTES.AI_ASSIST],
  ['sprints', ROUTES.SPRINTS],
  ['reports', ROUTES.REPORTES],
  ['strategy', ROUTES.ESTRATEGIA],
  ['kpis', ROUTES.DASHBOARD_KPIS],
  ['gaps', ROUTES.DASHBOARD_GAPS],
  ['impact', ROUTES.DASHBOARD_IMPACTO],
  ['settings_profile', ROUTES.SETTINGS_PROFILE],
  ['settings_users', ROUTES.SETTINGS_USERS],
  ['settings_catalogs', ROUTES.SETTINGS_CATALOGS],
  ['settings_reminders', ROUTES.SETTINGS_REMINDERS],
  ['settings_academy', ROUTES.SETTINGS_ACADEMY_MODULES],
]

function matches(pathname: string, route: string) {
  const normalized = route.replace(/:\w+/g, '')
  return pathname === route || pathname === normalized || pathname.startsWith(`${normalized}/`)
}

export function moduleKeyForPath(pathname: string): string | null {
  return MODULE_ROUTES.find(([route]) => matches(pathname, route))?.[1] ?? null
}

export function canAccessRouteWithModules(
  rol: string | null | undefined,
  pathname: string,
  appRole: string | null | undefined,
  moduleKeys: string[] | null | undefined,
  context?: RouteAccessContext
) {
  if (pathname === ROUTES.OKRS || pathname.startsWith(`${ROUTES.OKRS}/`)) {
    if (!canAccessOkrs(rol, appRole, context?.area, context?.areas)) return false
  }

  // La regla de seguridad del Kanban por Equipos siempre prevalece sobre el catalogo de modulos.
  if (
    pathname === ROUTES.TEAM_KANBAN ||
    pathname.startsWith(`${ROUTES.TEAM_KANBAN}/`) ||
    pathname === ROUTES.DASHBOARD_TEAMS ||
    pathname.startsWith(`${ROUTES.DASHBOARD_TEAMS}/`)
  ) {
    return (
      canAccessRouteByRole(rol, pathname, appRole) ||
      moduleKeys?.includes('team_kanban') === true ||
      moduleKeys?.includes('team_dashboard') === true
    )
  }

  if (pathname === ROUTES.ADMIN_CHALLENGES || pathname.startsWith(`${ROUTES.ADMIN_CHALLENGES}/`)) {
    if (!canAccessRouteByRole(rol, pathname, appRole)) return false
    if (!moduleKeys) return true
    return moduleKeys.includes('challenges')
  }

  if (isAnalystByRole(rol)) return canAccessRouteByRole(rol, pathname, appRole)

  if (isAppSuperAdminByAppRole(appRole) || isSuperAdminByRole(rol)) return true
  const moduleKey = moduleKeyForPath(pathname)
  if (moduleKeys && moduleKey) return moduleKeys.includes(moduleKey)
  return canAccessRouteByRole(rol, pathname, appRole)
}

export function getDefaultRouteWithModules(
  rol: string | null | undefined,
  appRole: string | null | undefined,
  moduleKeys: string[] | null | undefined,
  context?: RouteAccessContext
): string | null {
  const legacyDefault = getDefaultRouteByRole(rol)
  if (isAppSuperAdminByAppRole(appRole) || isSuperAdminByRole(rol) || !moduleKeys) {
    return legacyDefault
  }

  if (
    legacyDefault &&
    canAccessRouteWithModules(rol, legacyDefault, appRole, moduleKeys, context)
  ) {
    return legacyDefault
  }

  return (
    MODULE_DEFAULT_ROUTES.find(
      ([key, route]) =>
        moduleKeys.includes(key) &&
        canAccessRouteWithModules(rol, route, appRole, moduleKeys, context)
    )?.[1] ?? null
  )
}
