import { describe, expect, it } from 'vitest'
import { createRetellR4LiveAdapter } from './retellR4LiveAdapter.js'
import {
  providerRecordingMustBeVerifiedSeparately,
  resolveRetellR4LiveGate,
} from './retellR4LiveGate.js'

describe('Retell R4 live adapter (fail-closed)', () => {
  it('no conecta con flag off, sin LIVE_OK o sin secretos R4', () => {
    expect(resolveRetellR4LiveGate({}).code).toBe('flag_off')
    expect(
      resolveRetellR4LiveGate({ AGENT_VOICE_R4: '1' }).code
    ).toBe('live_not_authorized')
    expect(
      resolveRetellR4LiveGate({
        AGENT_VOICE_R4: '1',
        AGENT_VOICE_R4_LIVE_OK: '1',
      }).code
    ).toBe('missing_credentials')
  })

  it('rechaza reutilizar el agente de Guía o secretos VITE_', () => {
    expect(
      resolveRetellR4LiveGate({
        AGENT_VOICE_R4: '1',
        AGENT_VOICE_R4_LIVE_OK: '1',
        RETELL_R4_AGENT_ID: 'same-agent',
        RETELL_R4_API_KEY: 'placeholder-not-used',
        RETELL_GUIDE_AGENT_ID: 'same-agent',
      }).code
    ).toBe('guide_agent_reuse_denied')
    expect(
      resolveRetellR4LiveGate({
        AGENT_VOICE_R4: '1',
        VITE_RETELL_R4_API_KEY: 'leaked',
      }).code
    ).toBe('secret_on_client')
  })

  it('con credenciales R4 distintas sigue connect_blocked y no llama fetch', async () => {
    let fetches = 0
    const fetchImpl = (async () => {
      fetches += 1
      return new Response('nope')
    }) as typeof fetch
    const env = {
      AGENT_VOICE_R4: '1',
      AGENT_VOICE_R4_LIVE_OK: '1',
      RETELL_R4_AGENT_ID: 'agent-r4-distinct',
      RETELL_R4_API_KEY: 'placeholder-not-used',
      RETELL_GUIDE_AGENT_ID: 'agent-guide',
      RETELL_AGENT_ID: 'agent-interview',
    }
    const gate = resolveRetellR4LiveGate(env)
    expect(gate.code).toBe('connect_blocked')
    expect(gate.ready).toBe(true)
    expect(gate.connect).toBe(false)

    const adapter = createRetellR4LiveAdapter(env, fetchImpl)
    const started = await adapter.start({ sessionId: 's1' })
    expect(started.ok).toBe(false)
    if (!started.ok) expect(started.code).toBe('unauthorized')
    expect(fetches).toBe(0)
    expect(adapter.lastGate().code).toBe('connect_blocked')
  })

  it('no asume que la retencion local apaga grabaciones de Retell', () => {
    const status = providerRecordingMustBeVerifiedSeparately()
    expect(status.controlsLocalBlobsOnly).toBe(true)
    expect(status.mustVerifyInProviderConsole).toBe(true)
    expect(status.retellDashboardRecording).toBe('unknown')
  })
})
