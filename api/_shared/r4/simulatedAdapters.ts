import type {
  LinkAuthPort,
  R4LinkDecision,
  R4VoiceAdapters,
  RetellSessionPort,
  SttPort,
  TtsPort,
} from './contracts.js'

/**
 * Adaptadores deterministas para harness local.
 * No abren red, no leen process.env de proveedores, no escriben DB.
 */

export function createSimulatedStt(options?: {
  failWith?: 'permission' | 'timeout' | 'unsupported' | 'provider'
  text?: string
}): SttPort {
  return {
    async transcribe() {
      if (options?.failWith) {
        return {
          ok: false,
          error: `STT simulado: ${options.failWith}`,
          code: options.failWith,
        }
      }
      return {
        ok: true,
        text: options?.text ?? 'transcripcion simulada',
        confidence: 1,
        provider: 'simulated',
      }
    },
  }
}

export function createSimulatedTts(options?: {
  failWith?: 'interrupted' | 'timeout' | 'provider'
}): TtsPort {
  const active = new Set<string>()
  return {
    async synthesize(input) {
      if (options?.failWith) {
        return { ok: false, error: `TTS simulado: ${options.failWith}`, code: options.failWith }
      }
      const audioId = `sim-audio-${active.size + 1}`
      active.add(audioId)
      return {
        ok: true,
        audioId,
        durationMs: Math.max(200, input.text.length * 40),
        provider: 'simulated',
      }
    },
    async interrupt(audioId) {
      if (!active.has(audioId)) return { ok: false, error: 'Audio no activo.' }
      active.delete(audioId)
      return { ok: true }
    },
  }
}

export function createSimulatedRetell(options?: {
  failWith?: 'timeout' | 'reconnect' | 'provider' | 'unauthorized'
  firstAudioMs?: number
}): RetellSessionPort {
  const calls = new Map<string, { status: 'ready' | 'listening' | 'speaking' | 'ended' }>()
  return {
    async start(input) {
      if (options?.failWith === 'unauthorized' || options?.failWith === 'provider') {
        return { ok: false, error: `Retell simulado: ${options.failWith}`, code: options.failWith }
      }
      const callId = `sim-call-${input.sessionId}`
      calls.set(callId, { status: 'ready' })
      return {
        ok: true,
        callId,
        firstAudioMs: options?.firstAudioMs ?? 180,
        status: 'ready',
      }
    },
    async speakTurn(input) {
      if (options?.failWith === 'timeout' || options?.failWith === 'reconnect') {
        return { ok: false, error: `Retell simulado: ${options.failWith}`, code: options.failWith }
      }
      const current = calls.get(input.callId)
      if (!current || current.status === 'ended') {
        return { ok: false, error: 'Llamada inexistente o cerrada.', code: 'reconnect' }
      }
      calls.set(input.callId, { status: 'speaking' })
      return {
        ok: true,
        callId: input.callId,
        firstAudioMs: options?.firstAudioMs ?? 180,
        status: 'speaking',
      }
    },
    async end(input) {
      calls.set(input.callId, { status: 'ended' })
      return { ok: true, callId: input.callId, firstAudioMs: null, status: 'ended' }
    },
  }
}

/**
 * Evaluador puro de autorización de liga (AT-13) sin DB.
 * No sustituye guideUserLinks en producción; solo harness R4.
 */
export function createSimulatedLinkAuth(): LinkAuthPort {
  return {
    evaluate(input): R4LinkDecision {
      const now = input.nowMs ?? Date.now()
      if (input.status === 'revoked') {
        return { ok: false, error: 'Liga revocada.', code: 'revoked' }
      }
      if (input.status === 'expired' || Date.parse(input.expiresAt) <= now) {
        return { ok: false, error: 'Liga expirada.', code: 'expired' }
      }
      if (
        input.requesterUsuarioId &&
        input.requesterUsuarioId !== input.ownerUsuarioId
      ) {
        return { ok: false, error: 'Sesion ajena.', code: 'foreign_session' }
      }
      if (input.grantValid === false) {
        return { ok: false, error: 'Grant invalido.', code: 'invalid_grant' }
      }
      if (input.publicConfirmAttempt) {
        return {
          ok: false,
          error: 'La confirmacion publica no esta permitida.',
          code: 'public_confirm_denied',
        }
      }
      return {
        ok: true,
        linkId: input.linkId,
        usuarioId: input.ownerUsuarioId,
        accessMode: 'read',
        requiresAuthenticatedApproval: true,
      }
    },
  }
}

export function createSimulatedR4Adapters(): R4VoiceAdapters {
  return {
    stt: createSimulatedStt(),
    tts: createSimulatedTts(),
    retell: createSimulatedRetell(),
    linkAuth: createSimulatedLinkAuth(),
  }
}
