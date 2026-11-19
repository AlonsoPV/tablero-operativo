/**
 * Utilidades para permisos y control de acceso.
 *
 * Modelo de datos:
 * - auth.users = identidad de acceso.
 * - usuarios = perfil de negocio (nombre, rol de catalogo, area).
 * - user_roles.app_role = rol de aplicacion (admin / super_admin).
 */

import { ROUTES } from '../../../constants/index.js'
import type { Usuario } from '../../../types'

/** Roles que tienen privilegios de admin (spec 2.2). */
const ADMIN_ROLES = ['DG', 'Sistemas', 'super_admin'] as const
const OPERATIVE_ROLE = 'Operativo'
const ANALYST_ROLE = 'Analista'
const LEADER_ROLE = 'Lider'
const DIRECTION_ROLE = 'Direccion'
const SUPER_ADMIN_ROLE = 'super_admin'
const KANBAN_ACTION_EDITOR_ROLES = ['kanban', 'editor_kanban', 'kanban_editor'] as const

const STRICT_ANALYST_ALLOWED_ROUTES = [
  ROUTES.OKRS,
  ROUTES.TEAM_KANBAN,
  ROUTES.TEAM_KANBAN_BOARD,
  ROUTES.DASHBOARD_TEAMS,
  ROUTES.CHALLENGES,
  ROUTES.DISCIPLINA,
  ROUTES.CALENDARIO,
] as const

const ANALYST_ALLOWED_ROUTES = [
  ROUTES.OKRS,
  ROUTES.KANBAN,
  ROUTES.TICKETS,
  ROUTES.CHALLENGES,
  ROUTES.ACADEMIA,
  ROUTES.DISCIPLINA,
  ROUTES.CALENDARIO,
  ROUTES.NOTIFICACIONES,
  ROUTES.MANUAL,
  ROUTES.AI_ASSIST,
  ROUTES.AI_HISTORY,
  ROUTES.AI_WHATSAPP_SEGUIMIENTO,
  ROUTES.SETTINGS_WHATSAPP,
  ROUTES.ORG_CHART,
  ROUTES.SETTINGS,
  ROUTES.SETTINGS_PROFILE,
] as const

const DIRECTION_ALLOWED_ROUTES = [
  ROUTES.DASHBOARD,
  ROUTES.DASHBOARD_TEAMS,
  ...ANALYST_ALLOWED_ROUTES.filter(route =>
    route !== ROUTES.AI_WHATSAPP_SEGUIMIENTO && route !== ROUTES.SETTINGS_WHATSAPP),
  ROUTES.TEAM_KANBAN,
  ROUTES.TEAM_KANBAN_BOARD,
  ROUTES.ORG_CHART,
] as const

/** Rutas del bloque «Por Liberar» y módulos no disponibles para Operativo. */
const ANALYST_DENIED_ROUTES = [
  ROUTES.ESTRATEGIA,
  ROUTES.DASHBOARD_KPIS,
  ROUTES.DASHBOARD_GAPS,
  ROUTES.DASHBOARD_IMPACTO,
  ROUTES.SPRINTS,
  ROUTES.REPORTES,
  ROUTES.PLAN_ACCION,
  ROUTES.DISTANCIAS,
  ROUTES.AREAS,
] as const

/** app_role se obtendria de user_roles; por ahora no se expone en perfil. */
export type AppRole = 'admin' | 'viewer' | 'super_admin'

