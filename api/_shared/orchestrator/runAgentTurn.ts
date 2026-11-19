/**
 * Orquestador compartido del agente (CV-05):
 * identidad → intención → contexto → autorización → consulta → interpretación → respuesta.
 * Los canales sólo adaptan formato. Si la intención es 'unknown' devuelve handled=false
 * y el canal continúa con su flujo LLM existente.
 */
import type {
  CopilotClarification,
  CopilotToolResult,
} from '../../../src/features/ai-support/copilot/types.js'
import { draftFromRequest } from '../../../src/features/ai-support/creationDraft.js'
import { parseDueDateHint } from '../../../src/features/ai-support/parseWorkFacts.js'
import { todayWallClockCDMX } from '../../../src/lib/dateUtils.js'
import { buildActiveQueryEntry, isPersonalActionScope } from '../actionQueryContract.js'
import { proposeAction, type ActionProposal } from '../actions/contracts.js'
import { authorizeOperation, authorizeQuery } from '../query/authorizeQuery.js'
import type {
  ActionItem,
  ActionsQueryRequest,
  AggregateQueryRequest,
  QueryResult,
  QueryStatus,
} from '../query/contracts.js'
import { queryActions, queryAggregate, queryOkrs, type ToolDispatcher } from '../query/index.js'
import type { QueryAuditEntry, QueryAuditSink } from '../query/queryAudit.js'
import type { AgentActor } from '../query/resolveActor.js'
import { UNAVAILABLE_DOMAINS } from '../query/sourceCatalog.js'
import { classifyAgentIntent, type AgentIntent } from './intent.js'
import {
  pickMostUrgent,
  rankByUrgency,
  resolvePerson,
  urgencyRank,
  type PersonCandidate,
} from './resolveEntity.js'
import { emptyBlocks, statusMessage, type AgentResponse } from './respond.js'
import {
  emptySessionContext,
  needsReferenceRehydration,
  sessionContextKey,
  toReferencedActions,
  type SessionContext,
  type SessionContextStore,
} from './sessionContext.js'
import { capabilityFingerprint } from '../query/actorCapabilities.js'

/** authz se evalúa dentro de cada handler, antes de consultar; query_interpret incluye ambas fases. */
export type AgentStage = 'identity' | 'intent' | 'context' | 'query_interpret' | 'respond'

export type AgentTurnDeps = {
  dispatch: ToolDispatcher
  store: SessionContextStore
  audit?: QueryAuditSink
  now?: () => number
  today?: () => string
}

export type AgentTurnResult = {
  handled: boolean
  intent: AgentIntent['kind']
  response: AgentResponse
  clarification?: CopilotClarification
  proposal?: ActionProposal
  toolsUsed: string[]
  trace: Array<{ stage: AgentStage; ms: number }>
}

type TurnState = {
  actor: AgentActor
  ctx: SessionContext
  today: string
  tools: string[]
  dispatch: ToolDispatcher
}

const LIST_LIMIT = 5

function unwrap(data: unknown): Record<string, unknown> {
  if (!data || typeof data !== 'object') return {}
  const record = data as Record<string, unknown>
  const inner = record.payload
  return inner && typeof inner === 'object' ? (inner as Record<string, unknown>) : record
}

function actionLine(item: ActionItem, today: string): string {
  const flags: string[] = []
  const rank = urgencyRank(item, today)
  if (rank === 0) flags.push('vencida')
  if (rank === 1) flags.push('bloqueada')
  if (item.fecha === today && rank > 1) flags.push('vence hoy')
  const owner = item.responsableNombre ? ` · ${item.responsableNombre}` : ''
  return `- ${item.title} (${item.estado ?? 'sin estado'}, ${item.fecha ?? 'sin fecha'}${flags.length ? `, ${flags.join(', ')}` : ''})${owner}`
}

function scopeLabel(scope: string): string {
  switch (scope) {
    case 'responsable_actual':
    case 'assigned_to_me':
      return 'tus acciones como responsable'
    case 'creadas_por_mi':
    case 'created_by_me':
      return 'acciones que creaste'
    case 'responsable_o_creador':
    case 'assigned_to_me_or_created':
      return 'acciones tuyas o creadas por ti'
    case 'equipo_autorizado':
    case 'team_authorized':
      return 'acciones del equipo autorizado'
    default:
      return 'acciones del tablero autorizado'
  }
}

