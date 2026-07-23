export const APP_NAME = 'SCRUMBAN'
export const PRODUCTION_APP_BASE_URL = 'https://scrumbanemx.vercel.app'
export const APP_BASE_URL = (
  import.meta.env.VITE_APP_URL?.trim() || PRODUCTION_APP_BASE_URL
).replace(/\/+$/, '')

/** Rutas según módulos de lovable-spec §5 */
export const ROUTES = {
  LOGIN: '/login',
  FORGOT_PASSWORD: '/forgot-password',
  RESET_PASSWORD: '/reset-password',
  DASHBOARD: '/dashboard',
  /** Cadena causa–efecto: BHAG, FCE, procesos O2C, ejecución. */
  ESTRATEGIA: '/estrategia',
  DASHBOARD_KPIS: '/dashboard/kpis',
  DASHBOARD_GAPS: '/dashboard/gaps',
  DASHBOARD_IMPACTO: '/dashboard/impacto',
  KANBAN: '/kanban',
  TEAM_KANBAN: '/kanban-equipos',
  TICKETS: '/tickets',
  SPRINTS: '/sprints',
  DISCIPLINA: '/disciplina',
  AREAS: '/areas',
  CALENDARIO: '/calendario',
  REPORTES: '/reportes',
  NOTIFICACIONES: '/notificaciones',
  DISTANCIAS: '/distancias',
  ACADEMIA: '/academia',
  MANUAL: '/manual',
  /** Asistente IA O2C (proxy Edge Functions → Lovable). */
  AI_ASSIST: '/asistente-ia',
  /** Organigrama jerárquico de la organización. */
  ORG_CHART: '/organigrama',
  /** Plan de acción Scrum Master — acceso restringido por usuario. */
  PLAN_ACCION: '/plan-accion',
  SETTINGS: '/settings',
  SETTINGS_PROFILE: '/settings/profile',
  SETTINGS_REMINDERS: '/settings/reminders',
  SETTINGS_USERS: '/settings/users',
  SETTINGS_USERS_DETAIL: '/settings/users/:id',
  SETTINGS_CATALOGS: '/settings/catalogs',
  SETTINGS_CATALOGS_ROLES: '/settings/catalogs/roles',
  SETTINGS_CATALOGS_AREAS: '/settings/catalogs/areas',
  SETTINGS_CATALOGS_STATUSES: '/settings/catalogs/statuses',
  SETTINGS_CATALOGS_PRIORITIES: '/settings/catalogs/priorities',
  SETTINGS_CATALOGS_DROPDOWNS: '/settings/catalogs/dropdowns',
  SETTINGS_CATALOGS_DROPDOWNS_OPTIONS: '/settings/catalogs/dropdowns/:catalogId',
  SETTINGS_CATALOGS_KPIS: '/settings/catalogs/kpis',
  SETTINGS_CATALOGS_GAPS: '/settings/catalogs/gaps',
  SETTINGS_ACADEMY_MODULES: '/settings/academy/modules',
} as const

export function getRuntimeAppBaseUrl() {
  if (typeof window === 'undefined') return APP_BASE_URL

  const { hostname, origin } = window.location
  if (hostname === new URL(PRODUCTION_APP_BASE_URL).hostname) {
    return origin.replace(/\/+$/, '')
  }

  return APP_BASE_URL
}

export function getPasswordResetRedirectUrl() {
  return `${getRuntimeAppBaseUrl()}${ROUTES.RESET_PASSWORD}`
}

/** Exportar minutas, acciones y recordatorios a Google Calendar / Tasks / Gmail. */
export const GOOGLE_WORKSPACE_CALENDAR_SYNC_ENABLED =
  import.meta.env.VITE_GOOGLE_WORKSPACE_CALENDAR_SYNC_ENABLED !== 'false'
