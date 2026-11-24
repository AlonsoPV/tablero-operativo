import type { R4VoiceAdapters } from './contracts.js'
import { createOnceReportFinalizer } from './reportFinalize.js'
import { R4TimeoutError } from './resilience.js'
import type { R4LinkOccupancy, R4LinkStore } from './linkStore.js'
import type {
  R4PortRunner,
  R4ProtectedOpType,
  R4SessionErrorCode,
  R4SessionSnapshot,
  R4TranscriptItem,
} from './sessionTypes.js'

const defaultRunPort: R4PortRunner = async (_label, fn) => fn()

export type CreateR4SessionInput = {
  adapters: R4VoiceAdapters
  linkStore: R4LinkStore
  authenticated: boolean
  publicConfirmAttempt?: boolean
  requesterUsuarioId?: string | null
  sessionId?: string
  source?: 'voice' | 'link'
  nowMs?: () => number
  isoNow?: () => string
  runPort?: R4PortRunner
  finalizer?: ReturnType<typeof createOnceReportFinalizer>
  occupancy?: R4LinkOccupancy
}

export function createR4SessionOrchestrator(input: CreateR4SessionInput) {
  const adapters = input.adapters
  const linkStore = input.linkStore
  const runPort = input.runPort ?? defaultRunPort
  const nowMs = input.nowMs ?? (() => Date.now())
  const isoNow = input.isoNow ?? (() => new Date().toISOString())
  const finalizer = input.finalizer ?? createOnceReportFinalizer(isoNow)
  const sessionId = input.sessionId ?? `r4-${nowMs()}`
  const source = input.source ?? 'voice'
  const seenUtterances = new Set<string>()
  let cancelledTurn = false
  let seq = 0

  let snapshot: R4SessionSnapshot = {
    phase: 'consent',
    sessionId,
    callId: null,
    consented: false,
    authenticated: input.authenticated,
    source,
    link: linkStore.get(),
    lastLinkDecision: null,
    transcript: [],
    lastError: null,
    lastAudioId: null,
    report: null,
    reportDuplicate: false,
    protectedOps: [],
    reconnectAttempts: 0,
  }

  function getSnapshot(): R4SessionSnapshot {
    return {
      ...snapshot,
      link: linkStore.get(),
      transcript: [...snapshot.transcript],
      protectedOps: [...snapshot.protectedOps],
    }
  }

  function portErrorSnapshot(error: unknown) {
    if (error instanceof R4TimeoutError) {
      return fail('timeout', error.message)
    }
    const code =
      error && typeof error === 'object' && 'code' in error
        ? String((error as { code: unknown }).code)
        : 'provider'
    const message = error instanceof Error ? error.message : 'Fallo de puerto simulado.'
    const mapped: R4SessionErrorCode = isKnownError(code) ? code : 'provider'
    return fail(mapped, message, mapped === 'reconnect' ? 'recovering' : undefined)
  }

  function fail(code: R4SessionErrorCode, message: string, phase?: R4SessionSnapshot['phase']) {
    snapshot = {
      ...snapshot,
      phase: phase ?? (code === 'denied' || isAuthCode(code) ? 'denied' : 'error'),
      lastError: { code, message },
    }
    return getSnapshot()
  }

  function evaluateLink(publicConfirmAttempt = input.publicConfirmAttempt === true) {
    const link = linkStore.get()
    snapshot = { ...snapshot, link }
    const decision = adapters.linkAuth.evaluate({
      linkId: link.linkId,
      status: link.status,
      expiresAt: link.expiresAt,
      ownerUsuarioId: link.ownerUsuarioId,
      requesterUsuarioId: input.requesterUsuarioId,
      grantValid: link.grantValid,
      publicConfirmAttempt,
      nowMs: nowMs(),
    })
    snapshot = { ...snapshot, lastLinkDecision: decision }
    return decision
  }

  function gateLive(action: string) {
    if (snapshot.phase === 'ended') {
      return fail('ended', `Sesion finalizada; no se puede ${action}.`, 'ended')
    }
    if (!snapshot.consented) {
      return fail('consent_required', 'Debes aceptar el consentimiento para continuar.', 'consent')
    }
    const decision = evaluateLink(false)
    if (!decision.ok) {
      return fail(decision.code, decision.error, 'denied')
    }
    if (snapshot.phase === 'paused' && action !== 'resume' && action !== 'end') {
      return fail('paused', 'La sesion esta en pausa.', 'paused')
    }
    return null
  }

  async function consent() {
    snapshot = { ...snapshot, consented: true, lastError: null }
    const decision = evaluateLink(false)
    if (!decision.ok) {
      return fail(decision.code, decision.error, 'denied')
    }
    return getSnapshot()
  }

  async function start() {
    if (!snapshot.consented) {
      return fail('consent_required', 'Debes aceptar el consentimiento antes de conectar.', 'consent')
    }
    const blocked = gateLive('conectar')
    if (blocked) return blocked
    if (
      snapshot.callId &&
      (snapshot.phase === 'connecting' ||
        snapshot.phase === 'listening' ||
        snapshot.phase === 'speaking' ||
        snapshot.phase === 'paused' ||
        snapshot.phase === 'recovering')
    ) {
      return fail('session_occupied', 'Esta liga ya tiene una sesion autorizada activa.', snapshot.phase)
    }
    const occupancy = input.occupancy
    if (occupancy) {
      const claim = occupancy.claim(snapshot.link.linkId, sessionId)
      if (!claim.ok) {
        return fail(
          'session_occupied',
          'La liga publica solo admite una sesion autorizada a la vez.',
          'denied'
        )
      }
    }
    snapshot = { ...snapshot, phase: 'connecting', lastError: null }
    let started
    try {
      started = await runPort('retell.start', () =>
        adapters.retell.start({ sessionId, grant: snapshot.link.grantValid ? 'sim-grant' : undefined })
      )
    } catch (error) {
      occupancy?.release(snapshot.link.linkId, sessionId)
      return portErrorSnapshot(error)
    }
    if (!started.ok) {
      occupancy?.release(snapshot.link.linkId, sessionId)
      return fail(started.code, started.error, started.code === 'unauthorized' ? 'denied' : 'error')
    }
    snapshot = {
      ...snapshot,
      phase: 'listening',
      callId: started.callId,
      lastError: null,
    }
    return getSnapshot()
  }

  async function speak(utterance: string, utteranceId?: string) {
    const blocked = gateLive('hablar')
    if (blocked) return blocked
    if (!snapshot.callId) return fail('not_connected', 'No hay llamada activa.')
    if (cancelledTurn) {
      cancelledTurn = false
      return fail('cancelled', 'Turno cancelado.', snapshot.phase === 'paused' ? 'paused' : 'listening')
    }
    const id = utteranceId ?? `utt-${++seq}`
    if (utteranceId && seenUtterances.has(utteranceId)) {
      return fail('duplicate_turn', 'Turno duplicado; se ignora.', snapshot.phase)
    }
    if (utteranceId) seenUtterances.add(utteranceId)

    snapshot = { ...snapshot, phase: 'listening', lastError: null }

    let stt
    try {
      stt = await runPort('stt.transcribe', () => adapters.stt.transcribe({}))
    } catch (error) {
      return portErrorSnapshot(error)
    }
    if (!stt.ok) {
      return fail(stt.code, stt.error)
    }
    const userText = utterance.trim() || stt.text
    const userItem: R4TranscriptItem = { id: `${id}-user`, role: 'user', text: userText, utteranceId: id }
    snapshot = { ...snapshot, transcript: [...snapshot.transcript, userItem] }

    let turn
    try {
      turn = await runPort('retell.speakTurn', () =>
        adapters.retell.speakTurn({ callId: snapshot.callId!, utterance: userText })
      )
    } catch (error) {
      return portErrorSnapshot(error)
    }
    if (!turn.ok) {
      const recovering = turn.code === 'reconnect' || turn.code === 'timeout'
      snapshot = {
        ...snapshot,
        phase: recovering ? 'recovering' : 'error',
        lastError: { code: turn.code, message: turn.error },
      }
      return getSnapshot()
    }

    snapshot = { ...snapshot, phase: 'speaking' }
    const reply = `Recibido: ${userText}`
    let tts
    try {
      tts = await runPort('tts.synthesize', () => adapters.tts.synthesize({ text: reply, interruptible: true }))
    } catch (error) {
      return portErrorSnapshot(error)
    }
    if (!tts.ok) {
      return fail(tts.code, tts.error)
    }
    const assistantItem: R4TranscriptItem = {
      id: `${id}-assistant`,
      role: 'assistant',
      text: reply,
      utteranceId: id,
    }
    snapshot = {
      ...snapshot,
      phase: 'listening',
      lastAudioId: tts.audioId,
      transcript: [...snapshot.transcript, assistantItem],
      lastError: null,
    }
    return getSnapshot()
  }

  async function pause() {
    const blocked = gateLive('pausar')
    if (blocked) return blocked
    snapshot = { ...snapshot, phase: 'paused', lastError: null }
    return getSnapshot()
  }

  async function resume() {
    if (snapshot.phase !== 'paused') {
      return fail('not_connected', 'No hay una sesion en pausa.', snapshot.phase)
    }
    const blocked = gateLive('resume')
    if (blocked) return blocked
    snapshot = { ...snapshot, phase: 'listening', lastError: null }
    return getSnapshot()
  }

  async function interruptSpeech() {
    if (!snapshot.lastAudioId) {
      return fail('interrupted', 'No hay audio activo para interrumpir.', snapshot.phase)
    }
    const result = await adapters.tts.interrupt?.(snapshot.lastAudioId)
    if (!result?.ok) {
      return fail('interrupted', result?.error ?? 'No se pudo interrumpir.', snapshot.phase)
    }
    snapshot = { ...snapshot, lastAudioId: null, phase: 'listening', lastError: null }
    return getSnapshot()
  }

  async function cancelTurn() {
    cancelledTurn = true
    snapshot = {
      ...snapshot,
      phase: snapshot.phase === 'speaking' ? 'listening' : snapshot.phase,
      lastError: { code: 'cancelled', message: 'Turno cancelado. El informe no se finalizo.' },
    }
    return getSnapshot()
  }

  async function recover() {
    if (snapshot.phase !== 'recovering' && snapshot.phase !== 'error') {
      return fail('not_connected', 'No hay una sesion que recuperar.', snapshot.phase)
    }
    if (snapshot.reconnectAttempts >= 1) {
      return fail('reconnect', 'Reconexion agotada.', 'error')
    }
    snapshot = {
      ...snapshot,
      reconnectAttempts: snapshot.reconnectAttempts + 1,
      phase: 'connecting',
      lastError: null,
    }
    let started
    try {
      started = await runPort('retell.recover', () =>
        adapters.retell.start({ sessionId, grant: snapshot.link.grantValid ? 'sim-grant' : undefined })
      )
    } catch (error) {
      return portErrorSnapshot(error)
    }
    if (!started.ok) {
      return fail('reconnect', started.error, 'error')
    }
    snapshot = {
      ...snapshot,
      phase: 'listening',
      callId: started.callId,
      lastError: null,
    }
    return getSnapshot()
  }

  async function end() {
    if (snapshot.callId) {
      try {
        await runPort('retell.end', () => adapters.retell.end({ callId: snapshot.callId! }))
      } catch {
        /* el informe se cierra igual: no dejar la sesion a medias */
      }
    }
    const closed = finalizer.finalize({ sessionId, source })
    input.occupancy?.release(snapshot.link.linkId, sessionId)
    snapshot = {
      ...snapshot,
      phase: 'ended',
      lastError: null,
      report: closed.report,
      reportDuplicate: closed.duplicate,
    }
    return getSnapshot()
  }

  function authorizeProtected(type: R4ProtectedOpType, id: string) {
    if (!input.authenticated) {
      const result = {
        ok: false as const,
        type,
        id,
        code: 'unauthenticated' as const,
        error: 'Se requiere autenticacion del dueno para esta operacion.',
      }
      snapshot = { ...snapshot, protectedOps: [...snapshot.protectedOps, result] }
      return result
    }
    const decision = evaluateLink(input.publicConfirmAttempt === true)
    if (!decision.ok) {
      const result = {
        ok: false as const,
        type,
        id,
        code: decision.code,
        error: decision.error,
      }
      snapshot = {
        ...snapshot,
        phase: 'denied',
        lastError: { code: decision.code, message: decision.error },
        protectedOps: [...snapshot.protectedOps, result],
      }
      return result
    }
    if (decision.requiresAuthenticatedApproval && !input.authenticated) {
      const result = {
        ok: false as const,
        type,
        id,
        code: 'unauthenticated' as const,
        error: 'La aprobacion autenticada es obligatoria.',
      }
      snapshot = { ...snapshot, protectedOps: [...snapshot.protectedOps, result] }
      return result
    }
    const result = { ok: true as const, type, id }
    snapshot = { ...snapshot, protectedOps: [...snapshot.protectedOps, result] }
    return result
  }

  function confirmAction(actionId: string) {
    return authorizeProtected('confirmAction', actionId)
  }

  function queueCommunication(draftId: string) {
    return authorizeProtected('queueCommunication', draftId)
  }

  return {
    getSnapshot,
    consent,
    start,
    speak,
    pause,
    resume,
    interruptSpeech,
    cancelTurn,
    recover,
    end,
    confirmAction,
    queueCommunication,
    evaluateLink,
  }
}

function isKnownError(code: string): code is R4SessionErrorCode {
  return (
    code === 'consent_required' ||
    code === 'not_connected' ||
    code === 'paused' ||
    code === 'ended' ||
    code === 'denied' ||
    code === 'expired' ||
    code === 'revoked' ||
    code === 'foreign_session' ||
    code === 'invalid_grant' ||
    code === 'public_confirm_denied' ||
    code === 'unauthenticated' ||
    code === 'timeout' ||
    code === 'reconnect' ||
    code === 'permission' ||
    code === 'unsupported' ||
    code === 'provider' ||
    code === 'interrupted' ||
    code === 'unauthorized' ||
    code === 'duplicate_turn' ||
    code === 'cancelled' ||
    code === 'session_occupied'
  )
}

function isAuthCode(code: R4SessionErrorCode) {
  return (
    code === 'expired' ||
    code === 'revoked' ||
    code === 'foreign_session' ||
    code === 'invalid_grant' ||
    code === 'public_confirm_denied' ||
    code === 'unauthenticated' ||
    code === 'unauthorized'
  )
}

export type R4SessionOrchestrator = ReturnType<typeof createR4SessionOrchestrator>