function baseResponse(status: AgentResponse['status'], asOf: string | null = null): AgentResponse {
  return { status, blocks: emptyBlocks(), references: [], asOf }
}

function forbidden(reason: string, recommendation?: string): AgentResponse {
  const response = baseResponse('forbidden')
  response.blocks.data.push(reason)
  if (recommendation) response.blocks.recommendation.push(recommendation)
  response.blocks.limitations.push('No se muestran datos fuera de tu alcance autorizado.')
  return response
}

async function resolvePersonHint(state: TurnState, hint: string) {
  const result = await state.dispatch(state.actor.copilot, 'search_people', { name: hint })
  if (result.kind === 'clarification' && result.clarification) {
    return {
      kind: 'ambiguous' as const,
      clarification: {
        question: 'Hay varias personas con ese nombre. ¿A quién te refieres?',
        options: result.clarification.options,
      },
    }
  }
  if (!result.ok) return { kind: 'none' as const }
  const items = (unwrap(result.data).items as unknown[] | undefined) ?? []
  const candidates: PersonCandidate[] = items.flatMap((raw) => {
    const row = raw as Record<string, unknown>
    return typeof row.id === 'string'
      ? [{ id: row.id, nombre: String(row.nombre ?? ''), area: typeof row.area === 'string' ? row.area : null }]
      : []
  })
  return resolvePerson(candidates)
}

function wideOrPersonal(actor: AgentActor): ActionsQueryRequest['scope'] {
  const wide = authorizeQuery(actor, {
    entity: 'actions', scope: 'board_authorized', statusGroup: 'open', visual: 'none',
  })
  return wide.allowed ? 'board_authorized' : 'assigned_to_me'
}

/**
 * El store compartido guarda sólo IDs: títulos y responsables se releen con la consulta activa y los
 * permisos vigentes. Lo que ya no es visible se descarta en silencio.
 */
async function rehydrateReferences(state: TurnState) {
  const ids = state.ctx.lastActions.map((item) => item.id)
  const previous = state.ctx.activeQuery
  const entity = state.ctx.lastEntity
  state.ctx = { ...state.ctx, lastActions: [], lastEntity: null }
  if (!previous || ids.length === 0) return
  const request: ActionsQueryRequest = {
    entity: 'actions', scope: previous.scope, statusGroup: previous.status_group, visual: previous.visual, limit: 12,
  }
  if (!authorizeQuery(state.actor, request).allowed) return
  const result = await queryActions(state.actor.copilot, request, state.dispatch)
  const byId = new Map(result.items.map((item) => [item.id, item]))
  const kept = ids.flatMap((id) => {
    const item = byId.get(id)
    return item ? [item] : []
  })
  const entityItem = entity?.kind === 'action' ? byId.get(entity.id) : undefined
  state.ctx = {
    ...state.ctx,
    lastActions: toReferencedActions(kept),
    lastEntity: entityItem ? { kind: 'action', id: entityItem.id, label: entityItem.title } : null,
  }
}

function rememberActions(state: TurnState, request: ActionsQueryRequest, result: QueryResult<ActionItem>) {
  state.ctx = {
    ...state.ctx,
    activeQuery: buildActiveQueryEntry({ scope: request.scope, status_group: request.statusGroup, visual: request.visual }),
    lastActions: result.items.length ? toReferencedActions(result.items) : state.ctx.lastActions,
  }
}

