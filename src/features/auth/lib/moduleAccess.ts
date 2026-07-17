import { ROUTES } from '@/constants'
import {
  canAccessRouteByRole,
  getDefaultRouteByRole,
  isAppSuperAdminByAppRole,
  isSuperAdminByRole,
} from './permissions'

const MODULE_ROUTES: Array<[string, string]> = [
  [ROUTES.DASHBOARD_KPIS, 'kpis'],
  [ROUTES.DASHBOARD_GAPS, 'gaps'],
  [ROUTES.DASHBOARD_IMPACTO, 'impact'],
  [ROUTES.SETTINGS_ACADEMY_MODULES, 'settings_academy'],
  [ROUTES.SETTINGS_CATALOGS, 'settings_catalogs'],
  [ROUTES.SETTINGS_USERS, 'settings_users'],
  [ROUTES.SETTINGS_REMINDERS, 'settings_reminders'],
  [ROUTES.SETTINGS_PROFILE, 'settings_profile'],
  [ROUTES.TEAM_KANBAN, 'team_kanban'],
  [ROUTES.DASHBOARD, 'dashboard'],
  [ROUTES.KANBAN, 'kanban'],
  [ROUTES.TICKETS, 'tickets'],
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
  ['dashboard', ROUTES.DASHBOARD],
  ['kanban', ROUTES.KANBAN],
  ['team_kanban', ROUTES.TEAM_KANBAN],
  ['tickets', ROUTES.TICKETS],
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
  moduleKeys: string[] | null | undefined
) {
  if (isAppSuperAdminByAppRole(appRole) || isSuperAdminByRole(rol)) return true

  // La regla de seguridad previa para Kanban por Equipos siempre prevalece.
  if (pathname === ROUTES.TEAM_KANBAN || pathname.startsWith(`${ROUTES.TEAM_KANBAN}/`)) {
    return canAccessRouteByRole(rol, pathname, appRole)
  }
  const moduleKey = moduleKeyForPath(pathname)
  if (moduleKeys && moduleKey) return moduleKeys.includes(moduleKey)
  return canAccessRouteByRole(rol, pathname, appRole)
}

export function getDefaultRouteWithModules(
  rol: string | null | undefined,
  appRole: string | null | undefined,
  moduleKeys: string[] | null | undefined
): string | null {
  const legacyDefault = getDefaultRouteByRole(rol)
  if (isAppSuperAdminByAppRole(appRole) || isSuperAdminByRole(rol) || !moduleKeys) {
    return legacyDefault
  }

  if (canAccessRouteWithModules(rol, legacyDefault, appRole, moduleKeys)) {
    return legacyDefault
  }

  return MODULE_DEFAULT_ROUTES.find(
    ([key, route]) => moduleKeys.includes(key) && canAccessRouteWithModules(rol, route, appRole, moduleKeys)
  )?.[1] ?? null
}
