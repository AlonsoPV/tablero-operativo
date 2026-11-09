export const APP_NAME = 'SCRUMBAN'
export const PRODUCTION_APP_BASE_URL = 'https://scrumbanemx.vercel.app'

type ViteImportMeta = ImportMeta & {
  env?: {
    VITE_APP_URL?: string
    VITE_GOOGLE_WORKSPACE_CALENDAR_SYNC_ENABLED?: string
  }
}

function readViteEnv() {
  try {
    return (import.meta as ViteImportMeta).env
  } catch {
    return undefined
  }
}

function readNodeEnv(name: string): string | undefined {
  const runtime = globalThis as typeof globalThis & {
    process?: { env?: Record<string, string | undefined> }
  }
  const value = runtime.process?.env?.[name]
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function readPublicEnv(name: 'VITE_APP_URL' | 'VITE_GOOGLE_WORKSPACE_CALENDAR_SYNC_ENABLED') {
  const fromProcess = readNodeEnv(name)
  if (fromProcess) return fromProcess
  const fromVite = readViteEnv()?.[name]
  return typeof fromVite === 'string' && fromVite.trim() ? fromVite.trim() : undefined
}

export const APP_BASE_URL = (
  readPublicEnv('VITE_APP_URL') || PRODUCTION_APP_BASE_URL
).replace(/\/+$/, '')

/** Rutas según módulos de lovable-spec §5 */
export const ROUTES = {
  LOGIN: '/login',
  FORGOT_PASSWORD: '/forgot-password',
  RESET_PASSWORD: '/reset-password',
  DASHBOARD: '/dashboard',
  OKRS: '/okrs',
  /** Cadena causa–efecto: BHAG, FCE, procesos O2C, ejecución. */
  ESTRATEGIA: '/estrategia',
  DASHBOARD_KPIS: '/dashboard/kpis',
  DASHBOARD_GAPS: '/dashboard/gaps',
  DASHBOARD_IMPACTO: '/dashboard/impacto',
  DASHBOARD_TEAMS: '/dashboard-equipos',
  KANBAN: '/kanban',
  TEAM_KANBAN: '/kanban-equipos',
  TEAM_KANBAN_BOARD: '/kanban-equipos/tablero',
  TICKETS: '/tickets',
  CHALLENGES: '/challenges',
  CHALLENGES_DETAIL: '/challenges/:id',
  CHALLENGE_IDEA_DETAIL: '/challenges/:challengeId/ideas/:ideaId',
  ADMIN_CHALLENGES: '/admin/challenges',
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
  /** Historial de conversaciones y resultados de Guia / Asistente. */
  AI_HISTORY: '/asistente-ia/historial',
  /** Bandeja de seguimiento WhatsApp (operadores). */
  AI_WHATSAPP_SEGUIMIENTO: '/asistente-ia/seguimiento-whatsapp',
  /** Liga personal de Guía (pública). */
  GUIA_INVITACION: '/guia/invitacion/:token',
  /** Voz por liga personal de Guía (pública). */
  GUIA_INVITACION_VOZ: '/guia/invitacion/:token/voz',
  /** Organigrama jerárquico de la organización. */
  ORG_CHART: '/organigrama',
  /** Plan de acción Scrum Master — acceso restringido por usuario. */
  PLAN_ACCION: '/plan-accion',
  SETTINGS: '/settings',
  SETTINGS_PROFILE: '/settings/profile',
  SETTINGS_REMINDERS: '/settings/reminders',
  SETTINGS_WHATSAPP: '/settings/whatsapp',
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
  const browser = globalThis as typeof globalThis & {
    window?: { location?: { hostname?: string; origin?: string } }
  }
  const location = browser.window?.location
  if (!location?.hostname || !location.origin) return APP_BASE_URL

  if (location.hostname === new URL(PRODUCTION_APP_BASE_URL).hostname) {
    return location.origin.replace(/\/+$/, '')
  }

  return APP_BASE_URL
}

export function getPasswordResetRedirectUrl() {
  return `${getRuntimeAppBaseUrl()}${ROUTES.RESET_PASSWORD}`
}

/** Exportar minutas, acciones y recordatorios a Google Calendar / Tasks / Gmail. */
export const GOOGLE_WORKSPACE_CALENDAR_SYNC_ENABLED =
  readPublicEnv('VITE_GOOGLE_WORKSPACE_CALENDAR_SYNC_ENABLED') !== 'false'
