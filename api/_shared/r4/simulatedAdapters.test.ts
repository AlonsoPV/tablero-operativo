import { describe, expect, it } from 'vitest'
import {
  createSimulatedLinkAuth,
  createSimulatedR4Adapters,
  createSimulatedRetell,
  createSimulatedStt,
  createSimulatedTts,
} from './simulatedAdapters.js'

describe('R4 simulated adapters', () => {
  it('STT/TTS/Retell responden en memoria sin proveedor real', async () => {
    const adapters = createSimulatedR4Adapters()
    const stt = await adapters.stt.transcribe({})
    const tts = await adapters.tts.synthesize({ text: 'hola' })
    const call = await adapters.retell.start({ sessionId: 's1' })

    expect(stt).toMatchObject({ ok: true, provider: 'simulated' })
    expect(tts).toMatchObject({ ok: true, provider: 'simulated' })
    expect(call).toMatchObject({ ok: true, status: 'ready' })
  })

  it('propaga fallos recuperables de STT y TTS', async () => {
    const stt = await createSimulatedStt({ failWith: 'timeout' }).transcribe({})
    const tts = await createSimulatedTts({ failWith: 'provider' }).synthesize({ text: 'x' })
    expect(stt).toEqual({ ok: false, error: 'STT simulado: timeout', code: 'timeout' })
    expect(tts).toEqual({ ok: false, error: 'TTS simulado: provider', code: 'provider' })
  })

  it('permite interrumpir audio TTS simulado', async () => {
    const tts = createSimulatedTts()
    const started = await tts.synthesize({ text: 'mensaje' })
    expect(started.ok).toBe(true)
    if (!started.ok) throw new Error('expected ok')
    await expect(tts.interrupt?.(started.audioId)).resolves.toEqual({ ok: true })
    await expect(tts.interrupt?.(started.audioId)).resolves.toEqual({
      ok: false,
      error: 'Audio no activo.',
    })
  })

  it('Retell simulado cubre timeout y cierre', async () => {
    const failing = createSimulatedRetell({ failWith: 'timeout' })
    const started = await createSimulatedRetell().start({ sessionId: 'a' })
    expect(started.ok).toBe(true)
    if (!started.ok) throw new Error('expected ok')
    const turn = await failing.speakTurn({ callId: started.callId, utterance: 'hola' })
    expect(turn).toMatchObject({ ok: false, code: 'timeout' })
    const ended = await createSimulatedRetell().end({ callId: started.callId })
    expect(ended).toMatchObject({ ok: true, status: 'ended' })
  })

  it('LinkAuth simulado cubre AT-13: expirado, revocado, ajeno, grant y confirmación pública', () => {
    const auth = createSimulatedLinkAuth()
    const base = {
      linkId: 'L1',
      ownerUsuarioId: 'u-owner',
      expiresAt: '2099-01-01T00:00:00.000Z',
      status: 'active' as const,
    }

    expect(auth.evaluate({ ...base, status: 'revoked' }).ok).toBe(false)
    expect(auth.evaluate({ ...base, status: 'expired' })).toMatchObject({
      ok: false,
      code: 'expired',
    })
    expect(
      auth.evaluate({
        ...base,
        expiresAt: '2000-01-01T00:00:00.000Z',
        nowMs: Date.parse('2026-11-22T00:00:00.000Z'),
      })
    ).toMatchObject({ ok: false, code: 'expired' })
    expect(
      auth.evaluate({ ...base, requesterUsuarioId: 'u-other' })
    ).toMatchObject({ ok: false, code: 'foreign_session' })
    expect(auth.evaluate({ ...base, grantValid: false })).toMatchObject({
      ok: false,
      code: 'invalid_grant',
    })
    expect(auth.evaluate({ ...base, publicConfirmAttempt: true })).toMatchObject({
      ok: false,
      code: 'public_confirm_denied',
    })
    expect(auth.evaluate({ ...base, grantValid: true })).toEqual({
      ok: true,
      linkId: 'L1',
      usuarioId: 'u-owner',
      accessMode: 'read',
      requiresAuthenticatedApproval: true,
    })
  })
})
