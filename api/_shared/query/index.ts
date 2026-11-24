/**
 * Punto de entrada de la capa de consulta del agente. Los adaptadores de canal
 * llaman a runQuery; nunca a tablas ni a herramientas sueltas.
 */
import type { CopilotActor } from '../assistantPending.js'
import {
  combineStatuses,
  type CombinedQueryRequest,
  type CombinedQueryResult,
  type QueryRequest,
  type QueryResult,
  type ActionItem,
  type AggregateBucket,
  type OkrItem,
} from './contracts.js'
import { queryActions, type ToolDispatcher } from './kanbanQuery.js'
import { queryOkrs } from './okrQuery.js'
import { queryAggregate } from './aggregateQuery.js'

export * from './contracts.js'
export { normalizeAggregateToolResult } from './aggregateQuery.js'
export { normalizeActionsToolResult, type ToolDispatcher } from './kanbanQuery.js'
export { normalizeOkrToolResult } from './okrQuery.js'
export { AGENT_SOURCES, UNAVAILABLE_DOMAINS, sourcesFor } from './sourceCatalog.js'

export async function queryCombined(
  actor: CopilotActor,
  request: CombinedQueryRequest,
  dispatch: ToolDispatcher
): Promise<CombinedQueryResult> {
  const [actions, okrs] = await Promise.all([
    queryActions(actor, { entity: 'actions', ...request.actions }, dispatch),
    queryOkrs(actor, { entity: 'okrs', ...request.okrs }, dispatch),
  ])
  const limitations = [...actions.limitations, ...okrs.limitations]
  if (actions.status === 'forbidden') limitations.push('Acciones fuera de tu alcance: no se incluyen.')
  if (okrs.status === 'forbidden') limitations.push('OKRs fuera de tu alcance: no se incluyen.')
  if (actions.status === 'error') limitations.push('La fuente de acciones falló.')
  if (okrs.status === 'error') limitations.push('La fuente de OKRs falló.')
  return {
    status: combineStatuses([actions.status, okrs.status]),
    entity: 'combined',
    actions,
    okrs,
    asOf: new Date().toISOString(),
    limitations,
  }
}

export type AnyQueryResult =
  | QueryResult<ActionItem>
  | QueryResult<OkrItem>
  | QueryResult<AggregateBucket>
  | CombinedQueryResult

export async function runQuery(
  actor: CopilotActor,
  request: QueryRequest,
  dispatch: ToolDispatcher
): Promise<AnyQueryResult> {
  if (request.entity === 'actions') return queryActions(actor, request, dispatch)
  if (request.entity === 'okrs') return queryOkrs(actor, request, dispatch)
  if (request.entity === 'aggregate') return queryAggregate(actor, request, dispatch)
  return queryCombined(actor, request, dispatch)
}

export { queryActions, queryAggregate, queryOkrs }
