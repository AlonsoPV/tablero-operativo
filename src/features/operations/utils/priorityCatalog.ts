import type { Priority } from '@/features/catalogs/types/catalogs.types'

function normalizedPriorityName(value: string | null | undefined) {
  return (value ?? '').trim().toLocaleLowerCase()
}

export function findCatalogPriority(priorities: Priority[], value: string | null | undefined) {
  const normalized = normalizedPriorityName(value)
  if (!normalized) return undefined
  return priorities.find((priority) => normalizedPriorityName(priority.nombre) === normalized)
}

export function isActiveCatalogPriority(priorities: Priority[], value: string | null | undefined) {
  return Boolean(findCatalogPriority(priorities.filter((priority) => priority.activo), value))
}
