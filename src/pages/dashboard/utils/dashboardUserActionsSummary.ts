import type { AccionDiaria } from '@/types'
import type { AccionComentario } from '@/types/accionComentario'
import type { UserProfile } from '@/features/users/types/user.types'
import { buildActionGamificationMetrics } from '@/features/disciplina/utils/actionGamification'
import { isEnRetraso } from '@/features/operations/utils/accionUtils'

const CLOSED_STATES = new Set(['Hecho', 'Verificado'])

export interface UserActionsSummaryRow {
  userId: string
  nombre: string
  area: string
  abiertas: number
  retraso: number
  bloqueadas: number
  gamificationPoints: number
}

export interface AreaActionsSummaryRow {
  area: string
  usuarios: number
  abiertas: number
  retraso: number
  bloqueadas: number
  gamificationPoints: number
}

export type UserSummarySortKey = 'nombre' | 'abiertas' | 'retraso' | 'bloqueadas' | 'gamificationPoints'
export type AreaSummarySortKey = 'area' | 'usuarios' | 'abiertas' | 'retraso' | 'bloqueadas' | 'gamificationPoints'
export type SummarySortDir = 'asc' | 'desc'

function isOpenAction(accion: AccionDiaria) {
  return !CLOSED_STATES.has(accion.estado)
}

export function hasAssignedArea(user: Pick<UserProfile, 'area'>): boolean {
  return typeof user.area === 'string' && user.area.trim() !== ''
}

export function filterUsersWithAssignedArea(
  users: UserProfile[],
  areaFilter?: string
): UserProfile[] {
  return users.filter((user) => {
    if (!hasAssignedArea(user)) return false
    if (areaFilter != null && areaFilter.trim() !== '') {
      return user.area!.trim().toLowerCase() === areaFilter.trim().toLowerCase()
    }
    return true
  })
}

export function buildUserActionsSummaryRows(
  users: UserProfile[],
  acciones: AccionDiaria[],
  comentarios: AccionComentario[],
  today: string,
  areaFilter?: string
): UserActionsSummaryRow[] {
  return filterUsersWithAssignedArea(users, areaFilter).map((user) => {
    const assignedOpenActions = acciones.filter(
      (accion) => accion.responsable === user.id && isOpenAction(accion)
    )
    const gamificationPoints = buildActionGamificationMetrics(
      user.id,
      acciones,
      comentarios,
      today
    ).totalPoints

    return {
      userId: user.id,
      nombre: user.nombre,
      area: user.area!.trim(),
      abiertas: assignedOpenActions.length,
      retraso: assignedOpenActions.filter(
        (accion) => accion.estado === 'Retraso' || isEnRetraso(accion)
      ).length,
      bloqueadas: assignedOpenActions.filter((accion) => accion.estado === 'Bloqueado').length,
      gamificationPoints,
    }
  })
}

export function buildAreaActionsSummaryRows(
  userRows: UserActionsSummaryRow[]
): AreaActionsSummaryRow[] {
  const byArea = new Map<string, AreaActionsSummaryRow>()

  for (const row of userRows) {
    const existing = byArea.get(row.area) ?? {
      area: row.area,
      usuarios: 0,
      abiertas: 0,
      retraso: 0,
      bloqueadas: 0,
      gamificationPoints: 0,
    }

    existing.usuarios += 1
    existing.abiertas += row.abiertas
    existing.retraso += row.retraso
    existing.bloqueadas += row.bloqueadas
    existing.gamificationPoints += row.gamificationPoints
    byArea.set(row.area, existing)
  }

  return Array.from(byArea.values())
}

export function compareUserSummaryRows(
  a: UserActionsSummaryRow,
  b: UserActionsSummaryRow,
  sortKey: UserSummarySortKey,
  sortDir: SummarySortDir
) {
  let cmp = 0
  if (sortKey === 'nombre') {
    cmp = a.nombre.localeCompare(b.nombre, 'es')
  } else {
    cmp = a[sortKey] - b[sortKey]
  }

  if (cmp === 0) {
    cmp =
      b.abiertas - a.abiertas ||
      b.retraso - a.retraso ||
      b.bloqueadas - a.bloqueadas ||
      a.nombre.localeCompare(b.nombre, 'es')
  }

  return sortDir === 'asc' ? cmp : -cmp
}

