import { readPreparedActionState, formatPreparedActionState } from './preparedActionState.js'
import { prepareContextualExecution, revokeContextualExecution } from './communicationExecution.js'
import { extractResponsablePatch } from './structuredActionDraft.js'
/**
 * Orquestador compartido del agente (CV-05):
 * identidad → intención → contexto → autorización → consulta → interpretación → respuesta.
 * Los canales sólo adaptan formato. Si la intención es 'unknown' devuelve handled=false
 * y el canal continúa con su flujo LLM existente.
 */
import type {
  CopilotClarification,
  CopilotProposal,
  CopilotToolResult,
} from '../../../src/features/ai-support/copilot/types.js'
import { parseDueDateHint } from '../../../src/features/ai-support/parseWorkFacts.js'
import { todayWallClockCDMX } from '../../../src/lib/dateUtils.js'
import { buildActiveQueryEntry, isPersonalActionScope } from '../actionQueryContract.js'
import { proposeAction, type ActionProposal } from '../actions/contracts.js'
import { resolveR2ExecutionMode } from '../actions/executionMode.js'
import { proposeR2Operation } from '../actions/r2Runtime.js'
import { authorizeOperation, authorizeQuery } from '../query/authorizeQuery.js'
import type {
  ActionItem,
  ActionsQueryRequest,
  AggregateQueryRequest,
  InitiativeItem,
  OkrItem,
  QueryResult,
  QueryStatus,
} from '../query/contracts.js'
import {
  okrBehindPace,
  queryActions,
  queryAggregate,
  queryInitiatives,
  queryOkrs,
  type ToolDispatcher,
} from '../query/index.js'
import type { QueryAuditEntry, QueryAuditSink } from '../query/queryAudit.js'
import type { AgentActor } from '../query/resolveActor.js'
import { UNAVAILABLE_DOMAINS } from '../query/sourceCatalog.js'
import {
  coerceResponseFormat,
  emptyFacts,
  FORMAT_LABEL,
  isResponseFormat,
  type AnswerFacts,
  type AnswerFinding,
  type AnswerItem,
  type AnswerMetric,
  type ResolvedFormat,
  type ResponseFormat,
} from './answerContract.js'
import { classifyAgentIntent, type AgentIntent } from './intent.js'
import {
  buildCompoundOperationPlan,
  formatCompoundOperationPlan,
  type CompoundOperationPlan,
} from './multiIntent.js'
import {
  applyCommunicationEdit,
  formatCommunicationProposalText,
  composeContextualCommunication,
  type PendingCommunicationProposal,
} from './communicationComposer.js'
import { TurnTimer, type TurnTelemetry } from './turnTelemetry.js'
import {
  applyDraftPatch,
  emptyStructuredDraft,
  extractActionPatch,
  formatStructuredActionDraft,
  loadEntityCatalogFromActor,
  resolveDraftEntities,
  type EntityResolutionCatalog,
} from './structuredActionDraft.js'
import {
  buildExecutiveDiagnosis,
  DISCIPLINE_THRESHOLDS,
  executiveComparisonItems,
  executiveFindings,
  executiveMetrics,
  executivePriorityItems,
} from './executiveDiagnosis.js'
import {
  buildDraftCommitmentsFromDiagnosis,
  buildPendingTopicsFromDiagnosis,
  createExecutiveSession,
  nextExecutiveStage,
  previousExecutiveStage,
  STAGE_METADATA,
} from './executiveSession.js'
import { FORMAT_DESCRIPTION, parseFormatDirective, resolveFormat } from './responseFormat.js'
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
  type ReferencedAction,
  type SessionContext,
  type SessionContextStore,
} from './sessionContext.js'
import { capabilityFingerprint } from '../query/actorCapabilities.js'
import { isAgentMemoryEnabled } from '../memory/flag.js'
import type { MemoryStore } from '../memory/store.js'

/** authz se evalúa dentro de cada handler, antes de consultar; query_interpret incluye ambas fases. */
export type AgentStage = 'identity' | 'intent' | 'context' | 'query_interpret' | 'respond'

export type AgentTurnDeps = {
  dispatch: ToolDispatcher
  store: SessionContextStore
  audit?: QueryAuditSink
  now?: () => number
  today?: () => string
  /** POC R3: almacén de memoria/documentos (harness local). Ausente = sin recall. */
  memoryStore?: MemoryStore
  /** Catálogo opcional de entidades (usuarios/tableros) para resolución determinista en pruebas. */
  entityCatalog?: EntityResolutionCatalog
}

function looksLikeMemoryAsk(text: string) {
  const n = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  return /\b(acordamos|acuerdo|procedimientos?|documentos?|documentacion|retomemos|ultima sesion|preferencia|politicas?|criterio|memoria|verificad\w*|cuando se considera|cuando se verifica)\b/.test(
    n
  )
}

function describeLiveCountChange(
  previous: SessionContext['lastTotals'] | null | undefined,
  live: { open: number; overdue: number; blocked: number }
): string | null {
  if (!previous) return null
  if (previous.open === live.open && previous.overdue === live.overdue && previous.blocked === live.blocked) {
    return null
  }
  return `El tablero ahora muestra ${live.open} abiertas, ${live.overdue} vencidas y ${live.blocked} bloqueadas (antes ${previous.open}/${previous.overdue}/${previous.blocked} en esta sesión) porque se consultó de nuevo con datos actuales.`
}

function rememberTotals(state: TurnState, live: { open: number; overdue: number; blocked: number }) {
  state.ctx.lastTotals = live
}

function attachMemoryRecall(
  response: AgentResponse,
  store: MemoryStore,
  actor: AgentActor,
  utterance: string,
  options?: { passive?: boolean }
): AgentResponse {
  const passive = options?.passive === true
  let recall
  try {
    recall = store.recall(
      {
        usuarioId: actor.usuarioId,
        canReadProject: actor.capabilities.readAllOkrs || actor.capabilities.readCrossAreaExecution,
        visibleAreaIds: [],
      },
      utterance
    )
  } catch (error) {
    recall = { ok: false as const, error: error instanceof Error ? error.message : 'memory_store_error' }
  }
  if (!recall.ok) {
    if (!passive) {
      response.blocks.limitations.push(
        'No pude consultar la memoria autorizada en este momento; respondo sólo con el tablero si aplica.'
      )
    }
    return response
  }
  if (recall.denied) {
    if (passive) return response
    response.blocks.data.push('No tienes acceso a ese conocimiento.')
    response.blocks.limitations.push('No se revelan títulos ni fragmentos fuera de tu alcance.')
    if (response.status === 'empty' || response.status === 'ok') response.status = 'forbidden'
    return response
  }
  if (recall.hits.length === 0) {
    if (!passive) {
      response.blocks.limitations.push('No encontré acuerdos o documentos confirmados para esa pregunta.')
    }
    return response
  }
  for (const hit of recall.hits) {
    const cite =
      hit.kind === 'document'
        ? `[Documentación R3] «${hit.title ?? hit.source_label}» v${hit.version}: ${hit.body.slice(0, 280)}`
        : `[Memoria R3] Acuerdo ${hit.id} (${hit.source_label} v${hit.version}): ${hit.body.slice(0, 280)}`
    response.blocks.data.push(cite)
    if (response.facts) {
      response.facts.findings.push({ basis: 'evidence', text: cite })
    }
  }
  const notice =
    'La memoria/documentos (R3) son contexto de referencia y no sustituyen el estado vivo de Kanban u OKRs; las cifras del tablero prevalecen.'
  response.blocks.limitations.push(notice)
  if (response.facts) response.facts.limitations.push(notice)
  return response
}

export type AgentTurnResult = {
  handled: boolean
  intent: AgentIntent['kind']
  response: AgentResponse
  clarification?: CopilotClarification
  proposal?: ActionProposal | CopilotProposal
  proposals?: CopilotProposal[]
  multiIntentPlan?: CompoundOperationPlan
  communicationProposal?: PendingCommunicationProposal
  batchId?: string
  /** Servidor: simulated|qa. Nunca lo decide el cliente. */
  executionEnabled?: boolean
  /** Formato aplicado (Automático ya resuelto) y el elegido por el usuario o la sesión. */
  format: ResolvedFormat
  formatSelected: ResponseFormat
  /** Automático con consulta ambigua: se invita a profundizar. */
  offerDetail: boolean
  /** Aviso corto (p. ej. cambio de formato) que antecede a la respuesta. */
  notice?: string
  toolsUsed: string[]
  trace: Array<{ stage: AgentStage; ms: number }>
  /** Telemetría real medida en este turno (sin latencias simuladas). */
  telemetry?: TurnTelemetry
}

type TurnState = {
  actor: AgentActor
  ctx: SessionContext
  today: string
  tools: string[]
  dispatch: ToolDispatcher
  entityCatalog?: EntityResolutionCatalog
}

const LIST_LIMIT = 5

function unwrap(data: unknown): Record<string, unknown> {
  if (!data || typeof data !== 'object') return {}
  const record = data as Record<string, unknown>
  const inner = record.payload
  return inner && typeof inner === 'object' ? (inner as Record<string, unknown>) : record
}

function actionFlags(item: ActionItem | ReferencedAction, today: string): string[] {
  const flags: string[] = []
  const rank = urgencyRank(item, today)
  if (rank === 0) flags.push('vencida')
  if (rank === 1) flags.push('bloqueada')
  if (item.fecha === today && rank > 1) flags.push('vence hoy')
  return flags
}

function actionItem(item: ActionItem | ReferencedAction, today: string): AnswerItem {
  return {
    kind: 'action',
    id: item.id,
    title: item.title,
    status: item.estado,
    date: item.fecha,
    owner: item.responsableNombre ?? null,
    priority: item.prioridad,
    flags: actionFlags(item, today),
    href: item.href,
  }
}

function okrItem(okr: OkrItem): AnswerItem {
  return {
    kind: 'okr',
    id: okr.id,
    title: okr.name,
    progress: okr.progress,
    withoutInitiatives: okr.withoutInitiatives,
    insufficientKrs: okr.insufficientKrs,
    krCount: okr.keyResults.length,
    href: '/okrs',
  }
}

/**
 * Adjunta el contrato tipado al terminar el handler: recomendaciones y limitaciones salen de los
 * mismos bloques ya redactados; las cifras, elementos y hallazgos los aportan los datos consultados.
 */
function withFacts(response: AgentResponse, extra: Partial<AnswerFacts>): AgentResponse {
  response.facts = {
    ...emptyFacts(),
    recommendations: [...response.blocks.recommendation],
    limitations: [...response.blocks.limitations],
    ...extra,
  }
  return response
}

