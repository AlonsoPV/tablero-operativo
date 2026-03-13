export const APP_NAME = 'Tablero Operativo'

/** Rutas según módulos de lovable-spec §5 */
export const ROUTES = {
  LOGIN: '/login',
  DASHBOARD: '/dashboard',
  KANBAN: '/kanban',
  DISCIPLINA: '/disciplina',
  AREAS: '/areas',
  CALENDARIO: '/calendario',
  REPORTES: '/reportes',
  NOTIFICACIONES: '/notificaciones',
  MANUAL: '/manual',
  SETTINGS: '/settings',
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
} as const