export function compareAreaSummaryRows(
  a: AreaActionsSummaryRow,
  b: AreaActionsSummaryRow,
  sortKey: AreaSummarySortKey,
  sortDir: SummarySortDir
) {
  let cmp = 0
  if (sortKey === 'area') {
    cmp = a.area.localeCompare(b.area, 'es')
  } else {
    cmp = a[sortKey] - b[sortKey]
  }

  if (cmp === 0) {
    cmp =
      b.abiertas - a.abiertas ||
      b.usuarios - a.usuarios ||
      a.area.localeCompare(b.area, 'es')
  }

  return sortDir === 'asc' ? cmp : -cmp
}

export interface ActionsSummaryTotals {
  count: number
  abiertas: number
  retraso: number
  bloqueadas: number
  gamificationPoints: number
}

export function summarizeUserActionsRows(rows: UserActionsSummaryRow[]): ActionsSummaryTotals {
  return rows.reduce<ActionsSummaryTotals>(
    (totals, row) => ({
      count: totals.count + 1,
      abiertas: totals.abiertas + row.abiertas,
      retraso: totals.retraso + row.retraso,
      bloqueadas: totals.bloqueadas + row.bloqueadas,
      gamificationPoints: totals.gamificationPoints + row.gamificationPoints,
    }),
    { count: 0, abiertas: 0, retraso: 0, bloqueadas: 0, gamificationPoints: 0 }
  )
}

export function summarizeAreaActionsRows(rows: AreaActionsSummaryRow[]): ActionsSummaryTotals {
  return rows.reduce<ActionsSummaryTotals>(
    (totals, row) => ({
      count: totals.count + 1,
      abiertas: totals.abiertas + row.abiertas,
      retraso: totals.retraso + row.retraso,
      bloqueadas: totals.bloqueadas + row.bloqueadas,
      gamificationPoints: totals.gamificationPoints + row.gamificationPoints,
    }),
    { count: 0, abiertas: 0, retraso: 0, bloqueadas: 0, gamificationPoints: 0 }
  )
}

export function initialsFromDisplayName(nombre: string): string {
  const parts = nombre.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toLocaleUpperCase('es')
  return (parts[0][0] + parts[parts.length - 1][0]).toLocaleUpperCase('es')
}

export interface SummaryTotals {
  count: number
  abiertas: number
  retraso: number
  bloqueadas: number
  gamificationPoints: number
}

export function computeUserSummaryTotals(rows: UserActionsSummaryRow[]): SummaryTotals {
  return rows.reduce(
    (totals, row) => ({
      count: totals.count + 1,
      abiertas: totals.abiertas + row.abiertas,
      retraso: totals.retraso + row.retraso,
      bloqueadas: totals.bloqueadas + row.bloqueadas,
      gamificationPoints: totals.gamificationPoints + row.gamificationPoints,
    }),
    { count: 0, abiertas: 0, retraso: 0, bloqueadas: 0, gamificationPoints: 0 }
  )
}

export function computeAreaSummaryTotals(rows: AreaActionsSummaryRow[]): SummaryTotals {
  return rows.reduce(
    (totals, row) => ({
      count: totals.count + 1,
      abiertas: totals.abiertas + row.abiertas,
      retraso: totals.retraso + row.retraso,
      bloqueadas: totals.bloqueadas + row.bloqueadas,
      gamificationPoints: totals.gamificationPoints + row.gamificationPoints,
    }),
    { count: 0, abiertas: 0, retraso: 0, bloqueadas: 0, gamificationPoints: 0 }
  )
}

export function userSummarySortLabel(sortKey: UserSummarySortKey): string {
  switch (sortKey) {
    case 'nombre':
      return 'nombre'
    case 'abiertas':
      return 'acciones abiertas'
    case 'retraso':
      return 'retrasos'
    case 'bloqueadas':
      return 'bloqueadas'
    case 'gamificationPoints':
      return 'puntos'
  }
}

export function areaSummarySortLabel(sortKey: AreaSummarySortKey): string {
  switch (sortKey) {
    case 'area':
      return 'área'
    case 'usuarios':
      return 'usuarios'
    case 'abiertas':
      return 'acciones abiertas'
    case 'retraso':
      return 'retrasos'
    case 'bloqueadas':
      return 'bloqueadas'
    case 'gamificationPoints':
      return 'puntos'
  }
}
