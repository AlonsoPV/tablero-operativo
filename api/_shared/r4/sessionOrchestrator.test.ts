import { describe, expect, it } from 'vitest'
import { createLinkStore } from './linkStore.js'
import { createR4SessionOrchestrator } from './sessionOrchestrator.js'
import {
  createSimulatedR4Adapters,
  createSimulatedRetell,
  createSimulatedStt,
  createSimulatedTts,
  createSimulatedLinkAuth,
} from './simulatedAdapters.js'

function activeLink() {
  return createLinkStore({
    linkId: 'L1',
    ownerUsuarioId: 'u-owner',
    status: 'active',
    expiresAt: '2099-01-01T00:00:00.000Z',
    grantValid: true,
  })
}

function session(overrides: Parameters<typeof createR4SessionOrchestrator>[0] extends infer T
  ? Partial<T>
  : never = {}) {
  return createR4SessionOrchestrator({
    adapters: createSimulatedR4Adapters(),
    linkStore: activeLink(),
    authenticated: true,
    sessionId: 's1',
    isoNow: () => '2026-11-22T12:00:00.000Z',
    ...overrides,
  })
}

describe('R4.2 session orchestrator (AT-13)', () => {
  it('exige consentimiento antes de conectar', async () => {
    const orch = session()
    const started = await orch.start()
    expect(started.phase).toBe('consent')
    expect(started.lastError?.code).toBe('consent_required')
  })

  it('inicia, conversa voz-a-voz con STT/TTS y finaliza un informe', async () => {
    const orch = session()
    await orch.consent()
    const started = await orch.start()
    expect(started.phase).toBe('listening')
    expect(started.callId).toBe('sim-call-s1')

    const spoken = await orch.speak('Cuales estan vencidas?', 'u1')
    expect(spoken.phase).toBe('listening')
    expect(spoken.transcript.map((row) => row.role)).toEqual(['user', 'assistant'])
    expect(spoken.transcript[0]?.text).toBe('Cuales estan vencidas?')
    expect(spoken.lastAudioId).toMatch(/^sim-audio-/)

    const ended = await orch.end()
    expect(ended.phase).toBe('ended')
    expect(ended.reportDuplicate).toBe(false)
    expect(ended.report?.sessionId).toBe('s1')
  })

  it('pausa y reanuda sin perder el transcript', async () => {
    const orch = session()
    await orch.consent()
    await orch.start()
    await orch.speak('hola', 't1')
    const paused = await orch.pause()
    expect(paused.phase).toBe('paused')
    const blocked = await orch.speak('despues', 't2')
    expect(blocked.lastError?.code).toBe('paused')
    const resumed = await orch.resume()
    expect(resumed.phase).toBe('listening')
    expect(resumed.transcript).toHaveLength(2)
  })

  it('deniega liga expirada, revocada, grant invalido, sesion ajena y confirmacion publica', async () => {
    const expired = session({
      linkStore: createLinkStore({
        linkId: 'L1',
        ownerUsuarioId: 'u-owner',
        status: 'expired',
        expiresAt: '2000-01-01T00:00:00.000Z',
        grantValid: true,
      }),
    })
    await expired.consent()
    expect((await expired.start()).lastError?.code).toBe('expired')

    const revokedStore = activeLink()
    const revoked = session({ linkStore: revokedStore })
    await revoked.consent()
    revokedStore.revoke()
    expect((await revoked.start()).lastError?.code).toBe('revoked')

    const grant = session({
      linkStore: createLinkStore({
        linkId: 'L1',
        ownerUsuarioId: 'u-owner',
        status: 'active',
        expiresAt: '2099-01-01T00:00:00.000Z',
        grantValid: false,
      }),
    })
    await grant.consent()
    expect((await grant.start()).lastError?.code).toBe('invalid_grant')

    const foreign = session({ requesterUsuarioId: 'u-other' })
    await foreign.consent()
    expect((await foreign.start()).lastError?.code).toBe('foreign_session')

    const publicConfirm = session({ publicConfirmAttempt: true, authenticated: false })
    await publicConfirm.consent()
    const confirm = publicConfirm.confirmAction('a1')
    expect(confirm.ok).toBe(false)
    if (confirm.ok) throw new Error('expected deny')
    expect(confirm.code).toBe('unauthenticated')
  })

  it('bloquea operaciones protegidas sin autenticacion aunque la liga este vigente', () => {
    const orch = session({ authenticated: false })
    const confirm = orch.confirmAction('accion-1')
    const comms = orch.queueCommunication('draft-1')
    expect(confirm).toMatchObject({ ok: false, code: 'unauthenticated' })
    expect(comms).toMatchObject({ ok: false, code: 'unauthenticated' })
    expect(orch.getSnapshot().protectedOps).toHaveLength(2)
    expect(orch.getSnapshot().protectedOps.every((op) => op.ok === false)).toBe(true)
  })

  it('bloquea confirmacion publica aunque el actor este autenticado', () => {
    const orch = session({ authenticated: true, publicConfirmAttempt: true })
    const confirm = orch.confirmAction('accion-1')
    expect(confirm).toMatchObject({ ok: false, code: 'public_confirm_denied' })
    expect(orch.getSnapshot().phase).toBe('denied')
  })

  it('permite confirmacion autenticada cuando la liga y el grant son validos', () => {
    const orch = session({ authenticated: true })
    expect(orch.confirmAction('accion-1')).toEqual({
      ok: true,
      type: 'confirmAction',
      id: 'accion-1',
    })
  })

  it('recupera una sesion tras fallo de reconexion de voz-a-voz', async () => {
    let turns = 0
    const retell = createSimulatedRetell()
    const wrapped = {
      ...retell,
      async speakTurn(args: { callId: string; utterance: string }) {
        turns += 1
        if (turns === 1) {
          return { ok: false as const, error: 'Retell simulado: reconnect', code: 'reconnect' as const }
        }
        return retell.speakTurn(args)
      },
    }
    const orch = session({
      adapters: {
        stt: createSimulatedStt(),
        tts: createSimulatedTts(),
        retell: wrapped,
        linkAuth: createSimulatedLinkAuth(),
      },
    })
    await orch.consent()
    await orch.start()
    const failed = await orch.speak('hola', 'r1')
    expect(failed.phase).toBe('recovering')
    const recovered = await orch.recover()
    expect(recovered.phase).toBe('listening')
    const ok = await orch.speak('segunda', 'r2')
    expect(ok.transcript.some((row) => row.text === 'segunda')).toBe(true)
  })
})
