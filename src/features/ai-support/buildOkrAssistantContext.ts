import {
  krProgress,
  objectivePeriod,
  type ActionOption,
  type CheckIn,
  type Initiative,
  type KeyResult,
  type OkrData,
} from '@/features/okrs/model'

export type OkrAssistantFocus = 'objective' | 'key_result' | 'initiative'

export type OkrAssistantContextPayload = {
  focus: OkrAssistantFocus
  objective: {
    id: string
    nombre: string
    descripcion: string
    scope: string
    area: string
    owner: string
    periodStart: string
    periodEnd: string
    periodStatus: string
    parentNombre: string
    periodElapsedHint: string
  }
  keyResults: Array<{
    id: string
    title: string
    baseline: number | null
    target: number | null
    current: number | null
    unit: string
    metricType: string
    direction: string
    progress: number | null
    owner: string
    focused: boolean
    completeness: {
      hasBaseline: boolean
      hasTarget: boolean
      hasCurrent: boolean
    }
    checkIns: Array<{
      value: number
      note: string
      confidence: string
      created_at: string
    }>
  }>
  initiatives: Array<{
    id: string
    keyResultId: string
    keyResultTitle: string
    title: string
    kind: string
    closed: boolean
    esOkr: boolean
    focused: boolean
  }>
}

type KeyResultWithDirection = KeyResult & {
  direction?: 'increase' | 'decrease' | string | null
}

function nameById(items: { id: string; nombre: string }[], id: string | null | undefined) {
  if (!id) return ''
  return items.find((item) => item.id === id)?.nombre ?? ''
}

function finiteOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function periodElapsedHint(start: string | null, end: string | null, today: string) {
  if (!start || !end || today < start) return ''
  const startMs = Date.parse(`${start}T00:00:00`)
  const endMs = Date.parse(`${end}T00:00:00`)
  const todayMs = Date.parse(`${today}T00:00:00`)
  if (![startMs, endMs, todayMs].every(Number.isFinite) || endMs <= startMs) return ''
  const ratio = Math.max(0, Math.min(1, (todayMs - startMs) / (endMs - startMs)))
  return `aprox. ${Math.round(ratio * 100)}% del periodo`
}

function resolveActionOption(initiative: Initiative, actions: ActionOption[]) {
  if (initiative.action_id) {
    return actions.find((action) => action.kind === 'company' && action.id === initiative.action_id)
  }
  if (initiative.team_action_id) {
    return actions.find((action) => action.kind === 'team' && action.id === initiative.team_action_id)
  }
  return undefined
}

export function buildOkrAssistantContext(
  data: Pick<OkrData, 'objectives' | 'keyResults' | 'initiatives' | 'checkIns' | 'users' | 'areas'>,
  actions: ActionOption[],
  selection: {
    objectiveId: string
    keyResultId?: string | null
    initiativeId?: string | null
    today: string
  }
): OkrAssistantContextPayload | null {
  const objective = data.objectives.find((item) => item.id === selection.objectiveId)
  if (!objective) return null

  const parent = objective.parent_okr_id
    ? data.objectives.find((item) => item.id === objective.parent_okr_id)
    : undefined
  const keyResults = data.keyResults.filter((item) => item.okr_id === objective.id)
  const focusedInitiative = selection.initiativeId
    ? data.initiatives.find((item) => item.id === selection.initiativeId)
    : undefined
  const focusedKrId = selection.keyResultId || focusedInitiative?.key_result_id || null
  const focus: OkrAssistantFocus = focusedInitiative
    ? 'initiative'
    : focusedKrId
      ? 'key_result'
      : 'objective'

  const relatedKrIds = new Set(
    focusedKrId ? [focusedKrId] : keyResults.map((item) => item.id)
  )
  const relatedInitiatives = data.initiatives.filter((item) => relatedKrIds.has(item.key_result_id))

  return {
    focus,
    objective: {
      id: objective.id,
      nombre: objective.nombre_okr,
      descripcion: objective.descripcion ?? '',
      scope: objective.scope,
      area: nameById(data.areas, objective.area_id),
      owner: nameById(data.users, objective.owner_user_id),
      periodStart: objective.start_date ?? '',
      periodEnd: objective.end_date ?? '',
      periodStatus: objectivePeriod(objective, selection.today),
      parentNombre: parent?.nombre_okr ?? '',
      periodElapsedHint: periodElapsedHint(
        objective.start_date,
        objective.end_date,
        selection.today
      ),
    },
    keyResults: keyResults.map((kr) => serializeKeyResult(kr, data, focusedKrId)),
    initiatives: relatedInitiatives.map((initiative) => {
      const option = resolveActionOption(initiative, actions)
      const kr = keyResults.find((item) => item.id === initiative.key_result_id)
      return {
        id: initiative.id,
        keyResultId: initiative.key_result_id,
        keyResultTitle: kr?.title ?? '',
        title: option?.title ?? '',
        kind: option?.kind ?? (initiative.team_action_id ? 'team' : 'company'),
        closed: Boolean(option?.closed),
        esOkr: option?.es_okr === true,
        focused: initiative.id === selection.initiativeId,
      }
    }),
  }
}

function serializeKeyResult(
  kr: KeyResultWithDirection,
  data: Pick<OkrData, 'checkIns' | 'users'>,
  focusedKrId: string | null
) {
  const baseline = finiteOrNull(kr.baseline_value)
  const target = finiteOrNull(kr.target_value)
  const current = finiteOrNull(kr.current_value)
  const canCompute = baseline != null && target != null && current != null && baseline !== target
  const checkIns = data.checkIns
    .filter((item) => item.key_result_id === kr.id)
    .slice(0, 3)
    .map((item) => serializeCheckIn(item))

  return {
    id: kr.id,
    title: kr.title,
    baseline,
    target,
    current,
    unit: kr.unit ?? '',
    metricType: kr.metric_type ?? '',
    direction: kr.direction || (baseline != null && target != null && target < baseline ? 'decrease' : baseline != null && target != null && target > baseline ? 'increase' : ''),
    progress: canCompute ? krProgress(kr) : null,
    owner: nameById(data.users, kr.owner_user_id),
    focused: kr.id === focusedKrId,
    completeness: {
      hasBaseline: baseline != null,
      hasTarget: target != null,
      hasCurrent: current != null,
    },
    checkIns,
  }
}

function serializeCheckIn(item: CheckIn) {
  return {
    value: item.value,
    note: item.note ?? '',
    confidence: item.confidence ?? '',
    created_at: item.created_at,
  }
}
