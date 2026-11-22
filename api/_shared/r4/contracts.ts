/**
 * Contratos R4 (puertos). Los adaptadores reales quedan fuera de R4.1.
 * No modifican guideUserLinks ni el runtime Retell existente.
 */

export type R4SttResult =
  | { ok: true; text: string; confidence?: number; provider: 'simulated' | 'browser' | 'cloud' }
  | { ok: false; error: string; code: 'permission' | 'timeout' | 'unsupported' | 'provider' }

export type R4TtsResult =
  | { ok: true; audioId: string; durationMs: number; provider: 'simulated' | 'browser' | 'cloud' }
  | { ok: false; error: string; code: 'interrupted' | 'timeout' | 'provider' }

export type R4RetellSessionResult =
  | {
      ok: true
      callId: string
      firstAudioMs: number | null
      status: 'ready' | 'listening' | 'speaking' | 'ended'
    }
  | { ok: false; error: string; code: 'timeout' | 'reconnect' | 'provider' | 'unauthorized' }

export type R4LinkDecision =
  | {
      ok: true
      linkId: string
      usuarioId: string
      accessMode: 'read' | 'propose' | 'interview_full_read'
      requiresAuthenticatedApproval: boolean
    }
  | {
      ok: false
      error: string
      code: 'expired' | 'revoked' | 'foreign_session' | 'invalid_grant' | 'public_confirm_denied'
    }

export type SttPort = {
  transcribe(input: { audioBase64?: string; locale?: string }): Promise<R4SttResult>
}

export type TtsPort = {
  synthesize(input: { text: string; interruptible?: boolean }): Promise<R4TtsResult>
  interrupt?(audioId: string): Promise<{ ok: true } | { ok: false; error: string }>
}

export type RetellSessionPort = {
  start(input: { sessionId: string; grant?: string }): Promise<R4RetellSessionResult>
  speakTurn(input: { callId: string; utterance: string }): Promise<R4RetellSessionResult>
  end(input: { callId: string }): Promise<R4RetellSessionResult>
}

export type LinkAuthPort = {
  evaluate(input: {
    linkId: string
    status: 'active' | 'revoked' | 'expired'
    expiresAt: string
    ownerUsuarioId: string
    requesterUsuarioId?: string | null
    grantValid?: boolean
    publicConfirmAttempt?: boolean
    nowMs?: number
  }): R4LinkDecision
}

export type R4VoiceAdapters = {
  stt: SttPort
  tts: TtsPort
  retell: RetellSessionPort
  linkAuth: LinkAuthPort
}
