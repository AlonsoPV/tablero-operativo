import { initialsFromName } from '@/features/org-chart/utils/orgHierarchy'

export { initialsFromName }

export function formatUserDate(iso: string, style: 'short' | 'long' = 'short') {
  try {
    return new Date(iso).toLocaleDateString('es-MX', {
      day: 'numeric',
      month: style === 'long' ? 'long' : 'short',
      year: 'numeric',
      ...(style === 'short' ? { hour: '2-digit', minute: '2-digit' } : {}),
    })
  } catch {
    return iso
  }
}

export function formatUserDateLong(iso: string) {
  try {
    return new Date(iso).toLocaleDateString('es-MX', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

export function userRoleLabels(user: {
  rol: string
  role_names?: string[]
}): string[] {
  return user.role_names?.length ? user.role_names : [user.rol]
}

export function userAreaLabels(user: {
  area: string | null
  areas?: string[]
}): string[] {
  const names = [...(user.areas?.length ? user.areas : []), ...(user.area ? [user.area] : [])]
  return [...new Set(names.map((name) => name.trim()).filter(Boolean))]
}
