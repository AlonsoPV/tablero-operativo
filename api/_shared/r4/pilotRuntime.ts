/**
 * Runtime de piloto R4: contrato de sesión independiente de Guía.
 * El adaptador real permanece deshabilitado. Cero fallback entre proveedores.
 */
import { createLinkOccupancy, createLinkStore } from './linkStore.js'
import { createOnceReportFinalizer } from './reportFinalize.js'
import { createR4SessionOrchestrator } from './sessionOrchestrator.js'
import { createSimulatedR4Adapters } from './simulatedAdapters.js'
import {
  createDisabledOpenAiRealtimeAdapter,
  createDisabledRetellR4Adapter,
} from './disabledLiveAdapters.js'
import { resolveR4PilotPolicy, type R4PilotPolicy } from './pilotPolicy.js'
import type { R4VoiceAdapters, RetellSessionPort } from './contracts.js'
import type { R4LinkRecord, R4SessionSnapshot } from './sessionTypes.js'

export type R4PilotProvider = 'simulated' | 'retell_r4' | 'openai_realtime'

export type R4PilotConnectionEvent =
  | { type: 'consent_required' }
  | { type: 'consented' }
  | { type: 'connecting'; provider: R4PilotProvider }
  | { type: 'connected'; callId: string }
  | { type: 'disconnected'; reportId: string; duplicate: boolean }
  | { type: 'denied'; code: string }
  | { type: 'error'; code: string }

export function selectPilotVoicePort(provider: R4PilotProvider): {
  port: RetellSessionPort
  live: false
} {
  if (provider === 'retell_r4') {
    return { port: createDisabledRetellR4Adapter(), live: false }
  }
  if (provider === 'openai_realtime') {
    return { port: createDisabledOpenAiRealtimeAdapter(), live: false }
  }
  return { port: createSimulatedR4Adapters().retell, live: false }
}

export function createR4PilotRuntime(input?: {
  provider?: R4PilotProvider
  authenticated?: boolean
  publicConfirmAttempt?: boolean
  env?: Record<string, string | undefined>
  occupancy?: ReturnType<typeof createLinkOccupancy>
  link?: Partial<R4LinkRecord>
  sessionId?: string
  nowMs?: () => number
}) {
  const env = input?.env ?? {}
  const policy: R4PilotPolicy = resolveR4PilotPolicy(env)
  const provider: R4PilotProvider = input?.provider ?? 'simulated'
  const nowMs = input?.nowMs ?? (() => Date.now())
  const occupancy = input?.occupancy ?? createLinkOccupancy()
  const events: R4PilotConnectionEvent[] = [{ type: 'consent_required' }]
  const selected = selectPilotVoicePort(provider)
  const adapters: R4VoiceAdapters = {
    ...createSimulatedR4Adapters(),
    retell: selected.port,
  }

  const expiresAt = new Date(nowMs() + 15 * 60 * 1000).toISOString()
  const link: R4LinkRecord = {
    linkId: input?.link?.linkId ?? `pilot-link-${nowMs()}`,
    ownerUsuarioId: input?.link?.ownerUsuarioId ?? 'u-owner',
    status: input?.link?.status ?? 'active',
    expiresAt: input?.link?.expiresAt ?? expiresAt,
    grantValid: input?.link?.grantValid ?? true,
  }

  const orch = createR4SessionOrchestrator({
    adapters,
    linkStore: createLinkStore(link),
    authenticated: input?.authenticated !== false,
    publicConfirmAttempt: input?.publicConfirmAttempt,
    occupancy,
    sessionId: input?.sessionId ?? `pilot-${nowMs()}`,
    source: 'link',
    nowMs,
    isoNow: () => new Date(nowMs()).toISOString(),
    finalizer: createOnceReportFinalizer(() => new Date(nowMs()).toISOString()),
  })

  return {
    policy,
    provider,
    occupancy,
    events: () => [...events],
    snapshot(): R4SessionSnapshot {
      return orch.getSnapshot()
    },
    async consent() {
      const next = await orch.consent()
      if (next.lastError) events.push({ type: 'denied', code: next.lastError.code })
      else events.push({ type: 'consented' })
      return next
    },
    async start() {
      events.push({ type: 'connecting', provider })
      const next = await orch.start()
      if (next.callId && next.phase === 'listening') {
        events.push({ type: 'connected', callId: next.callId })
      } else if (next.lastError) {
        events.push({
          type: next.lastError.code === 'unauthorized' ? 'denied' : 'error',
          code: next.lastError.code,
        })
      }
      return next
    },
    speak: (text: string) => orch.speak(text, `pilot-${events.length}`),
    confirmAction: (actionId: string) => orch.confirmAction(actionId),
    async disconnect() {
      const next = await orch.end()
      events.push({
        type: 'disconnected',
        reportId: next.report?.sessionId ?? next.sessionId,
        duplicate: next.reportDuplicate,
      })
      return next
    },
  }
}

export type R4PilotRuntime = ReturnType<typeof createR4PilotRuntime>
