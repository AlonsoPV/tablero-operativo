/**
 * Adaptadores de canal: mismo turno del orquestador, distinto formato.
 * Activación detrás de AGENT_ORCHESTRATOR_R1=1 hasta cerrar R0 e integrar R1.
 */
import { dispatchCopilotTool } from '../assistantOpsRuntime.js'
import { supabaseQueryAuditSink } from '../query/queryAudit.js'
import { resolveActor, type AgentChannel, type VerifiedIdentity } from '../query/resolveActor.js'
import type { AssistantUiPayload } from '../../../src/features/ai-support/chatViews/types.js'
import { buildReportUi, composeRendered, composeVoice, composeWhatsApp, hasFormattableFacts, renderAnswer } from './renderFormat.js'
import { composeText } from './respond.js'
import { runAgentTurn, type AgentTurnDeps, type AgentTurnResult } from './runAgentTurn.js'
import {
  createSupabaseSessionContextStore,
  defaultSessionContextStore,
  emptySessionContext,
  sessionContextKey,
  type SessionContextStore,
} from './sessionContext.js'
import { loadAgentCapabilities } from '../query/actorCapabilities.js'
import type { ActionActiveQuery } from '../../../src/features/ai-support/actionQuery/types.js'
import type { AccessCapabilities } from '../../../src/features/auth/lib/permissions.js'

/** Web y WhatsApp comparten contexto entre instancias; voz rehidrata desde consult_log. */
function defaultStoreForChannel(input: { identity: VerifiedIdentity; channel: AgentChannel }): SessionContextStore {
  if (input.channel === 'voice') return defaultSessionContextStore
  return createSupabaseSessionContextStore(input.identity.supabase)
}

export function isAgentOrchestratorEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.AGENT_ORCHESTRATOR_R1 === '1'
}

const WHATSAPP_MAX = 900
const VOICE_MAX_LINES = 4

/**
 * Un mismo AgentTurnResult (datos y formato ya resueltos) se presenta por canal: aquí sólo cambia
 * el marcado y la longitud. Sin datos que formatear (vacío, sin permiso, error, aclaración,
 * propuesta) el texto es el mismo en los cuatro formatos.
 */
export function formatForChannel(result: AgentTurnResult, channel: AgentChannel): string {
  const { response } = result
  const rendered = renderAnswer(response, result.format, { offerDetail: result.offerDetail })
  const notice = result.notice ?? ''

  if (channel === 'web') {
    const body = rendered ? composeRendered(rendered, { headings: true }) : composeText(response, { headings: true })
    return notice ? `${notice}\n\n${body}` : body
  }

  if (channel === 'voice' && rendered) {
    const body = composeVoice(rendered)
    return notice ? `${notice} ${body}`.trim() : body
  }

  if (channel === 'whatsapp' && rendered) {
    const body = composeWhatsApp(rendered, WHATSAPP_MAX - (notice ? notice.length + 2 : 0))
    return notice ? `${notice}\n\n${body}` : body
  }

  if (channel === 'voice') {
    const { blocks } = response
    const lines = [
      ...blocks.data.filter((l) => !l.startsWith('- ')).slice(0, 2),
      ...blocks.data.filter((l) => l.startsWith('- ')).slice(0, 2).map((l) => l.slice(2)),
      ...blocks.recommendation.slice(0, 1),
      ...blocks.limitations.slice(0, 1),
    ]
    return lines.slice(0, VOICE_MAX_LINES + 1).join(' ')
  }

  const text = composeText(response, { headings: false }).replace(/[#*_]/g, '')
  return text.length <= WHATSAPP_MAX ? text : `${text.slice(0, WHATSAPP_MAX - 1).trim()}…`
}

/**
 * Sesión web del orquestador: un identificador estable por conversación (el cliente lo conserva) para
 * que el contexto y el formato persistan entre turnos. Siempre se combina con el usuario autenticado
 * en la clave, así que un valor ajeno no da acceso a nada. Sin él, se conserva el comportamiento previo.
 */
export function webSessionId(conversationId: unknown, requestId: unknown): string {
  if (typeof conversationId === 'string' && /^[A-Za-z0-9_-]{8,80}$/.test(conversationId)) return conversationId
  return typeof requestId === 'string' ? requestId.split(':')[0]!.slice(0, 80) : 'web'
}

/** Vistas estructuradas (web): sólo el formato Reporte las usa; reutiliza los componentes existentes. */
export function uiForTurn(result: AgentTurnResult, text: string): AssistantUiPayload | undefined {
  if (result.format !== 'report' || !hasFormattableFacts(result.response)) return undefined
  return buildReportUi(result.response, text)
}

export type ChannelTurn = AgentTurnResult & { text: string }

export async function runChannelTurn(
  input: {
    identity: VerifiedIdentity
    channel: AgentChannel
    sessionId: string
    utterance: string
    /** Preferencia de formato del canal (selector web); se valida y sólo afecta la presentación. */
    responseFormat?: unknown
    /** Consulta activa persistida por el canal (p. ej. consult_log de voz) para rehidratar tras cold start. */
    seedActiveQuery?: ActionActiveQuery | null
  },
  overrides: Partial<AgentTurnDeps> & { capabilities?: AccessCapabilities } = {}
): Promise<ChannelTurn> {
  // Capacidades recalculadas en cada turno desde datos del servidor (nunca del cliente ni del modelo).
  const capabilities = overrides.capabilities ?? await loadAgentCapabilities(input.identity)
  const actor = resolveActor(input.identity, { channel: input.channel, sessionId: input.sessionId, capabilities })
  const store = overrides.store ?? defaultStoreForChannel(input)
  const key = sessionContextKey(actor)
  if (input.seedActiveQuery && !(await store.get(key))) {
    await store.set(key, { ...emptySessionContext(), activeQuery: input.seedActiveQuery })
  }
  const result = await runAgentTurn(
    { actor, utterance: input.utterance, responseFormat: input.responseFormat },
    {
      dispatch: overrides.dispatch ?? ((a, name, args) => dispatchCopilotTool(a, name, args)),
      store,
      audit: overrides.audit ?? supabaseQueryAuditSink(actor),
      now: overrides.now,
      today: overrides.today,
    }
  )
  return { ...result, text: result.handled ? formatForChannel(result, input.channel) : '' }
}