async function handleQueryActions(
  state: TurnState,
  intent: Extract<AgentIntent, { kind: 'query_actions' }>
): Promise<{ response: AgentResponse; clarification?: CopilotClarification; audit: Partial<QueryAuditEntry> }> {
  let responsableId: string | undefined
  let personLabel: string | undefined
  const request: ActionsQueryRequest = {
    entity: 'actions',
    scope: intent.scope,
    statusGroup: intent.statusGroup,
    visual: intent.visual,
    limit: intent.limit,
  }

  const authz = authorizeQuery(state.actor, request)
  if (!authz.allowed) {
    return {
      response: forbidden(
        intent.restrictedRequest
          ? 'No puedo mostrar acciones de otros equipos: tu rol sólo permite consultar tus propias acciones.'
          : authz.reason,
        authz.fallbackScope ? 'Puedo mostrarte tus acciones asignadas o las que creaste.' : undefined
      ),
      audit: { status: 'denied_precheck', entity: 'actions', scope: request.scope },
    }
  }

  if (intent.personHint) {
    const person = await resolvePersonHint(state, intent.personHint)
    if (person.kind === 'ambiguous') {
      const response = baseResponse('clarification')
      response.blocks.data.push(person.clarification.question)
      return { response, clarification: person.clarification, audit: { status: 'clarification', entity: 'people' } }
    }
    if (person.kind === 'none') {
      const response = baseResponse('empty')
      response.blocks.data.push(`No encontré una persona activa llamada «${intent.personHint}».`)
      return { response, audit: { status: 'empty', entity: 'people' } }
    }
    responsableId = person.person.id
    personLabel = person.person.nombre
    state.ctx = { ...state.ctx, lastEntity: { kind: 'person', id: person.person.id, label: person.person.nombre } }
  }

  const result = await queryActions(state.actor.copilot, { ...request, responsableId }, state.dispatch)
  const response = baseResponse(result.status, result.asOf)
  const subject = personLabel ? `acciones de ${personLabel}` : scopeLabel(result.scopeApplied)

  if (result.status === 'forbidden' || result.status === 'error') {
    response.blocks.data.push(statusMessage(result.status, subject, result.error?.message))
    return { response, audit: { status: result.status, entity: 'actions', scope: request.scope } }
  }
  if (result.status === 'empty') {
    response.blocks.data.push(statusMessage('empty', subject))
    rememberActions(state, request, result)
    return { response, audit: { status: 'empty', entity: 'actions', scope: request.scope, total: 0 } }
  }

  const ranked = rankByUrgency(result.items, state.today)
  const shown = ranked.slice(0, LIST_LIMIT)
  const verb = intent.statusGroup === 'overdue' ? 'vencidas' : intent.statusGroup === 'blocked' ? 'bloqueadas' : 'abiertas'
  response.blocks.data.push(`${result.totals.total} ${verb} en ${subject}.`)
  response.blocks.data.push(...shown.map((item) => actionLine(item, state.today)))
  response.references = shown.map((item) => ({ id: item.id, title: item.title, href: item.href }))

  const overdue = result.items.filter((i) => urgencyRank(i, state.today) === 0).length
  const blocked = result.items.filter((i) => urgencyRank(i, state.today) === 1).length
  const dueToday = result.items.filter((i) => i.fecha === state.today).length
  if (overdue || blocked || (intent.focusToday && dueToday)) {
    const parts = [
      overdue ? `${overdue} vencida(s)` : '',
      blocked ? `${blocked} bloqueada(s)` : '',
      intent.focusToday ? `${dueToday} con fecha de hoy` : '',
    ].filter(Boolean)
    response.blocks.interpretation.push(`De las ${result.items.length} revisadas: ${parts.join(', ')}. El orden prioriza vencidas, bloqueadas y prioridad alta.`)
  }
  if (shown[0] && urgencyRank(shown[0], state.today) <= 2) {
    response.blocks.recommendation.push(`Empieza por «${shown[0].title}».`)
  }
  response.blocks.limitations.push(...result.limitations)
  rememberActions(state, { ...request }, result)
  return {
    response,
    audit: { status: result.status, entity: 'actions', scope: request.scope, total: result.totals.total },
  }
}

