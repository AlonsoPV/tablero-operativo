import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { requestAssistantTranscript } from '@/lib/assistantAudioClient'

type SpeechRecognitionLike = {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  start: () => void
  stop: () => void
  abort: () => void
  onstart: (() => void) | null
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

function pickRecorderMime() {
  if (typeof MediaRecorder === 'undefined') return ''
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? ''
}

function uniqueLangs(preferred: string) {
  return [...new Set([preferred, 'es-MX', 'es-ES', 'es'])]
}

export function speechRecognitionSupported() {
  return (
    typeof window !== 'undefined' &&
    Boolean(navigator.mediaDevices?.getUserMedia) &&
    typeof MediaRecorder !== 'undefined'
  )
}

export function useSpeechRecognition(options?: {
  onFinalTranscript?: (transcript: string) => void
  onTranscript?: (transcript: string) => void
  lang?: string
}) {
  const [supported] = useState(() => speechRecognitionSupported())
  const [listening, setListening] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [audioLevel, setAudioLevel] = useState(0)
  const [interimText, setInterimText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const rafRef = useRef<number | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const finalsRef = useRef('')
  const interimRef = useRef('')
  const wantedRef = useRef(false)
  const discardOnStopRef = useRef(false)
  const timerRef = useRef<number | null>(null)
  const restartTimerRef = useRef<number | null>(null)
  const onFinalRef = useRef(options?.onFinalTranscript)
  const onTranscriptRef = useRef(options?.onTranscript)
  const lang = options?.lang ?? 'es-MX'
  onFinalRef.current = options?.onFinalTranscript
  onTranscriptRef.current = options?.onTranscript
  const langs = useMemo(() => uniqueLangs(lang), [lang])

  const clearTimer = () => {
    if (timerRef.current != null) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }
  }

  const clearRestart = () => {
    if (restartTimerRef.current != null) {
      window.clearTimeout(restartTimerRef.current)
      restartTimerRef.current = null
    }
  }

  const emitTranscript = (text: string) => {
    interimRef.current = text
    setInterimText(text)
    onTranscriptRef.current?.(text)
  }

  const liveText = () => (finalsRef.current.trim() || interimRef.current.trim()).replace(/\s+/g, ' ')

  const commit = (text: string) => {
    const transcript = text.replace(/\s+/g, ' ').trim()
    setInterimText(transcript)
    if (transcript) onFinalRef.current?.(transcript)
  }

  const stopAudioMeter = () => {
    if (rafRef.current != null) {
      window.cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    const ctx = audioCtxRef.current
    audioCtxRef.current = null
    if (ctx && ctx.state !== 'closed') {
      void ctx.close().catch(() => {})
    }
    setAudioLevel(0)
  }

  const startAudioMeter = (stream: MediaStream) => {
    stopAudioMeter()
    try {
      const AudioCtx = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!AudioCtx) return
      const ctx = new AudioCtx()
      audioCtxRef.current = ctx
      const source = ctx.createMediaStreamSource(stream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 256
      source.connect(analyser)
      const data = new Uint8Array(analyser.frequencyBinCount)
      const tick = () => {
        if (!wantedRef.current || !audioCtxRef.current) {
          setAudioLevel(0)
          return
        }
        analyser.getByteTimeDomainData(data)
        let sumSq = 0
        for (let i = 0; i < data.length; i += 1) {
          const normalized = (data[i]! - 128) / 128
          sumSq += normalized * normalized
        }
        const rms = Math.sqrt(sumSq / data.length)
        setAudioLevel(Math.min(1, Number((rms * 4).toFixed(2))))
        rafRef.current = window.requestAnimationFrame(tick)
      }
      rafRef.current = window.requestAnimationFrame(tick)
    } catch {
      setAudioLevel(0)
    }
  }

  const releaseStream = () => {
    stopAudioMeter()
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
  }

  const stopRecognition = () => {
    const recognition = recognitionRef.current
    recognitionRef.current = null
    if (!recognition) return
    recognition.onstart = null
    recognition.onresult = null
    recognition.onerror = null
    recognition.onend = null
    try {
      recognition.abort()
    } catch {
      /* ya cerrada */
    }
  }

  const beginRecognition = useCallback(
    (nextLang: string) => {
      const Ctor = getRecognitionCtor()
      if (!Ctor || !wantedRef.current) return
      stopRecognition()
      const recognition = new Ctor()
      recognition.lang = nextLang
      recognition.continuous = true
      recognition.interimResults = true
      recognition.maxAlternatives = 1
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
        emitTranscript(`${finals}${interim}`.replace(/\s+/g, ' ').trim())
      }

      recognition.onerror = () => {
        /* El grabador sigue; Gemini transcribe al soltar. */
      }

      recognition.onend = () => {
        if (!wantedRef.current) return
        clearRestart()
        restartTimerRef.current = window.setTimeout(() => {
          if (!wantedRef.current) return
          try {
            recognition.start()
          } catch {
            beginRecognition(nextLang)
          }
        }, 160)
      }

      try {
        recognition.start()
      } catch {
        /* Gemini transcribe el audio grabado */
      }
    },
    []
  )

  const finishRecording = useCallback(async (blob: Blob | null) => {
    clearTimer()
    releaseStream()
    setListening(false)
    if (discardOnStopRef.current) {
      discardOnStopRef.current = false
      chunksRef.current = []
      return
    }
    const heard = liveText()
    if (heard) {
      commit(heard)
      return
    }
    if (!blob || blob.size < 200) {
      setError('No se detecto voz. Intenta de nuevo o escribe la nota.')
      return
    }
    setTranscribing(true)
    try {
      const transcript = await requestAssistantTranscript(blob)
      if (transcript) commit(transcript)
      else setError('No se entendio el dictado. Intenta de nuevo o escribe la nota.')
    } catch (error) {
      setError(error instanceof Error ? error.message : 'No se pudo transcribir el dictado.')
    } finally {
      setTranscribing(false)
    }
  }, [])

  const stop = useCallback(() => {
    discardOnStopRef.current = false
    wantedRef.current = false
    clearRestart()
    stopRecognition()
    const recorder = recorderRef.current
    recorderRef.current = null
    if (recorder && recorder.state !== 'inactive') {
      try {
        recorder.stop()
      } catch {
        void finishRecording(null)
      }
      return
    }
    void finishRecording(null)
  }, [finishRecording])

  const cancel = useCallback(() => {
    discardOnStopRef.current = true
    wantedRef.current = false
    clearTimer()
    clearRestart()
    stopRecognition()
    const recorder = recorderRef.current
    recorderRef.current = null
    if (recorder && recorder.state !== 'inactive') {
      try {
        recorder.stop()
      } catch {
        /* ya detenido */
      }
    }
    chunksRef.current = []
    finalsRef.current = ''
    interimRef.current = ''
    setInterimText('')
    setListening(false)
    setTranscribing(false)
    releaseStream()
  }, [])

  const start = useCallback(async () => {
    if (!speechRecognitionSupported()) {
      setError('Este navegador no puede grabar audio. Escribe la nota.')
      return
    }
    if (wantedRef.current || transcribing) return

    wantedRef.current = true
    setError(null)
    finalsRef.current = ''
    interimRef.current = ''
    chunksRef.current = []
    setInterimText('')
    setSeconds(0)
    setListening(true)

    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      wantedRef.current = false
      setListening(false)
      setError('Permiso de microfono denegado. Activalo en el navegador o escribe la nota.')
      return
    }
    if (!wantedRef.current) {
      stream.getTracks().forEach((track) => track.stop())
      return
    }

    streamRef.current = stream
    const mimeType = pickRecorderMime()
    const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
    recorderRef.current = recorder
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data)
    }
    recorder.onerror = () => {
      if (wantedRef.current) setError('No se pudo grabar el audio. Intenta de nuevo.')
    }
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || mimeType || 'audio/webm' })
      chunksRef.current = []
      void finishRecording(blob)
    }
    try {
      recorder.start(400)
    } catch {
      wantedRef.current = false
      setListening(false)
      releaseStream()
      setError('No se pudo iniciar el microfono.')
      return
    }

    if (timerRef.current == null) {
      timerRef.current = window.setInterval(() => setSeconds((value) => value + 1), 1000)
    }
    startAudioMeter(stream)
    beginRecognition(langs[0] ?? 'es-MX')
  }, [beginRecognition, finishRecording, langs, transcribing])

  useEffect(() => {
    return () => {
      wantedRef.current = false
      clearTimer()
      clearRestart()
      stopRecognition()
      try {
        recorderRef.current?.stop()
      } catch {
        /* unmount */
      }
      releaseStream()
    }
  }, [])

  return {
    supported,
    listening,
    transcribing,
    seconds,
    audioLevel,
    interimText,
    error,
    setError,
    start,
    stop,
    cancel,
    setInterimText,
  }
}
