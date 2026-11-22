import { describe, expect, it } from 'vitest'
import { createLinkOccupancy } from './linkStore.js'
import { createR4PilotRuntime } from './pilotRuntime.js'
import { R4_PILOT_SECRET_ENV_KEYS } from './pilotPolicy.js'
import {
  createDisabledOpenAiRealtimeAdapter,
  createDisabledRetellR4Adapter,
} from './disabledLiveAdapters.js'

describe('R4.5+ pilot runtime (SIMULATED, live adapters disabled)', () => {
  it('no lee credenciales de Retell ni OpenAI al arrancar adaptadores deshabilitados', async () => {
    const env = new Proxy(
      {} as Record<string, string | undefined>,
      {
        get(_target, prop) {
          if (R4_PILOT_SECRET_ENV_KEYS.includes(prop as (typeof R4_PILOT_SECRET_ENV_KEYS)[number])) {
            throw new Error(`secret leaked: ${String(prop)}`)
          }
          return undefined
        },
      }
    )
    expect(await createDisabledRetellR4Adapter().start({ sessionId: 'x' })).toMatchObject({
      ok: false,
      code: 'unauthorized',
    })
    expect(await createDisabledOpenAiRealtimeAdapter().start({ sessionId: 'x' })).toMatchObject({
      ok: false,
      code: 'unauthorized',
    })
    const runtime = createR4PilotRuntime({ provider: 'retell_r4', env })
    await runtime.consent()
    const started = await runtime.start()
    expect(started.phase).toBe('denied')
    expect(started.lastError?.code).toBe('unauthorized')
    expect(runtime.policy.autoFallback).toBe(false)
  })

  it('exige consentimiento, bloquea confirmacion publica y cierra el informe una sola vez', async () => {
    const runtime = createR4PilotRuntime({ authenticated: true })
    expect((await runtime.start()).lastError?.code).toBe('consent_required')
    await runtime.consent()
    const started = await runtime.start()
    expect(started.phase).toBe('listening')
    expect(runtime.events().some((event) => event.type === 'connected')).toBe(true)
    const first = await runtime.disconnect()
    const second = await runtime.disconnect()
    expect(first.reportDuplicate).toBe(false)
    expect(second.reportDuplicate).toBe(true)
    expect(runtime.events().filter((event) => event.type === 'disconnected')).toHaveLength(2)

    const publicRuntime = createR4PilotRuntime({
      authenticated: true,
      publicConfirmAttempt: true,
    })
    expect(publicRuntime.confirmAction('a1')).toMatchObject({
      ok: false,
      code: 'public_confirm_denied',
    })
  })

  it('una liga publica solo admite una sesion autorizada viva', async () => {
    const occupancy = createLinkOccupancy()
    const link = { linkId: 'shared-link' }
    const first = createR4PilotRuntime({
      occupancy,
      link,
      sessionId: 's-a',
      authenticated: true,
    })
    const second = createR4PilotRuntime({
      occupancy,
      link,
      sessionId: 's-b',
      authenticated: true,
    })
    await first.consent()
    await second.consent()
    expect((await first.start()).phase).toBe('listening')
    const blocked = await second.start()
    expect(blocked.phase).toBe('denied')
    expect(blocked.lastError?.code).toBe('session_occupied')
    await first.disconnect()
    expect((await second.start()).phase).toBe('listening')
  })
})