async function handleWhoMostUrgent(state: TurnState) {
  if (state.ctx.lastActions.length === 0) {
    const previous = state.ctx.activeQuery
    const request: ActionsQueryRequest = {
      entity: 'actions',
      scope: previous?.scope ?? 'assigned_to_me',
      statusGroup: previous?.status_group ?? 'open',
      visual: previous?.visual ?? 'none',
    }
    const authz = authorizeQuery(state.actor, request)
    if (!authz.allowed) return { response: forbidden(authz.reason), audit: { status: 'denied_precheck' as const, entity: 'actions' } }
    const result = await queryActions(state.actor.copilot, request, state.dispatch)
    if (result.status === 'error' || result.status === 'forbidden') {
      const response = baseResponse(result.status)
      response.blocks.data.push(statusMessage(result.status, 'las acciones', result.error?.message))
      return { response, audit: { status: result.status, entity: 'actions' } }
    }
    rememberActions(state, request, result)
  }
  const pick = pickMostUrgent(state.ctx.lastActions, state.today)
  if (pick.kind === 'none') {
    const response = baseResponse('empty')
    response.blocks.data.push('No hay acciones en la consulta actual para comparar urgencia.')
    return { response, audit: { status: 'empty' as const, entity: 'actions' } }
  }
  if (pick.kind === 'ambiguous') {
    const response = baseResponse('clarification')
    response.blocks.data.push(pick.clarification.question)
    return { response, clarification: pick.clarification, audit: { status: 'clarification' as const, entity: 'actions' } }
  }
  const action = pick.action
  const response = baseResponse('ok')
  response.blocks.data.push(
    `La más urgente es «${action.title}» (${action.estado ?? 'sin estado'}, ${action.fecha ?? 'sin fecha'}).`,
    action.responsableNombre
      ? `Responsable: ${action.responsableNombre}.`
      : 'Responsable: no disponible en tu alcance de lectura.'
  )
  response.blocks.interpretation.push('Urgencia calculada por: vencida > bloqueada > prioridad alta > vence hoy > fecha.')
  response.references = [{ id: action.id, title: action.title, href: action.href }]
  state.ctx = { ...state.ctx, lastEntity: { kind: 'action', id: action.id, label: action.title } }
  return { response, audit: { status: 'ok' as const, entity: 'actions', total: 1 } }
}

async function handleOkrs(state: TurnState, intent: Extract<AgentIntent, { kind: 'query_okrs' }>) {
  const authz = authorizeQuery(state.actor, { entity: 'okrs', period: intent.period })
  if (!authz.allowed) return { response: forbidden(authz.reason), audit: { status: 'denied_precheck' as const, entity: 'okrs' } }
  const result = await queryOkrs(state.actor.copilot, { entity: 'okrs', period: intent.period }, state.dispatch)
  const response = baseResponse(result.status, result.asOf)
  if (result.status === 'forbidden' || result.status === 'error' || result.status === 'empty') {
    response.blocks.data.push(statusMessage(result.status, 'objetivos OKR', result.error?.message))
    return { response, audit: { status: result.status, entity: 'okrs' } }
  }
  response.blocks.data.push(`${result.totals.total} objetivo(s) activo(s).`)
  for (const okr of result.items.slice(0, LIST_LIMIT)) {
    response.blocks.data.push(
      `- ${okr.name}: ${okr.progress == null ? 'sin datos suficientes' : `${Math.round(okr.progress)}% de avance`}` +
        (okr.withoutInitiatives ? ' · sin iniciativas' : '')
    )
  }
  const lagging = result.items.filter((o) => o.progress != null && o.progress < 40)
  if (lagging.length) {
    response.blocks.interpretation.push(`${lagging.length} objetivo(s) por debajo de 40% de avance: ${lagging.map((o) => o.name).join(', ')}.`)
    response.blocks.recommendation.push('Revisa iniciativas y responsables de los objetivos rezagados.')
  }
  if (intent.period === 'current_quarter') {
    response.blocks.limitations.push('Se usan los objetivos activos; el periodo exacto de cada uno está en el módulo OKRs.')
  }
  response.blocks.limitations.push(...result.limitations)
  return { response, audit: { status: result.status, entity: 'okrs', total: result.totals.total } }
}

const GROUP_LABEL = { area: 'área', responsable: 'responsable', estado: 'estado' } as const
const STATUS_LABEL = { open: 'abiertas', overdue: 'vencidas', blocked: 'bloqueadas' } as const

