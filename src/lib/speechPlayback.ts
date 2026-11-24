import {
  playBase64Audio,
  requestElevenLabsSpeech,
  speakWithBrowser,
} from '@/lib/elevenLabsTtsClient'

export type SpeechPlaybackResult = {
  provider: 'elevenlabs' | 'local_adapter' | 'browser' | 'none'
  firstAudioMs: number
  interrupted: boolean
  error?: string
}

export type SpeakTextOptions = {
  /** Sólo intenta ElevenLabs cuando el servidor confirmó ttsProvider === 'elevenlabs_live'. */
  preferLiveTts?: boolean
  /** Adaptador local opcional (ej. http://127.0.0.1:8766/synthesize para Kokoro/Piper en dev/demo). */
  localTtsUrl?: string | null
  onStart?: () => void
  onEnd?: () => void
  onError?: (reason: string) => void
}

type PlaybackHandle = {
  stop: () => void
}

let active: PlaybackHandle | null = null

export function isBrowserTtsSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}

export function isSpeechPlaying(): boolean {
  return active !== null
}

export function stopSpeechPlayback() {
  active?.stop()
  active = null
}

/**
 * Reproduce texto hablado (ElevenLabs cuando está activo, o voz es-MX del navegador).
 * Cancela cualquier reproducción previa y nunca bloquea si el navegador no soporta síntesis.
 */
export function speakText(
  text: string,
  options: SpeakTextOptions = {}
): Promise<SpeechPlaybackResult> {
  const trimmed = text.trim()
  if (!trimmed) {
    return Promise.resolve({ provider: 'none', firstAudioMs: 0, interrupted: false })
  }

  stopSpeechPlayback()

  return new Promise((resolve) => {
    const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now()
    let settled = false
    let interrupted = false
    let audio: HTMLAudioElement | null = null
    let chosenProvider: SpeechPlaybackResult['provider'] = 'none'
    let firstAudioMs = 0
    let notifiedStart = false

    const elapsedMs = () =>
      Math.max(0, Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - startedAt))

    const markStarted = (provider: 'elevenlabs' | 'local_adapter' | 'browser') => {
      if (notifiedStart || settled) return
      notifiedStart = true
      chosenProvider = provider
      firstAudioMs = elapsedMs()
      options.onStart?.()
    }

    const finish = (error?: string) => {
      if (settled) return
      settled = true
      if (active?.stop === localStop) active = null
      if (error) options.onError?.(error)
      options.onEnd?.()
      resolve({
        provider: chosenProvider,
        firstAudioMs,
        interrupted,
        ...(error ? { error } : {}),
      })
    }

    const localStop = () => {
      interrupted = true
      if (audio) {
        audio.pause()
        audio.src = ''
      }
      if (typeof window !== 'undefined') window.speechSynthesis?.cancel()
      finish()
    }

    active = { stop: localStop }

    const playBrowser = () => {
      if (settled) return
      try {
        if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
          finish('La reproducción de voz no está disponible en este navegador; puedes seguir por texto.')
          return
        }
        const utterance = speakWithBrowser(trimmed)
        utterance.onstart = () => markStarted('browser')
        utterance.onend = () => finish()
        utterance.onerror = () => finish('No se pudo reproducir el audio; la respuesta sigue visible en pantalla.')
        // Algunos navegadores headless no disparan onstart inmediatamente
        window.setTimeout(() => {
          if (!notifiedStart && !settled) markStarted('browser')
        }, 60)
      } catch {
        finish('No se pudo reproducir el audio; la respuesta sigue visible en pantalla.')
      }
    }

    const safeLocalUrl = (() => {
      const raw = options.localTtsUrl?.trim()
      if (!raw) return null
      try {
        const u = new URL(raw)
        if (u.hostname !== '127.0.0.1' && u.hostname !== 'localhost') return null
        return u.toString()
      } catch {
        return null
      }
    })()

    if (safeLocalUrl) {
      void (async () => {
        try {
          const res = await fetch(safeLocalUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: trimmed, locale: 'es-MX' }),
          })
          if (!res.ok || settled) {
            playBrowser()
            return
          }
          const blob = await res.blob()
          if (settled) return
          const objectUrl = URL.createObjectURL(blob)
          audio = new Audio(objectUrl)
          audio.onplay = () => markStarted('local_adapter')
          audio.onended = () => {
            URL.revokeObjectURL(objectUrl)
            finish()
          }
          audio.onerror = () => {
            URL.revokeObjectURL(objectUrl)
            playBrowser()
          }
          await audio.play()
        } catch {
          playBrowser()
        }
      })()
      return
    }

    if (!options.preferLiveTts) {
      playBrowser()
      return
    }

    void (async () => {
      try {
        const result = await requestElevenLabsSpeech(trimmed)
        if (settled) return
        audio = playBase64Audio(result.audioBase64, result.mimeType)
        audio.onplay = () => markStarted('elevenlabs')
        audio.onended = () => finish()
        audio.onerror = playBrowser
      } catch {
        playBrowser()
      }
    })()
  })
}
