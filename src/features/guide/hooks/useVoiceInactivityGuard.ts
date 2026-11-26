import type { VoiceInputActivity } from '@/features/guide/voiceInputActivity'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  evaluateVoiceInactivity,
  VOICE_INACTIVITY_TIMEOUT_MS,
  VOICE_INACTIVITY_WARNING_MS,
  VOICE_STALLED_OPERATION_MS,
} from '@/features/guide/voiceInactivity'

export type UseVoiceInactivityGuardOptions = {
  /** True while a voice session is active (connecting or connected). */
  active: boolean
  /** True while the assistant is speaking/playing back audio. */
  agentTalking?: boolean
  /** True while the user is actively speaking. */
  userSpeaking?: boolean
  transcribing?: boolean
  processing?: boolean
  readInputActivity?: () => VoiceInputActivity
  /** Called once when 180s inactivity is reached (and not deferred by active speech). */
  onExpire: () => void
  /** Called on fatal environment interruption (offline, pagehide, beforeunload). */
  onInterrupt?: (reason: 'offline' | 'pagehide' | 'beforeunload') => void
  warningMs?: number
  timeoutMs?: number
  stalledMs?: number
}

export function useVoiceInactivityGuard({
  active,
  agentTalking = false,
  userSpeaking = false,
  transcribing = false,
  processing = false,
  readInputActivity,
  onExpire,
  onInterrupt,
  warningMs = VOICE_INACTIVITY_WARNING_MS,
  timeoutMs = VOICE_INACTIVITY_TIMEOUT_MS,
  stalledMs = VOICE_STALLED_OPERATION_MS,
}: UseVoiceInactivityGuardOptions) {
  const [warningVisible, setWarningVisible] = useState(false)
  const [remainingMs, setRemainingMs] = useState(timeoutMs)

  const lastActivityRef = useRef<number>(Date.now())
  const busySinceRef = useRef<number | null>(null)
  const expiredRef = useRef(false)
  const agentTalkingRef = useRef(agentTalking)
  const userSpeakingRef = useRef(userSpeaking)
  const transcribingRef = useRef(transcribing)
  const processingRef = useRef(processing)
  const readInputRef = useRef(readInputActivity)
  const onExpireRef = useRef(onExpire)
  const onInterruptRef = useRef(onInterrupt)

  agentTalkingRef.current = agentTalking
  userSpeakingRef.current = userSpeaking
  transcribingRef.current = transcribing
  processingRef.current = processing
  readInputRef.current = readInputActivity
  onExpireRef.current = onExpire
  onInterruptRef.current = onInterrupt

  useEffect(() => {
    if (agentTalking || userSpeaking || transcribing || processing) {
      if (busySinceRef.current == null) busySinceRef.current = Date.now()
    } else {
      if (busySinceRef.current != null) lastActivityRef.current = Date.now()
      busySinceRef.current = null
    }
  }, [agentTalking, userSpeaking, transcribing, processing])

  const recordActivity = useCallback(
    (nowMs = Date.now()) => {
      if (!active) return
      lastActivityRef.current = nowMs
      expiredRef.current = false
      setWarningVisible(false)
      setRemainingMs(timeoutMs)
    },
    [active, timeoutMs]
  )

  const evaluate = useCallback(
    (nowMs = Date.now()) => {
      if (!active || expiredRef.current) return
      const input = readInputRef.current?.() ?? 'unknown'
      // A missing/suspended input monitor cannot authorize an automatic cut.
      if (input !== 'silent') {
        lastActivityRef.current = nowMs
        setWarningVisible(false)
        setRemainingMs(timeoutMs)
        return
      }
      const snap = evaluateVoiceInactivity(
        {
          lastActivityAtMs: lastActivityRef.current,
          agentTalking: agentTalkingRef.current,
          userSpeaking: userSpeakingRef.current,
          transcribing: transcribingRef.current,
          processing: processingRef.current,
          busySinceMs: busySinceRef.current,
          warningMs,
          timeoutMs,
          stalledMs,
        },
        nowMs
      )
      setRemainingMs(snap.remainingMs)
      setWarningVisible(snap.warningVisible)
      if (snap.phase === 'expired') {
        expiredRef.current = true
        setWarningVisible(false)
        onExpireRef.current()
      }
    },
    [active, stalledMs, timeoutMs, warningMs]
  )

  useEffect(() => {
    if (!active) {
      expiredRef.current = false
      busySinceRef.current = null
      setWarningVisible(false)
      setRemainingMs(timeoutMs)
      return
    }

    lastActivityRef.current = Date.now()
    expiredRef.current = false
    setWarningVisible(false)
    setRemainingMs(timeoutMs)

    const tick = window.setInterval(() => evaluate(Date.now()), 1000)

    const handleVisibility = () => {
      // Re-evaluate immediately using real timestamps (handles background tab throttling / screen lock).
      evaluate(Date.now())
    }
    const handleOffline = () => {
      if (!expiredRef.current) {
        expiredRef.current = true
        setWarningVisible(false)
        onInterruptRef.current?.('offline')
      }
    }
    const handlePageHide = () => {
      if (!expiredRef.current) {
        expiredRef.current = true
        onInterruptRef.current?.('pagehide')
      }
    }
    const handleBeforeUnload = () => {
      if (!expiredRef.current) {
        expiredRef.current = true
        onInterruptRef.current?.('beforeunload')
      }
    }

    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('offline', handleOffline)
    window.addEventListener('pagehide', handlePageHide)
    window.addEventListener('beforeunload', handleBeforeUnload)

    return () => {
      window.clearInterval(tick)
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener('pagehide', handlePageHide)
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [active, evaluate, timeoutMs])

  return {
    warningVisible,
    remainingMs,
    recordActivity,
  }
}
