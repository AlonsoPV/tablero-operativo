/**
 * Runtime de integración R4.5 (simulado).
 * Prepara el contrato que un adaptador Retell real implementaría.
 * No abre red, no lee claves, no llama a Retell ni OpenAI.
 */
import { createLinkStore, type R4LinkStore } from './linkStore.js'
import { createOnceReportFinalizer } from './reportFinalize.js'
import { createR4SessionOrchestrator, type R4SessionOrchestrator } from './sessionOrchestrator.js'
import { createSimulatedR4Adapters } from './simulatedAdapters.js'
import { isAgentVoiceR4Enabled } from './flags.js'
import type { R4VoiceAdapters } from './contracts.js'
import type { R4LinkRecord, R4SessionSnapshot } from './sessionTypes.js'

export type R4VoiceProviderKind = 'simulated' | 'retell' | 'openai_realtime'

export type R4ConversationEvent =
  | { type: 'link_issued'; linkId: string; expiresAt: string }
  | { type: 'link_revoked'; linkId: string }
  | { type: 'consented'; sessionId: string }
  | { type: 'session_started'; sessionId: string; callId: string }
  | { type: 'user_speech'; text: string }
  | { type: 'agent_speech'; text: string }
  | { type: 'interrupted' }
  | { type: 'recovered'; callId: string }
  | { type: 'session_ended'; sessionId: string; reportId: string; duplicate: boolean }
  | { type: 'denied'; code: string }

export type R4ProviderSelection =
  | { ok: true; provider: 'simulated' }
  | { ok: false; provider: R4VoiceProviderKind; code: 'flag_off' | 'real_provider_not_authorized' }

/**
 * Selección de proveedor. Retell y OpenAI Realtime quedan bloqueados
 * aunque el flag de laboratorio esté encendido.
 */
export function selectR4VoiceProvider(
  env: Record<string, string | undefined> = process.env
): R4ProviderSelection {
  const requested = (env.AGENT_VOICE_R4_PROVIDER ?? 'simulated').toLowerCase()
  if (!isAgentVoiceR4Enabled(env)) {
    return { ok: false, provider: 'simulated', code: 'flag_off' }
  }
  if (requested === 'retell' || requested === 'openai_realtime') {
    return { ok: false, provider: requested, code: 'real_provider_not_authorized' }
  }
  return { ok: true, provider: 'simulated' }
}

export function createSimulatedRetellLinkRuntime(input?: {
  authenticated?: boolean
  publicConfirmAttempt?: boolean
  ttlMs?: number
  nowMs?: () => number
  adapters?: R4VoiceAdapters
}) {
  const nowMs = input?.nowMs ?? (() => Date.now())
  const ttlMs = input?.ttlMs ?? 15 * 60 * 1000
  const events: R4ConversationEvent[] = []
  const expiresAt = new Date(nowMs() + ttlMs).toISOString()
  const link: R4LinkRecord = {
    linkId: `sim-link-${nowMs()}`,
    ownerUsuarioId: 'u-owner',
    status: 'active',
    expiresAt,
    grantValid: true,
  }
  const store: R4LinkStore = createLinkStore(link)
  events.push({ type: 'link_issued', linkId: link.linkId, expiresAt })

  const orch: R4SessionOrchestrator = createR4SessionOrchestrator({
    adapters: input?.adapters ?? createSimulatedR4Adapters(),
    linkStore: store,
    authenticated: input?.authenticated !== false,
    publicConfirmAttempt: input?.publicConfirmAttempt,
    sessionId: `sim-session-${nowMs()}`,
    source: 'link',
    nowMs,
    isoNow: () => new Date(nowMs()).toISOString(),
    finalizer: createOnceReportFinalizer(() => new Date(nowMs()).toISOString()),
  })

  function snapshot(): R4SessionSnapshot {
    return orch.getSnapshot()
  }

  return {
    events: () => [...events],
    snapshot,
    linkId: link.linkId,
    async consent() {
      const next = await orch.consent()
      if (next.lastError) events.push({ type: 'denied', code: next.lastError.code })
      else events.push({ type: 'consented', sessionId: next.sessionId })
      return next
    },
    async start() {
      const next = await orch.start()
      if (next.callId && next.phase === 'listening') {
        events.push({
          type: 'session_started',
          sessionId: next.sessionId,
          callId: next.callId,
        })
      } else if (next.lastError) {
        events.push({ type: 'denied', code: next.lastError.code })
      }
      return next
    },
    async speak(text: string) {
      const next = await orch.speak(text, `evt-${events.length}`)
      const lastUser = [...next.transcript].reverse().find((row) => row.role === 'user')
      const lastAgent = [...next.transcript].reverse().find((row) => row.role === 'assistant')
      if (lastUser) events.push({ type: 'user_speech', text: lastUser.text })
      if (lastAgent) events.push({ type: 'agent_speech', text: lastAgent.text })
      return next
    },
    async interrupt() {
      const next = await orch.interruptSpeech()
      events.push({ type: 'interrupted' })
      return next
    },
    async recover() {
      const next = await orch.recover()
      if (next.callId && next.phase === 'listening') {
        events.push({ type: 'recovered', callId: next.callId })
      }
      return next
    },
    confirmAction(actionId: string) {
      const result = orch.confirmAction(actionId)
      if (!result.ok) events.push({ type: 'denied', code: result.code })
      return result
    },
    revoke() {
      store.revoke()
      events.push({ type: 'link_revoked', linkId: link.linkId })
      return snapshot()
    },
    async end() {
      const next = await orch.end()
      events.push({
        type: 'session_ended',
        sessionId: next.sessionId,
        reportId: next.report?.sessionId ?? next.sessionId,
        duplicate: next.reportDuplicate,
      })
      return next
    },
  }
}

export type SimulatedRetellLinkRuntime = ReturnType<typeof createSimulatedRetellLinkRuntime>
