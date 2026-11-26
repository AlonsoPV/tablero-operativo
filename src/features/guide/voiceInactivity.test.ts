import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import {
  evaluateVoiceInactivity,
  hasValidUserTranscriptActivity,
  VOICE_INACTIVITY_CONTINUE_LABEL,
  VOICE_INACTIVITY_ENDED_TEXT,
  VOICE_INACTIVITY_RESUME_LABEL,
  VOICE_INACTIVITY_TIMEOUT_MS,
  VOICE_INACTIVITY_WARNING_MS,
  VOICE_INACTIVITY_WARNING_TEXT,
  VOICE_STALLED_OPERATION_MS,
} from '@/features/guide/voiceInactivity'
import { clockStateFromSession } from '../../../api/_shared/guideSessionClock'
import type { GuideMessage } from '@/features/guide/types'

function msg(role: 'user' | 'assistant', content: string, sequence = 1): GuideMessage {
  return {
    id: `m-${sequence}`,
    session_id: 's-1',
    sequence,
    role,
    content,
    created_at: new Date().toISOString(),
  }
}

describe('voiceInactivity (180s timeout + 150s warning)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('usa los textos exactos requeridos para aviso y cierre', () => {
    expect(VOICE_INACTIVITY_WARNING_MS).toBe(150_000)
    expect(VOICE_INACTIVITY_TIMEOUT_MS).toBe(180_000)
    expect(VOICE_INACTIVITY_WARNING_TEXT).toBe(
      'La sesión de voz se cerrará en 30 segundos por inactividad'
    )
    expect(VOICE_INACTIVITY_ENDED_TEXT).toBe('Sesión de voz finalizada por inactividad')
    expect(VOICE_INACTIVITY_CONTINUE_LABEL).toBe('Continuar conversación')
    expect(VOICE_INACTIVITY_RESUME_LABEL).toBe('Reanudar conversación')
  })

  it('a los 149s sigue activa sin aviso', () => {
    const start = 1_000_000
    const snap = evaluateVoiceInactivity({ lastActivityAtMs: start }, start + 149_000)
    expect(snap.phase).toBe('active')
    expect(snap.warningVisible).toBe(false)
    expect(snap.remainingMs).toBe(31_000)
  })

  it('a los 150s muestra aviso preventivo', () => {
    const start = 1_000_000
    const snap = evaluateVoiceInactivity({ lastActivityAtMs: start }, start + 150_000)
    expect(snap.phase).toBe('warning')
    expect(snap.warningVisible).toBe(true)
    expect(snap.remainingMs).toBe(30_000)
  })

  it('a los 179s de inactividad la sesión sigue activa', () => {
    const start = 1_000_000
    const snap = evaluateVoiceInactivity({ lastActivityAtMs: start }, start + 179_000)
    expect(snap.phase).toBe('warning')
    expect(snap.warningVisible).toBe(true)
    expect(snap.remainingMs).toBe(1_000)
  })

  it('a los 180s exactos expira para cierre automático', () => {
    const start = 1_000_000
    const snap = evaluateVoiceInactivity({ lastActivityAtMs: start }, start + 180_000)
    expect(snap.phase).toBe('expired')
    expect(snap.warningVisible).toBe(false)
    expect(snap.remainingMs).toBe(0)
  })

  it('respeta expiración con timestamps reales aunque los timers se suspendan en segundo plano', () => {
    const start = Date.now()
    vi.setSystemTime(start + 210_000)
    const snap = evaluateVoiceInactivity({ lastActivityAtMs: start }, Date.now())
    expect(snap.phase).toBe('expired')
    expect(snap.remainingMs).toBe(0)
  })

  it('no interrumpe habla activa aunque supere el antiguo límite de 45s', () => {
    const start = 1_000_000
    const deferred = evaluateVoiceInactivity(
      {
        lastActivityAtMs: start,
        agentTalking: true,
        busySinceMs: start + 175_000,
      },
      start + 182_000
    )
    expect(deferred.phase).toBe('defer_busy')

    const stalled = evaluateVoiceInactivity(
      {
        lastActivityAtMs: start,
        agentTalking: true,
        busySinceMs: start + 175_000,
      },
      start + 175_000 + VOICE_STALLED_OPERATION_MS
    )
    expect(stalled.phase).toBe('defer_busy')
  })

  it('solo reinicia actividad ante intervención real del usuario (no ruido ambiental ni eventos del asistente)', () => {
    const empty: GuideMessage[] = []
    expect(hasValidUserTranscriptActivity(empty, [msg('assistant', 'Hola, ¿en qué te ayudo?')])).toBe(false)
    expect(hasValidUserTranscriptActivity(empty, [msg('user', ' ')])).toBe(false)
    expect(hasValidUserTranscriptActivity(empty, [msg('user', '.')])).toBe(false)
    expect(hasValidUserTranscriptActivity(empty, [msg('user', 'Revisa mis pendientes')])).toBe(true)

    const withUser = [msg('user', 'Revisa mis pendientes')]
    // Same transcript repeated by internal update event does NOT count as new activity
    expect(hasValidUserTranscriptActivity(withUser, [msg('user', 'Revisa mis pendientes')])).toBe(false)
    // Assistant reply does NOT count as user activity
    expect(
      hasValidUserTranscriptActivity(withUser, [
        msg('user', 'Revisa mis pendientes', 1),
        msg('assistant', 'Tienes 3 pendientes', 2),
      ])
    ).toBe(false)
  })

  it('updated_at antiguo no demuestra silencio ni autoriza cerrar la voz', () => {
    const now=Date.parse('2026-11-25T12:00:00Z')
    const session={provider:'retell',status:'active',updated_at:new Date(now-600_000).toISOString(),expires_at:new Date(now+300_000).toISOString()}
    expect(clockStateFromSession(session,now).must_close).toBe(false)
  })
})


it.each(['agentTalking','userSpeaking','transcribing','processing'] as const)('protege %s sin un corte por duración y no muestra aviso mientras está activo', field => {
  expect(evaluateVoiceInactivity({lastActivityAtMs:0,[field]:true},160_000).warningVisible).toBe(false)
  expect(evaluateVoiceInactivity({lastActivityAtMs:0,busySinceMs:1,[field]:true},600_000).phase).toBe('defer_busy')
})
