export type ElevenLabsSpeechResult = {
  audioBase64: string
  mimeType?: string
  truncated?: boolean
}

type ElevenLabsSpeechResponse = Partial<ElevenLabsSpeechResult> & {
  error?: string
  code?: string
}

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
  const response = await fetch('/api/elevenlabs-tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({ text: text.slice(0, 1200) }),
  })

  const data = await readJson(response)

  if (!response.ok || !data.audioBase64) {
    throw new Error(data.error || 'No se pudo generar audio con ElevenLabs.')
  }

  return {
    audioBase64: data.audioBase64,
    mimeType: data.mimeType || 'audio/mpeg',
    truncated: data.truncated,
  }
}

export function playBase64Audio(audioBase64: string, mimeType = 'audio/mpeg'): HTMLAudioElement {
  const src = `data:${mimeType};base64,${audioBase64}`
  const audio = new Audio(src)
  void audio.play()
  return audio
}

export function speakWithBrowser(text: string, lang = 'es-MX') {
  if (typeof window === 'undefined' || !window.speechSynthesis) {
    throw new Error('Este navegador no soporta lectura por voz.')
  }
  window.speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = lang
  window.speechSynthesis.speak(utterance)
  return utterance
}
