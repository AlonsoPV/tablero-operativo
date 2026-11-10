import { getAppNow } from '@/lib/clock'
import {
  isCorporateBlocked,
  isCorporateOverdue,
} from '@/features/metrics/corporateActionMetrics'
import {
  objectivePeriod,
  objectiveProgress,
  type OkrData,
} from '@/features/okrs/model'
import { findPriorityForAccion } from '@/features/operations/utils/resolveAccionPrioridad'
import { priorityColorFor } from '@/features/operations/utils/priorityColors'
import type { Priority } from '@/features/catalogs/types/catalogs.types'
import type { AccionDiaria } from '@/types'

const MAX_ACTION_ITEMS = 12
const MAX_OBJECTIVE_ITEMS = 8

export type BoardAssistantContextPayload = {
  today: string
  /** ISO timestamp de cuando se armo el contexto (cliente). */
  fetchedAt?: string
  viewer?: {
    rol?: string | null
    areas?: string[]
    scope?: 'own' | 'board'
  }
  operational?: {
    dueThisWeek?: number
    stale?: number
    pendingVerification?: number
    teamOverdue?: number
    teamBlocked?: number
    mineTitles?: Array<{
      titulo: string
      estado: string
      fecha: string
      dueBucket?: string
      daysSinceUpdate?: number | null
    }>
    pendingVerificationTitles?: Array<{ titulo: string; fecha: string }>
    teamHotTitles?: Array<{ titulo: string; estado: string; fecha: string }>
  }
  actions: {
    totalOpen: number
    delayed: number
    blocked: number
    red: number
    taggedOkr: number
    byEstado: Array<{ estado: string; count: number }>
    items: Array<{
      titulo: string
      estado: string
      prioridad: string
      color: string
      fecha: string
      hora: string
      esOkr: boolean
      okrImpactado: string
    }>
  }
  okrs: {
    visible: boolean
    objectives: number
    keyResults: number
    initiatives: number
    items: Array<{
      nombre: string
      scope: string
      periodStatus: string
      krCount: number
      initiativeCount: number
      progress: number | null
      krsWithoutBaseline: number
    }>
  } | null
}

function countByEstado(actions: AccionDiaria[]) {
  const counts = new Map<string, number>()
  for (const action of actions) {
    counts.set(action.estado, (counts.get(action.estado) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([estado, count]) => ({ estado, count }))
    .sort((a, b) => b.count - a.count)
}

function actionColor(action: AccionDiaria, priorities: Priority[]) {
  const priority = findPriorityForAccion(action, priorities)
  return priorityColorFor(priority?.nombre ?? action.prioridad, priority?.color)
}

function sortOpenActions(actions: AccionDiaria[], priorities: Priority[]) {
  return [...actions].sort((a, b) => {
    const aLate = a.estado === 'Retraso' || actionColor(a, priorities) === 'rojo'
    const bLate = b.estado === 'Retraso' || actionColor(b, priorities) === 'rojo'
    if (aLate !== bLate) return aLate ? -1 : 1
    if (a.estado === 'Bloqueado' && b.estado !== 'Bloqueado') return -1
    if (a.estado !== 'Bloqueado' && b.estado === 'Bloqueado') return 1
    return `${a.fecha} ${a.hora_limite}`.localeCompare(`${b.fecha} ${b.hora_limite}`)
  })
}

export function buildBoardAssistantContext(
  actions: AccionDiaria[],
  priorities: Priority[],
  okrData: OkrData | null | undefined,
  today: string,
  now = getAppNow()
): BoardAssistantContextPayload {
  const sorted = sortOpenActions(actions, priorities)
  const red = actions.filter(
    (action) => isCorporateOverdue(action, now) || actionColor(action, priorities) === 'rojo'
  ).length

  return {
    today,
    actions: {
      totalOpen: actions.length,
      delayed: actions.filter((action) => isCorporateOverdue(action, now)).length,
      blocked: actions.filter((action) => isCorporateBlocked(action)).length,
      red,
      taggedOkr: actions.filter((action) => action.es_okr === true).length,
      byEstado: countByEstado(actions),
      items: sorted.slice(0, MAX_ACTION_ITEMS).map((action) => ({
        titulo: action.titulo_accion || action.descripcion_accion || 'Accion sin titulo',
        estado: action.estado,
        prioridad: action.prioridad,
        color: actionColor(action, priorities),
        fecha: action.fecha,
        hora: action.hora_limite,
        esOkr: action.es_okr === true,
        okrImpactado: action.okr_impactado?.trim() || '',
      })),
    },
    okrs: okrData
      ? {
          visible: true,
          objectives: okrData.objectives.length,
          keyResults: okrData.keyResults.length,
          initiatives: okrData.initiatives.length,
          items: okrData.objectives.slice(0, MAX_OBJECTIVE_ITEMS).map((objective) => {
            const keyResults = okrData.keyResults.filter((item) => item.okr_id === objective.id)
            const krIds = new Set(keyResults.map((item) => item.id))
            const initiatives = okrData.initiatives.filter((item) => krIds.has(item.key_result_id))
            const progress = objectiveProgress(keyResults)
            return {
              nombre: objective.nombre_okr,
              scope: objective.scope,
              periodStatus: objectivePeriod(objective, today),
              krCount: keyResults.length,
              initiativeCount: initiatives.length,
              progress: progress == null ? null : Math.round(progress),
              krsWithoutBaseline: keyResults.filter((item) => item.baseline_value == null).length,
            }
          }),
        }
      : null,
  }
}
