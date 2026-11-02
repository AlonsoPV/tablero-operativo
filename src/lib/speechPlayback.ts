import {
  playBase64Audio,
  requestElevenLabsSpeech,
  speakWithBrowser,
} from '@/lib/elevenLabsTtsClient'

type PlaybackHandle = {
  stop: () => void
}

let active: PlaybackHandle | null = null

export function stopSpeechPlayback() {
  active?.stop()
  active = null
}

/** Reproduce texto (ElevenLabs, con fallback del navegador). Cancela cualquier lectura previa. */
export function speakText(text: string): Promise<void> {
  const trimmed = text.trim()
  if (!trimmed) return Promise.resolve()

  stopSpeechPlayback()

  return new Promise((resolve) => {
    let settled = false
    let audio: HTMLAudioElement | null = null

    const finish = () => {
      if (settled) return
      settled = true
      if (active?.stop === localStop) active = null
      resolve()
    }

    const localStop = () => {
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
        const utterance = speakWithBrowser(trimmed)
        utterance.onend = finish
        utterance.onerror = finish
      } catch {
        finish()
      }
    }

    void (async () => {
      try {
        const result = await requestElevenLabsSpeech(trimmed)
        if (settled) return
        audio = playBase64Audio(result.audioBase64, result.mimeType)
        audio.onended = finish
        audio.onerror = playBrowser
      } catch {
        playBrowser()
      }
    })()
  })
}
