import { useCallback, useEffect, useRef, useState } from 'react'

type SpeechRecognitionLike = {
  lang: string
  continuous: boolean
  interimResults: boolean
  start: () => void
  stop: () => void
  abort: () => void
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onerror: ((event: { error?: string }) => void) | null
  onend: (() => void) | null
}

type SpeechRecognitionEventLike = {
  resultIndex: number
  results: ArrayLike<{
    isFinal: boolean
    0: { transcript: string }
  }>
}

type SpeechWindow = Window & {
  SpeechRecognition?: new () => SpeechRecognitionLike
  webkitSpeechRecognition?: new () => SpeechRecognitionLike
}

function getRecognitionCtor() {
  if (typeof window === 'undefined') return null
  const w = window as SpeechWindow
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export function speechRecognitionSupported() {
  return Boolean(getRecognitionCtor())
}

export function useSpeechRecognition(options?: {
  onFinalTranscript?: (transcript: string) => void
  lang?: string
}) {
  const [supported] = useState(() => speechRecognitionSupported())
  const [listening, setListening] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [interimText, setInterimText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const finalsRef = useRef('')
  const interimRef = useRef('')
  const timerRef = useRef<number | null>(null)
  const onFinalRef = useRef(options?.onFinalTranscript)
  const lang = options?.lang ?? 'es-MX'
  onFinalRef.current = options?.onFinalTranscript

  const clearTimer = () => {
    if (timerRef.current != null) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }
  }

  const stop = useCallback(() => {
    recognitionRef.current?.stop()
  }, [])

  const start = useCallback(() => {
    const Ctor = getRecognitionCtor()
    if (!Ctor) {
      setError('Tu navegador no soporta dictado por voz. Escribe la nota en el cuadro de texto.')
      return
    }

    setError(null)
    finalsRef.current = ''
    interimRef.current = ''
    setInterimText('')
    setSeconds(0)

    const recognition = new Ctor()
    recognition.lang = lang
    recognition.continuous = true
    recognition.interimResults = true
    recognitionRef.current = recognition

    recognition.onresult = (event) => {
      let interim = ''
      let finals = finalsRef.current
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i]
        const chunk = result[0]?.transcript ?? ''
        if (result.isFinal) finals += `${chunk} `
        else interim += chunk
      }
      finalsRef.current = finals
      interimRef.current = `${finals}${interim}`.trim()
      setInterimText(interimRef.current)
    }

    recognition.onerror = (event) => {
      const code = event.error ?? 'unknown'
      if (code === 'not-allowed' || code === 'service-not-allowed') {
        setError('Permiso de microfono denegado. Puedes escribir la nota en texto.')
      } else if (code === 'no-speech') {
        setError('No se detecto voz. Intenta de nuevo o escribe la nota.')
      } else if (code !== 'aborted') {
        setError('No se pudo completar el dictado. Intenta de nuevo o usa texto.')
      }
      setListening(false)
      clearTimer()
    }

    recognition.onend = () => {
      clearTimer()
      setListening(false)
      const transcript = finalsRef.current.trim() || interimRef.current.trim()
      setInterimText(transcript)
      if (transcript) onFinalRef.current?.(transcript)
      else setError('No se detecto voz. Intenta de nuevo o escribe la nota.')
    }

    try {
      recognition.start()
      setListening(true)
      timerRef.current = window.setInterval(() => setSeconds((value) => value + 1), 1000)
    } catch {
      setError('No se pudo iniciar el microfono.')
      setListening(false)
    }
  }, [lang])

  useEffect(() => {
    return () => {
      clearTimer()
      recognitionRef.current?.abort()
    }
  }, [])

  return {
    supported,
    listening,
    seconds,
    interimText,
    error,
    setError,
    start,
    stop,
    setInterimText,
  }
}