async function handleAggregate(state: TurnState, intent: Extract<AgentIntent, { kind: 'aggregate_execution' }>) {
  const wide: AggregateQueryRequest = {
    entity: 'aggregate', groupBy: intent.groupBy, statusGroup: intent.statusGroup, scope: 'board_authorized',
  }
  const authz = authorizeQuery(state.actor, wide)
  const request: AggregateQueryRequest = authz.allowed ? wide : { ...wide, scope: authz.fallbackScope ?? 'assigned_to_me' }
  if (!authz.allowed) {
    const personal = authorizeQuery(state.actor, request)
    if (!personal.allowed) {
      return { response: forbidden(personal.reason), audit: { status: 'denied_precheck' as const, entity: 'aggregate', scope: request.scope } }
    }
  }
  const result = await queryAggregate(state.actor.copilot, request, state.dispatch)
  const response = baseResponse(result.status, result.asOf)
  const subject = `acciones ${STATUS_LABEL[intent.statusGroup]} por ${GROUP_LABEL[intent.groupBy]}`
  if (result.status === 'forbidden' || result.status === 'error' || result.status === 'empty') {
    response.blocks.data.push(statusMessage(result.status, subject, result.error?.message))
    return { response, audit: { status: result.status, entity: 'aggregate', scope: request.scope } }
  }
  response.blocks.data.push(`${result.totals.total} ${subject} en ${scopeLabel(result.scopeApplied)}.`)
  response.blocks.data.push(...result.items.map((b) => `- ${b.label}: ${b.count}`))
  if (!authz.allowed) response.blocks.limitations.push(authz.reason)
  response.blocks.limitations.push(...result.limitations)
  state.ctx = { ...state.ctx, lastActions: [], lastEntity: null }
  return { response, audit: { status: result.status, entity: 'aggregate', scope: request.scope, total: result.totals.total } }
}

async function handleRisk(state: TurnState) {
  const scope = wideOrPersonal(state.actor)
  const base = { entity: 'actions' as const, scope, visual: 'none' as const }
  const okrAuthz = authorizeQuery(state.actor, { entity: 'okrs' })
  const [overdue, blocked, okrs] = await Promise.all([
    queryActions(state.actor.copilot, { ...base, statusGroup: 'overdue' }, state.dispatch),
    queryActions(state.actor.copilot, { ...base, statusGroup: 'blocked' }, state.dispatch),
    okrAuthz.allowed ? queryOkrs(state.actor.copilot, { entity: 'okrs' }, state.dispatch) : Promise.resolve(null),
  ])
  const statuses: QueryStatus[] = [overdue.status, blocked.status, okrs?.status ?? 'forbidden']
  const hasData = statuses.some((s) => s === 'ok' || s === 'partial' || s === 'empty')
  const status: QueryStatus = !hasData
    ? statuses.includes('error') ? 'error' : 'forbidden'
    : statuses.every((s) => s === 'ok' || s === 'empty') ? 'ok' : 'partial'
  const response = baseResponse(status, overdue.asOf)
  const label = scopeLabel(scope)

  if (overdue.status === 'ok' || overdue.status === 'partial' || overdue.status === 'empty') {
    response.blocks.data.push(`Acciones vencidas (${label}): ${overdue.totals.total}.`)
  } else response.blocks.limitations.push(statusMessage(overdue.status, 'acciones vencidas'))
  if (blocked.status === 'ok' || blocked.status === 'partial' || blocked.status === 'empty') {
    response.blocks.data.push(`Acciones bloqueadas: ${blocked.totals.total}.`)
    for (const item of blocked.items.slice(0, 3)) response.blocks.data.push(actionLine(item, state.today))
  } else response.blocks.limitations.push(statusMessage(blocked.status, 'acciones bloqueadas'))

  const lagging = okrs && (okrs.status === 'ok' || okrs.status === 'partial')
    ? okrs.items.filter((o) => o.progress != null && o.progress < 40)
    : []
  if (okrs && (okrs.status === 'ok' || okrs.status === 'partial')) {
    response.blocks.data.push(`Objetivos con avance menor a 40%: ${lagging.length} de ${okrs.totals.total}.`)
    const unmeasured = okrs.items.reduce((sum, o) => sum + o.insufficientKrs, 0)
    if (unmeasured) response.blocks.data.push(`KR sin datos para medir: ${unmeasured}.`)
  } else {
    response.blocks.limitations.push(okrs ? statusMessage(okrs.status, 'OKRs') : 'Sin acceso a OKRs: el análisis sólo usa acciones.')
  }

  if (overdue.totals.total || blocked.totals.total || lagging.length) {
    response.blocks.interpretation.push(
      'Inferencia, no dato del sistema: los atrasos y bloqueos son las señales de riesgo disponibles. Las acciones no están vinculadas a cada objetivo en los datos consultados, así que la relación con OKRs específicos no está comprobada.'
    )
  }
  if (blocked.totals.total) response.blocks.recommendation.push('Desbloquea primero las acciones bloqueadas y confirma responsables.')
  else if (overdue.totals.total) response.blocks.recommendation.push('Reprograma o cierra las vencidas con su responsable.')
  response.blocks.limitations.push(...overdue.limitations, ...blocked.limitations, ...(okrs?.limitations ?? []))
  state.ctx = { ...state.ctx, lastActions: blocked.items.length ? toReferencedActions(blocked.items) : state.ctx.lastActions }
  return { response, audit: { status, entity: 'combined', scope } }
}

