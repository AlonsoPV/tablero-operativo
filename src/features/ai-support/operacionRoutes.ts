import { ROUTES } from '@/constants'

/** Prefijos de rutas del grupo Operacion en el sidebar. */
export const OPERACION_ROUTE_PREFIXES = [
  ROUTES.DASHBOARD,
  ROUTES.OKRS,
  ROUTES.KANBAN,
  ROUTES.TEAM_KANBAN,
  ROUTES.DASHBOARD_TEAMS,
] as const

export function isOperacionRoute(pathname: string): boolean {
  return OPERACION_ROUTE_PREFIXES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  )
}
