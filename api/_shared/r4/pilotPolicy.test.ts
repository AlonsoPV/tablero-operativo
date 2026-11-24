import { describe, expect, it } from 'vitest'
import { R4_PILOT_DECISIONS, resolveR4PilotPolicy } from './pilotPolicy.js'

describe('R4 pilot policy', () => {
  it('adopta agente Retell R4 independiente, comparador experimental y sin fallback', () => {
    const policy = resolveR4PilotPolicy({})
    expect(policy.primaryAgent).toBe('retell_r4_independent_of_guide')
    expect(policy.comparator).toBe('openai_realtime_experimental')
    expect(policy.autoFallback).toBe(false)
    expect(policy.consentBeforeAudioCapture).toBe(true)
    expect(policy.publicLinkAccess).toBe('single_authorized_session')
    expect(policy.protectedConfirm).toBe('authenticated_authorized_owner')
    expect(policy.audioRetention).toBe('none')
    expect(policy.retainAudio).toBe(false)
    expect(policy.liveProvidersAuthorized).toBe(false)
    expect(policy.reuseGuideRetellAgent).toBe(false)
    expect(policy.backendVoiceFlag).toBe(false)
    expect(R4_PILOT_DECISIONS.autoFallback).toBe(false)
  })

  it('permite retencion de audio solo con flag explicito; no enciende proveedores', () => {
    const policy = resolveR4PilotPolicy({
      AGENT_VOICE_R4_RETAIN_AUDIO: '1',
      AGENT_VOICE_R4: '1',
      VITE_AGENT_VOICE_R4: '1',
    })
    expect(policy.audioRetention).toBe('configured')
    expect(policy.retainAudio).toBe(true)
    expect(policy.liveProvidersAuthorized).toBe(false)
    expect(policy.backendVoiceFlag).toBe(true)
    expect(policy.uiLabFlag).toBe(true)
  })
})