async function handleUnsupportedMetric(state: TurnState) {
  const scope = wideOrPersonal(state.actor)
  const overdue = await queryActions(
    state.actor.copilot,
    { entity: 'actions', scope, statusGroup: 'overdue', visual: 'none' },
    state.dispatch
  )
  const domain = UNAVAILABLE_DOMAINS.find((d) => d.id === 'finance')!
  const response = baseResponse('partial', overdue.asOf)
  response.blocks.limitations.push(
    `No tengo ${domain.label} en las fuentes autorizadas, así que no calculo ni estimo montos.`
  )
  if (overdue.status === 'ok' || overdue.status === 'partial' || overdue.status === 'empty') {
    response.blocks.data.push(`Lo que sí puedo medir: ${overdue.totals.total} acción(es) vencida(s) en ${scopeLabel(scope)}.`)
  }
  response.blocks.recommendation.push('Si se registra un costo por acción o por día de atraso, el cálculo sería verificable.')
  return { response, audit: { status: 'partial' as const, entity: 'actions', scope, total: overdue.totals.total } }
}

function handleWriteRequest(state: TurnState, intent: Extract<AgentIntent, { kind: 'write_request' }>) {
  const auth = authorizeOperation(state.actor, 'propose_write')
  if (!auth.allowed) {
    return { response: forbidden(auth.reason), audit: { status: 'denied_precheck' as const, entity: 'actions' } }
  }
  const response = baseResponse('proposal')
  if (intent.operation === 'create_action') {
    const draft = draftFromRequest(intent.request)
    const blockedRefs = state.ctx.lastActions.filter((a) => a.estado === 'Bloqueado')
    const mentionsBlocker = /bloque/i.test(intent.request)
    const origen = mentionsBlocker && blockedRefs.length === 1 ? blockedRefs[0]! : null
    const due = parseDueDateHint(intent.request, state.today)
    const proposed = proposeAction(state.actor, 'create_action', {
      titulo: draft.title || intent.request.slice(0, 70),
      responsableId: null,
      fecha: due.dateYmd,
      origenAccionId: origen?.id ?? null,
    })
    if (!proposed.ok) return { response: forbidden(proposed.reason), audit: { status: 'denied_precheck' as const, entity: 'actions' } }
    response.blocks.data.push(`Propuesta identificada: crear la acción «${proposed.proposal.payload.titulo}».`)
    if (origen) response.blocks.data.push(`Relacionada con la acción bloqueada «${origen.title}».`)
    else if (mentionsBlocker && blockedRefs.length > 1) response.blocks.data.push('Hay varias acciones bloqueadas en la consulta; falta indicar cuál.')
    if (proposed.proposal.missing.length) {
      response.blocks.data.push(`Faltaría: ${proposed.proposal.missing.join(', ')}.`)
    }
    response.blocks.limitations.push('La ejecución todavía no está habilitada en R1: no se creó ninguna acción.')
    return { response, proposal: proposed.proposal as ActionProposal, audit: { status: 'proposal_blocked' as const, entity: 'actions' } }
  }
  const target = state.ctx.lastEntity?.kind === 'action' ? state.ctx.lastEntity : null
  response.blocks.data.push(
    target ? `Propuesta identificada: actualizar «${target.label}».` : 'Propuesta identificada: actualizar una acción (falta indicar cuál).'
  )
  response.blocks.limitations.push('La ejecución todavía no está habilitada en R1: no se modificó nada.')
  return { response, audit: { status: 'proposal_blocked' as const, entity: 'actions' } }
}

