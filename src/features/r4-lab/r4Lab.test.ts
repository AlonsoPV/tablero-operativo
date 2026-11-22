import { describe, expect, it } from 'vitest'
import { isVoiceR4UiEnabled } from '@/constants'
import { moodFromPhase, sessionAuthForScenario } from './labScenarios'

describe('R4.4 lab UI gates', () => {
  it('deja la UI apagada si el flag no es 1 (R4-AT-08)', () => {
    expect(isVoiceR4UiEnabled({})).toBe(false)
    expect(isVoiceR4UiEnabled({ VITE_AGENT_VOICE_R4: 'true' })).toBe(false)
    expect(isVoiceR4UiEnabled({ VITE_AGENT_VOICE_R4: '0' })).toBe(false)
    expect(isVoiceR4UiEnabled({ VITE_AGENT_VOICE_R4: '' })).toBe(false)
    expect(isVoiceR4UiEnabled({ VITE_AGENT_VOICE_R4: '1' })).toBe(true)
  })

  it('mapea fases de sesion a moods de GuidePresence', () => {
    expect(moodFromPhase('connecting')).toBe('connecting')
    expect(moodFromPhase('listening')).toBe('listening')
    expect(moodFromPhase('speaking')).toBe('speaking')
    expect(moodFromPhase('paused')).toBe('muted')
    expect(moodFromPhase('recovering')).toBe('thinking')
    expect(moodFromPhase('consent')).toBe('idle')
  })

  it('la confirmacion publica no viaja autenticada', () => {
    expect(sessionAuthForScenario('public_confirm')).toEqual({
      authenticated: false,
      publicConfirmAttempt: true,
      requesterUsuarioId: 'u-owner',
    })
    expect(sessionAuthForScenario('foreign').requesterUsuarioId).toBe('u-other')
  })
})
