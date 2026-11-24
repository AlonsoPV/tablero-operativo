import { getAssistantAuthHeaders } from '@/lib/assistantApiAuth'

export type ElevenLabsSpeechResult = {
  audioBase64: string
  mimeType?: string
  truncated?: boolean
}

type ElevenLabsSpeechResponse = Partial<ElevenLabsSpeechResult> & {
  error?: string
  code?: string
}

let activeAudioElement: HTMLAudioElement | null = null

async function readJson(response: Response): Promise<ElevenLabsSpeechResponse> {
  const text = await response.text()
  if (!text.trim()) return {}
  try {
    return JSON.parse(text) as ElevenLabsSpeechResponse
  } catch {
    return { error: text.trim().slice(0, 220) }
  }
}

export async function requestElevenLabsSpeech(
  text: string,
  signal?: AbortSignal
): Promise<ElevenLabsSpeechResult> {
  const headers = await getAssistantAuthHeaders()
  const response = await fetch('/api/elevenlabs-tts', {
    method: 'POST',
    headers,
    signal,
    body: JSON.stringify({ text: text.slice(0, 1200) }),
  })

  const data = await readJson(response)

  if (response.status === 401 || response.status === 403) {
    throw new Error(data.error || 'No autorizado para generar voz.')
  }
  if (response.status === 429) {
    throw new Error(data.error || 'Demasiadas solicitudes de voz. Espera un momento.')
  }
  if (!response.ok || !data.audioBase64) {
    throw new Error(data.error || 'No se pudo generar audio con ElevenLabs.')
  }

  return {
    audioBase64: data.audioBase64,
    mimeType: data.mimeType || 'audio/mpeg',
    truncated: data.truncated,
  }
}

export function stopAllVoicePlayback() {
  if (activeAudioElement) {
    try {
      activeAudioElement.pause()
      activeAudioElement.currentTime = 0
    } catch {
      // Ignorar errores de limpieza del elemento de audio.
    }
    activeAudioElement = null
  }
  if (typeof window !== 'undefined' && window.speechSynthesis) {
    try {
      window.speechSynthesis.cancel()
    } catch {
      // Ignorar si speechSynthesis no está activo.
    }
  }
}

export function playBase64Audio(audioBase64: string, mimeType = 'audio/mpeg'): HTMLAudioElement {
  stopAllVoicePlayback()
  const src = `data:${mimeType};base64,${audioBase64}`
  const audio = new Audio(src)
  activeAudioElement = audio
  audio.addEventListener('ended', () => {
    if (activeAudioElement === audio) activeAudioElement = null
  })
  audio.addEventListener('error', () => {
    if (activeAudioElement === audio) activeAudioElement = null
  })
  void audio.play()
  return audio
}

/**
 * Selecciona la voz más cálida y natural disponible en español de México (`es-MX`),
 * priorizando voces naturales locales antes de caer a variantes generales de español.
 */
export function pickBestMexicanSpanishVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  if (!voices.length) return null
  const mxVoices = voices.filter((v) => v.lang.toLowerCase().replace('_', '-').startsWith('es-mx'))
  const preferredNames = /dalia|paulina|sabina|angelica|google.*español.*m[eé]xico|microsoft.*dalia|natural/i
  const preferredMx = mxVoices.find((v) => preferredNames.test(v.name))
  if (preferredMx) return preferredMx
  if (mxVoices.length > 0) return mxVoices[0]!

  const latamVoices = voices.filter((v) => /^es-(us|419|co|ar|cl|pe)/i.test(v.lang.replace('_', '-')))
  if (latamVoices.length > 0) return latamVoices[0]!

  return voices.find((v) => v.lang.toLowerCase().startsWith('es')) ?? null
}

export function speakWithBrowser(
  text: string,
  lang = 'es-MX',
  callbacks?: { onStart?: () => void; onEnd?: () => void; onError?: () => void }
) {
  if (typeof window === 'undefined' || !window.speechSynthesis) {
    throw new Error('Este navegador no soporta lectura por voz.')
  }
  stopAllVoicePlayback()
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = lang
  utterance.rate = 1.02
  utterance.pitch = 1.0
  const selected = pickBestMexicanSpanishVoice(window.speechSynthesis.getVoices?.() ?? [])
  if (selected) utterance.voice = selected
  if (callbacks?.onStart) utterance.onstart = callbacks.onStart
  if (callbacks?.onEnd) utterance.onend = callbacks.onEnd
  if (callbacks?.onError) utterance.onerror = callbacks.onError
  window.speechSynthesis.speak(utterance)
  return utterance
}

export type NaturalVoicePlaybackHandle = {
  stop: () => void
  provider: 'elevenlabs' | 'browser_es_mx' | 'none'
}

/**
 * Reproduce una respuesta en español de México cálido y natural.
 * Reutiliza ElevenLabs sólo cuando está explícitamente habilitado (`preferElevenLabs`) y responde OK;
 * en caso contrario hace fallback silencioso a la voz es-MX del navegador.
 */
export async function speakNaturalEsMx(
  text: string,
  options: {
    preferElevenLabs?: boolean
    signal?: AbortSignal
    onStart?: () => void
    onEnd?: () => void
  } = {}
): Promise<NaturalVoicePlaybackHandle> {
  const clean = text.trim()
  if (!clean) {
    return { stop: stopAllVoicePlayback, provider: 'none' }
  }

  if (options.preferElevenLabs) {
    try {
      const result = await requestElevenLabsSpeech(clean, options.signal)
      if (options.signal?.aborted) {
        return { stop: stopAllVoicePlayback, provider: 'none' }
      }
      const audio = playBase64Audio(result.audioBase64, result.mimeType)
      options.onStart?.()
      audio.addEventListener('ended', () => options.onEnd?.(), { once: true })
      audio.addEventListener('error', () => options.onEnd?.(), { once: true })
      return {
        stop: () => {
          stopAllVoicePlayback()
          options.onEnd?.()
        },
        provider: 'elevenlabs',
      }
    } catch {
      // Fallback limpio a voz local es-MX del navegador sin bloquear la conversación.
    }
  }

  try {
    speakWithBrowser(clean, 'es-MX', {
      onStart: options.onStart,
      onEnd: options.onEnd,
      onError: options.onEnd,
    })
    return {
      stop: () => {
        stopAllVoicePlayback()
        options.onEnd?.()
      },
      provider: 'browser_es_mx',
    }
  } catch {
    options.onEnd?.()
    return { stop: stopAllVoicePlayback, provider: 'none' }
  }
}