export async function runAgentTurn(
  input: { actor: AgentActor; utterance: string },
  deps: AgentTurnDeps
): Promise<AgentTurnResult> {
  const now = deps.now ?? (() => Date.now())
  const trace: AgentTurnResult['trace'] = []
  let mark = now()
  const stage = (name: AgentStage) => {
    const t = now()
    trace.push({ stage: name, ms: t - mark })
    mark = t
  }
  const started = mark

  const { actor } = input
  if (actor.roleClass === 'inactive') {
    stage('identity')
    return {
      handled: true,
      intent: 'unknown',
      response: forbidden('Tu usuario está inactivo.'),
      toolsUsed: [],
      trace,
    }
  }
  stage('identity')

  const key = sessionContextKey(actor)
  const fingerprint = capabilityFingerprint(actor.capabilities)
  let stored = await deps.store.get(key, now())
  // Cambio de permisos (área, rol, módulos, activación): el contexto previo no se reutiliza.
  if (stored?.fingerprint && stored.fingerprint !== fingerprint) {
    await deps.store.clear(key)
    stored = null
  }
  const ctx = stored ?? emptySessionContext(now())
  const intent = classifyAgentIntent(input.utterance, ctx.activeQuery)
  stage('intent')

  if (intent.kind === 'unknown') {
    return { handled: false, intent: 'unknown', response: baseResponse('empty'), toolsUsed: [], trace }
  }

  const tools: string[] = []
  const state: TurnState = {
    actor,
    ctx,
    today: (deps.today ?? todayWallClockCDMX)(),
    tools,
    dispatch: async (a, name, args) => {
      tools.push(name)
      return deps.dispatch(a, name, args) as Promise<CopilotToolResult>
    },
  }
  if (needsReferenceRehydration(state.ctx)) await rehydrateReferences(state)
  stage('context')

  let outcome: {
    response: AgentResponse
    clarification?: CopilotClarification
    proposal?: ActionProposal
    audit: Partial<QueryAuditEntry>
  }
  switch (intent.kind) {
    case 'query_actions':
      outcome = await handleQueryActions(state, intent)
      break
    case 'who_most_urgent':
      outcome = await handleWhoMostUrgent(state)
      break
    case 'query_okrs':
      outcome = await handleOkrs(state, intent)
      break
    case 'aggregate_execution':
      outcome = await handleAggregate(state, intent)
      break
    case 'analyze_risk':
      outcome = await handleRisk(state)
      break
    case 'unsupported_metric':
      outcome = await handleUnsupportedMetric(state)
      break
    case 'write_request':
      outcome = handleWriteRequest(state, intent)
      break
    case 'clarify': {
      const response = baseResponse('clarification')
      response.blocks.data.push(intent.question)
      outcome = { response, audit: { status: 'clarification' } }
      break
    }
  }
  stage('query_interpret')

  await deps.store.set(
    key,
    { activeQuery: state.ctx.activeQuery, lastActions: state.ctx.lastActions, lastEntity: state.ctx.lastEntity, fingerprint },
    now()
  )

  if (deps.audit) {
    try {
      await deps.audit({
        usuarioId: actor.usuarioId,
        channel: actor.channel,
        intent: intent.kind,
        entity: outcome.audit.entity ?? 'none',
        scope: outcome.audit.scope ?? (isPersonalActionScope(state.ctx.activeQuery?.scope ?? 'assigned_to_me') ? 'personal' : 'wide'),
        status: outcome.audit.status ?? outcome.response.status as QueryAuditEntry['status'],
        total: outcome.audit.total ?? null,
        durationMs: now() - started,
      })
    } catch {
      /* auditoría best-effort: no bloquea la respuesta */
    }
  }
  stage('respond')

  return {
    handled: true,
    intent: intent.kind,
    response: outcome.response,
    clarification: outcome.clarification,
    proposal: outcome.proposal,
    toolsUsed: tools,
    trace,
  }
}
