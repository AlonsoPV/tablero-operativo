import { describe, expect, it } from 'vitest'
import {
  createSimulatedRetellLinkRuntime,
  selectR4VoiceProvider,
} from './providerRuntime.js'
import { AGENT_VOICE_R4_FLAG } from './flags.js'
import { createSimulatedR4Adapters } from './simulatedAdapters.js'

describe('R4.5 simulated Retell/link runtime', () => {
  it('bloquea proveedores reales aunque el laboratorio esté encendido', () => {
    expect(selectR4VoiceProvider({})).toEqual({
      ok: false,
      provider: 'simulated',
      code: 'flag_off',
    })
    expect(
      selectR4VoiceProvider({
        [AGENT_VOICE_R4_FLAG]: '1',
        AGENT_VOICE_R4_PROVIDER: 'retell',
      })
    ).toEqual({ ok: false, provider: 'retell', code: 'real_provider_not_authorized' })
    expect(
      selectR4VoiceProvider({
        [AGENT_VOICE_R4_FLAG]: '1',
        AGENT_VOICE_R4_PROVIDER: 'openai_realtime',
      })
    ).toEqual({
      ok: false,
      provider: 'openai_realtime',
      code: 'real_provider_not_authorized',
    })
    expect(selectR4VoiceProvider({ [AGENT_VOICE_R4_FLAG]: '1' })).toEqual({
      ok: true,
      provider: 'simulated',
    })
  })

  it('emite eventos de liga, consentimiento, conversacion y cierre unico', async () => {
    const runtime = createSimulatedRetellLinkRuntime({ authenticated: true })
    await runtime.consent()
    const started = await runtime.start()
    expect(started.callId).toBeTruthy()
    await runtime.speak('Cuales estan vencidas?')
    await runtime.interrupt()
    const ended = await runtime.end()
    const again = await runtime.end()
    const types = runtime.events().map((event) => event.type)
    expect(types[0]).toBe('link_issued')
    expect(types).toContain('consented')
    expect(types).toContain('session_started')
    expect(types).toContain('user_speech')
    expect(types).toContain('agent_speech')
    expect(types).toContain('interrupted')
    expect(types.filter((type) => type === 'session_ended')).toHaveLength(2)
    expect(ended.reportDuplicate).toBe(false)
    expect(again.reportDuplicate).toBe(true)
  })

  it('recupera una interrupcion de proveedor y deniega confirmacion publica', async () => {
    const base = createSimulatedR4Adapters()
    let drops = 0
    const runtime = createSimulatedRetellLinkRuntime({
      authenticated: true,
      adapters: {
        ...base,
        retell: {
          ...base.retell,
          async speakTurn(input) {
            if (drops++ === 0) {
              return { ok: false, error: 'caida simulada', code: 'reconnect' }
            }
            return base.retell.speakTurn(input)
          },
        },
      },
    })
    await runtime.consent()
    await runtime.start()
    const dropped = await runtime.speak('Que tengo pendiente?')
    expect(dropped.phase).toBe('recovering')
    const recovered = await runtime.recover()
    expect(recovered.phase).toBe('listening')
    expect(runtime.events().some((event) => event.type === 'recovered')).toBe(true)

    const publicRuntime = createSimulatedRetellLinkRuntime({
      authenticated: false,
      publicConfirmAttempt: true,
    })
    const confirm = publicRuntime.confirmAction('accion-1')
    expect(confirm.ok).toBe(false)
    expect(confirm.ok === false && confirm.code).toBe('unauthenticated')
  })

  it('revoca la liga temporal y deniega un start posterior', async () => {
    const runtime = createSimulatedRetellLinkRuntime()
    await runtime.consent()
    runtime.revoke()
    const started = await runtime.start()
    expect(started.phase).toBe('denied')
    expect(started.lastError?.code).toBe('revoked')
    expect(runtime.events().some((event) => event.type === 'link_revoked')).toBe(true)
  })
})
