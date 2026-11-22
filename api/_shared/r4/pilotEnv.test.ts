import { describe, expect, it } from 'vitest'
import {
  findClientLeakedSecrets,
  isForbiddenPilotTarget,
  pilotBudgetExceeded,
  R4_PILOT_ENV_SPEC,
  R4_PILOT_MAX_SESSION_MS,
} from './pilotEnv.js'

describe('R4 pilot isolated environment (IMPLEMENTED LOCAL)', () => {
  it('prohíbe QA A/B, DEV, PROD y Preview R3 y no declara recursos provisionados', () => {
    expect(R4_PILOT_ENV_SPEC.provisioned).toBe(false)
    expect(R4_PILOT_ENV_SPEC.connectAuthorized).toBe(false)
    expect(isForbiddenPilotTarget('prod')).toBe(true)
    expect(isForbiddenPilotTarget('qa-ab')).toBe(true)
    expect(isForbiddenPilotTarget('dev')).toBe(true)
    expect(isForbiddenPilotTarget('preview-r3')).toBe(true)
    expect(isForbiddenPilotTarget('r4-pilot')).toBe(false)
    expect(R4_PILOT_ENV_SPEC.maxConcurrentSessions).toBe(1)
    expect(R4_PILOT_ENV_SPEC.maxSessionMs).toBe(R4_PILOT_MAX_SESSION_MS)
  })

  it('detecta secretos filtrados al cliente y respeta el presupuesto de sesion', () => {
    expect(
      findClientLeakedSecrets({ VITE_RETELL_R4_API_KEY: 'x', VITE_AGENT_VOICE_R4: '1' })
    ).toEqual(['VITE_RETELL_R4_API_KEY'])
    expect(pilotBudgetExceeded({ elapsedMs: R4_PILOT_MAX_SESSION_MS - 1 })).toBe(false)
    expect(pilotBudgetExceeded({ elapsedMs: R4_PILOT_MAX_SESSION_MS })).toBe(true)
  })
})
