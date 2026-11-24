import { describe, expect, it } from 'vitest'
import { AGENT_VOICE_R4_FLAG, isAgentLinkR4Enabled, isAgentVoiceR4Enabled } from './flags.js'

describe('R4 flags', () => {
  it('queda apagado cuando el flag está ausente', () => {
    expect(isAgentVoiceR4Enabled({})).toBe(false)
    expect(isAgentLinkR4Enabled({})).toBe(false)
  })

  it('solo enciende con el valor estricto 1', () => {
    expect(isAgentVoiceR4Enabled({ [AGENT_VOICE_R4_FLAG]: '1' })).toBe(true)
    expect(isAgentLinkR4Enabled({ [AGENT_VOICE_R4_FLAG]: '1' })).toBe(true)
  })

  it('trata basura como apagado (paridad con flags R1/R3)', () => {
    for (const value of ['true', 'TRUE', '0', '', 'yes', 'on', '2']) {
      expect(isAgentVoiceR4Enabled({ [AGENT_VOICE_R4_FLAG]: value })).toBe(false)
    }
  })

  it('no depende de flags R1/R3', () => {
    expect(
      isAgentVoiceR4Enabled({
        AGENT_ORCHESTRATOR_R1: '1',
        R1_EXECUTION_ENABLED: '1',
        AGENT_MEMORY_R3: '1',
      })
    ).toBe(false)
  })
})
