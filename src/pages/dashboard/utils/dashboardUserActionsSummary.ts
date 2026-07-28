import type { AccionDiaria } from '@/types'
import type { AccionComentario } from '@/types/accionComentario'
import type { UserProfile } from '@/features/users/types/user.types'
import {
  buildActionGamificationMetrics,
  getUserOwnedActions,
  getUserRelevantComments,
  type OrgChartGamificationScore,
} from '@/features/disciplina/utils/actionGamification'
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
  gamificationEarnedPoints: number
  gamificationPossiblePoints: number
  gamificationFulfillmentPercent: number
  gamificationAwardScore: number
  workloadBand: string
}

export interface AreaActionsSummaryRow {
  area: string
  usuarios: number
  abiertas: number
  retraso: number
  bloqueadas: number
  gamificationPoints: number
  gamificationEarnedPoints: number
  gamificationPossiblePoints: number
  gamificationFulfillmentPercent: number
  gamificationAwardScore: number
}

export type UserSummarySortKey =
  | 'nombre'
  | 'abiertas'
  | 'retraso'
  | 'bloqueadas'
  | 'gamificationFulfillmentPercent'
  | 'gamificationAwardScore'
export type AreaSummarySortKey =
  | 'area'
  | 'usuarios'
  | 'abiertas'
  | 'retraso'
  | 'bloqueadas'
  | 'gamificationFulfillmentPercent'
  | 'gamificationAwardScore'
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
  areaFilter?: string,
  orgChartScores: ReadonlyMap<string, OrgChartGamificationScore> = new Map(),
  academyCompletedByAuthUserId: ReadonlyMap<string, number> = new Map(),
  gamificationActions: AccionDiaria[] = acciones,
  gamificationComments: AccionComentario[] = comentarios
): UserActionsSummaryRow[] {
  return filterUsersWithAssignedArea(users, areaFilter).map((user) => {
    const assignedOpenActions = acciones.filter(
      (accion) => accion.responsable === user.id && isOpenAction(accion)
    )
    const personalActions = getUserOwnedActions(user.id, gamificationActions, gamificationComments)
    const personalComments = getUserRelevantComments(user.id, gamificationComments, personalActions)
    const gamificationPoints = buildActionGamificationMetrics(
      user.id,
      personalActions,
      personalComments,
      today,
      academyCompletedByAuthUserId.get(user.user_id) ?? 0,
      orgChartScores.get(user.id) ?? null
    )

    return {
      userId: user.id,
      nombre: user.nombre,
      area: user.area!.trim(),
      abiertas: assignedOpenActions.length,
      retraso: assignedOpenActions.filter(
        (accion) => accion.estado === 'Retraso' || isEnRetraso(accion)
      ).length,
      bloqueadas: assignedOpenActions.filter((accion) => accion.estado === 'Bloqueado').length,
      gamificationPoints: gamificationPoints.totalPoints,
      gamificationEarnedPoints: gamificationPoints.earnedPoints,
      gamificationPossiblePoints: gamificationPoints.possiblePoints,
      gamificationFulfillmentPercent: gamificationPoints.fulfillmentPercent,
      gamificationAwardScore: gamificationPoints.awardScore,
      workloadBand: gamificationPoints.workloadBand,
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
      gamificationEarnedPoints: 0,
      gamificationPossiblePoints: 0,
      gamificationFulfillmentPercent: 0,
      gamificationAwardScore: 0,
    }

    existing.usuarios += 1
    existing.abiertas += row.abiertas
    existing.retraso += row.retraso
    existing.bloqueadas += row.bloqueadas
    existing.gamificationPoints += row.gamificationPoints
    existing.gamificationEarnedPoints += row.gamificationEarnedPoints
    existing.gamificationPossiblePoints += row.gamificationPossiblePoints
    existing.gamificationFulfillmentPercent = calculateFulfillmentPercent(
      existing.gamificationEarnedPoints,
      existing.gamificationPossiblePoints
    )
    existing.gamificationAwardScore = Math.round(
      ((existing.gamificationAwardScore * (existing.usuarios - 1)) + row.gamificationAwardScore) /
        existing.usuarios
    )
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
  gamificationEarnedPoints: number
  gamificationPossiblePoints: number
  gamificationFulfillmentPercent: number
  gamificationAwardScore: number
}

export function summarizeUserActionsRows(rows: UserActionsSummaryRow[]): ActionsSummaryTotals {
  return rows.reduce<ActionsSummaryTotals>(
    (totals, row) => ({
      count: totals.count + 1,
      abiertas: totals.abiertas + row.abiertas,
      retraso: totals.retraso + row.retraso,
      bloqueadas: totals.bloqueadas + row.bloqueadas,
      gamificationPoints: totals.gamificationPoints + row.gamificationPoints,
      gamificationEarnedPoints: totals.gamificationEarnedPoints + row.gamificationEarnedPoints,
      gamificationPossiblePoints: totals.gamificationPossiblePoints + row.gamificationPossiblePoints,
      gamificationFulfillmentPercent: calculateFulfillmentPercent(
        totals.gamificationEarnedPoints + row.gamificationEarnedPoints,
        totals.gamificationPossiblePoints + row.gamificationPossiblePoints
      ),
      gamificationAwardScore: Math.round(
        ((totals.gamificationAwardScore * totals.count) + row.gamificationAwardScore) /
          (totals.count + 1)
      ),
    }),
    {
      count: 0,
      abiertas: 0,
      retraso: 0,
      bloqueadas: 0,
      gamificationPoints: 0,
      gamificationEarnedPoints: 0,
      gamificationPossiblePoints: 0,
      gamificationFulfillmentPercent: 0,
      gamificationAwardScore: 0,
    }
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
      gamificationEarnedPoints: totals.gamificationEarnedPoints + row.gamificationEarnedPoints,
      gamificationPossiblePoints: totals.gamificationPossiblePoints + row.gamificationPossiblePoints,
      gamificationFulfillmentPercent: calculateFulfillmentPercent(
        totals.gamificationEarnedPoints + row.gamificationEarnedPoints,
        totals.gamificationPossiblePoints + row.gamificationPossiblePoints
      ),
      gamificationAwardScore: Math.round(
        ((totals.gamificationAwardScore * totals.count) + row.gamificationAwardScore) /
          (totals.count + 1)
      ),
    }),
    {
      count: 0,
      abiertas: 0,
      retraso: 0,
      bloqueadas: 0,
      gamificationPoints: 0,
      gamificationEarnedPoints: 0,
      gamificationPossiblePoints: 0,
      gamificationFulfillmentPercent: 0,
      gamificationAwardScore: 0,
    }
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
  gamificationEarnedPoints: number
  gamificationPossiblePoints: number
  gamificationFulfillmentPercent: number
  gamificationAwardScore: number
}

export function computeUserSummaryTotals(rows: UserActionsSummaryRow[]): SummaryTotals {
  return rows.reduce(
    (totals, row) => ({
      count: totals.count + 1,
      abiertas: totals.abiertas + row.abiertas,
      retraso: totals.retraso + row.retraso,
      bloqueadas: totals.bloqueadas + row.bloqueadas,
      gamificationPoints: totals.gamificationPoints + row.gamificationPoints,
      gamificationEarnedPoints: totals.gamificationEarnedPoints + row.gamificationEarnedPoints,
      gamificationPossiblePoints: totals.gamificationPossiblePoints + row.gamificationPossiblePoints,
      gamificationFulfillmentPercent: calculateFulfillmentPercent(
        totals.gamificationEarnedPoints + row.gamificationEarnedPoints,
        totals.gamificationPossiblePoints + row.gamificationPossiblePoints
      ),
      gamificationAwardScore: Math.round(
        ((totals.gamificationAwardScore * totals.count) + row.gamificationAwardScore) /
          (totals.count + 1)
      ),
    }),
    {
      count: 0,
      abiertas: 0,
      retraso: 0,
      bloqueadas: 0,
      gamificationPoints: 0,
      gamificationEarnedPoints: 0,
      gamificationPossiblePoints: 0,
      gamificationFulfillmentPercent: 0,
      gamificationAwardScore: 0,
    }
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
      gamificationEarnedPoints: totals.gamificationEarnedPoints + row.gamificationEarnedPoints,
      gamificationPossiblePoints: totals.gamificationPossiblePoints + row.gamificationPossiblePoints,
      gamificationFulfillmentPercent: calculateFulfillmentPercent(
        totals.gamificationEarnedPoints + row.gamificationEarnedPoints,
        totals.gamificationPossiblePoints + row.gamificationPossiblePoints
      ),
      gamificationAwardScore: Math.round(
        ((totals.gamificationAwardScore * totals.count) + row.gamificationAwardScore) /
          (totals.count + 1)
      ),
    }),
    {
      count: 0,
      abiertas: 0,
      retraso: 0,
      bloqueadas: 0,
      gamificationPoints: 0,
      gamificationEarnedPoints: 0,
      gamificationPossiblePoints: 0,
      gamificationFulfillmentPercent: 0,
      gamificationAwardScore: 0,
    }
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
    case 'gamificationFulfillmentPercent':
      return 'cumplimiento'
    case 'gamificationAwardScore':
      return 'score ajustado'
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
    case 'gamificationFulfillmentPercent':
      return 'cumplimiento'
    case 'gamificationAwardScore':
      return 'score ajustado'
  }
}

function calculateFulfillmentPercent(earnedPoints: number, possiblePoints: number) {
  if (possiblePoints <= 0) return 0
  return Math.round((earnedPoints / possiblePoints) * 100)
}
