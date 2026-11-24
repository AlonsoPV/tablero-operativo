import { describe, expect, it } from 'vitest'
import { createLinkStore } from './linkStore.js'
import {
  R4TimeoutError,
  createResilientPortRunner,
  withBoundedRetry,
  withTimeout,
} from './resilience.js'
import { createR4SessionOrchestrator } from './sessionOrchestrator.js'
import {
  createSimulatedLinkAuth,
  createSimulatedRetell,
  createSimulatedStt,
  createSimulatedTts,
} from './simulatedAdapters.js'

function liveSession(
  adapters: Parameters<typeof createR4SessionOrchestrator>[0]['adapters'],
  runPort?: Parameters<typeof createR4SessionOrchestrator>[0]['runPort']
) {
  return createR4SessionOrchestrator({
    adapters,
    linkStore: createLinkStore({
      linkId: 'L1',
      ownerUsuarioId: 'u-owner',
      status: 'active',
      expiresAt: '2099-01-01T00:00:00.000Z',
      grantValid: true,
    }),
    authenticated: true,
    sessionId: 's-resilience',
    isoNow: () => '2026-11-22T12:00:00.000Z',
    runPort,
  })
}

describe('R4.3 resilience (AT-14)', () => {
  it('withTimeout rechaza promesas colgadas', async () => {
    await expect(
      withTimeout(() => new Promise(() => undefined), 20, 'hang')
    ).rejects.toBeInstanceOf(R4TimeoutError)
  })

  it('withBoundedRetry no entra en bucle: tope de 2 reintentos', async () => {
    let calls = 0
    await expect(
      withBoundedRetry(
        async () => {
          calls += 1
          throw Object.assign(new Error('timeout'), { code: 'timeout' })
        },
        { maxRetries: 2, backoffMs: 0, sleep: async () => undefined }
      )
    ).rejects.toMatchObject({ code: 'timeout' })
    expect(calls).toBe(3)
  })

  it('no reintenta errores de permiso', async () => {
    let calls = 0
    await expect(
      withBoundedRetry(
        async () => {
          calls += 1
          throw Object.assign(new Error('permission'), { code: 'permission' })
        },
        { maxRetries: 2, backoffMs: 0 }
      )
    ).rejects.toMatchObject({ code: 'permission' })
    expect(calls).toBe(1)
  })

  it('STT timeout o permiso no inventan transcripcion (R4-AT-04)', async () => {
    const timeoutOrch = liveSession({
      stt: createSimulatedStt({ failWith: 'timeout' }),
      tts: createSimulatedTts(),
      retell: createSimulatedRetell(),
      linkAuth: createSimulatedLinkAuth(),
    })
    await timeoutOrch.consent()
    await timeoutOrch.start()
    const timedOut = await timeoutOrch.speak('hola', 't-timeout')
    expect(timedOut.lastError?.code).toBe('timeout')
    expect(timedOut.transcript.filter((row) => row.role === 'assistant')).toHaveLength(0)

    const permOrch = liveSession({
      stt: createSimulatedStt({ failWith: 'permission' }),
      tts: createSimulatedTts(),
      retell: createSimulatedRetell(),
      linkAuth: createSimulatedLinkAuth(),
    })
    await permOrch.consent()
    await permOrch.start()
    const denied = await permOrch.speak('hola', 't-perm')
    expect(denied.lastError?.code).toBe('permission')
  })

  it('Retell timeout deja recovering y reconexion fallida no marca ended (R4-AT-05)', async () => {
    const orch = liveSession({
      stt: createSimulatedStt(),
      tts: createSimulatedTts(),
      retell: createSimulatedRetell({ failWith: 'timeout' }),
      linkAuth: createSimulatedLinkAuth(),
    })
    await orch.consent()
    await orch.start()
    const timed = await orch.speak('hola', 't1')
    expect(timed.phase).toBe('recovering')
    expect(timed.lastError?.code).toBe('timeout')

    const failingRecover = liveSession({
      stt: createSimulatedStt(),
      tts: createSimulatedTts(),
      retell: createSimulatedRetell({ failWith: 'provider' }),
      linkAuth: createSimulatedLinkAuth(),
    })
    await failingRecover.consent()
    const started = await failingRecover.start()
    expect(started.phase).toBe('error')
    const recovered = await failingRecover.recover()
    expect(recovered.phase).toBe('error')
    expect(recovered.report).toBeNull()
  })

  it('doble cierre produce un solo informe (R4-AT-06)', async () => {
    const orch = liveSession({
      stt: createSimulatedStt(),
      tts: createSimulatedTts(),
      retell: createSimulatedRetell(),
      linkAuth: createSimulatedLinkAuth(),
    })
    await orch.consent()
    await orch.start()
    const first = await orch.end()
    const second = await orch.end()
    expect(first.reportDuplicate).toBe(false)
    expect(second.reportDuplicate).toBe(true)
    expect(second.report).toEqual(first.report)
  })

  it('interrumpe TTS y cancela un turno sin finalizar informe', async () => {
    const orch = liveSession({
      stt: createSimulatedStt(),
      tts: createSimulatedTts(),
      retell: createSimulatedRetell(),
      linkAuth: createSimulatedLinkAuth(),
    })
    await orch.consent()
    await orch.start()
    await orch.speak('hola', 'i1')
    const interrupted = await orch.interruptSpeech()
    expect(interrupted.lastAudioId).toBeNull()
    const cancelled = await orch.cancelTurn()
    expect(cancelled.lastError?.code).toBe('cancelled')
    expect(cancelled.report).toBeNull()
    expect(cancelled.phase).not.toBe('ended')
  })

  it('ignora utterance duplicada', async () => {
    const orch = liveSession({
      stt: createSimulatedStt(),
      tts: createSimulatedTts(),
      retell: createSimulatedRetell(),
      linkAuth: createSimulatedLinkAuth(),
    })
    await orch.consent()
    await orch.start()
    await orch.speak('uno', 'dup')
    const again = await orch.speak('uno otra vez', 'dup')
    expect(again.lastError?.code).toBe('duplicate_turn')
    expect(again.transcript.filter((row) => row.role === 'user')).toHaveLength(1)
  })

  it('el runner resiliente agota reintentos y no llama mas de 3 veces', async () => {
    let calls = 0
    const runner = createResilientPortRunner({
      timeoutMs: 200,
      maxRetries: 2,
      backoffMs: 0,
      sleep: async () => undefined,
    })
    await expect(
      runner('stt', async () => {
        calls += 1
        return { ok: false as const, error: 'timeout', code: 'timeout' as const }
      })
    ).rejects.toMatchObject({ code: 'timeout' })
    expect(calls).toBe(3)
  })
})