function normalizeRole(rol: string | null | undefined): string {
  return (rol ?? '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es-MX')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function routeMatches(pathname: string, route: string): boolean {
  if (route.includes(':')) {
    const routeParts = route.split('/').filter(Boolean)
    const pathParts = pathname.split('/').filter(Boolean)
    return (
      routeParts.length === pathParts.length &&
      routeParts.every((part, index) => part.startsWith(':') || part === pathParts[index])
    )
  }

  if (route === ROUTES.SETTINGS) return pathname === ROUTES.SETTINGS
  // Solo dashboard principal; subrutas (/dashboard/kpis, etc.) se controlan por ruta explicita.
  if (route === ROUTES.DASHBOARD) return pathname === ROUTES.DASHBOARD
  return pathname === route || pathname.startsWith(`${route}/`)
}

/**
 * Indica si el rol de negocio tiene privilegios de administrador.
 * Spec: DG y Sistemas son tratados como admin.
 */
export function isAdminByRole(rol: string | null | undefined): boolean {
  const normalized = normalizeRole(rol)
  return ADMIN_ROLES.some((r) => normalizeRole(r) === normalized)
}

export function isOperativeByRole(rol: string | null | undefined): boolean {
  const normalized = normalizeRole(rol)
  const operative = normalizeRole(OPERATIVE_ROLE)
  return normalized === operative || normalized.includes(operative)
}

export function isAnalystByRole(rol: string | null | undefined): boolean {
  return normalizeRole(rol) === normalizeRole(ANALYST_ROLE)
}

export function isLeaderByRole(rol: string | null | undefined): boolean {
  return normalizeRole(rol) === normalizeRole(LEADER_ROLE)
}

export function isDirectionByRole(rol: string | null | undefined): boolean {
  const normalized = normalizeRole(rol)
  const direction = normalizeRole(DIRECTION_ROLE)
  return normalized === direction || normalized.startsWith(`${direction}_`)
}

export function usesOperationalDashboardByRole(rol: string | null | undefined): boolean {
  return isOperativeByRole(rol) || isDirectionByRole(rol)
}

export function isSuperAdminByRole(rol: string | null | undefined): boolean {
  return normalizeRole(rol) === normalizeRole(SUPER_ADMIN_ROLE)
}

export function isAppSuperAdminByAppRole(appRole: string | null | undefined): boolean {
  return normalizeRole(appRole) === normalizeRole(SUPER_ADMIN_ROLE)
}

export function isAppAdminByAppRole(appRole: string | null | undefined): boolean {
  const normalized = normalizeRole(appRole)
  return normalized === 'admin' || normalized === normalizeRole(SUPER_ADMIN_ROLE)
}

export function canManageSupportTicketsByRole(rol: string | null | undefined): boolean {
  return isSuperAdminByRole(rol)
}

export function canManageAcademyModulesByRole(rol: string | null | undefined): boolean {
  return isSuperAdminByRole(rol)
}

/**
 * Super Admin no participa ni visualiza el organigrama (función solo administrativa).
 */
export function isExcludedFromOrgChartByRole(rol: string | null | undefined): boolean {
  return isSuperAdminByRole(rol)
}

/**
 * Campos Reporta a / Supervisa a en perfil: Dirección y Operativo.
 * Analista y Super Admin no editan ni ven estos campos.
 */
export function canEditOwnOrgProfileByRole(rol: string | null | undefined): boolean {
  if (isExcludedFromOrgChartByRole(rol) || isAnalystByRole(rol)) return false
  return isOperativeByRole(rol) || isDirectionByRole(rol)
}

/** @deprecated Prefer canEditOwnOrgProfileByRole */
export function canEditOwnHierarchy(rol?: string | null): boolean {
  if (rol === undefined) return true
  return canEditOwnOrgProfileByRole(rol)
}

/**
 * Quién puede editar la jerarquía de cualquiera (organigrama / usuarios).
 * Área RH o Super Admin (solo administración; no forman parte del organigrama).
 */
export function canEditOrgHierarchyByRole(
  rol?: string | null,
  appRole?: string | null,
  area?: string | null,
  areas?: string[] | null
): boolean {
  if (isSuperAdminByRole(rol) || isAppSuperAdminByAppRole(appRole)) return true
  return belongsToRhArea(area, areas)
}

/**
 * Edición en organigrama: RH/Super Admin editan a cualquiera (no a sí mismos vía módulo);
 * Dirección/Operativo solo su propia ficha.
 */
export function canEditOrgUserHierarchy(
  options: {
    actorUserId?: string | null
    targetUserId?: string | null
    rol?: string | null
    appRole?: string | null
    area?: string | null
    areas?: string[] | null
  }
): boolean {
  const { actorUserId, targetUserId, rol, appRole, area, areas } = options
  if (actorUserId && targetUserId && actorUserId === targetUserId) {
    return canEditOwnOrgProfileByRole(rol)
  }
  return canEditOrgHierarchyByRole(rol, appRole, area, areas)
}

function belongsToRhArea(
  area?: string | null | undefined,
  areas?: string[] | null | undefined
): boolean {
  return userBelongsToArea('RH', area, areas)
}

/** True if the user primary/extra areas include the given catalog area name. */
export function userBelongsToArea(
  areaName: string,
  area?: string | null | undefined,
  areas?: string[] | null | undefined
): boolean {
  const target = normalizeRole(areaName)
  if (!target) return false
  const names = [...(area ? [area] : []), ...(areas ?? [])]
  return names.some((name) => normalizeRole(name) === target)
}

/**
 * Super Admin y Dirección ven el tablero completo: todas las acciones y todos los OKRs.
 */
export function canViewAllBoardData(
  rol?: string | null,
  appRole?: string | null
): boolean {
  return (
    isSuperAdminByRole(rol) ||
    isAppSuperAdminByAppRole(appRole) ||
    isDirectionByRole(rol)
  )
}

/**
 * Mientras sea true, pertenecer al área OKRS conserva la administración de OKRs y WhatsApp heredada.
 * Debe coincidir con public.legacy_okrs_area_grants() (scripts/apply_r1_revoke_legacy_okrs_area.sql).
 */
export const LEGACY_OKRS_AREA_GRANTS = true

/** Módulos de catálogo que conceden capacidades explícitas (tabla app_modules). */
export const CAPABILITY_MODULES = {
  okrsAdmin: 'okrs_admin',
  whatsappAssistant: 'whatsapp_assistant',
  whatsappInbox: 'whatsapp_inbox',
  whatsappSettings: 'whatsapp_settings',
  whatsappIdentityLink: 'whatsapp_identity_link',
} as const

export type AccessCapabilityInput = {
  rol?: string | null
  appRole?: string | null
  area?: string | null
  areas?: string[] | null
  moduleKeys?: readonly string[] | null
  active?: boolean | null
  /** Rol de catálogo activo `super_admin` (por system_key o nombre), como en public.usuario_is_super_admin. */
  catalogSuperAdmin?: boolean | null
}

export type CatalogRoleRef = { nombre?: string | null; system_key?: string | null; activo?: boolean | null }

export function isSuperAdminCatalogRole(role: CatalogRoleRef | null | undefined): boolean {
  if (!role || role.activo === false) return false
  return role.system_key === SUPER_ADMIN_ROLE || normalizeRole(role.nombre) === normalizeRole(SUPER_ADMIN_ROLE)
}

/** Mismas claves que public.access_capabilities_for_usuario (en camelCase). */
export type AccessCapabilities = {
  active: boolean
  superAdmin: boolean
  direction: boolean
  okrsArea: boolean
  legacyOkrsAreaGrants: boolean
  readAllOrganizationalData: boolean
  readAllOkrs: boolean
  readCrossAreaExecution: boolean
  manageAll: boolean
  adminAllOkrs: boolean
  whatsappAssistant: boolean
  whatsappInbox: boolean
  whatsappSettings: boolean
  whatsappIdentityLink: boolean
}

/**
 * Única derivación de capacidades en cliente y API. La lectura nunca implica escritura:
 * Dirección y área OKRS leen todo OKR/ejecución; administrar exige Super Admin, admin de catálogos
 * o un módulo explícito. La autorización efectiva sigue en SQL/RLS.
 */
export function resolveAccessCapabilities(input: AccessCapabilityInput): AccessCapabilities {
  const active = input.active !== false
  const modules = input.moduleKeys ?? []
  const superAdmin = active && (
    isSuperAdminByRole(input.rol) || isAppSuperAdminByAppRole(input.appRole) || input.catalogSuperAdmin === true
  )
  const direction = active && isDirectionByRole(input.rol)
  const okrsArea = active && userBelongsToArea('OKRS', input.area, input.areas)
  const legacy = LEGACY_OKRS_AREA_GRANTS && okrsArea
  const catalogAdmin = active && (isAdminByRole(input.rol) || isAppAdminByAppRole(input.appRole))
  const granted = (key: string) => active && (superAdmin || modules.includes(key) || legacy)
  return {
    active,
    superAdmin,
    direction,
    okrsArea,
    legacyOkrsAreaGrants: LEGACY_OKRS_AREA_GRANTS,
    readAllOrganizationalData: superAdmin,
    readAllOkrs: superAdmin || direction || okrsArea,
    readCrossAreaExecution: superAdmin || direction || okrsArea,
    manageAll: superAdmin,
    adminAllOkrs: catalogAdmin || granted(CAPABILITY_MODULES.okrsAdmin),
    whatsappAssistant: granted(CAPABILITY_MODULES.whatsappAssistant),
    whatsappInbox: granted(CAPABILITY_MODULES.whatsappInbox),
    whatsappSettings: granted(CAPABILITY_MODULES.whatsappSettings),
    whatsappIdentityLink: granted(CAPABILITY_MODULES.whatsappIdentityLink),
  }
}

/**
 * OKRs (/okrs y pestaña del dashboard): área OKRS, Super Admin o Dirección.
 */
export function canAccessOkrs(
  rol?: string | null,
  appRole?: string | null,
  area?: string | null,
  areas?: string[] | null
): boolean {
  return resolveAccessCapabilities({ rol, appRole, area, areas }).readAllOkrs
}

/** Envíos y bandeja WhatsApp (whatsapp-send-action, whatsapp-inbox). */
export function canAccessWhatsAppInbox(input: AccessCapabilityInput): boolean {
  return resolveAccessCapabilities(input).whatsappInbox
}

export function canUseWhatsAppAssistant(input: AccessCapabilityInput): boolean {
  return resolveAccessCapabilities(input).whatsappAssistant
}

export function canConfigureWhatsApp(input: AccessCapabilityInput): boolean {
  return resolveAccessCapabilities(input).whatsappSettings
}

export function canLinkWhatsAppPhones(input: AccessCapabilityInput): boolean {
  return resolveAccessCapabilities(input).whatsappIdentityLink
}

/**
 * @deprecated Usa canAccessWhatsAppInbox / canConfigureWhatsApp / canLinkWhatsAppPhones.
 * Sin módulos solo refleja Super Admin y la herencia del área OKRS.
 */
export function canAccessAiAssistAndWhatsApp(
  rol?: string | null,
  appRole?: string | null,
  area?: string | null,
  areas?: string[] | null
): boolean {
  return canAccessWhatsAppInbox({ rol, appRole, area, areas })
}

export function canManageActionsByRole(rol: string | null | undefined): boolean {
  return isSuperAdminByRole(rol)
}

export function canEditActionGeneralByRole(rol: string | null | undefined): boolean {
  const normalized = normalizeRole(rol)
  return canManageActionsByRole(rol) || KANBAN_ACTION_EDITOR_ROLES.includes(normalized as typeof KANBAN_ACTION_EDITOR_ROLES[number])
}

export function canAccessRouteByRole(
  rol: string | null | undefined,
  pathname: string,
  appRole?: string | null | undefined
): boolean {
  if (routeMatches(pathname, ROUTES.TEAM_KANBAN) || routeMatches(pathname, ROUTES.DASHBOARD_TEAMS)) {
    return (
      isSuperAdminByRole(rol) ||
      isDirectionByRole(rol) ||
      isAnalystByRole(rol) ||
      isLeaderByRole(rol) ||
      isAppSuperAdminByAppRole(appRole)
    )
  }

  if (isAnalystByRole(rol)) {
    return STRICT_ANALYST_ALLOWED_ROUTES.some((route) => routeMatches(pathname, route))
  }

  if (isAppAdminByAppRole(appRole)) return true

  if (isDirectionByRole(rol)) {
    return DIRECTION_ALLOWED_ROUTES.some((route) => routeMatches(pathname, route))
  }

  if (!isOperativeByRole(rol)) return true

  if (
    ANALYST_DENIED_ROUTES.some(
      (route) => pathname === route || pathname.startsWith(`${route}/`)
    )
  ) {
    return false
  }

  return ANALYST_ALLOWED_ROUTES.some((route) => routeMatches(pathname, route))
}

export function getDefaultRouteByRole(rol: string | null | undefined): string {
  if (isAnalystByRole(rol)) return ROUTES.TEAM_KANBAN
  if (isOperativeByRole(rol)) return ROUTES.KANBAN
  return ROUTES.KANBAN
}

/**
 * Comprueba si el usuario puede editar un recurso.
 * Por ahora: admins pueden; resto segun created_by/assigned_to.
 */
export function canEditAsCreator(profile: Usuario | null, createdBy: string | null): boolean {
  if (!profile) return false
  if (isAdminByRole(profile.rol)) return true
  return createdBy === profile.id
}

/**
 * Comprueba si el usuario puede editar un recurso asignado.
 */
export function canEditAsAssignee(profile: Usuario | null, assignedTo: string | null): boolean {
  if (!profile) return false
  if (isAdminByRole(profile.rol)) return true
  return assignedTo === profile.id
}