function actionLine(item: ActionItem, today: string): string {
  const flags = actionFlags(item, today)
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
  intent: Extract<AgentIntent, { kind: 'query_actions' }>,
  utterance = ''
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
  } else if (state.ctx.lastEntity?.kind === 'person') {
    // Continuidad conversacional: «¿Cuáles están atrasados?» conserva a la persona del turno anterior.
    responsableId = state.ctx.lastEntity.id
    personLabel = state.ctx.lastEntity.label
  }

  const result = await queryActions(state.actor.copilot, { ...request, responsableId }, state.dispatch)
  const response = baseResponse(result.status, result.asOf)
  const subject = personLabel ? `acciones de ${personLabel}` : scopeLabel(result.scopeApplied)

  if (result.status === 'forbidden' || result.status === 'error') {
    response.blocks.data.push(statusMessage(result.status, subject, result.error?.message))
    return { response, audit: { status: result.status, entity: 'actions', scope: request.scope } }
  }

  const normUtterance = utterance
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
  const titleMatches = result.items.filter((item) => {
    const t = item.title.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
    return t.length >= 4 && normUtterance.includes(t)
  })
  let focusedItem = titleMatches.length === 1 ? titleMatches[0]! : null
  if (!focusedItem && state.actor.copilot?.supabase) {
    const namedMatch = utterance.match(/\b(?:mu[eé]strame|abre|ver|busca|consulta)\s+(?:la\s+)?acci[oó]n\s+([^\n?.!]{4,120})/i)
    const searchTerm = namedMatch?.[1]?.trim().replace(/[«»"']/g, '')
    if (searchTerm) {
      const { data: foundRows } = await state.actor.copilot.supabase
        .from('acciones_diarias')
        .select('id,titulo_accion,estado,fecha,prioridad,responsable,updated_at')
        .ilike('titulo_accion', `%${searchTerm}%`)
        .limit(2)
      const list = Array.isArray(foundRows) ? foundRows : []
      if (list.length === 1) {
        const row = list[0] as {
          id: string
          titulo_accion?: string | null
          estado?: string | null
          fecha?: string | null
          prioridad?: string | null
          responsable?: string | null
          updated_at?: string | null
        }
        focusedItem = {
          id: row.id,
          title: row.titulo_accion ?? searchTerm,
          estado: row.estado ?? null,
          fecha: row.fecha ?? null,
          hora: null,
          prioridad: row.prioridad ?? null,
          responsableId: row.responsable ?? null,
          responsableNombre: null,
          area: null,
          updatedAt: row.updated_at ?? null,
          href: `/kanban?accion=${row.id}`,
        }
      }
    }
  }

  if (result.status === 'empty' && !focusedItem) {
    if (intent.entityHint === 'proyectos') {
      const msg =
        'SCRUMBAN no cuenta con una entidad separada de proyectos (el trabajo se gestiona en acciones, iniciativas y objetivos) y actualmente no tienes acciones abiertas asignadas. Si lo deseas, puedo mostrarte las acciones del equipo o los objetivos corporativos.'
      response.blocks.data.push(msg)
      withFacts(response, { primary: { text: msg, value: 0 }, metrics: [{ id: 'total', label: 'Asignadas', value: 0 }] })
    } else {
      response.blocks.data.push(statusMessage('empty', subject))
    }
    rememberActions(state, request, result)
    return { response, audit: { status: 'empty', entity: 'actions', scope: request.scope, total: 0 } }
  }

  const effectiveItems = focusedItem ? [focusedItem] : result.items
  const ranked = focusedItem ? [focusedItem] : rankByUrgency(effectiveItems, state.today)
  const shown = ranked.slice(0, LIST_LIMIT)
  const verb = intent.statusGroup === 'overdue' ? 'vencidas' : intent.statusGroup === 'blocked' ? 'bloqueadas' : 'abiertas'
  const headline = `${result.totals.total} ${verb} en ${subject}.`
  response.blocks.data.push(headline)
  response.blocks.data.push(...shown.map((item) => actionLine(item, state.today)))
  response.references = shown.map((item) => ({ id: item.id, title: item.title, href: item.href }))

  const overdue = result.items.filter((i) => urgencyRank(i, state.today) === 0).length
  const blocked = result.items.filter((i) => urgencyRank(i, state.today) === 1).length
  const dueToday = result.items.filter((i) => i.fecha === state.today).length
  const liveTotals = {
    open: intent.statusGroup === 'open' ? result.totals.total : state.ctx.lastTotals?.open ?? result.totals.total,
    overdue: intent.statusGroup === 'overdue' ? result.totals.total : overdue,
    blocked: intent.statusGroup === 'blocked' ? result.totals.total : blocked,
  }
  const countChange = describeLiveCountChange(state.ctx.lastTotals, liveTotals)
  if (countChange) {
    response.blocks.interpretation.unshift(countChange)
    response.blocks.data.push(countChange)
  }
  rememberTotals(state, liveTotals)
  let finding: string | null = null
  if (overdue || blocked || (intent.focusToday && dueToday)) {
    const parts = [
      overdue ? `${overdue} vencida(s)` : '',
      blocked ? `${blocked} bloqueada(s)` : '',
      intent.focusToday ? `${dueToday} con fecha de hoy` : '',
    ].filter(Boolean)
    finding = `De las ${result.items.length} revisadas: ${parts.join(', ')}.`
    response.blocks.interpretation.push(`${finding} El orden prioriza vencidas, bloqueadas y prioridad alta.`)
  }
  if (shown[0] && urgencyRank(shown[0], state.today) <= 2) {
    response.blocks.recommendation.push(`Empieza por «${shown[0].title}».`)
  }
  response.blocks.limitations.push(...result.limitations)
  if (intent.entityHint === 'proyectos') {
    response.blocks.limitations.push(
      'SCRUMBAN organiza el trabajo en acciones, iniciativas y objetivos (sin catálogo separado de proyectos); se muestran tus acciones abiertas asignadas.'
    )
  }

  const reviewed = `de ${result.items.length} revisadas`
  const metrics: AnswerMetric[] = [{ id: 'total', label: `Acciones ${verb}`, value: result.totals.total, scope: subject }]
  if (overdue) metrics.push({ id: 'overdue', label: 'Vencidas', value: overdue, tone: 'danger', scope: reviewed })
  if (blocked) metrics.push({ id: 'blocked', label: 'Bloqueadas', value: blocked, tone: 'warning', scope: reviewed })
  if (intent.focusToday) metrics.push({ id: 'due_today', label: 'Vencen hoy', value: dueToday, scope: reviewed })
  withFacts(response, {
    primary: { text: headline, value: result.totals.total },
    metrics,
    items: shown.map((item) => actionItem(item, state.today)),
    findings: finding ? [{ text: finding, basis: 'evidence', risk: overdue > 0 || blocked > 0 }] : [],
    warnings: [...result.limitations, ...(result.status === 'partial' ? [statusMessage('partial', subject)] : [])],
    limitations: [...response.blocks.limitations, ...(result.status === 'partial' ? [statusMessage('partial', subject)] : [])],
  })
  rememberActions(state, { ...request }, result)
  if (focusedItem) {
    state.ctx.lastEntity = { kind: 'action', id: focusedItem.id, label: focusedItem.title }
    if (!state.ctx.lastActions.some((a) => a.id === focusedItem.id)) {
      state.ctx.lastActions = [
        {
          id: focusedItem.id,
          title: focusedItem.title,
          estado: focusedItem.estado,
          fecha: focusedItem.fecha,
          prioridad: focusedItem.prioridad,
          responsableId: focusedItem.responsableId,
          responsableNombre: focusedItem.responsableNombre,
          href: focusedItem.href,
        },
        ...state.ctx.lastActions,
      ]
    }
  }
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
  const response = baseResponse('ok', new Date().toISOString())
  response.blocks.data.push(
    `La más urgente es «${action.title}» (${action.estado ?? 'sin estado'}, ${action.fecha ?? 'sin fecha'}).`,
    action.responsableNombre
      ? `Responsable: ${action.responsableNombre}.`
      : 'Responsable: no disponible en tu alcance de lectura.'
  )
  response.blocks.interpretation.push('Urgencia calculada por: vencida > bloqueada > prioridad alta > vence hoy > fecha.')
  if (urgencyRank(action, state.today) <= 2) response.blocks.recommendation.push(`Empieza por «${action.title}».`)
  const flags = actionFlags(action, state.today)
  withFacts(response, {
    primary: { text: response.blocks.data.join(' ') },
    items: [actionItem(action, state.today)],
    findings: flags.length ? [{ text: `Está ${flags.join(' y ')}.`, basis: 'evidence', risk: flags.includes('vencida') || flags.includes('bloqueada') }] : [],
    limitations: [...response.blocks.limitations],
  })
  response.references = [{ id: action.id, title: action.title, href: action.href }]
  state.ctx = { ...state.ctx, lastEntity: { kind: 'action', id: action.id, label: action.title } }
  return { response, audit: { status: 'ok' as const, entity: 'actions', total: 1 } }
}

async function handleRecommendNext(state: TurnState) {
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
  const focused =
    state.ctx.lastEntity?.kind === 'action'
      ? state.ctx.lastActions.find((item) => item.id === state.ctx.lastEntity!.id) ?? null
      : null
  const pick = focused
    ? ({ kind: 'one' as const, action: focused })
    : pickMostUrgent(state.ctx.lastActions, state.today)
  if (pick.kind === 'none') {
    const response = baseResponse('empty')
    response.blocks.data.push('No hay acciones en la consulta actual para recomendar un siguiente paso.')
    return { response, audit: { status: 'empty' as const, entity: 'actions' } }
  }
  if (pick.kind === 'ambiguous') {
    const response = baseResponse('clarification')
    response.blocks.data.push(pick.clarification.question)
    return { response, clarification: pick.clarification, audit: { status: 'clarification' as const, entity: 'actions' } }
  }
  const action = pick.action
  const flags = actionFlags(action, state.today)
  const why = flags.includes('vencida')
    ? 'está vencida'
    : flags.includes('bloqueada')
      ? 'está bloqueada'
      : action.prioridad?.startsWith('P1')
        ? 'es prioridad alta'
        : flags.includes('vence hoy')
          ? 'vence hoy'
          : 'es la más urgente del conjunto'
  const response = baseResponse('ok', new Date().toISOString())
  response.blocks.data.push(`Siguiente paso: atiende «${action.title}» (${action.id}): ${why}.`)
  if (action.responsableNombre) response.blocks.data.push(`Responsable: ${action.responsableNombre}.`)
  response.blocks.recommendation.push(`Empieza por «${action.title}»; no se inventaron identificadores fuera del tablero.`)
  response.blocks.interpretation.push('Recomendación por: vencida > bloqueada > prioridad alta > vence hoy > fecha.')
  withFacts(response, {
    primary: { text: response.blocks.data.join(' ') },
    items: [actionItem(action, state.today)],
    findings: flags.length
      ? [{ text: `Está ${flags.join(' y ')}.`, basis: 'evidence', risk: flags.includes('vencida') || flags.includes('bloqueada') }]
      : [],
    limitations: [...response.blocks.limitations],
  })
  response.references = [{ id: action.id, title: action.title, href: action.href }]
  state.ctx = { ...state.ctx, lastEntity: { kind: 'action', id: action.id, label: action.title } }
  return { response, audit: { status: 'ok' as const, entity: 'actions', total: 1 } }
}

function initiativeAnswerItem(item: InitiativeItem): AnswerItem {
  return {
    kind: 'action',
    id: item.id,
    title: item.title,
    status: item.estado ?? null,
    date: item.fecha ?? null,
    owner: item.responsableNombre ?? null,
    priority: null,
    flags: item.okrNombre ? [`OKR: ${item.okrNombre}`] : [],
    href: item.href ?? '/okrs',
  }
}

function initiativeLine(item: InitiativeItem): string {
  const meta = [
    item.estado,
    item.fecha,
    item.responsableNombre ? `resp. ${item.responsableNombre}` : null,
    item.okrNombre ? `OKR: ${item.okrNombre}` : null,
  ].filter(Boolean)
  return `- ${item.title}${meta.length ? ` (${meta.join(' · ')})` : ''}`
}

async function handleInitiatives(state: TurnState, intent: Extract<AgentIntent, { kind: 'query_initiatives' }>) {
  const authz = authorizeQuery(state.actor, { entity: 'okrs', period: 'all_active' })
  if (!authz.allowed) {
    return { response: forbidden(authz.reason), audit: { status: 'denied_precheck' as const, entity: 'okrs' } }
  }
  const result = await queryInitiatives(state.actor.copilot, state.dispatch)
  if (result.status === 'forbidden' || result.status === 'error') {
    const response = baseResponse(result.status, result.asOf)
    response.blocks.data.push(statusMessage(result.status, 'las iniciativas', result.error?.message))
    return { response, audit: { status: result.status, entity: 'okrs' } }
  }

  const allItems = result.items

  if (intent.askOwner) {
    const lastId = state.ctx.lastEntity?.id
    const lastLabel = state.ctx.lastEntity?.label?.toLowerCase()
    const matched =
      (lastId ? allItems.find((i) => i.id === lastId || i.actionId === lastId) : undefined) ??
      (lastLabel ? allItems.find((i) => i.title.toLowerCase() === lastLabel) : undefined) ??
      (allItems.length === 1 ? allItems[0] : undefined)

    if (!matched) {
      const response = baseResponse('clarification', result.asOf)
      const msg =
        allItems.length === 0
          ? 'No encontré iniciativas registradas en el alcance actual para identificar un responsable.'
          : 'No tengo identificada una iniciativa específica en este hilo. Indica el nombre de la iniciativa para consultar su responsable real.'
      response.blocks.data.push(msg)
      withFacts(response, { primary: { text: msg }, items: [] })
      return { response, audit: { status: 'clarification' as const, entity: 'okrs', total: allItems.length } }
    }

    const response = baseResponse('ok', result.asOf)
    const msg = matched.responsableNombre
      ? `El responsable de la iniciativa «${matched.title}» es ${matched.responsableNombre}.`
      : `La iniciativa «${matched.title}» no tiene un responsable asignado actualmente.`
    response.blocks.data.push(msg)
    withFacts(response, {
      primary: { text: msg },
      items: [initiativeAnswerItem(matched)],
    })
    response.references = [{ id: matched.id, title: matched.title, href: matched.href ?? '/okrs' }]
    state.ctx = { ...state.ctx, lastEntity: { kind: 'action', id: matched.actionId ?? matched.id, label: matched.title } }
    return { response, audit: { status: 'ok' as const, entity: 'okrs', total: 1 } }
  }

  // Separación estricta de alcance solicitado vs permisos:
  // super_admin / Dirección pueden ver la organización, pero si piden alcance personal
  // ("mis iniciativas", "tengo asignadas") JAMÁS se amplía automáticamente a la empresa.
  const userId = state.actor.copilot.usuarioId
  const canSeeTeam =
    state.actor.capabilities.readCrossAreaExecution ||
    state.actor.rol === 'Líder' ||
    state.actor.rol === 'Dirección' ||
    state.actor.rol === 'Super Admin'
  const scoped =
    intent.scope === 'personal'
      ? allItems.filter((i) => Boolean(i.responsableId) && i.responsableId === userId)
      : intent.scope === 'team'
        ? canSeeTeam
          ? allItems.filter((i) => i.responsableId === userId || Boolean(i.teamActionId))
          : allItems.filter((i) => Boolean(i.responsableId) && i.responsableId === userId)
        : allItems

  const filtered = intent.activeOnly ? scoped.filter((i) => i.active) : scoped

  if (filtered.length === 0) {
    const response = baseResponse('empty', result.asOf)
    const emptyMsg =
      intent.scope === 'personal'
        ? intent.activeOnly
          ? 'No tienes iniciativas activas asignadas actualmente. Si lo deseas, puedo mostrarte las iniciativas de la organización o los objetivos estratégicos corporativos.'
          : 'No tienes iniciativas asignadas actualmente. Si lo deseas, puedo mostrarte las iniciativas de la organización o los objetivos estratégicos corporativos.'
        : intent.scope === 'team'
          ? 'No hay iniciativas activas asignadas a tu equipo actualmente. Si lo deseas, puedo mostrarte las iniciativas de la organización o los objetivos estratégicos corporativos.'
          : 'No hay iniciativas activas registradas en la organización actualmente. Si lo deseas, puedo mostrarte los objetivos estratégicos corporativos.'
    response.blocks.data.push(emptyMsg)
    withFacts(response, {
      primary: { text: emptyMsg, value: 0 },
      metrics: [{ id: 'total', label: 'Iniciativas', value: 0 }],
      items: [],
    })
    return { response, audit: { status: 'empty' as const, entity: 'okrs', total: 0 } }
  }

  const response = baseResponse('ok', result.asOf)
  const scopeLabel =
    intent.scope === 'personal'
      ? 'asignadas a ti'
      : intent.scope === 'team'
        ? 'de tu equipo'
        : 'de la organización'
  const qualifier = intent.activeOnly ? 'activas ' : ''
  const headline = `${filtered.length} iniciativa(s) ${qualifier}${scopeLabel}.`
  const shown = filtered.slice(0, LIST_LIMIT)
  response.blocks.data.push(headline)
  response.blocks.data.push(...shown.map(initiativeLine))
  if (filtered.length > shown.length) {
    response.blocks.limitations.push(`Se muestran ${shown.length} de ${filtered.length} iniciativas.`)
  }
  response.references = shown.map((item) => ({ id: item.id, title: item.title, href: item.href ?? '/okrs' }))
  if (filtered.length === 1) {
    state.ctx = {
      ...state.ctx,
      lastEntity: { kind: 'action', id: filtered[0].actionId ?? filtered[0].id, label: filtered[0].title },
    }
  }
  withFacts(response, {
    primary: { text: headline, value: filtered.length },
    metrics: [{ id: 'total', label: 'Iniciativas', value: filtered.length, scope: scopeLabel }],
    items: shown.map(initiativeAnswerItem),
    limitations: [...response.blocks.limitations],
  })
  return { response, audit: { status: 'ok' as const, entity: 'okrs', total: filtered.length } }
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

  const personalScope = intent.scope === 'personal'
  const scopedItems = personalScope
    ? result.items.filter((o) => Boolean(o.ownerUserId) && o.ownerUserId === state.actor.copilot.usuarioId)
    : result.items
  const scopedTotal = personalScope ? scopedItems.length : result.totals.total

  if (personalScope && scopedItems.length === 0) {
    const emptyResponse = baseResponse('empty', result.asOf)
    const msg =
      'No tienes objetivos asignados directamente actualmente. Si lo deseas, puedo mostrarte los objetivos estratégicos corporativos.'
    emptyResponse.blocks.data.push(msg)
    withFacts(emptyResponse, {
      primary: { text: msg, value: 0 },
      metrics: [{ id: 'total', label: 'Objetivos asignados', value: 0 }],
      items: [],
    })
    return { response: emptyResponse, audit: { status: 'empty' as const, entity: 'okrs', total: 0 } }
  }

  const scopeSuffix = personalScope ? ' asignado(s) a ti' : ''
  response.blocks.data.push(`${scopedTotal} objetivo(s) activo(s)${scopeSuffix}.`)
  for (const okr of scopedItems.slice(0, LIST_LIMIT)) {
    response.blocks.data.push(
      `- ${okr.name}: ${okr.progress == null ? 'sin datos suficientes' : `${Math.round(okr.progress)}% de avance`}` +
        (okr.withoutInitiatives ? ' · sin iniciativas' : '')
    )
  }
  const lagging = scopedItems.filter((o) => okrBehindPace(o, state.today))
  const withoutPace = scopedItems.filter((o) => o.progress == null || (!o.pace && !o.startDate && !o.endDate))
  if (lagging.length) {
    response.blocks.interpretation.push(
      `${lagging.length} objetivo(s) bajo el ritmo esperado del periodo (avance vs tiempo transcurrido): ${lagging.map((o) => o.name).join(', ')}.`
    )
    response.blocks.recommendation.push('Revisa iniciativas y responsables de los objetivos que van bajo ritmo.')
  }
  if (withoutPace.length && !lagging.length) {
    response.blocks.limitations.push(
      `${withoutPace.length} objetivo(s) no tienen periodo o avance suficiente para evaluar ritmo; no se clasifican como riesgo.`
    )
  }
  if (intent.period === 'current_quarter') {
    response.blocks.limitations.push('Se usan los objetivos activos; el periodo exacto de cada uno está en el módulo OKRs.')
  }
  response.blocks.limitations.push(...result.limitations)
  const unmeasuredKrs = scopedItems.reduce((sum, o) => sum + o.insufficientKrs, 0)
  const okrMetrics: AnswerMetric[] = [{ id: 'total', label: 'Objetivos activos', value: scopedTotal }]
  okrMetrics.push({ id: 'lagging', label: 'Bajo ritmo del periodo', value: lagging.length, tone: lagging.length ? 'warning' : 'ok' })
  if (unmeasuredKrs) okrMetrics.push({ id: 'unmeasured_krs', label: 'KR sin datos', value: unmeasuredKrs, tone: 'warning' })
  withFacts(response, {
    primary: { text: `${scopedTotal} objetivo(s) activo(s)${scopeSuffix}.`, value: scopedTotal },
    metrics: okrMetrics,
    items: scopedItems.slice(0, LIST_LIMIT).map(okrItem),
    findings: lagging.length
      ? [{
          text: `${lagging.length} objetivo(s) bajo el ritmo esperado del periodo: ${lagging.map((o) => o.name).join(', ')}.`,
          basis: 'evidence',
          risk: true,
        }]
      : [],
    warnings: [...result.limitations],
    limitations: [...response.blocks.limitations],
  })
  return { response, audit: { status: result.status, entity: 'okrs', total: scopedTotal } }
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
  const headline = `${result.totals.total} ${subject} en ${scopeLabel(result.scopeApplied)}.`
  response.blocks.data.push(headline)
  response.blocks.data.push(...result.items.map((b) => `- ${b.label}: ${b.count}`))
  if (!authz.allowed) response.blocks.limitations.push(authz.reason)
  response.blocks.limitations.push(...result.limitations)
  const top = result.items.reduce<(typeof result.items)[number] | null>((best, b) => (!best || b.count > best.count ? b : best), null)
  withFacts(response, {
    primary: { text: headline, value: result.totals.total },
    metrics: [{ id: 'total', label: `Acciones ${STATUS_LABEL[intent.statusGroup]}`, value: result.totals.total, scope: scopeLabel(result.scopeApplied) }],
    items: result.items.map((b) => ({ kind: 'group' as const, id: `${intent.groupBy}:${b.label}`, title: b.label, count: b.count })),
    findings: top && result.items.length > 1
      ? [{
          text: `«${top.label}» concentra ${top.count} de ${result.totals.total}.`,
          basis: 'evidence',
          risk: intent.statusGroup !== 'open',
        }]
      : [],
    warnings: [...(authz.allowed ? [] : [authz.reason]), ...result.limitations],
  })
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
    ? okrs.items.filter((o) => okrBehindPace(o, state.today))
    : []
  if (okrs && (okrs.status === 'ok' || okrs.status === 'partial')) {
    response.blocks.data.push(`Objetivos bajo ritmo del periodo: ${lagging.length} de ${okrs.totals.total}.`)
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

  const okrOk = Boolean(okrs && (okrs.status === 'ok' || okrs.status === 'partial'))
  const overdueOk = overdue.status === 'ok' || overdue.status === 'partial' || overdue.status === 'empty'
  const blockedOk = blocked.status === 'ok' || blocked.status === 'partial' || blocked.status === 'empty'
  const metrics: AnswerMetric[] = []
  const summary: string[] = []
  if (overdueOk) {
    metrics.push({ id: 'overdue', label: 'Vencidas', value: overdue.totals.total, tone: overdue.totals.total ? 'danger' : 'ok', scope: label })
    summary.push(`${overdue.totals.total} vencida(s)`)
  }
  if (blockedOk) {
    metrics.push({ id: 'blocked', label: 'Bloqueadas', value: blocked.totals.total, tone: blocked.totals.total ? 'warning' : 'ok', scope: label })
    summary.push(`${blocked.totals.total} bloqueada(s)`)
  }
  if (okrOk && okrs) {
    metrics.push({ id: 'lagging_okrs', label: 'Objetivos bajo ritmo del periodo', value: lagging.length, tone: lagging.length ? 'warning' : 'ok', scope: `de ${okrs.totals.total}` })
    summary.push(`${lagging.length} de ${okrs.totals.total} objetivo(s) bajo ritmo del periodo`)
    const unmeasured = okrs.items.reduce((sum, o) => sum + o.insufficientKrs, 0)
    if (unmeasured) metrics.push({ id: 'unmeasured_krs', label: 'KR sin datos', value: unmeasured, tone: 'warning' })
  }
  const findings: AnswerFinding[] = []
  if (overdue.totals.total || blocked.totals.total || lagging.length) {
    findings.push({
      text: 'Los atrasos y bloqueos son las señales de riesgo disponibles; las acciones no están vinculadas a cada objetivo en los datos consultados, así que la relación con OKRs específicos no está comprobada.',
      basis: 'inference',
      risk: true,
    })
  }
  if (blocked.totals.total && lagging.length) {
    findings.push({
      text: 'Los bloqueos podrían estar frenando los objetivos rezagados. No comprobado: para confirmarlo hay que vincular cada acción bloqueada con su objetivo.',
      basis: 'hypothesis',
      risk: true,
    })
  }
  withFacts(response, {
    primary: summary.length ? { text: `${summary.join('; ')}.` } : null,
    metrics,
    items: [
      ...(blockedOk ? blocked.items.slice(0, 3).map((item) => actionItem(item, state.today)) : []),
      ...(okrOk && okrs ? lagging.slice(0, 3).map(okrItem) : []),
    ],
    findings,
    warnings: [...response.blocks.limitations],
  })
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
  const measured = overdue.status === 'ok' || overdue.status === 'partial' || overdue.status === 'empty'
  withFacts(response, {
    primary: measured ? { text: response.blocks.data[0]!, value: overdue.totals.total } : null,
    metrics: measured
      ? [{ id: 'overdue', label: 'Vencidas', value: overdue.totals.total, tone: overdue.totals.total ? 'danger' : 'ok', scope: scopeLabel(scope) }]
      : [],
    warnings: [...response.blocks.limitations],
  })
  return { response, audit: { status: 'partial' as const, entity: 'actions', scope, total: overdue.totals.total } }
}

async function handleExecutiveBrief(
  state: TurnState,
  intent: Extract<AgentIntent, { kind: 'executive_brief' }>
) {
  const boardReq: ActionsQueryRequest = {
    entity: 'actions',
    scope: 'board_authorized',
    statusGroup: 'open',
    visual: 'none',
    limit: 50,
  }
  const canSeeBoard =
    state.actor.capabilities.readCrossAreaExecution && authorizeQuery(state.actor, boardReq).allowed
  const scope = canSeeBoard ? 'board_authorized' : 'assigned_to_me'
  const openReq: ActionsQueryRequest = {
    entity: 'actions',
    scope,
    statusGroup: 'open',
    visual: 'none',
    limit: 50,
  }
  const authOpen = authorizeQuery(state.actor, openReq)
  if (!authOpen.allowed) {
    return { response: forbidden(authOpen.reason), audit: { status: 'denied_precheck' as const, entity: 'actions', scope } }
  }

  const openRes = await queryActions(state.actor.copilot, openReq, state.dispatch)
  if (openRes.status === 'forbidden') {
    return {
      response: forbidden(openRes.error?.message ?? 'No tienes acceso a las acciones solicitadas.'),
      audit: { status: 'forbidden' as const, entity: 'actions', scope },
    }
  }
  if (openRes.status === 'error') {
    const response = baseResponse('error')
    response.blocks.data.push(statusMessage('error', 'las acciones', openRes.error?.message))
    return { response, audit: { status: 'error' as const, entity: 'actions', scope } }
  }

  // Consultar acciones en Hecho pendientes de Verificado (best-effort)
  const pendingVerReq: ActionsQueryRequest = {
    entity: 'actions',
    scope,
    statusGroup: 'verification',
    visual: 'none',
    limit: 20,
  }
  const pendingVerRes = authorizeQuery(state.actor, pendingVerReq).allowed
    ? await queryActions(state.actor.copilot, pendingVerReq, state.dispatch)
    : null

  // Consultar OKRs solo si el actor tiene permiso (best-effort)
  const okrReq = { entity: 'okrs' as const, period: 'all_active' as const }
  const okrRes = authorizeQuery(state.actor, okrReq).allowed
    ? await queryOkrs(state.actor.copilot, okrReq, state.dispatch)
    : null

  const diagnosis = buildExecutiveDiagnosis({
    actions: openRes.items,
    pendingVerificationActions: pendingVerRes?.status === 'ok' ? pendingVerRes.items : [],
    okrs: okrRes?.status === 'ok' ? okrRes.items : null,
    today: state.today,
  })

  // Guardar las prioridades principales en contexto para permitir borrador de acción en el siguiente turno
  if (diagnosis.topPriorities.length > 0) {
    rememberActions(state, openReq, {
      ...openRes,
      items: diagnosis.topPriorities.map((p) => p.action),
    })
  } else {
    rememberActions(state, openReq, openRes)
  }

  const sLabel = scopeLabel(scope)
  const hasAnyData =
    diagnosis.counts.open > 0 ||
    diagnosis.counts.pendingVerification > 0 ||
    (diagnosis.okrSummary?.total ?? 0) > 0

  if (!hasAnyData) {
    const empty = baseResponse('empty', openRes.asOf)
    empty.blocks.data.push(
      `No hay acciones abiertas ni OKRs activos con datos suficientes en ${sLabel}.`
    )
    empty.blocks.recommendation.push(
      'Registra las prioridades del equipo con responsable y fecha compromiso para habilitar el diagnóstico ejecutivo.'
    )
    empty.blocks.limitations.push('No se inventan indicadores ni compromisos cuando el tablero está vacío.')
    return { response: empty, audit: { status: 'empty' as const, entity: 'actions', scope, total: 0 } }
  }

  const response = baseResponse(openRes.status === 'partial' ? 'partial' : 'ok', openRes.asOf)
  const summaryHeadline =
    intent.focus === 'priorities'
      ? `Top ${diagnosis.topPriorities.length} prioridades en ${sLabel}: ${diagnosis.counts.overdue} vencidas, ${diagnosis.counts.blocked} bloqueadas de ${diagnosis.counts.open} abiertas.`
      : intent.focus === 'recurrence'
        ? diagnosis.recurringPatterns.length > 0
          ? `Se detectaron ${diagnosis.recurringPatterns.length} patrón(es) repetitivos en ${sLabel} (${diagnosis.counts.overdue} vencidas, ${diagnosis.counts.blocked} bloqueadas).`
          : `No se detectan patrones de reincidencia en ${sLabel} con los datos actuales (${diagnosis.counts.open} abiertas).`
        : `Diagnóstico en ${sLabel}: ${diagnosis.counts.open} abiertas, ${diagnosis.counts.overdue} vencidas, ${diagnosis.counts.blocked} bloqueadas${diagnosis.counts.pendingVerification > 0 ? ` y ${diagnosis.counts.pendingVerification} en Hecho pendientes de Verificado` : ''}.`

  response.blocks.data.push(summaryHeadline)
  const liveTotals = {
    open: diagnosis.counts.open,
    overdue: diagnosis.counts.overdue,
    blocked: diagnosis.counts.blocked,
  }
  const countChange = describeLiveCountChange(state.ctx.lastTotals, liveTotals)
  if (countChange) {
    response.blocks.interpretation.unshift(countChange)
    response.blocks.data.push(countChange)
  }
  rememberTotals(state, liveTotals)
  response.references = diagnosis.topPriorities.map((p) => ({
    id: p.action.id,
    title: p.action.title,
    href: p.action.href,
  }))

  if (diagnosis.delayedByArea.length > 0) {
    const topAreas = diagnosis.delayedByArea
      .slice(0, 3)
      .map((a) => `${a.area}: ${a.delayed} vencidas / ${a.blocked} bloqueadas`)
      .join('; ')
    response.blocks.data.push(`Áreas con mayor retraso o bloqueo: ${topAreas}.`)
  }

  if (diagnosis.okrSummary && diagnosis.okrSummary.total > 0) {
    const avg = diagnosis.okrSummary.avgProgress !== null ? `${diagnosis.okrSummary.avgProgress}% promedio` : 'sin avance calculable'
    response.blocks.data.push(
      `Avance estratégico: ${diagnosis.okrSummary.total} OKR(s) activos (${avg}${diagnosis.okrSummary.atRisk.length > 0 ? `, ${diagnosis.okrSummary.atRisk.length} bajo ritmo del periodo` : ''}).`
    )
  }

  // Interpretación separada de hechos
  if (diagnosis.topPriorities.length > 0) {
    for (const [idx, p] of diagnosis.topPriorities.entries()) {
      response.blocks.interpretation.push(`Prioridad ${idx + 1}: ${p.what} ${p.why}`)
    }
  }
  if (diagnosis.recurringPatterns.length > 0) {
    response.blocks.interpretation.push(...diagnosis.recurringPatterns.slice(0, 2))
  }

  // Recomendaciones accionables (qué hacer + siguiente paso)
  if (diagnosis.topPriorities.length > 0) {
    const primary = diagnosis.topPriorities[0]!
    response.blocks.recommendation.push(
      `Qué recomiendo primero: ${primary.recommendation}`,
      `Siguiente paso: ${primary.nextStep} Puedes pedirme «Prepara un borrador de acción para…» (sin ejecutar hasta habilitar R2).`
    )
  } else if (diagnosis.counts.pendingVerification > 0) {
    response.blocks.recommendation.push(
      `Validar las ${diagnosis.counts.pendingVerification} acciones en Hecho para cerrar el ciclo operativo.`
    )
  }

  if (!canSeeBoard) {
    response.blocks.limitations.push('Alcance limitado por permiso a tus acciones asignadas; no incluye otros equipos.')
  }
  if (openRes.status === 'partial') {
    response.blocks.limitations.push(`El análisis cubre las primeras ${openRes.items.length} acciones de ${openRes.totals.total}.`)
  }
  if (diagnosis.counts.withoutDate > 0) {
    response.blocks.limitations.push(
      `${diagnosis.counts.withoutDate} acción(es) abiertas no tienen fecha compromiso; no se asume vencimiento.`
    )
  }

  withFacts(response, {
    primary: {
      value: diagnosis.counts.open,
      text: summaryHeadline,
    },
    metrics: executiveMetrics(diagnosis, sLabel),
    items: [
      ...executivePriorityItems(diagnosis.topPriorities),
      ...executiveComparisonItems(diagnosis),
    ],
    findings: [
      ...(countChange ? [{ basis: 'evidence' as const, text: countChange }] : []),
      ...executiveFindings(diagnosis),
    ],
    warnings: response.blocks.limitations.filter((l) => /limitado|sin fecha/i.test(l)),
  })

  return {
    response,
    audit: {
      status: openRes.status === 'partial' ? ('partial' as const) : ('ok' as const),
      entity: 'actions',
      scope,
      total: openRes.totals.total,
    },
  }
}

async function handleExecutiveCommitments(
  state: TurnState,
  intent: Extract<AgentIntent, { kind: 'executive_commitments' }>
) {
  const boardReq: ActionsQueryRequest = {
    entity: 'actions',
    scope: 'board_authorized',
    statusGroup: 'open',
    visual: 'none',
    limit: 50,
  }
  const personalRequested = intent.scope === 'personal'
  const canSeeBoard =
    !personalRequested &&
    state.actor.capabilities.readCrossAreaExecution &&
    authorizeQuery(state.actor, boardReq).allowed
  const scope = personalRequested ? 'assigned_to_me' : canSeeBoard ? 'board_authorized' : 'assigned_to_me'
  const openReq: ActionsQueryRequest = {
    entity: 'actions',
    scope,
    statusGroup: 'open',
    visual: 'none',
    limit: 50,
  }
  const authOpen = authorizeQuery(state.actor, openReq)
  if (!authOpen.allowed) {
    return { response: forbidden(authOpen.reason), audit: { status: 'denied_precheck' as const, entity: 'actions', scope } }
  }

  const openRes = await queryActions(state.actor.copilot, openReq, state.dispatch)
  if (openRes.status === 'forbidden') {
    return {
      response: forbidden(openRes.error?.message ?? 'No tienes acceso a esos compromisos.'),
      audit: { status: 'forbidden' as const, entity: 'actions', scope },
    }
  }
  if (openRes.status === 'error') {
    const response = baseResponse('error')
    response.blocks.data.push(statusMessage('error', 'los compromisos', openRes.error?.message))
    return { response, audit: { status: 'error' as const, entity: 'actions', scope } }
  }

  const pendingVerReq: ActionsQueryRequest = {
    entity: 'actions',
    scope,
    statusGroup: 'verification',
    visual: 'none',
    limit: 25,
  }
  const pendingVerRes = authorizeQuery(state.actor, pendingVerReq).allowed
    ? await queryActions(state.actor.copilot, pendingVerReq, state.dispatch)
    : null
  const pendingVerItems = pendingVerRes?.status === 'ok' ? pendingVerRes.items : []

  const diagnosis = buildExecutiveDiagnosis({
    actions: openRes.items,
    pendingVerificationActions: pendingVerItems,
    today: state.today,
  })

  const contextItems =
    intent.filter === 'verification'
      ? pendingVerItems
      : diagnosis.topPriorities.map((p) => p.action)
  rememberActions(state, openReq, {
    ...openRes,
    items: contextItems.length > 0 ? contextItems : openRes.items,
  })

  const sLabel = scopeLabel(scope)
  if (diagnosis.counts.open === 0 && diagnosis.counts.pendingVerification === 0) {
    const empty = baseResponse('empty', openRes.asOf)
    const emptyMsg = personalRequested
      ? 'No tienes compromisos pendientes asignados actualmente. Si lo deseas, puedo mostrarte los compromisos del equipo o del tablero completo.'
      : `No hay compromisos abiertos ni acciones pendientes de verificación en ${sLabel}.`
    empty.blocks.data.push(emptyMsg)
    withFacts(empty, { primary: { text: emptyMsg, value: 0 }, metrics: [{ id: 'total', label: 'Compromisos', value: 0 }] })
    return { response: empty, audit: { status: 'empty' as const, entity: 'actions', scope, total: 0 } }
  }

  const response = baseResponse(openRes.status === 'partial' ? 'partial' : 'ok', openRes.asOf)
  const headline =
    intent.filter === 'verification'
      ? `Hay ${diagnosis.counts.pendingVerification} acción(es) en Hecho pendientes de Verificado en ${sLabel}.`
      : `Seguimiento de compromisos en ${sLabel}: ${diagnosis.counts.overdue} vencidas, ${diagnosis.counts.pendingVerification} pendientes de Verificado y ${diagnosis.counts.open} abiertas en total.`

  response.blocks.data.push(headline)

  if (diagnosis.commitmentsByOwner.length > 0) {
    const ownerLines = diagnosis.commitmentsByOwner
      .slice(0, 5)
      .map(
        (o) =>
          `${o.owner}: ${o.overdue} vencidas, ${o.blocked} bloqueadas, ${o.pendingVerification} por verificar (${o.open} abiertas)`
      )
    response.blocks.data.push(`Compromisos por responsable: ${ownerLines.join(' · ')}.`)
  }

  if (diagnosis.counts.pendingVerification > 0) {
    response.blocks.interpretation.push(
      `Existen ${diagnosis.counts.pendingVerification} entrega(s) en Hecho que requieren validación humana para pasar a Verificado.`
    )
  }
  if (diagnosis.commitmentsByOwner[0] && diagnosis.commitmentsByOwner[0].overdue > 0) {
    const topOwner = diagnosis.commitmentsByOwner[0]
    response.blocks.interpretation.push(
      `${topOwner.owner} concentra la mayor carga vencida (${topOwner.overdue} vencidas).`
    )
    response.blocks.recommendation.push(
      `Revisar compromisos vencidos con ${topOwner.owner} y validar si requieren reprogramación o desbloqueo.`
    )
  } else if (diagnosis.counts.pendingVerification > 0) {
    response.blocks.recommendation.push(
      'Priorizar la verificación de las acciones en Hecho para mantener el tablero confiable.'
    )
  }

  if (!canSeeBoard) {
    response.blocks.limitations.push('Alcance limitado por permiso a tus compromisos asignados.')
  }

  const ownerComparison: AnswerItem[] = diagnosis.commitmentsByOwner.slice(0, 5).map((o) => ({
    kind: 'group',
    id: `owner:${o.owner}`,
    title: `${o.owner} (vencidas/por verificar)`,
    count: o.overdue + o.pendingVerification,
  }))
  const focusActions: AnswerItem[] =
    intent.filter === 'verification'
      ? pendingVerItems.slice(0, 5).map((a) => ({
          kind: 'action' as const,
          id: a.id,
          title: a.title,
          status: a.estado ?? 'Hecho',
          date: a.fecha ?? null,
          priority: a.prioridad ?? null,
          owner: a.responsableNombre ?? null,
          flags: ['pendiente de verificar'],
          href: a.href,
        }))
      : executivePriorityItems(diagnosis.topPriorities)

  withFacts(response, {
    primary: {
      value: diagnosis.counts.overdue + diagnosis.counts.pendingVerification,
      text: headline,
    },
    metrics: [
      { id: 'overdue', label: 'Vencidas', value: diagnosis.counts.overdue, tone: diagnosis.counts.overdue > 0 ? 'danger' : 'ok', scope: sLabel },
      {
        id: 'pending_verification',
        label: 'Pend. verificar',
        value: diagnosis.counts.pendingVerification,
        tone: diagnosis.counts.pendingVerification > 0 ? 'warning' : 'ok',
        scope: sLabel,
      },
      { id: 'open', label: 'Abiertas', value: diagnosis.counts.open, tone: 'neutral', scope: sLabel },
    ],
    items: [...focusActions, ...ownerComparison],
    findings: [
      ...diagnosis.commitmentsByOwner.slice(0, 3).map((o) => ({
        basis: 'evidence' as const,
        risk: o.overdue > 0 || o.blocked > 0,
        text: `${o.owner}: ${o.overdue} vencidas, ${o.blocked} bloqueadas, ${o.pendingVerification} por verificar.`,
      })),
    ],
    warnings: response.blocks.limitations,
  })

  return {
    response,
    audit: {
      status: openRes.status === 'partial' ? ('partial' as const) : ('ok' as const),
      entity: 'actions',
      scope,
      total: openRes.totals.total,
    },
  }
}

async function loadAuthorizedExecutiveData(state: TurnState) {
  const boardReq: ActionsQueryRequest = {
    entity: 'actions',
    scope: 'board_authorized',
    statusGroup: 'open',
    visual: 'none',
    limit: 50,
  }
  const canSeeBoard =
    state.actor.capabilities.readCrossAreaExecution && authorizeQuery(state.actor, boardReq).allowed
  const scope: ActionsQueryRequest['scope'] = canSeeBoard ? 'board_authorized' : 'assigned_to_me'
  const openReq: ActionsQueryRequest = {
    entity: 'actions',
    scope,
    statusGroup: 'open',
    visual: 'none',
    limit: 50,
  }
  const authOpen = authorizeQuery(state.actor, openReq)
  if (!authOpen.allowed) {
    return {
      ok: false as const,
      outcome: { response: forbidden(authOpen.reason), audit: { status: 'denied_precheck' as const, entity: 'actions' as const, scope } },
    }
  }
  const openRes = await queryActions(state.actor.copilot, openReq, state.dispatch)
  if (openRes.status === 'forbidden') {
    return {
      ok: false as const,
      outcome: {
        response: forbidden(openRes.error?.message ?? 'No tienes acceso a las acciones solicitadas.'),
        audit: { status: 'forbidden' as const, entity: 'actions' as const, scope },
      },
    }
  }
  if (openRes.status === 'error') {
    const response = baseResponse('error')
    response.blocks.data.push(statusMessage('error', 'las acciones', openRes.error?.message))
    return {
      ok: false as const,
      outcome: { response, audit: { status: 'error' as const, entity: 'actions' as const, scope } },
    }
  }

  const pendingVerReq: ActionsQueryRequest = {
    entity: 'actions',
    scope,
    statusGroup: 'verification',
    visual: 'none',
    limit: 25,
  }
  const pendingVerRes = authorizeQuery(state.actor, pendingVerReq).allowed
    ? await queryActions(state.actor.copilot, pendingVerReq, state.dispatch)
    : null
  const okrReq = { entity: 'okrs' as const, period: 'all_active' as const }
  const okrRes = authorizeQuery(state.actor, okrReq).allowed
    ? await queryOkrs(state.actor.copilot, okrReq, state.dispatch)
    : null

  const diagnosis = buildExecutiveDiagnosis({
    actions: openRes.items,
    pendingVerificationActions: pendingVerRes?.status === 'ok' ? pendingVerRes.items : [],
    okrs: okrRes?.status === 'ok' ? okrRes.items : null,
    today: state.today,
  })
  return { ok: true as const, canSeeBoard, scope, openReq, openRes, diagnosis }
}

async function handleExecutiveDiscipline(
  state: TurnState,
  intent: Extract<AgentIntent, { kind: 'executive_discipline' }>
) {
  const loaded = await loadAuthorizedExecutiveData(state)
  if (!loaded.ok) return loaded.outcome
  const { canSeeBoard, scope, openReq, openRes, diagnosis } = loaded
  const sLabel = scopeLabel(scope)

  const staleItems = diagnosis.discipline.staleActive.map((s) => s.action)
  const prolongedItems = diagnosis.discipline.prolongedBlocked.map((s) => s.action)
  const focusActions = [...staleItems, ...prolongedItems, ...diagnosis.discipline.withoutDate].filter(
    (item, idx, arr) => arr.findIndex((x) => x.id === item.id) === idx
  )

  rememberActions(state, openReq, {
    ...openRes,
    items: focusActions.length > 0 ? focusActions : diagnosis.topPriorities.map((p) => p.action),
  })

  if (diagnosis.counts.open === 0 && diagnosis.counts.pendingVerification === 0) {
    const empty = baseResponse('empty', openRes.asOf)
    empty.blocks.data.push(`No hay acciones abiertas ni señales de disciplina operativa en ${sLabel}.`)
    empty.blocks.limitations.push('No se inventan señales de seguimiento cuando no existen registros.')
    return { response: empty, audit: { status: 'empty' as const, entity: 'actions', scope, total: 0 } }
  }

  const response = baseResponse(openRes.status === 'partial' ? 'partial' : 'ok', openRes.asOf)
  const headline =
    intent.focus === 'stale'
      ? `Seguimiento en ${sLabel}: ${diagnosis.counts.staleActive} acción(es) activas con >= ${DISCIPLINE_THRESHOLDS.staleActiveDays} días sin actualización, ${diagnosis.counts.overdueNoFollowup} vencidas sin seguimiento y ${diagnosis.counts.prolongedBlocked} bloqueos prolongados.`
      : `Disciplina operativa en ${sLabel}: ${diagnosis.counts.staleActive} sin seguimiento reciente, ${diagnosis.counts.prolongedBlocked} bloqueos prolongados, ${diagnosis.counts.pendingVerification} en Hecho pendientes de Verificado y ${diagnosis.counts.withoutDate} sin fecha compromiso.`

  response.blocks.data.push(headline)

  const findings: AnswerFinding[] = []
  for (const s of diagnosis.discipline.staleActive.slice(0, 4)) {
    const evidenceNote = s.hasOperationalEvidence
      ? 'con evidencia cargada'
      : 'sin evidencia operativa cargada'
    findings.push({
      basis: 'evidence',
      risk: true,
      text: `«${s.action.title}» (${s.action.responsableNombre ?? 'sin responsable'} · ${s.action.area ?? 'sin área'}): ${s.daysSinceUpdate} días sin actualización (${evidenceNote}).`,
    })
  }
  for (const b of diagnosis.discipline.prolongedBlocked.slice(0, 3)) {
    findings.push({
      basis: 'evidence',
      risk: true,
      text: `Bloqueo prolongado: «${b.action.title}» lleva ${b.daysSinceUpdate} días bloqueada sin actualización.`,
    })
  }
  if (diagnosis.counts.pendingVerification > 0) {
    findings.push({
      basis: 'evidence',
      risk: true,
      text: `${diagnosis.counts.pendingVerification} acción(es) en Hecho siguen pendientes de Verificado.`,
    })
  }
  if (diagnosis.counts.withoutDate > 0) {
    findings.push({
      basis: 'evidence',
      text: `${diagnosis.counts.withoutDate} acción(es) abiertas no tienen fecha compromiso definida.`,
    })
  }
  findings.push({
    basis: 'inference',
    text: `Señal basada en última actualización registrada (umbral >= ${DISCIPLINE_THRESHOLDS.staleActiveDays}d); requiere validación operativa y no constituye incumplimiento confirmado.`,
  })

  response.blocks.interpretation.push(
    ...findings.filter((f) => f.basis === 'inference').map((f) => f.text)
  )
  response.blocks.recommendation.push(
    diagnosis.counts.overdueNoFollowup > 0
      ? `Priorizar contacto hoy sobre las ${diagnosis.counts.overdueNoFollowup} acciones vencidas sin seguimiento y confirmar estatus real.`
      : diagnosis.counts.staleActive > 0
        ? `Solicitar actualización breve con evidencia operativa en las ${diagnosis.counts.staleActive} acciones sin movimiento.`
        : 'La disciplina de seguimiento está al día; mantener ritmo semanal de verificación.'
  )
  response.blocks.recommendation.push(
    'Puedes pedirme «Muéstrame las acciones que sustentan esta recomendación» para ver enlaces directos o iniciar una revisión ejecutiva de 15 minutos.'
  )

  if (!canSeeBoard) {
    response.blocks.limitations.push('Alcance limitado por permiso a tus acciones asignadas.')
  }
  response.blocks.limitations.push(
    'La fecha updated_at refleja última modificación técnica en el registro; no existe historial verificable de reprogramaciones en esta consulta.'
  )

  const answerActions: AnswerItem[] = (
    focusActions.length > 0 ? focusActions.slice(0, 5) : diagnosis.topPriorities.map((p) => p.action)
  ).map((a) => ({
    kind: 'action' as const,
    id: a.id,
    title: a.title,
    status: a.estado ?? null,
    date: a.fecha ?? null,
    priority: a.prioridad ?? null,
    owner: a.responsableNombre ?? null,
    flags: [
      ...(a.estado === 'Bloqueado' ? ['bloqueada'] : []),
      ...(!a.fecha ? ['sin fecha'] : []),
      ...(a.updatedAt ? [`act. ${a.updatedAt.slice(0, 10)}`] : []),
    ],
    href: a.href,
  }))

  withFacts(response, {
    primary: { value: diagnosis.counts.staleActive + diagnosis.counts.prolongedBlocked, text: headline },
    metrics: [
      { id: 'stale', label: 'Sin seguimiento', value: diagnosis.counts.staleActive, tone: diagnosis.counts.staleActive > 0 ? 'warning' : 'ok', scope: sLabel },
      { id: 'prolonged_blocked', label: 'Bloqueo prolongado', value: diagnosis.counts.prolongedBlocked, tone: diagnosis.counts.prolongedBlocked > 0 ? 'danger' : 'ok', scope: sLabel },
      { id: 'pending_verification', label: 'Pend. verificar', value: diagnosis.counts.pendingVerification, tone: diagnosis.counts.pendingVerification > 0 ? 'warning' : 'ok', scope: sLabel },
      { id: 'without_date', label: 'Sin fecha', value: diagnosis.counts.withoutDate, tone: diagnosis.counts.withoutDate > 0 ? 'warning' : 'ok', scope: sLabel },
    ],
    items: [...answerActions, ...executiveComparisonItems(diagnosis)],
    findings,
    warnings: response.blocks.limitations,
  })

  return {
    response,
    audit: {
      status: openRes.status === 'partial' ? ('partial' as const) : ('ok' as const),
      entity: 'actions',
      scope,
      total: openRes.totals.total,
    },
  }
}

async function handleExecutivePreventive(state: TurnState) {
  const loaded = await loadAuthorizedExecutiveData(state)
  if (!loaded.ok) return loaded.outcome
  const { canSeeBoard, scope, openReq, openRes, diagnosis } = loaded
  const sLabel = scopeLabel(scope)

  const preventiveActionItems = [
    ...diagnosis.preventive.upcomingDue.map((u) => u.action),
    ...diagnosis.discipline.staleActive.map((s) => s.action),
    ...diagnosis.topPriorities.map((p) => p.action),
  ].filter((a, i, arr) => arr.findIndex((x) => x.id === a.id) === i)

  rememberActions(state, openReq, { ...openRes, items: preventiveActionItems.slice(0, 8) })

  if (diagnosis.counts.open === 0 && (diagnosis.okrSummary?.total ?? 0) === 0) {
    const empty = baseResponse('empty', openRes.asOf)
    empty.blocks.data.push(`No hay compromisos abiertos ni OKRs activos para evaluar riesgos preventivos en ${sLabel}.`)
    empty.blocks.limitations.push('No se generan predicciones sin evidencia operativa vigente.')
    return { response: empty, audit: { status: 'empty' as const, entity: 'actions', scope, total: 0 } }
  }

  const response = baseResponse(openRes.status === 'partial' ? 'partial' : 'ok', openRes.asOf)
  const headline = `Inteligencia preventiva (${sLabel}): ${diagnosis.currentProblems.length} problema(s) actual(es), ${diagnosis.preventiveRisks.length} riesgo(s) potencial(es) esta semana y ${diagnosis.improvementOpportunities.length} oportunidad(es) de mejora.`
  response.blocks.data.push(headline)

  const findings: AnswerFinding[] = [
    ...diagnosis.currentProblems.map((text) => ({
      basis: 'evidence' as const,
      risk: true,
      text: `[Problema actual] ${text}`,
    })),
    ...diagnosis.preventiveRisks.map((text) => ({
      basis: 'inference' as const,
      risk: true,
      text: `[Riesgo potencial] ${text}`,
    })),
    ...diagnosis.improvementOpportunities.map((text) => ({
      basis: 'evidence' as const,
      text: `[Oportunidad de mejora] ${text}`,
    })),
  ]

  response.blocks.interpretation.push(...diagnosis.preventiveRisks.slice(0, 3))
  response.blocks.recommendation.push(
    diagnosis.preventive.upcomingDue.length > 0
      ? `Asegurar avance hoy en los ${diagnosis.preventive.upcomingDue.length} compromiso(s) próximos a vencer (próximos ${DISCIPLINE_THRESHOLDS.upcomingDueDays} días) antes de que pasen a retraso.`
      : 'Atender bloqueos activos y confirmar fechas en acciones sin fecha para prevenir retrasos la próxima semana.'
  )
  response.blocks.recommendation.push(
    'Pide «Muéstrame las acciones que sustentan esta recomendación» para inspeccionar cada registro con enlace directo.'
  )

  if (!canSeeBoard) {
    response.blocks.limitations.push('Alcance limitado por permiso a tus acciones asignadas.')
  }
  response.blocks.limitations.push(
    'Los riesgos potenciales son señales preventivas basadas en fechas, carga y última actualización; no constituyen pronósticos no verificados.'
  )

  const items: AnswerItem[] = [
    ...diagnosis.preventive.upcomingDue.slice(0, 3).map((u) => ({
      kind: 'action' as const,
      id: u.action.id,
      title: u.action.title,
      status: u.action.estado ?? null,
      date: u.action.fecha ?? null,
      priority: u.action.prioridad ?? null,
      owner: u.action.responsableNombre ?? null,
      flags: [u.daysUntilDue === 0 ? 'vence hoy' : `vence en ${u.daysUntilDue}d`],
      href: u.action.href,
    })),
    ...executiveComparisonItems(diagnosis),
  ]

  withFacts(response, {
    primary: { value: diagnosis.preventiveRisks.length, text: headline },
    metrics: [
      { id: 'upcoming', label: 'Por vencer (5d)', value: diagnosis.counts.upcomingDue, tone: diagnosis.counts.upcomingDue > 0 ? 'warning' : 'ok', scope: sLabel },
      { id: 'stale', label: 'Sin seguimiento', value: diagnosis.counts.staleActive, tone: diagnosis.counts.staleActive > 0 ? 'warning' : 'ok', scope: sLabel },
      { id: 'blocked', label: 'Bloqueadas', value: diagnosis.counts.blocked, tone: diagnosis.counts.blocked > 0 ? 'danger' : 'ok', scope: sLabel },
      { id: 'current_problems', label: 'Problemas actuales', value: diagnosis.currentProblems.length, tone: diagnosis.currentProblems.length > 0 ? 'danger' : 'ok', scope: sLabel },
    ],
    items,
    findings,
    warnings: response.blocks.limitations,
  })

  return {
    response,
    audit: {
      status: openRes.status === 'partial' ? ('partial' as const) : ('ok' as const),
      entity: 'actions',
      scope,
      total: openRes.totals.total,
    },
  }
}

async function handleExecutiveEvidence(
  state: TurnState,
  intent: Extract<AgentIntent, { kind: 'executive_evidence' }>
) {
  let refs = state.ctx.lastActions
  let scope: ActionsQueryRequest['scope'] = state.ctx.activeQuery?.scope ?? 'board_authorized'

  if (refs.length === 0) {
    const loaded = await loadAuthorizedExecutiveData(state)
    if (!loaded.ok) return loaded.outcome
    scope = loaded.scope
    rememberActions(state, loaded.openReq, {
      ...loaded.openRes,
      items: loaded.diagnosis.topPriorities.map((p) => p.action),
    })
    refs = state.ctx.lastActions
  }

  if (refs.length === 0) {
    const empty = baseResponse('empty')
    empty.blocks.data.push('No hay acciones en el contexto actual ni abiertas en tu alcance para mostrar evidencia.')
    return { response: empty, audit: { status: 'empty' as const, entity: 'actions', scope, total: 0 } }
  }

  const selected =
    intent.priorityIndex !== undefined && refs[intent.priorityIndex]
      ? [refs[intent.priorityIndex]!]
      : refs.slice(0, 5)

  if (selected.length === 1) {
    state.ctx.lastEntity = { kind: 'action', id: selected[0]!.id, label: selected[0]!.title }
  }

  const response = baseResponse('ok')
  const headline =
    intent.priorityIndex !== undefined
      ? `Evidencia de la Prioridad ${intent.priorityIndex + 1}: «${selected[0]!.title}».`
      : `Evidencia trazable: ${selected.length} acción(es) autorizadas sustentan la recomendación anterior.`
  response.blocks.data.push(headline)
  response.references = selected.map((a) => ({ id: a.id, title: a.title, href: a.href }))

  const findings: AnswerFinding[] = selected.map((a) => ({
    basis: 'evidence' as const,
    risk: a.estado === 'Bloqueado' || a.estado === 'Retraso',
    text: `«${a.title}» · Estado: ${a.estado ?? 'sin estado'} · Fecha: ${a.fecha ?? 'sin fecha'} · Responsable: ${a.responsableNombre ?? 'sin asignar'}${a.area ? ` · Área: ${a.area}` : ''}${a.updatedAt ? ` · Últ. act.: ${a.updatedAt.slice(0, 10)}` : ''} · [Abrir en Kanban](${a.href})`,
  }))

  response.blocks.recommendation.push(
    selected.length === 1
      ? `Puedes abrir «${selected[0]!.title}» directo en Kanban o pedirme «Prepara un borrador de acción para destrabarla» (sin ejecutar hasta habilitar R2).`
      : 'Selecciona una prioridad (ej. «Profundiza en la prioridad 1») o abre cualquiera de las acciones directamente en Kanban.'
  )

  withFacts(response, {
    primary: { value: selected.length, text: headline },
    metrics: [
      { id: 'evidence_count', label: 'Acciones evidencia', value: selected.length, tone: 'neutral', scope: scopeLabel(scope) },
    ],
    items: selected.map((a) => ({
      kind: 'action' as const,
      id: a.id,
      title: a.title,
      status: a.estado ?? null,
      date: a.fecha ?? null,
      priority: a.prioridad ?? null,
      owner: a.responsableNombre ?? null,
      flags: [
        ...(a.estado === 'Bloqueado' ? ['bloqueada'] : []),
        ...(a.estado === 'Retraso' ? ['retraso'] : []),
      ],
      href: a.href,
    })),
    findings,
    warnings: [],
  })

  return {
    response,
    audit: { status: 'ok' as const, entity: 'actions', scope, total: selected.length },
  }
}

async function handleExecutiveReview(
  state: TurnState,
  intent: Extract<AgentIntent, { kind: 'executive_review' }>
) {
  const loaded = await loadAuthorizedExecutiveData(state)
  if (!loaded.ok) return loaded.outcome
  const { canSeeBoard, scope, openReq, openRes, diagnosis } = loaded
  const sLabel = scopeLabel(scope)

  rememberActions(state, openReq, {
    ...openRes,
    items: diagnosis.topPriorities.length > 0 ? diagnosis.topPriorities.map((p) => p.action) : openRes.items,
  })

  const session =
    state.ctx.executiveSession ?? createExecutiveSession(openRes.asOf ?? new Date().toISOString())

  if (intent.action === 'start') {
    session.stage = 'overview'
    session.focusedPriorityIndex = null
  } else if (intent.action === 'next') {
    session.stage = nextExecutiveStage(session.stage)
  } else if (intent.action === 'previous') {
    session.stage = previousExecutiveStage(session.stage)
  } else if (intent.action === 'skip') {
    if (!session.skippedStages.includes(session.stage)) session.skippedStages.push(session.stage)
    session.stage = nextExecutiveStage(session.stage)
  } else if (intent.action === 'focus_priority') {
    session.focusedPriorityIndex = intent.priorityIndex ?? 0
    session.stage = 'priorities'
  } else if (intent.action === 'record_decision' && intent.note) {
    session.decisions.push(intent.note)
    session.stage = 'decisions'
  } else if (intent.action === 'summary') {
    session.stage = 'summary'
  }

  if (session.draftCommitments.length === 0) {
    session.draftCommitments = buildDraftCommitmentsFromDiagnosis(diagnosis, state.today)
  }
  session.pendingTopics = buildPendingTopicsFromDiagnosis(diagnosis)
  state.ctx.executiveSession = session

  const meta = STAGE_METADATA[session.stage]
  const response = baseResponse(openRes.status === 'partial' ? 'partial' : 'ok', openRes.asOf)
  const liveTotals = {
    open: diagnosis.counts.open,
    overdue: diagnosis.counts.overdue,
    blocked: diagnosis.counts.blocked,
  }
  const countChange = describeLiveCountChange(state.ctx.lastTotals, liveTotals)
  rememberTotals(state, liveTotals)
  const headline = `Revisión ejecutiva (${meta.step}/6 · ${meta.label} · ~${meta.minutes} min): ${diagnosis.counts.open} abiertas, ${diagnosis.counts.overdue} vencidas, ${diagnosis.counts.blocked} bloqueadas en ${sLabel}.`
  response.blocks.data.push(headline)
  if (countChange) response.blocks.interpretation.push(countChange)

  const findings: AnswerFinding[] = []

  if (session.stage === 'summary') {
    if (session.decisions.length > 0) {
      for (const [i, dec] of session.decisions.entries()) {
        findings.push({ basis: 'evidence', text: `Decisión ${i + 1}: ${dec}` })
      }
    } else {
      findings.push({
        basis: 'evidence',
        text: 'Decisiones registradas en sesión: ninguna todavía (puedes decir «Decisión: ...» para agregarla).',
      })
    }
    for (const draft of session.draftCommitments) {
      findings.push({
        basis: 'inference',
        text: `Compromiso propuesto (borrador R2 OFF): «${draft.titulo}» · Responsable sugerido: ${draft.responsableSugerido} · Fecha propuesta: ${draft.fechaPropuesta ?? 'por definir'}.`,
      })
    }
    for (const topic of session.pendingTopics) {
      findings.push({ basis: 'evidence', risk: true, text: `Asunto pendiente: ${topic}` })
    }
    response.blocks.recommendation.push(
      'Todos los compromisos propuestos permanecen como borradores no persistidos mientras R2 siga desactivado. Valida responsables y fechas antes de cargarlos en Kanban.'
    )
    response.blocks.limitations.push(
      'R2 desactivado: no se creó ni modificó ninguna acción en el tablero.'
    )
  } else {
    findings.push(...executiveFindings(diagnosis).slice(0, 6))
    if (session.decisions.length > 0) {
      findings.push({
        basis: 'evidence',
        text: `Decisiones capturadas en esta sesión: ${session.decisions.join(' | ')}.`,
      })
    }
    if (session.stage === 'priorities') {
      const focused =
        session.focusedPriorityIndex != null ? diagnosis.topPriorities[session.focusedPriorityIndex] : null
      if (focused) {
        findings.unshift({
          basis: 'evidence',
          text: `Foco en prioridad ${(session.focusedPriorityIndex ?? 0) + 1}: «${focused.action.title}» · [Abrir en Kanban](${focused.action.href})`,
        })
      }
    } else if (session.stage === 'risks') {
      findings.push({
        basis: 'evidence',
        risk: diagnosis.counts.staleActive > 0,
        text: `Disciplina: ${diagnosis.counts.staleActive} sin seguimiento reciente, ${diagnosis.counts.prolongedBlocked} bloqueos prolongados (señal de atención, no incumplimiento).`,
      })
    } else if (session.stage === 'decisions') {
      response.blocks.data.push(
        session.decisions.length === 0
          ? 'Aún no hay decisiones registradas. Di «Decisión: …» para capturar un acuerdo.'
          : `Decisiones en sesión: ${session.decisions.length}.`
      )
    } else if (session.stage === 'commitments') {
      for (const draft of session.draftCommitments) {
        findings.push({
          basis: 'inference',
          text: `Borrador R2 OFF: «${draft.titulo}» · ${draft.responsableSugerido} · ${draft.fechaPropuesta ?? 'fecha por definir'}. No se ejecuta ni se persiste.`,
        })
      }
      response.blocks.limitations.push('R2 desactivado: no hay botón de ejecución. Los compromisos quedan como borrador.')
    }
    response.blocks.recommendation.push(
      `Guía paso ${meta.step}/6: puedes decir «Siguiente etapa», «Etapa anterior», «Profundiza en la prioridad 1», «Omitir etapa», «Decisión: …» o «Resume nuestras decisiones y prepara los compromisos».`
    )
  }

  if (!canSeeBoard) {
    response.blocks.limitations.push('Alcance limitado por permiso a tus acciones asignadas.')
  }

  withFacts(response, {
    primary: { value: meta.step, text: headline },
    metrics: executiveMetrics(diagnosis, sLabel).slice(0, 4),
    items: [
      ...executivePriorityItems(diagnosis.topPriorities),
      ...executiveComparisonItems(diagnosis),
    ],
    findings,
    warnings: response.blocks.limitations,
  })

  return {
    response,
    audit: {
      status: openRes.status === 'partial' ? ('partial' as const) : ('ok' as const),
      entity: 'actions',
      scope,
      total: openRes.totals.total,
    },
  }
}

function persistWriteMode(userId?: string | null) {
  return resolveR2ExecutionMode(process.env, userId)
}

function markSimulated(proposal: CopilotProposal, mode: ReturnType<typeof resolveR2ExecutionMode>): CopilotProposal {
  return mode === 'simulated' ? { ...proposal, simulated: true } : proposal
}

function parsePriorityHint(text: string): 'P1_Alta' | 'P2_Media' | 'P3_Baja' | null {
  const n = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  if (/\b(p1|alta|urgente)\b/.test(n)) return 'P1_Alta'
  if (/\b(p3|baja)\b/.test(n)) return 'P3_Baja'
  if (/\b(p2|media)\b/.test(n)) return 'P2_Media'
  return null
}

function parseResponsableHint(utterance: string): string | null {
  const m =
    utterance.match(
      /\b(?:asign[aeo]|reasign[aeo])(?:\s+\S+){0,6}\s+a\s+([A-Za-zÁÉÍÓÚÑáéíóúñ]{3,}(?:\s+[A-Za-zÁÉÍÓÚÑáéíóúñ]{3,})?)/i
    ) ||
    utterance.match(
      /\bresponsable\s+(?:a\s+)?([A-Za-zÁÉÍÓÚÑáéíóúñ]{3,}(?:\s+[A-Za-zÁÉÍÓÚÑáéíóúñ]{3,})?)/i
    )
  const name = m?.[1]?.trim() ?? ''
  if (!name || /^(esa|esta|la|el|un|una|accion|tarea)$/i.test(name)) return null
  return name
}

function r2Limitation(mode: ReturnType<typeof resolveR2ExecutionMode>, simulatedVerb = 'modificó') {
  if (mode === 'pilot') return 'Propuesta lista (piloto R2). Confirma explícitamente para aplicar el cambio en Scrumban.'
  if (mode === 'qa') return 'Confirma desde esta sesión para aplicar el cambio en QA. No se envió nada a proveedores.'
  if (mode === 'simulated') return `Propuesta guardada en modo simulado. Confirma en la tarjeta; no se ${simulatedVerb} el tablero aún.`
  return 'R2 desactivado: la ejecución no está habilitada en este canal. Texto de borrador, sin assistant_pending_ops.'
}

async function handleWriteRequest(state: TurnState, intent: Extract<AgentIntent, { kind: 'write_request' }>) {
  const auth = authorizeOperation(state.actor, 'propose_write')
  if (!auth.allowed) {
    return { response: forbidden(auth.reason), audit: { status: 'denied_precheck' as const, entity: 'actions' } }
  }
  const response = baseResponse('proposal')
  if (intent.batch) {
    return handleBatchCommitments(state, intent, response)
  }
  if (intent.operation === 'compound') {
    const catalog = state.entityCatalog ?? (await loadEntityCatalogFromActor(state.actor))
    const existingDraft =
      intent.isFollowUp && state.ctx.pendingWrite?.operation === 'create_action'
        ? state.ctx.pendingWrite.draft ?? null
        : null
    const plan = buildCompoundOperationPlan({
      utterance: intent.request,
      actor: state.actor,
      catalog,
      today: state.today,
      existingDraft,
    })
    if (plan.forbiddenReasons.length > 0 && plan.steps.every((s) => s.forbiddenReason)) {
      return {
        response: forbidden(plan.forbiddenReasons.join(' ')),
        multiIntentPlan: plan,
        audit: { status: 'denied_precheck' as const, entity: 'actions' },
      }
    }
    const persistMode = resolveR2ExecutionMode(process.env, state.actor.usuarioId)
    const formatted = formatCompoundOperationPlan(plan, persistMode)
    if (plan.clarifications.length > 0) {
      const clarifyResp = baseResponse('clarification')
      clarifyResp.blocks.data.push(formatted)
      withFacts(clarifyResp, { primary: { text: formatted } })
      return {
        response: clarifyResp,
        clarification: { question: plan.clarifications.join(' '), options: [] },
        multiIntentPlan: plan,
        audit: { status: 'clarification' as const, entity: 'actions' },
      }
    }
    const primaryCreate = plan.steps.find((s) => s.kind === 'create_action' && s.draft)?.draft
    if (primaryCreate) {
      state.ctx.pendingWrite = {
        operation: 'create_action',
        request: (primaryCreate.titulo ?? intent.request).slice(0, 280),
        ...(state.ctx.pendingWrite?.proposalId ? { proposalId: state.ctx.pendingWrite.proposalId } : {}),
        draft: primaryCreate,
      }
    }
    const primaryComm = plan.steps.find(
      (s) => (s.kind === 'send_whatsapp' || s.kind === 'send_email') && s.messageBody && s.recipientName
    )
    if (primaryComm && primaryComm.channel && primaryComm.messageBody && primaryComm.recipientName) {
      if (state.ctx.pendingCommunication) {
        await revokeContextualExecution(state.actor, state.ctx.pendingCommunication, state.dispatch)
      }
      const commChannel = primaryComm.channel
      const recUser = primaryComm.recipientId
        ? catalog.users.find((u) => u.id === primaryComm.recipientId) ?? null
        : null
      const canSendDirect = commChannel === 'whatsapp' && recUser?.hasWhatsApp !== false
      const channelLimitation =
        commChannel === 'email'
          ? 'El envío directo de correo electrónico no está habilitado; puedes copiar este mensaje y enviarlo desde tu cliente de correo.'
          : recUser?.hasWhatsApp === false
            ? `${primaryComm.recipientName} no tiene un canal de WhatsApp verificado y disponible; puedes copiar el mensaje para compartirlo manualmente.`
            : null
      const proposalId = `compound-${primaryComm.stepId}-${Date.now().toString(36)}`
      state.ctx.pendingCommunication = {
        proposalId,
        idempotencyKey: `comm:${state.actor.usuarioId}:${primaryComm.recipientId ?? primaryComm.recipientName}:${commChannel}:${state.today}:action_assigned`,
        version: 1,
        status: 'pending',
        channel: commChannel,
        recipientMode: 'single',
        purpose: 'action_assigned',
        canSendDirect,
        channelLimitation,
        createdAt: new Date().toISOString(),
        spec: {
          intent: 'send_communication',
          channel: commChannel,
          recipientMode: 'single',
          recipientHint: primaryComm.recipientName,
          purpose: 'action_assigned',
          requiredQueries: [],
          scope: 'recipient_personal',
          period: 'contextual',
          explicitContent: null,
          contentMode: 'contextual',
          tone: 'direct',
          finalOperation: canSendDirect ? 'propose_send' : 'prepare_copy',
        },
        recipients: [
          {
            recipientId: primaryComm.recipientId ?? null,
            recipientName: primaryComm.recipientName,
            channel: commChannel,
            canSendDirect,
            channelLimitation,
            subject: primaryComm.subject ?? null,
            messageBody: primaryComm.messageBody,
            itemCount: primaryCreate ? 1 : 0,
          },
        ],
      }
      state.ctx.pendingFocus = 'communication'
    }
    response.blocks.data.push(formatted)
    if (persistMode === 'disabled') {
      response.blocks.limitations.push(
        'Ninguna operación ni comunicación externa se ejecuta sin tu confirmación explícita.'
      )
    } else {
      response.blocks.limitations.push(
        'Confirmación agrupada requerida: se ejecutarán únicamente las operaciones listadas en orden y verificando dependencias.'
      )
    }
    withFacts(response, { primary: { text: formatted } })
    return {
      response,
      multiIntentPlan: plan,
      audit: { status: 'proposal_blocked' as const, entity: 'actions' },
    }
  }
  if (intent.operation === 'create_action') {
    const previous = intent.isFollowUp ? state.ctx.pendingWrite : null
    if (previous?.operation === 'create_action' && previous.proposalId) {
      const lifecycle = await readPreparedActionState(state.actor, previous.proposalId)
      if (lifecycle.status === 'confirmed' && lifecycle.actionId) {
        state.ctx.lastEntity = {kind: 'action', id: lifecycle.actionId, label: previous.draft?.titulo ?? 'Acción creada'}
        return handleWriteRequest(state, {...intent, operation: 'update_action', isFollowUp: false})
      }
      if (lifecycle.status !== 'pending') {
        return {response: forbidden('No se puede reemplazar esta propuesta sin verificar su estado. Consulta la acción en Kanban antes de reintentar.'), audit: {status: 'denied_precheck' as const, entity: 'actions'}}
      }
      const revoked = await state.dispatch(state.actor.copilot, 'cancel_pending_op', {pending_op_id: previous.proposalId})
      if (!revoked.ok) {
        return {response: forbidden('No pude invalidar la aprobación anterior. No se preparó otra operación.'), audit: {status: 'denied_precheck' as const, entity: 'actions'}}
      }
    }
    const baseDraft =
      intent.isFollowUp && state.ctx.pendingWrite?.operation === 'create_action' && state.ctx.pendingWrite.draft
        ? state.ctx.pendingWrite.draft
        : emptyStructuredDraft()
    const patch = extractActionPatch(intent.request, state.today, Boolean(intent.isFollowUp && state.ctx.pendingWrite?.draft))
    const mergedDraft = applyDraftPatch(baseDraft, patch)
    const catalog = state.entityCatalog ?? (await loadEntityCatalogFromActor(state.actor))
    const resolved = resolveDraftEntities(mergedDraft, state.actor, catalog)
    const draft = resolved.draft

    if (resolved.forbiddenReason) {
      return { response: forbidden(resolved.forbiddenReason), audit: { status: 'denied_precheck' as const, entity: 'actions' } }
    }

    state.ctx.pendingWrite = {
      operation: 'create_action',
      request: (draft.titulo ?? intent.request).slice(0, 280),
      draft,
    }

    if (resolved.clarification) {
      const clarifyResp = baseResponse('clarification')
      clarifyResp.blocks.data.push(resolved.clarification)
      withFacts(clarifyResp, { primary: { text: resolved.clarification } })
      return {
        response: clarifyResp,
        clarification: { question: resolved.clarification, options: [] },
        audit: { status: 'clarification' as const, entity: 'actions' },
      }
    }

    const blockedRefs = state.ctx.lastActions.filter((a) => a.estado === 'Bloqueado')
    const mentionsBlocker = /bloque/i.test(intent.request)
    const origen = mentionsBlocker && blockedRefs.length === 1 ? blockedRefs[0]! : null
    const contextAction =
      state.ctx.lastEntity?.kind === 'action'
        ? state.ctx.lastActions.find((item) => item.id === state.ctx.lastEntity!.id) ?? null
        : state.ctx.lastActions[0] ?? null
    const persistMode = resolveR2ExecutionMode(process.env, state.actor.usuarioId)

    if (persistMode === 'qa' || persistMode === 'simulated' || persistMode === 'pilot') {
      if (persistMode === 'pilot' && resolved.missingRequired.length > 0) {
        const formatted = formatStructuredActionDraft(draft, {
          mode: persistMode,
          missingRequired: resolved.missingRequired,
        })
        const clarifyResp = baseResponse('clarification')
        clarifyResp.blocks.data.push(formatted)
        withFacts(clarifyResp, { primary: { text: formatted } })
        return {
          response: clarifyResp,
          clarification: { question: `Para completarla, indícame: ${resolved.missingRequired.join(' y ')}.`, options: [] },
          audit: { status: 'clarification' as const, entity: 'actions' },
        }
      }
      const persisted = await proposeR2Operation(state.actor, 'create_action', {
        titulo: draft.titulo || intent.request.slice(0, 70),
        responsableId: draft.responsableId ?? contextAction?.responsableId ?? state.actor.usuarioId,
        fecha: draft.fecha ?? (contextAction ? state.today : null),
        origenAccionId: origen?.id ?? contextAction?.id ?? null,
      })
      if (persisted.ok) {
        const proposal = markSimulated(persisted.proposal, persistMode)
        if (state.ctx.pendingWrite) state.ctx.pendingWrite.proposalId = proposal.id
        const formatted = formatStructuredActionDraft(draft, { mode: persistMode })
        response.blocks.data.push(formatted)
        response.blocks.limitations.push(r2Limitation(persistMode, 'escribió'))
        withFacts(response, { primary: { text: formatted } })
        return { response, proposal, proposals: [proposal], audit: { status: 'proposal_blocked' as const, entity: 'actions' } }
      }
      if (persistMode === 'qa' || persistMode === 'pilot') {
        return { response: forbidden(persisted.reason), audit: { status: 'denied_precheck' as const, entity: 'actions' } }
      }
      // simulated con datos incompletos: cae al borrador tipado sin fila pending.
    }

    const proposed = proposeAction(state.actor, 'create_action', {
      titulo: draft.titulo || intent.request.slice(0, 70),
      responsableId: draft.responsableId,
      fecha: draft.fecha,
      origenAccionId: origen?.id ?? null,
    })
    if (!proposed.ok) return { response: forbidden(proposed.reason), audit: { status: 'denied_precheck' as const, entity: 'actions' } }
    const formatted = formatStructuredActionDraft(draft, {
      mode: 'disabled',
      missingRequired: resolved.missingRequired,
    })
    response.blocks.data.push(formatted)
    if (origen) response.blocks.data.push(`Relacionada con la acción bloqueada «${origen.title}».`)
    else if (mentionsBlocker && blockedRefs.length > 1) {
      response.blocks.data.push('Hay varias acciones bloqueadas en la consulta; falta indicar cuál.')
    }
    response.blocks.limitations.push(
      'La creación automática de acciones aún no está habilitada; este borrador es solo para revisión y no se guardó en Scrumban.'
    )
    withFacts(response, { primary: { text: formatted } })
    return { response, proposal: proposed.proposal as ActionProposal, audit: { status: 'proposal_blocked' as const, entity: 'actions' } }
  }
  const target = state.ctx.lastEntity?.kind === 'action'
    ? { id: state.ctx.lastEntity.id, label: state.ctx.lastEntity.label }
    : state.ctx.lastActions.length === 1
      ? { id: state.ctx.lastActions[0]!.id, label: state.ctx.lastActions[0]!.title }
      : null
  if (intent.operation === 'notify_responsable' && (intent.contextualComm || intent.recipientHint || intent.draftOnly)) {
    const catalog = state.entityCatalog ?? (await loadEntityCatalogFromActor(state.actor))
    const composed = await composeContextualCommunication({
      utterance: intent.request,
      actor: state.actor,
      catalog,
      today: state.today,
      session: state.ctx,
      dispatch: {
        queryActions: (copilot, req) => queryActions(copilot, req, state.dispatch),
        queryOkrs: (copilot, req) => queryOkrs(copilot, req, state.dispatch),
      },
    })

    if (composed.kind === 'clarification') {
      const clarifyResp = baseResponse('clarification')
      clarifyResp.blocks.data.push(composed.question)
      withFacts(clarifyResp, { primary: { text: composed.question } })
      return {
        response: clarifyResp,
        clarification: { question: composed.question, options: [] },
        audit: { status: 'clarification' as const, entity: 'actions' },
      }
    }
    if (composed.kind === 'forbidden') {
      return {
        response: forbidden(composed.reason),
        audit: { status: 'denied_precheck' as const, entity: 'actions' },
      }
    }
    if (composed.kind === 'error') {
      const errResp = baseResponse('error')
      errResp.presentation = 'operation'
      errResp.blocks.data.push(composed.message)
      withFacts(errResp, { primary: { text: composed.message } })
      return {
        response: errResp,
        audit: { status: 'error' as const, entity: 'actions' },
      }
    }
    if (composed.kind === 'empty') {
      const emptyResp = baseResponse('empty')
      emptyResp.presentation = 'operation'
      emptyResp.blocks.data.push(composed.message)
      withFacts(emptyResp, { primary: { text: composed.message } })
      return {
        response: emptyResp,
        audit: { status: 'empty' as const, entity: 'actions', total: 0 },
      }
    }

    if (state.ctx.pendingCommunication) await revokeContextualExecution(state.actor, state.ctx.pendingCommunication, state.dispatch)
    state.ctx.pendingFocus = 'communication'
    state.ctx.pendingCommunication = composed.proposal
    response.presentation = 'operation'
    const delivery = state.actor.channel === 'whatsapp' && process.env.WHATSAPP_COMMUNICATIONS_ENABLED === '1'
      ? await prepareContextualExecution(state.actor,composed.proposal,state.dispatch) : null
    response.blocks.data.push(composed.formattedText)
    if (delivery?.message) response.blocks.data.push(delivery.message)
    withFacts(response, { primary: { text: composed.formattedText } })
    return {
      response,
      ...(delivery?.proposal ? {proposal:delivery.proposal,proposals:[delivery.proposal]} : {}),
      communicationProposal: composed.proposal,
      audit: { status: 'proposal_blocked' as const, entity: 'actions' },
    }
  }
  if (intent.operation === 'update_action' || intent.operation === 'add_comment' || intent.operation === 'verify_action') {
    return handleTypedBoardWrite(state, intent, target, response)
  }
  return handleR2WriteRequest(state, intent, target, response)
}

async function handleTypedBoardWrite(
  state: TurnState,
  intent: Extract<AgentIntent, { kind: 'write_request' }>,
  target: { id: string; label: string } | null,
  response: ReturnType<typeof baseResponse>
) {
  const persistMode = persistWriteMode(state.actor.usuarioId)
  const accionId = target?.id ?? ''
  if (intent.operation === 'add_comment') {
    const contenido = (intent.contenido ?? intent.request).trim().slice(0, 2000)
    if (persistMode === 'qa' || persistMode === 'simulated' || persistMode === 'pilot') {
      const persisted = await proposeR2Operation(state.actor, 'add_comment', { accionId, contenido })
      if (persisted.ok) {
        const proposal = markSimulated(persisted.proposal, persistMode)
        response.blocks.data.push(persisted.proposal.summary)
        response.blocks.limitations.push(r2Limitation(persistMode, 'escribió'))
        return { response, proposal, proposals: [proposal], audit: { status: 'proposal_blocked' as const, entity: 'actions' } }
      }
      return { response: forbidden(persisted.reason), audit: { status: 'denied_precheck' as const, entity: 'actions' } }
    }
    const proposed = proposeAction(state.actor, 'add_comment', { accionId, contenido })
    if (!proposed.ok) return { response: forbidden(proposed.reason), audit: { status: 'denied_precheck' as const, entity: 'actions' } }
    response.blocks.data.push(
      target
        ? `Borrador: comentario en «${target.label}».`
        : 'Borrador: comentario (falta indicar la acción).'
    )
    if (proposed.proposal.missing.length) response.blocks.data.push(`Faltaría: ${proposed.proposal.missing.join(', ')}.`)
    response.blocks.limitations.push(r2Limitation(persistMode))
    return { response, proposal: proposed.proposal as ActionProposal, audit: { status: 'proposal_blocked' as const, entity: 'actions' } }
  }
  if (intent.operation === 'verify_action') {
    if (persistMode === 'qa' || persistMode === 'simulated' || persistMode === 'pilot') {
      const persisted = await proposeR2Operation(state.actor, 'verify_action', { accionId })
      if (persisted.ok) {
        const proposal = markSimulated(persisted.proposal, persistMode)
        response.blocks.data.push(persisted.proposal.summary)
        response.blocks.limitations.push(r2Limitation(persistMode, 'verificó'))
        return { response, proposal, proposals: [proposal], audit: { status: 'proposal_blocked' as const, entity: 'actions' } }
      }
      return { response: forbidden(persisted.reason), audit: { status: 'denied_precheck' as const, entity: 'actions' } }
    }
    response.blocks.data.push(
      target
        ? `Borrador: verificar «${target.label}» (Hecho → Verificado). Requiere aprobación humana.`
        : 'Borrador: verificar una acción (falta indicar cuál).'
    )
    response.blocks.limitations.push(r2Limitation(persistMode))
    return { response, audit: { status: 'proposal_blocked' as const, entity: 'actions' } }
  }
  const due = parseDueDateHint(intent.request, state.today)
  const prioridad = parsePriorityHint(intent.request)
  const responsableHint = parseResponsableHint(intent.request)
  if (persistMode === 'qa' || persistMode === 'simulated' || persistMode === 'pilot') {
    const persisted = await proposeR2Operation(state.actor, 'update_fields', {
      accionId,
      campos: [],
      fecha: due.dateYmd,
      prioridad,
      responsableHint,
    })
    if (persisted.ok) {
      const proposal = markSimulated(persisted.proposal, persistMode)
      response.blocks.data.push(persisted.proposal.summary)
      response.blocks.limitations.push(r2Limitation(persistMode, 'modificó'))
      return { response, proposal, proposals: [proposal], audit: { status: 'proposal_blocked' as const, entity: 'actions' } }
    }
    if (persistMode === 'qa' || persistMode === 'pilot' || !accionId) {
      return { response: forbidden(persisted.reason), audit: { status: 'denied_precheck' as const, entity: 'actions' } }
    }
  }
  response.blocks.data.push(
    target ? `Borrador: actualizar «${target.label}».` : 'Borrador: actualizar una acción (falta indicar cuál).'
  )
  const missing = [
    ...(!target ? ['accion'] : []),
    ...(!due.dateYmd && !prioridad && !responsableHint ? ['fecha, responsable o prioridad'] : []),
  ]
  if (missing.length) response.blocks.data.push(`Faltaría: ${missing.join(', ')}.`)
  response.blocks.limitations.push(r2Limitation(persistMode))
  return { response, audit: { status: 'proposal_blocked' as const, entity: 'actions' } }
}

async function handleBatchCommitments(
  state: TurnState,
  intent: Extract<AgentIntent, { kind: 'write_request' }>,
  response: ReturnType<typeof baseResponse>
) {
  const session = state.ctx.executiveSession
  const persistMode = persistWriteMode(state.actor.usuarioId)
  const drafts = session?.draftCommitments ?? []
  const decisions = session?.decisions ?? []
  const items =
    intent.batch === 'decisions'
      ? decisions.map((note, i) => ({
          titulo: note.slice(0, 70),
          responsableId: state.ctx.lastActions[i]?.responsableId ?? state.ctx.lastActions[0]?.responsableId ?? state.actor.usuarioId,
          fecha: state.today,
          origenAccionId: state.ctx.lastActions[i]?.id ?? state.ctx.lastActions[0]?.id ?? null,
        }))
      : drafts.map((draft) => {
          const origin = state.ctx.lastActions.find((a) => a.id === draft.origenAccionId)
          return {
            titulo: draft.titulo.slice(0, 70),
            responsableId: origin?.responsableId ?? state.actor.usuarioId,
            fecha: draft.fechaPropuesta ?? state.today,
            origenAccionId: draft.origenAccionId,
          }
        })
  if (items.length === 0) {
    return {
      response: forbidden('No hay compromisos ni decisiones de sesión para convertir. Inicia una revisión ejecutiva primero.'),
      audit: { status: 'denied_precheck' as const, entity: 'actions' },
    }
  }
  if (persistMode !== 'qa' && persistMode !== 'simulated') {
    for (const item of items) {
      response.blocks.data.push(
        `Borrador R2 OFF: «${item.titulo}» · ${item.fecha ?? 'sin fecha'}. No se persiste ni se ejecuta.`
      )
    }
    response.blocks.limitations.push(r2Limitation(persistMode))
    return { response, audit: { status: 'proposal_blocked' as const, entity: 'actions' } }
  }
  const batchId = crypto.randomUUID()
  const proposals: CopilotProposal[] = []
  for (const item of items) {
    const persisted = await proposeR2Operation(
      state.actor,
      'create_action',
      {
        titulo: item.titulo,
        responsableId: item.responsableId,
        fecha: item.fecha,
        origenAccionId: item.origenAccionId,
      },
      { today: state.today, batchId }
    )
    if (!persisted.ok) {
      response.blocks.data.push(`No pude proponer «${item.titulo}»: ${persisted.reason}`)
      continue
    }
    proposals.push(markSimulated(persisted.proposal, persistMode))
    response.blocks.data.push(persisted.proposal.summary)
  }
  if (proposals.length === 0) {
    return {
      response: forbidden('No se pudo armar el lote de compromisos con el contexto actual.'),
      audit: { status: 'denied_precheck' as const, entity: 'actions' },
    }
  }
  response.blocks.limitations.push(
    persistMode === 'qa'
      ? `Lote ${proposals.length}: confirma cada tarjeta o «Aprobar N de este lote». No se envió nada a proveedores.`
      : `Lote ${proposals.length} en modo simulado. Confirma las tarjetas; no se escribió en el tablero aún.`
  )
  return {
    response,
    proposal: proposals[0],
    proposals,
    batchId,
    audit: { status: 'proposal_blocked' as const, entity: 'actions' },
  }
}

function isFollowUpNotify(request: string) {
  const n = request.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  return /\b(seguimiento|responsables|avisa a los)\b/.test(n)
}

async function handleFollowUpNotify(
  state: TurnState,
  intent: Extract<AgentIntent, { kind: 'write_request' }>,
  response: ReturnType<typeof baseResponse>
) {
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
    if (result.status === 'forbidden') {
      return { response: forbidden(result.error?.message ?? 'No tienes acceso a ese conjunto.'), audit: { status: 'forbidden' as const, entity: 'actions' } }
    }
    if (result.status === 'error') {
      const err = baseResponse('error')
      err.blocks.data.push(statusMessage('error', 'las acciones', result.error?.message))
      return { response: err, audit: { status: 'error' as const, entity: 'actions' } }
    }
    rememberActions(state, request, result)
  }
  const byOwner = new Map<string, ReferencedAction>()
  for (const item of state.ctx.lastActions) {
    if (!item.responsableId || item.responsableId === state.actor.usuarioId) continue
    if (!byOwner.has(item.responsableId)) byOwner.set(item.responsableId, item)
  }
  if (byOwner.size === 0) {
    const empty = baseResponse('empty')
    empty.blocks.data.push('No hay responsables distintos que avisar en el último conjunto.')
    empty.blocks.limitations.push('No se encoló ningún aviso (cero outbox).')
    return { response: empty, audit: { status: 'empty' as const, entity: 'actions' } }
  }
  if (byOwner.size > 3) {
    const clarification = baseResponse('clarification')
    clarification.blocks.data.push(
      'Hay más de 3 responsables distintos. Indica a quién avisar o reduce el conjunto.'
    )
    return {
      response: clarification,
      clarification: {
        question: 'Hay más de 3 responsables distintos. Indica a quién avisar o reduce el conjunto.',
        options: [...byOwner.values()].slice(0, 6).map((item) => ({
          id: item.responsableId ?? item.id,
          label: item.responsableNombre ?? item.title,
        })),
      },
      audit: { status: 'clarification' as const, entity: 'actions' },
    }
  }
  const persistMode = persistWriteMode(state.actor.usuarioId)
  const batchId = crypto.randomUUID()
  let firstProposal: CopilotProposal | ActionProposal | undefined
  const proposals: CopilotProposal[] = []
  for (const item of byOwner.values()) {
    if (persistMode === 'qa' || persistMode === 'simulated') {
      const persisted = await proposeR2Operation(
        state.actor,
        'notify_responsable',
        {
          accionId: item.id,
          canal: intent.canal ?? 'email',
        },
        { batchId }
      )
      if (!persisted.ok) {
        response.blocks.data.push(`No pude proponer aviso para «${item.title}»: ${persisted.reason}`)
        continue
      }
      const proposal = markSimulated(persisted.proposal, persistMode)
      firstProposal ??= proposal
      proposals.push(proposal)
      response.blocks.data.push(persisted.proposal.summary)
    } else {
      const proposed = proposeAction(state.actor, 'notify_responsable', {
        accionId: item.id,
        canal: intent.canal ?? 'email',
      })
      if (!proposed.ok) {
        response.blocks.data.push(`No pude proponer aviso para «${item.title}»: ${proposed.reason}`)
        continue
      }
      firstProposal ??= proposed.proposal
      response.blocks.data.push(
        `Propuesta identificada: avisar a ${item.responsableNombre ?? 'el responsable'} sobre «${item.title}» por ${intent.canal === 'whatsapp' ? 'WhatsApp' : 'correo'}.`
      )
    }
  }
  if (!firstProposal) {
    return {
      response: forbidden('No se pudo armar el seguimiento con el conjunto actual.'),
      audit: { status: 'denied_precheck' as const, entity: 'actions' },
    }
  }
  response.blocks.limitations.push(
    persistMode === 'simulated'
      ? 'Seguimiento en modo simulado: una propuesta por responsable; no se envió nada (cero outbox).'
      : persistMode === 'qa'
        ? 'Seguimiento propuesto en QA. Confirma cada tarjeta; no se envió nada a proveedores.'
        : r2Limitation(persistMode)
  )
  return {
    response,
    proposal: firstProposal,
    proposals: proposals.length ? proposals : undefined,
    batchId: proposals.length > 1 ? batchId : undefined,
    audit: { status: 'proposal_blocked' as const, entity: 'actions' },
  }
}

/** R2 en canales: sólo llega a la propuesta validada; la confirmación y ejecución quedan fuera del canal. */
async function handleR2WriteRequest(
  state: TurnState,
  intent: Extract<AgentIntent, { kind: 'write_request' }>,
  target: { id: string; label: string } | null,
  response: ReturnType<typeof baseResponse>
) {
  if (intent.operation === 'update_status' && intent.estado === 'Verificado') {
    return {
      response: forbidden('Verificado requiere la validación de una persona; el agente no lo asigna.'),
      audit: { status: 'denied_precheck' as const, entity: 'actions' },
    }
  }
  if (
    intent.operation === 'notify_responsable' &&
    (isFollowUpNotify(intent.request) || (!target && state.ctx.lastActions.length > 1))
  ) {
    return handleFollowUpNotify(state, intent, response)
  }
  const accionId = target?.id ?? ''
  const persistMode = resolveR2ExecutionMode(process.env, state.actor.usuarioId)
  if (persistMode === 'qa' || persistMode === 'simulated' || persistMode === 'pilot') {
    const persisted = intent.operation === 'update_status'
      ? await proposeR2Operation(state.actor, 'update_status', {
        accionId,
        estado: intent.estado as 'Pendiente' | 'En_Ejecucion' | 'Hecho',
      })
      : intent.operation === 'register_blocker'
        ? await proposeR2Operation(state.actor, 'register_blocker', { accionId, motivo: intent.motivo ?? '' })
        : await proposeR2Operation(state.actor, 'notify_responsable', { accionId, canal: intent.canal ?? 'email' })
    if (persisted.ok) {
      const proposal = markSimulated(persisted.proposal, persistMode)
      response.blocks.data.push(persisted.proposal.summary)
      response.blocks.limitations.push(r2Limitation(persistMode, 'modificó'))
      return { response, proposal, proposals: [proposal], audit: { status: 'proposal_blocked' as const, entity: 'actions' } }
    }
    if (persistMode === 'qa' || persistMode === 'pilot' || !accionId) {
      return { response: forbidden(persisted.reason), audit: { status: 'denied_precheck' as const, entity: 'actions' } }
    }
  }
  const proposed = intent.operation === 'update_status'
    ? proposeAction(state.actor, 'update_status', { accionId, estado: intent.estado as 'Pendiente' | 'En_Ejecucion' | 'Hecho' })
    : intent.operation === 'register_blocker'
      ? proposeAction(state.actor, 'register_blocker', { accionId, motivo: intent.motivo ?? '' })
      : proposeAction(state.actor, 'notify_responsable', { accionId, canal: intent.canal ?? 'email' })
  if (!proposed.ok) return { response: forbidden(proposed.reason), audit: { status: 'denied_precheck' as const, entity: 'actions' } }
  const label = target?.label ? `«${target.label}»` : 'una acción (falta indicar cuál)'
  response.blocks.data.push(
    intent.operation === 'update_status'
      ? `Propuesta identificada: cambiar ${label} a ${intent.estado}.`
      : intent.operation === 'register_blocker'
        ? `Propuesta identificada: registrar bloqueo en ${label}.`
        : `Propuesta identificada: avisar al responsable de ${label} por ${intent.canal === 'whatsapp' ? 'WhatsApp' : 'correo'}.`
  )
  if (proposed.proposal.missing.length) response.blocks.data.push(`Faltaría: ${proposed.proposal.missing.join(', ')}.`)
  response.blocks.limitations.push(r2Limitation(persistMode))
  return { response, proposal: proposed.proposal as ActionProposal, audit: { status: 'proposal_blocked' as const, entity: 'actions' } }
}

function handleQueryKnowledge(
  state: TurnState,
  utterance: string,
  memoryStore: MemoryStore | undefined
): { response: AgentResponse; audit: Partial<QueryAuditEntry> } {
  const response = baseResponse('ok')
  if (!isAgentMemoryEnabled() || !memoryStore) {
    response.status = 'empty'
    response.blocks.data.push(
      'No hay información documental suficiente para responder. No sustituyo documentos con OKRs ni con el tablero.'
    )
    response.blocks.limitations.push(
      'Consulta documental/memoria (R3) no disponible en este entorno. Fail-closed: sin fuente, no hay respuesta inventada.'
    )
    return { response, audit: { status: 'empty', entity: 'none' } }
  }
  const recalled = attachMemoryRecall(response, memoryStore, state.actor, utterance)
  if (recalled.blocks.data.length === 0 && recalled.status !== 'forbidden') {
    recalled.status = 'empty'
    if (!recalled.blocks.data.some((line) => /no encontré|no tienes acceso/i.test(line))) {
      recalled.blocks.data.push(
        'No encontré documentos ni memoria confirmada para esa pregunta. No uso OKRs ni Kanban como sustituto.'
      )
    }
  }
  recalled.blocks.limitations.push('Fuente: memoria/documentos R3 (lectura).')
  return { response: recalled, audit: { status: recalled.status === 'forbidden' ? 'forbidden' : recalled.status === 'empty' ? 'empty' : 'ok', entity: 'none' } }
}

function formatNoticeResponse(selected: ResponseFormat): AgentResponse {
  const response = baseResponse('ok')
  response.blocks.data.push(`Formato de respuesta: ${FORMAT_LABEL[selected]}.`, `Usaré ${FORMAT_DESCRIPTION[selected]}.`)
  response.blocks.recommendation.push('Haz tu consulta y la presento en ese formato.')
  return response
}

export async function runAgentTurn(
  input: {
    actor: AgentActor
    utterance: string
    /** Preferencia de presentación del canal (p. ej. el selector web). Se valida; sólo cambia el formato. */
    responseFormat?: unknown
  },
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
  const timer = new TurnTimer(now)
  const started = mark

  const { actor } = input
  if (actor.roleClass === 'inactive') {
    stage('identity')
    return {
      handled: true,
      intent: 'unknown',
      response: forbidden('Tu usuario está inactivo.'),
      format: 'direct',
      formatSelected: 'auto',
      offerDetail: false,
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
  // A communication has its own versioned context; a legacy marker is not a second board operation.
  if (ctx.pendingCommunication && ctx.pendingWrite?.operation === 'notify_responsable') ctx.pendingWrite = null

  // Formato: directiva del usuario > preferencia del canal > selección guardada en la sesión.
  // Sólo elige presentación; el texto restante se clasifica y autoriza como cualquier otro mensaje.
  const directive = parseFormatDirective(input.utterance)
  const utterance = directive ? directive.rest : input.utterance
  const previousFormat = coerceResponseFormat(ctx.responseFormat)
  const selected: ResponseFormat = directive
    ? directive.format
    : isResponseFormat(input.responseFormat) ? input.responseFormat : previousFormat
  const persistFormat = async () => {
    await deps.store.set(
      key,
      {
        activeQuery: ctx.activeQuery,
        lastActions: ctx.lastActions,
        lastEntity: ctx.lastEntity,
        fingerprint,
        responseFormat: selected,
        lastAnswer: ctx.lastAnswer ?? null,
        executiveSession: ctx.executiveSession ?? null,
        lastTotals: ctx.lastTotals ?? null,
      },
      now()
    )
  }

  // Sólo cambio de formato: se conserva el contexto y, si hay una respuesta reciente en memoria,
  // se vuelve a presentar sin consultar de nuevo.
  if (directive && !directive.rest) {
    stage('intent')
    await persistFormat()
    const cached = ctx.lastAnswer
    const notice = `Formato de respuesta: ${FORMAT_LABEL[selected]}.`
    stage('respond')
    if (cached) {
      return {
        handled: true,
        intent: cached.intent,
        response: cached.response,
        format: selected === 'auto' ? cached.auto.format : selected,
        formatSelected: selected,
        offerDetail: selected === 'auto' && cached.auto.ambiguous,
        notice,
        toolsUsed: [],
        trace,
      }
    }
    return {
      handled: true,
      intent: 'unknown',
      response: formatNoticeResponse(selected),
      format: selected === 'auto' ? 'direct' : selected,
      formatSelected: selected,
      offerDetail: false,
      toolsUsed: [],
      trace,
    }
  }

  const intent = classifyAgentIntent(utterance, ctx.activeQuery, {
    hasExecutiveSession: Boolean(ctx.executiveSession?.active),
    lastActionCount: ctx.lastActions.length,
    lastEntityKind: ctx.lastEntity?.kind ?? null,
    pendingWrite: ctx.pendingWrite ?? null,
    hasPendingCommunication: Boolean(ctx.pendingCommunication),
    pendingFocus: ctx.pendingFocus ?? null,
  })
  stage('intent')

  if (intent.kind === 'unknown') {
    if (
      isAgentMemoryEnabled() &&
      deps.memoryStore &&
      looksLikeMemoryAsk(utterance)
    ) {
      stage('context')
      const response = attachMemoryRecall(baseResponse('ok'), deps.memoryStore, actor, utterance)
      stage('query_interpret')
      stage('respond')
      return {
        handled: true,
        intent: 'unknown',
        response,
        format: selected === 'auto' ? 'direct' : selected,
        formatSelected: selected,
        offerDetail: false,
        toolsUsed: [],
        trace,
      }
    }
    if (selected !== previousFormat) await persistFormat()
    return {
      handled: false,
      intent: 'unknown',
      response: baseResponse('empty'),
      format: 'direct',
      formatSelected: selected,
      offerDetail: false,
      toolsUsed: [],
      trace,
    }
  }

  const tools: string[] = []
  const state: TurnState = {
    actor,
    ctx,
    today: (deps.today ?? todayWallClockCDMX)(),
    tools,
    entityCatalog: deps.entityCatalog,
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
    proposal?: ActionProposal | CopilotProposal
    proposals?: CopilotProposal[]
    communicationProposal?: PendingCommunicationProposal
    batchId?: string
    audit: Partial<QueryAuditEntry>
  }
  switch (intent.kind) {
    case 'query_actions':
      outcome = await handleQueryActions(state, intent, utterance)
      break
    case 'who_most_urgent':
      outcome = await handleWhoMostUrgent(state)
      break
    case 'recommend_next':
      outcome = await handleRecommendNext(state)
      break
    case 'query_okrs':
      outcome = await handleOkrs(state, intent)
      break
    case 'query_initiatives':
      outcome = await handleInitiatives(state, intent)
      break
    case 'aggregate_execution':
      outcome = await handleAggregate(state, intent)
      break
    case 'analyze_risk':
      outcome = await handleRisk(state)
      break
    case 'executive_brief':
      outcome = await handleExecutiveBrief(state, intent)
      break
    case 'executive_commitments':
      outcome = await handleExecutiveCommitments(state, intent)
      break
    case 'executive_discipline':
      outcome = await handleExecutiveDiscipline(state, intent)
      break
    case 'executive_preventive':
      outcome = await handleExecutivePreventive(state)
      break
    case 'executive_evidence':
      outcome = await handleExecutiveEvidence(state, intent)
      break
    case 'executive_review':
      outcome = await handleExecutiveReview(state, intent)
      break
    case 'query_knowledge':
      outcome = handleQueryKnowledge(state, utterance, deps.memoryStore)
      break
    case 'unsupported_metric':
      outcome = await handleUnsupportedMetric(state)
      break
    case 'write_request':
      if (intent.operation !== 'notify_responsable') state.ctx.pendingFocus = 'action'
      outcome = await handleWriteRequest(state, intent)
      break
    case 'edit_pending_date': {
      const due = parseDueDateHint(intent.request, state.today)
      if (!due.dateYmd) {
        const response = baseResponse('clarification')
        const question = '¿Qué nueva fecha debe tener la acción?'
        response.blocks.data.push(question)
        outcome = {response, clarification:{question,options:[]},audit:{status:'clarification'}}
      } else {
        state.ctx.pendingFocus = 'action'
        outcome = await handleWriteRequest(state,{kind:'write_request',operation:'create_action',isFollowUp:true,request:`Para el ${due.dateYmd}`})
      }
      break
    }
    case 'review_pending': {
      const action = state.ctx.pendingWrite?.draft
      const communication = state.ctx.pendingCommunication
      const resp = baseResponse('proposal')
      resp.presentation = 'operation'
      if (intent.target === 'unspecified' && action && communication) {
        const question = '¿Quieres revisar la acción del tablero o el borrador del mensaje?'
        resp.status = 'clarification'
        resp.blocks.data.push(question)
        outcome = {response: resp, clarification: {question, options: []}, audit: {status: 'clarification'}}
      } else if (communication && intent.target !== 'action') {
        const fold = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
        if (intent.recipientHint && !communication.recipients.some(r=>fold(r.recipientName).includes(fold(intent.recipientHint!)))) {
          const question = 'No tengo un borrador vigente para esa persona en esta conversación. ¿Quieres revisar el mensaje actual o preparar otro?'
          resp.status = 'clarification';resp.blocks.data.push(question)
          outcome = {response:resp,clarification:{question,options:[]},audit:{status:'clarification'}}
          break
        }
        state.ctx.pendingFocus = 'communication'
        resp.blocks.data.push(formatCommunicationProposalText(communication))
        outcome = {response: resp, communicationProposal: communication, audit: {status: 'proposal_blocked'}}
      } else if (action && intent.target !== 'communication') {
        state.ctx.pendingFocus = 'action'
        const preparedState = await readPreparedActionState(state.actor, state.ctx.pendingWrite?.proposalId)
        resp.blocks.data.push(formatPreparedActionState(action, preparedState))
        outcome = {response: resp, audit: {status: 'proposal_blocked'}}
      } else {
        resp.status = 'empty'
        resp.blocks.data.push('No encontré ese borrador vigente en esta conversación. Indica cuál quieres preparar.')
        outcome = {response: resp, audit: {status: 'empty'}}
      }
      break
    }
    case 'communication_action': {
      const pending = state.ctx.pendingCommunication
      if (!pending) {
        const resp = baseResponse('empty')
        resp.presentation = 'operation'
        const msg = 'No hay una propuesta de comunicación pendiente en esta sesión.'
        resp.blocks.data.push(msg)
        withFacts(resp, { primary: { text: msg } })
        outcome = { response: resp, audit: { status: 'empty' as const, entity: 'actions' } }
        break
      }
      if (intent.action === 'cancel') {
        await revokeContextualExecution(state.actor, pending, state.dispatch)
        state.ctx.pendingCommunication = null
        const resp = baseResponse('ok')
        resp.presentation = 'operation'
        const msg = 'Cancelé la propuesta de comunicación. No se envió ningún mensaje.'
        resp.blocks.data.push(msg)
        withFacts(resp, { primary: { text: msg } })
        outcome = { response: resp, audit: { status: 'ok' as const, entity: 'actions' } }
        break
      }
      if (intent.action === 'edit') {
        await revokeContextualExecution(state.actor, pending, state.dispatch)
        const recipientHint = extractResponsablePatch(intent.utterance).hint
        const channel = /\b(correo|email|mail)\b/i.test(intent.utterance) ? 'email'
          : /\bwhatsapp\b/i.test(intent.utterance) ? 'whatsapp' : null
        if (recipientHint || channel) {
          const previousSpec = pending.spec
          if (!previousSpec) {
            const resp = baseResponse('clarification')
            const question = '¿Qué información debe incluir la propuesta actualizada?'
            resp.blocks.data.push(question)
            outcome = { response: resp, clarification: { question, options: [] }, audit: { status: 'clarification' as const } }
            break
          }
          const composed = await composeContextualCommunication({
            utterance: intent.utterance, actor: state.actor,
            catalog: state.entityCatalog ?? await loadEntityCatalogFromActor(state.actor),
            today: state.today, session: state.ctx,
            specOverride: {
              ...previousSpec,
              channel: channel ?? pending.channel,
              recipientHint: recipientHint ?? pending.recipients[0]?.recipientName ?? previousSpec.recipientHint,
              recipientMode: recipientHint ? 'single' : previousSpec.recipientMode,
            },
            dispatch: {
              queryActions: (copilot, req) => queryActions(copilot, req, state.dispatch),
              queryOkrs: (copilot, req) => queryOkrs(copilot, req, state.dispatch),
            },
          })
          const resp = baseResponse(composed.kind === 'proposal' ? 'proposal' : composed.kind === 'clarification' ? 'clarification' : composed.kind === 'forbidden' ? 'forbidden' : composed.kind === 'empty' ? 'empty' : 'error')
          resp.presentation = 'operation'
          if (composed.kind === 'proposal') {
            const updated = { ...composed.proposal, proposalId: pending.proposalId, version: pending.version + 1 }
            state.ctx.pendingCommunication = updated
            const text = formatCommunicationProposalText(updated)
            resp.blocks.data.push(text)
            withFacts(resp, { primary: { text } })
            outcome = { response: resp, communicationProposal: updated, audit: { status: 'proposal_blocked' as const, entity: 'actions' } }
          } else {
            const text = composed.kind === 'clarification' ? composed.question : composed.kind === 'forbidden' ? composed.reason : composed.message
            resp.blocks.data.push(text)
            outcome = { response: resp, ...(composed.kind === 'clarification' ? { clarification: { question: text, options: [] } } : {}), audit: { status: composed.kind === 'forbidden' ? 'denied_precheck' as const : 'clarification' as const } }
          }
          break
        }
        const edited = applyCommunicationEdit(pending, intent.utterance)
        state.ctx.pendingCommunication = edited.updated
        const resp = baseResponse('proposal')
        resp.presentation = 'operation'
        resp.blocks.data.push(edited.formattedText)
        withFacts(resp, { primary: { text: edited.formattedText } })
        outcome = {
          response: resp,
          communicationProposal: edited.updated,
          audit: { status: 'proposal_blocked' as const, entity: 'actions' },
        }
        break
      }
      // A chat confirmation never executes an external send. Existing HTTP approval
      // owns atomic claim, hash validation, provider recording and idempotency.
      const delivery = await prepareContextualExecution(state.actor, pending, state.dispatch, now())
      state.ctx.pendingCommunication = pending
      const resp = baseResponse(delivery.proposal ? 'proposal' : 'clarification')
      resp.presentation = 'operation'
      resp.blocks.data.push(delivery.message)
      withFacts(resp, {primary: {text: delivery.message}})
      outcome = {
        response: resp,
        communicationProposal: pending,
        ...(delivery.proposal ? {proposal: delivery.proposal, proposals: [delivery.proposal]} : {}),
        audit: {status: 'proposal_blocked' as const, entity: 'actions'},
      }
      break
    }
    case 'cancel_write_draft': {
      state.ctx.pendingWrite = null
      const response = baseResponse('ok')
      const msg = 'Cancelé el borrador en curso. Cuando quieras, indícame la nueva acción.'
      response.blocks.data.push(msg)
      withFacts(response, { primary: { text: msg } })
      outcome = { response, audit: { status: 'ok' as const, entity: 'actions' } }
      break
    }
    case 'unsupported_write': {
      const response = baseResponse('forbidden')
      response.blocks.data.push(
        intent.operation === 'tag_okr_action'
          ? 'Etiquetar OKRs no está soportado desde el asistente ejecutivo.'
          : intent.operation === 'sql'
            ? 'No ejecuto SQL ni escrituras genéricas. Usa las propuestas tipadas del tablero.'
            : 'Esa escritura no está soportada. El modelo no puede auto-aprobar ni ejecutar operaciones arbitrarias.'
      )
      outcome = { response, audit: { status: 'denied_precheck' as const, entity: 'actions' } }
      break
    }
    case 'clarify': {
      const response = baseResponse('clarification')
      response.blocks.data.push(intent.question)
      outcome = { response, audit: { status: 'clarification' } }
      break
    }
  }
  stage('query_interpret')

  const explicitMemoryAsk = looksLikeMemoryAsk(utterance)
  if (
    intent.kind !== 'query_knowledge' &&
    isAgentMemoryEnabled() &&
    deps.memoryStore &&
    (explicitMemoryAsk ||
      intent.kind === 'executive_brief' ||
      intent.kind === 'executive_commitments')
  ) {
    outcome = {
      ...outcome,
      response: attachMemoryRecall(outcome.response, deps.memoryStore, actor, utterance, {
        passive: !explicitMemoryAsk,
      }),
    }
  }

  const autoResolution = resolveFormat('auto', intent.kind, utterance)
  const resolution = selected === 'auto' ? autoResolution : { format: selected, ambiguous: false }
  const cacheable = outcome.response.facts !== undefined && (outcome.response.status === 'ok' || outcome.response.status === 'partial')
  await deps.store.set(
    key,
    {
      activeQuery: state.ctx.activeQuery,
      lastActions: state.ctx.lastActions,
      lastEntity: state.ctx.lastEntity,
      executiveSession: state.ctx.executiveSession ?? null,
      pendingWrite:
        intent.kind === 'cancel_write_draft'
          ? null
          : intent.kind === 'write_request' && intent.operation !== 'notify_responsable'
            ? state.ctx.pendingWrite ?? { operation: intent.operation, request: intent.request.slice(0, 280) }
            : state.ctx.pendingWrite ?? null,
      pendingCommunication: state.ctx.pendingCommunication ?? null,
      pendingFocus: state.ctx.pendingFocus ?? null,
      fingerprint,
      responseFormat: selected,
      lastAnswer: cacheable ? { intent: intent.kind, response: outcome.response, auto: autoResolution } : null,
      lastTotals: state.ctx.lastTotals ?? null,
    },
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

  for (const item of trace) {
    if (item.stage === 'intent') timer.recordInterpretation(item.ms)
    else if (item.stage === 'context') timer.recordEntityResolution(item.ms)
    else if (item.stage === 'query_interpret') timer.recordExecution(item.ms)
    else if (item.stage === 'respond') timer.recordProposal(item.ms)
  }
  const multiIntentPlan: CompoundOperationPlan | undefined =
    'multiIntentPlan' in outcome
      ? (outcome.multiIntentPlan as CompoundOperationPlan | undefined)
      : undefined
  const telemetry = timer.finish({
    channel: actor.channel,
    clarificationCount: outcome.clarification ? 1 : 0,
    usedLlm: false,
    multiIntentCount: multiIntentPlan?.steps.length ?? 1,
  })

  const persistMode = resolveR2ExecutionMode(process.env, state.actor.usuarioId)
  const executionEnabled = persistMode === 'simulated' || persistMode === 'qa' || persistMode === 'pilot'
  const proposals = outcome.proposals?.length
    ? outcome.proposals
    : outcome.proposal && 'tool' in outcome.proposal
      ? [outcome.proposal as CopilotProposal]
      : undefined
  return {
    handled: true,
    intent: intent.kind,
    response: outcome.response,
    clarification: outcome.clarification,
    proposal: outcome.proposal,
    proposals,
    multiIntentPlan,
    communicationProposal: outcome.communicationProposal,
    batchId: outcome.batchId,
    executionEnabled,
    format: resolution.format,
    formatSelected: selected,
    offerDetail: selected === 'auto' && resolution.ambiguous,
    toolsUsed: tools,
    trace,
    telemetry,
  }
}
