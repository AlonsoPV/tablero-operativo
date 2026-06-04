/** Alineado con src/features/auth/lib/permissions.ts (roles de negocio). */

const ADMIN_BUSINESS_ROLES = ['dg', 'sistemas', 'super_admin'] as const
const DIRECTION_ROLE = 'direccion'

export function normalizeBusinessRole(rol: unknown): string {
  return (typeof rol === 'string' ? rol : '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es-MX')
}

export function isDirectionRole(rol: unknown): boolean {
  return normalizeBusinessRole(rol) === DIRECTION_ROLE
}

export function isBusinessAdminRole(rol: unknown): boolean {
  const normalized = normalizeBusinessRole(rol)
  return ADMIN_BUSINESS_ROLES.some((role) => normalized === role)
}

export function canInviteUsers(params: {
  appRole: string | null | undefined
  businessRol: unknown
  activo: boolean | null | undefined
}): boolean {
  const isAppAdmin =
    params.appRole === 'admin' || params.appRole === 'super_admin'
  const businessAllowed =
    Boolean(params.activo) &&
    (isDirectionRole(params.businessRol) || isBusinessAdminRole(params.businessRol))
  return isAppAdmin || businessAllowed
}
