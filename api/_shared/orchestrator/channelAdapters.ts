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
import { formatWhatsAppTurn } from '../whatsappFormat.js'
import { formatVoiceSpokenReply, sanitizeTextForVoiceSpeech } from '../voiceChannelAdapter.js'
import {
  createSupabaseSessionContextStore,
  defaultSessionContextStore,
  emptySessionContext,
  readSharedUserPreferences,
  sessionContextKey,
  writeSharedUserPreferences,
  type SessionContextStore,
} from './sessionContext.js'
import { capabilityFingerprint, loadAgentCapabilities } from '../query/actorCapabilities.js'
import type { ActionActiveQuery } from '../../../src/features/ai-support/actionQuery/types.js'
import type { AccessCapabilities } from '../../../src/features/auth/lib/permissions.js'
import { isAgentMemoryEnabled } from '../memory/flag.js'
import { loadSupabaseMemoryStore } from '../memory/store.js'

/** Web, WhatsApp y Voz comparten contexto corporativo autorizado entre instancias. */
function defaultStoreForChannel(input: { identity: VerifiedIdentity; channel: AgentChannel }): SessionContextStore {
  if (input.identity.supabase) {
    return createSupabaseSessionContextStore(input.identity.supabase)
  }
  return defaultSessionContextStore
}

export function isAgentOrchestratorEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.AGENT_ORCHESTRATOR_R1 === '1'
}

const WHATSAPP_MAX = 900

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

  if (channel === 'voice') {
    if (rendered) {
      const body = sanitizeTextForVoiceSpeech(composeVoice(rendered), {
        hasProposals: Boolean((result.proposals && result.proposals.length > 0) || result.proposal),
      })
      return notice ? sanitizeTextForVoiceSpeech(`${notice} ${body}`.trim()) : body
    }
    const spoken = formatVoiceSpokenReply(result)
    if (spoken) return spoken
    return sanitizeTextForVoiceSpeech(composeText(response, { headings: false }))
  }

  if (channel === 'whatsapp') {
    if (rendered) {
      const formatted = formatWhatsAppTurn(result, { maxChars: WHATSAPP_MAX })
      return formatted || composeWhatsApp(rendered, WHATSAPP_MAX)
    }
    const text = composeText(response, { headings: false }).replace(/[#*_]/g, '')
    return text.length <= WHATSAPP_MAX ? text : `${text.slice(0, WHATSAPP_MAX - 1).trim()}…`
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
  const actorFingerprint = capabilityFingerprint(actor.capabilities)
  const store = overrides.store ?? defaultStoreForChannel(input)
  const now = overrides.now?.()
  const key = sessionContextKey(actor)
  const existingSession = await store.get(key, now)
  if (input.seedActiveQuery && !existingSession) {
    await store.set(key, { ...emptySessionContext(now), activeQuery: input.seedActiveQuery }, now)
  } else if (
    (input.channel === 'web' || input.channel === 'whatsapp' || input.channel === 'voice') &&
    (!existingSession || (!existingSession.lastEntity && existingSession.lastActions.length === 0))
  ) {
    // Continuidad segura entre canales para el MISMO usuario corporativo y MISMO fingerprint de alcance.
    const shared = await readSharedUserPreferences(store, actor.usuarioId, actorFingerprint, now)
    if (shared && (shared.lastEntity || (shared.lastActions && shared.lastActions.length > 0) || shared.lastTotals)) {
      const base = existingSession ?? emptySessionContext(now)
      await store.set(
        key,
        {
          activeQuery: base.activeQuery,
          lastActions: base.lastActions.length > 0 ? base.lastActions : (shared.lastActions ?? []),
          lastEntity: base.lastEntity ?? shared.lastEntity ?? null,
          lastTotals: base.lastTotals ?? shared.lastTotals ?? null,
          responseFormat: base.responseFormat,
          fingerprint: actorFingerprint,
        },
        now
      )
    }
  }
  const memoryStore =
    overrides.memoryStore ?? (isAgentMemoryEnabled() ? await loadSupabaseMemoryStore(input.identity.supabase) : undefined)
  const result = await runAgentTurn(
    { actor, utterance: input.utterance, responseFormat: input.responseFormat },
    {
      dispatch: overrides.dispatch ?? ((a, name, args) => dispatchCopilotTool(a, name, args)),
      store,
      audit: overrides.audit ?? supabaseQueryAuditSink(actor),
      now: overrides.now,
      today: overrides.today,
      memoryStore,
    }
  )
  // Registrar última actividad del usuario corporativo (sin mezclar identidades ni sobrescribir formato).
  if (input.channel === 'web' || input.channel === 'whatsapp' || input.channel === 'voice') {
    const updatedSession = await store.get(key, overrides.now?.())
    if (updatedSession && (updatedSession.lastTotals || updatedSession.lastEntity || updatedSession.lastActions.length > 0)) {
      await writeSharedUserPreferences(
        store,
        actor.usuarioId,
        {
          lastTotals: updatedSession.lastTotals,
          lastEntity: updatedSession.lastEntity,
          lastActions: updatedSession.lastActions,
          fingerprint: updatedSession.fingerprint ?? actorFingerprint,
        },
        overrides.now?.()
      )
    }
  }
  return { ...result, text: result.handled ? formatForChannel(result, input.channel) : '' }
}
