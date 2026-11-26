import type { GuideMessage } from '@/features/guide/types'

export const VOICE_INACTIVITY_WARNING_MS = 150_000
export const VOICE_INACTIVITY_TIMEOUT_MS = 180_000
export const VOICE_STALLED_OPERATION_MS = 45_000

export const VOICE_INACTIVITY_WARNING_TEXT =
  'La sesión de voz se cerrará en 30 segundos por inactividad'
export const VOICE_INACTIVITY_ENDED_TEXT = 'Sesión de voz finalizada por inactividad'
export const VOICE_INACTIVITY_CONTINUE_LABEL = 'Continuar conversación'
export const VOICE_INACTIVITY_RESUME_LABEL = 'Reanudar conversación'

export type VoiceInactivityPhase = 'active' | 'warning' | 'defer_busy' | 'expired'

export type VoiceInactivitySnapshot = {
  phase: VoiceInactivityPhase
  elapsedMs: number
  remainingMs: number
  warningVisible: boolean
}

export type VoiceInactivityInput = {
  lastActivityAtMs: number
  agentTalking?: boolean
  userSpeaking?: boolean
  transcribing?: boolean
  processing?: boolean
  busySinceMs?: number | null
  warningMs?: number
  timeoutMs?: number
  stalledMs?: number
}

/**
 * Evaluates voice session inactivity using real wall-clock timestamps so
 * background tab timer throttling cannot extend the session beyond 180s.
 * Active speech, transcription and operations are protected without a hard cutoff.
 * `stalledMs` is retained for compatibility; it must never override active work.
 */
export function evaluateVoiceInactivity(
  input: VoiceInactivityInput,
  nowMs = Date.now()
): VoiceInactivitySnapshot {
  const warningMs = input.warningMs ?? VOICE_INACTIVITY_WARNING_MS
  const timeoutMs = input.timeoutMs ?? VOICE_INACTIVITY_TIMEOUT_MS
  const elapsedMs = Math.max(0, nowMs - input.lastActivityAtMs)
  const remainingMs = Math.max(0, timeoutMs - elapsedMs)

  if (elapsedMs >= timeoutMs) {
    const busy = Boolean(input.agentTalking || input.userSpeaking || input.transcribing || input.processing)
    if (busy) {
      return {phase: 'defer_busy', elapsedMs, remainingMs: 0, warningVisible: false}
    }
    return {
      phase: 'expired',
      elapsedMs,
      remainingMs: 0,
      warningVisible: false,
    }
  }

  if (input.agentTalking || input.userSpeaking || input.transcribing || input.processing) {
    return {phase: 'active', elapsedMs, remainingMs, warningVisible: false}
  }

  if (elapsedMs >= warningMs) {
    return {
      phase: 'warning',
      elapsedMs,
      remainingMs,
      warningVisible: true,
    }
  }

  return {
    phase: 'active',
    elapsedMs,
    remainingMs,
    warningVisible: false,
  }
}

/**
 * Extracts normalized user-only utterance signature.
 * Ambient noise, empty updates, or assistant-only updates do not change this.
 */
export function userTranscriptSignature(messages: GuideMessage[]): string {
  return messages
    .filter((m) => m.role === 'user')
    .map((m) => m.content.replace(/\s+/g, ' ').trim())
    .filter((text) => text.length >= 2)
    .join('\n')
}

export function hasValidUserTranscriptActivity(
  prevMessages: GuideMessage[],
  nextMessages: GuideMessage[]
): boolean {
  const nextSig = userTranscriptSignature(nextMessages)
  if (!nextSig) return false
  return nextSig !== userTranscriptSignature(prevMessages)
}
