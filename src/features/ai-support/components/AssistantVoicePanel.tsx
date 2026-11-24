import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  AlertCircle,
  Check,
  Copy,
  FileText,
  Loader2,
  MessageSquare,
  Mic,
  MicOff,
  Pause,
  Play,
  Send,
  Sparkles,
  Square,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { speakNaturalEsMx, stopAllVoicePlayback } from '@/lib/elevenLabsTtsClient'
import { cn } from '@/lib/utils'
import { useSpeechRecognition } from '@/features/ai-support/useSpeechRecognition'
import type { AiChatMessage } from '@/features/ai-support/types'

const VOICE_QUICK_PROMPTS = [
  { label: '¿Qué necesita mi atención hoy?', prompt: '¿Qué necesita mi atención hoy?' },
  { label: '¿Qué está frenando a mi equipo?', prompt: '¿Qué está frenando a mi equipo?' },
  { label: 'Sesión ejecutiva guiada', prompt: 'Iniciemos una sesión ejecutiva guiada de 15 minutos.' },
  { label: 'Crear compromiso', prompt: 'Crea una acción para revisar este problema el viernes.' },
] as const

export type VoicePanelState =
  | 'idle'
  | 'listening'
  | 'processing'
  | 'speaking'
  | 'paused'
  | 'error'

export type AssistantVoicePanelProps = {
  conversationId: string
  messages: AiChatMessage[]
  loading: boolean
  lastOrchestratorMs?: number | null
  actorLabel?: string | null
  compact?: boolean
  className?: string
  onSendVoiceTurn: (utterance: string) => Promise<void>
  onContinueByText: () => void
  renderVisualReply: (message: AiChatMessage) => ReactNode
  renderProposalGroup: (message: AiChatMessage, index: number) => ReactNode
}

const AUDIO_BAR_WEIGHTS = [0.45, 0.8, 1, 0.72, 0.5] as const

function buildWrittenAgreementsSummary(input: {
  conversationId: string
  actorLabel?: string | null
  messages: AiChatMessage[]
}) {
  const proposals = input.messages.flatMap((m) => m.proposals ?? [])
  const findings = input.messages
    .filter((m) => m.role === 'assistant' && m.content.trim())
    .slice(-5)
    .map((m) => m.content.trim().split('\n')[0]!.slice(0, 180))
  const userTurns = input.messages.filter((m) => m.role === 'user').length
  const nowStr = new Date().toLocaleString('es-MX', { timeZone: 'America/Mexico_City' })

  const lines: string[] = [
    'Resumen escrito de acuerdos — SCRUMBAN (Voz por turnos · es-MX)',
    `Sesión: ${input.conversationId} · Fecha: ${nowStr}${input.actorLabel ? ` · Participante: ${input.actorLabel}` : ''}`,
    `Intercambios registrados: ${userTurns}`,
    '',
  ]

  if (proposals.length > 0) {
    lines.push('Propuestas generadas en la sesión (requieren aprobación explícita R2 en tarjeta):')
    proposals.forEach((p, idx) => {
      lines.push(`${idx + 1}. ${p.summary}`)
    })
    lines.push('')
  }

  if (findings.length > 0) {
    lines.push('Hallazgos y acuerdos conversados:')
    findings.forEach((line, idx) => {
      lines.push(`${idx + 1}. ${line}`)
    })
  } else {
    lines.push('Aún no hay acuerdos ni consultas registradas en esta sesión.')
  }

  return lines.join('\n')
}

export function AssistantVoicePanel({
  conversationId,
  messages,
  loading,
  lastOrchestratorMs = null,
  actorLabel,
  compact = false,
  className,
  onSendVoiceTurn,
  onContinueByText,
  renderVisualReply,
  renderProposalGroup,
}: AssistantVoicePanelProps) {
  const [draftTranscript, setDraftTranscript] = useState('')
  const [reviewingTranscript, setReviewingTranscript] = useState(false)
  const [autoSpeak, setAutoSpeak] = useState(true)
  const [speaking, setSpeaking] = useState(false)
  const [paused, setPaused] = useState(false)
  const [ttsError, setTtsError] = useState<string | null>(null)
  const [showSummary, setShowSummary] = useState(false)
  const [copiedSummary, setCopiedSummary] = useState(false)
  const [lastTurnMetrics, setLastTurnMetrics] = useState<{
    sttMs: number
    orchestratorMs: number
    ttsStartMs: number | null
    totalTurnMs: number
    provider: 'local_browser' | 'live_provider'
  } | null>(null)
  const lastSpokenIndexRef = useRef<number>(messages.length - 1)
  const playbackAbortRef = useRef<AbortController | null>(null)
  const captureStartRef = useRef<number | null>(null)
  const lastSttMsRef = useRef<number>(0)
  const scrollEndRef = useRef<HTMLDivElement>(null)

  const interruptPlayback = () => {
    playbackAbortRef.current?.abort()
    playbackAbortRef.current = null
    stopAllVoicePlayback()
    setSpeaking(false)
  }

  const speakTurn = async (text: string) => {
    const clean = text.trim()
    if (!clean) return
    interruptPlayback()
    setTtsError(null)
    const controller = new AbortController()
    playbackAbortRef.current = controller
    const ttsStartedAt = performance.now()
    const handle = await speakNaturalEsMx(clean, {
      preferElevenLabs: false,
      signal: controller.signal,
      onStart: () => {
        const elapsedMs = Math.round(performance.now() - ttsStartedAt)
        setSpeaking(true)
        setLastTurnMetrics((prev) =>
          prev
            ? {
                ...prev,
                ttsStartMs: elapsedMs,
                totalTurnMs: prev.sttMs + prev.orchestratorMs + elapsedMs,
              }
            : prev
        )
      },
      onEnd: () => setSpeaking(false),
    })
    if (handle.provider === 'none') {
      setTtsError('No se pudo reproducir el audio en este navegador. Puedes leer la respuesta y continuar por texto.')
      setSpeaking(false)
    }
  }

  const speech = useSpeechRecognition({
    onTranscript: (transcript) => {
      const heard = transcript.trim()
      if (heard) setDraftTranscript(heard)
    },
    onFinalTranscript: (transcript) => {
      const heard = transcript.trim()
      if (captureStartRef.current !== null) {
        lastSttMsRef.current = Math.round(performance.now() - captureStartRef.current)
        captureStartRef.current = null
      }
      if (!heard) {
        setTtsError('No se detectó voz clara. Reintenta con el micrófono o escribe tu solicitud.')
        return
      }
      setTtsError(null)
      setDraftTranscript(heard)
      setReviewingTranscript(true)
    },
  })

  // Auto-reproducir cada nueva respuesta del asistente en español de México
  useEffect(() => {
    const lastIdx = messages.length - 1
    if (lastIdx <= lastSpokenIndexRef.current) return
    const latest = messages[lastIdx]
    if (!latest || latest.role !== 'assistant') return
    lastSpokenIndexRef.current = lastIdx
    if (!autoSpeak || paused) return
    const textToSpeak = latest.spokenText?.trim() || latest.content.trim()
    if (textToSpeak) {
      void speakTurn(textToSpeak)
    }
  }, [messages, autoSpeak, paused])

  useEffect(() => {
    scrollEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages.length, reviewingTranscript, loading])

  useEffect(() => {
    return () => {
      playbackAbortRef.current?.abort()
      stopAllVoicePlayback()
    }
  }, [])

  const agreementsSummary = useMemo(
    () => buildWrittenAgreementsSummary({ conversationId, actorLabel, messages }),
    [conversationId, actorLabel, messages]
  )

  const handleStartDictation = () => {
    interruptPlayback()
    setPaused(false)
    setTtsError(null)
    setReviewingTranscript(false)
    captureStartRef.current = performance.now()
    void speech.start()
  }

  const handleTogglePause = () => {
    if (paused) {
      setPaused(false)
      setTtsError(null)
      return
    }
    interruptPlayback()
    if (speech.listening) speech.cancel()
    setPaused(true)
  }

  const handleFinishSession = () => {
    interruptPlayback()
    if (speech.listening) speech.cancel()
    setPaused(true)
    setShowSummary(true)
  }

  const handleConfirmSend = async (override?: string) => {
    const text = (override ?? draftTranscript).trim()
    if (!text || loading) return
    interruptPlayback()
    setPaused(false)
    setTtsError(null)
    setReviewingTranscript(false)
    setDraftTranscript('')
    const sendStart = performance.now()
    const sttMs = override ? 0 : lastSttMsRef.current
    lastSttMsRef.current = 0
    await onSendVoiceTurn(text)
    const orchestratorMs = lastOrchestratorMs ?? Math.round(performance.now() - sendStart)
    setLastTurnMetrics({
      sttMs,
      orchestratorMs,
      ttsStartMs: null,
      totalTurnMs: sttMs + orchestratorMs,
      provider: 'local_browser',
    })
  }

  const handleCopySummary = async () => {
    try {
      await navigator.clipboard.writeText(agreementsSummary)
      setCopiedSummary(true)
      toast.success('Resumen de acuerdos copiado.')
      window.setTimeout(() => setCopiedSummary(false), 1800)
    } catch {
      toast.error('No se pudo copiar al portapapeles.')
    }
  }

  const activeError = speech.error || ttsError
  const voiceState: VoicePanelState = activeError
    ? 'error'
    : speech.listening
      ? 'listening'
      : speech.transcribing || loading
        ? 'processing'
        : speaking
          ? 'speaking'
          : paused
            ? 'paused'
            : 'idle'

  const stateBadgeLabel: Record<VoicePanelState, string> = {
    idle: 'Disponible',
    listening: `Escuchando · ${speech.seconds}s`,
    processing: speech.transcribing ? 'Transcribiendo…' : 'Procesando',
    speaking: 'Respondiendo',
    paused: 'Pausado',
    error: 'Error recuperable',
  }

  const turnStateLabel =
    voiceState === 'listening'
      ? `Escuchando… ${speech.seconds}s`
      : voiceState === 'processing'
        ? speech.transcribing
          ? 'Transcribiendo tu voz…'
          : 'Consultando datos reales…'
        : voiceState === 'speaking'
          ? 'Respondiendo por voz (es-MX)…'
          : voiceState === 'paused'
            ? 'Sesión pausada · Micrófono liberado'
            : voiceState === 'error'
              ? 'Error recuperable · Tu conversación sigue intacta'
              : reviewingTranscript
                ? 'Revisa o corrige tu transcripción'
                : 'Disponible para tu siguiente turno'

  const clampedAudioLevel = Math.max(0.08, Math.min(1, speech.audioLevel))

  return (
    <div
      className={cn('flex min-h-0 flex-1 flex-col overflow-hidden', className)}
      data-testid="assistant-voice-panel"
      data-voice-state={voiceState}
    >
      {/* Barra superior del canal Voz (honesta: conversación por turnos, nunca finge streaming en vivo) */}
      <div
        className={cn(
          'flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border/50 bg-background/75 backdrop-blur-sm',
          compact ? 'px-2.5 py-2' : 'px-4 py-2.5'
        )}
      >
        <div className="flex min-w-0 items-center gap-2.5">
          {/* Indicador de actividad real ligado al AnalyserNode del micrófono o reproducción */}
          <div
            className="flex h-7 shrink-0 items-center gap-0.5 rounded-full bg-muted/60 px-2"
            aria-hidden
          >
            {AUDIO_BAR_WEIGHTS.map((weight, idx) => {
              const heightPx =
                voiceState === 'listening'
                  ? Math.round(5 + clampedAudioLevel * 14 * weight)
                  : voiceState === 'speaking'
                    ? Math.round(7 + (idx % 2 === 0 ? 0.85 : 0.45) * 9)
                    : voiceState === 'processing'
                      ? 8
                      : 4
              return (
                <span
                  key={idx}
                  className={cn(
                    'w-0.5 rounded-full transition-[height] duration-75',
                    voiceState === 'listening'
                      ? 'bg-red-500'
                      : voiceState === 'speaking'
                        ? 'bg-primary'
                        : voiceState === 'processing'
                          ? 'bg-amber-500'
                          : voiceState === 'error'
                            ? 'bg-destructive'
                            : 'bg-emerald-500/70'
                  )}
                  style={{ height: `${heightPx}px` }}
                />
              )
            })}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="truncate text-xs font-semibold tracking-tight text-foreground">
                Voz por turnos · es-MX
              </p>
              <span
                className={cn(
                  'inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-medium',
                  voiceState === 'error'
                    ? 'bg-destructive/15 text-destructive'
                    : voiceState === 'listening'
                      ? 'bg-red-500/15 text-red-700 dark:text-red-300'
                      : voiceState === 'speaking'
                        ? 'bg-primary/15 text-primary'
                        : voiceState === 'processing'
                          ? 'bg-amber-500/15 text-amber-800 dark:text-amber-300'
                          : voiceState === 'paused'
                            ? 'bg-muted text-muted-foreground'
                            : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                )}
              >
                {stateBadgeLabel[voiceState]}
              </span>
            </div>
            <p className="truncate text-[11px] text-muted-foreground">{turnStateLabel}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {speaking ? (
            <Button
              type="button"
              size="sm"
              variant="destructive"
              className="h-7 gap-1 rounded-full px-2.5 text-[11px]"
              onClick={interruptPlayback}
            >
              <Square className="h-3 w-3" aria-hidden />
              Detener voz
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 gap-1 rounded-full px-2.5 text-[11px]"
            onClick={handleTogglePause}
            disabled={loading}
            aria-label={paused ? 'Reanudar sesión de voz' : 'Pausar sesión de voz'}
          >
            {paused ? <Play className="h-3 w-3" aria-hidden /> : <Pause className="h-3 w-3" aria-hidden />}
            {paused ? 'Reanudar' : 'Pausar'}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 gap-1 rounded-full px-2.5 text-[11px]"
            onClick={() => {
              if (autoSpeak) interruptPlayback()
              setAutoSpeak((v) => !v)
            }}
            aria-label={autoSpeak ? 'Silenciar lectura automática' : 'Activar lectura automática'}
          >
            {autoSpeak ? <Volume2 className="h-3.5 w-3.5" aria-hidden /> : <VolumeX className="h-3.5 w-3.5" aria-hidden />}
            {autoSpeak ? 'Audio activo' : 'Silenciado'}
          </Button>
          <Button
            type="button"
            size="sm"
            variant={showSummary ? 'secondary' : 'outline'}
            className="h-7 gap-1 rounded-full px-2.5 text-[11px]"
            onClick={() => setShowSummary((v) => !v)}
          >
            <FileText className="h-3.5 w-3.5" aria-hidden />
            Acuerdos
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="h-7 gap-1 rounded-full px-2.5 text-[11px]"
            onClick={() => {
              interruptPlayback()
              if (speech.listening) speech.cancel()
              onContinueByText()
            }}
          >
            <MessageSquare className="h-3.5 w-3.5" aria-hidden />
            Continuar por texto
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 gap-1 rounded-full px-2 text-[11px] text-muted-foreground hover:text-foreground"
            onClick={handleFinishSession}
            aria-label="Finalizar conversación de voz"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
            Finalizar
          </Button>
        </div>
      </div>

      {/* Panel opcional de Resumen escrito de acuerdos */}
      {showSummary ? (
        <section className="shrink-0 space-y-2 border-b border-border/50 bg-muted/35 px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Resumen escrito de acuerdos
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 gap-1 rounded-full px-2.5 text-[11px]"
              onClick={() => void handleCopySummary()}
            >
              {copiedSummary ? <Check className="h-3 w-3" aria-hidden /> : <Copy className="h-3 w-3" aria-hidden />}
              {copiedSummary ? 'Copiado' : 'Copiar resumen'}
            </Button>
          </div>
          <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded-xl border border-border/60 bg-background p-2.5 font-sans text-xs leading-5 text-foreground">
            {agreementsSummary}
          </pre>
        </section>
      ) : null}

      {/* Hilo de conversación por turnos + complemento visual (tarjetas, cifras, propuestas R2) */}
      <div className={cn('min-h-0 flex-1 space-y-3 overflow-y-auto', compact ? 'px-3 py-3' : 'px-4 py-4 sm:px-5')}>
        {messages.length === 0 && !speech.listening && !reviewingTranscript ? (
          <div className="mx-auto flex max-w-md flex-col items-center justify-center gap-3 py-6 text-center">
            <button
              type="button"
              onClick={handleStartDictation}
              disabled={!speech.supported || loading}
              className={cn(
                'inline-flex h-16 w-16 items-center justify-center rounded-full border shadow-sm transition',
                speech.supported
                  ? 'border-primary/30 bg-primary/10 text-primary hover:bg-primary/15'
                  : 'border-border bg-muted text-muted-foreground'
              )}
              aria-label="Dictar solicitud por voz"
            >
              <Mic className="h-7 w-7" aria-hidden />
            </button>
            <div className="space-y-1">
              <p className="text-sm font-semibold text-foreground">
                Habla con SCRUMBAN por turnos
              </p>
              <p className="text-xs leading-5 text-muted-foreground">
                Dicta tu solicitud, revisa o corrige el texto antes de enviarlo, escucha la respuesta
                en español de México y aprueba propuestas de forma segura en pantalla.
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-1.5 pt-1">
              {VOICE_QUICK_PROMPTS.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  disabled={loading}
                  onClick={() => void handleConfirmSend(item.prompt)}
                  className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-background px-3 py-1.5 text-[11px] font-medium text-foreground transition hover:border-primary/40 hover:bg-primary/5"
                >
                  <Sparkles className="h-3 w-3 text-primary" aria-hidden />
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {messages.map((message, index) => (
          <div key={`voice-${message.role}-${index}`} className="space-y-2">
            <div
              className={cn(
                'flex items-end gap-2',
                message.role === 'user' ? 'justify-end' : 'justify-start'
              )}
            >
              <div
                className={cn(
                  message.role === 'user'
                    ? 'max-w-[85%] rounded-2xl rounded-br-md bg-primary px-3.5 py-2.5 text-sm leading-5 text-primary-foreground shadow-sm'
                    : 'w-full max-w-[92%] rounded-2xl rounded-bl-md bg-background/95 px-3.5 py-3 text-foreground shadow-sm ring-1 ring-border/50'
                )}
              >
                {message.role === 'assistant' ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2 border-b border-border/40 pb-1.5">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Complemento visual y voz
                      </span>
                      <button
                        type="button"
                        onClick={() => void speakTurn(message.spokenText || message.content)}
                        className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary hover:bg-primary/15"
                      >
                        <Volume2 className="h-3 w-3" aria-hidden />
                        Escuchar
                      </button>
                    </div>
                    {renderVisualReply(message)}
                  </div>
                ) : (
                  message.content
                )}
              </div>
            </div>
            {message.role === 'assistant' && message.proposals?.length ? (
              <div className="pl-1">{renderProposalGroup(message, index)}</div>
            ) : null}
          </div>
        ))}

        {loading ? (
          <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-background px-3 py-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" aria-hidden />
            Consultando tu operación autorizada…
          </div>
        ) : null}

        {/* Revisión y corrección explícita de transcripción antes de enviar */}
        {reviewingTranscript && !speech.listening ? (
          <section className="space-y-2 rounded-2xl border border-primary/30 bg-primary/5 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">
                Revisa o corrige lo escuchado
              </p>
              <span className="text-[10px] text-muted-foreground">Nada se envía hasta que confirmes</span>
            </div>
            <textarea
              value={draftTranscript}
              onChange={(event) => setDraftTranscript(event.target.value)}
              rows={2}
              aria-label="Editar transcripción antes de enviar"
              className="w-full resize-none rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                disabled={!draftTranscript.trim() || loading}
                onClick={() => void handleConfirmSend()}
              >
                <Send className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                Enviar consulta
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={!speech.supported || loading}
                onClick={handleStartDictation}
              >
                <Mic className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                Volver a dictar
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  setReviewingTranscript(false)
                  setDraftTranscript('')
                }}
              >
                Descartar
              </Button>
            </div>
          </section>
        ) : null}

        {activeError ? (
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-100"
          >
            <span className="flex items-start gap-1.5">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              <span>{activeError}</span>
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 rounded-full px-2.5 text-[11px]"
              onClick={() => {
                interruptPlayback()
                onContinueByText()
              }}
            >
              Continuar por texto
            </Button>
          </div>
        ) : null}

        <div ref={scrollEndRef} />
      </div>

      {/* Controles inferiores de dictado y escritura rápida por turnos */}
      <div className={cn('shrink-0 space-y-2 border-t border-border/50 bg-card/90', compact ? 'p-2.5' : 'px-4 py-3')}>
        {speech.listening ? (
          <div className="flex items-center justify-between gap-2 rounded-xl border border-primary/35 bg-primary/10 px-3 py-2">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-primary">Escuchando… {speech.seconds}s</p>
              <p className="truncate text-[11px] text-muted-foreground">
                {speech.interimText || 'Habla con claridad; al detener podrás revisar y corregir el texto.'}
              </p>
            </div>
            <Button type="button" size="sm" variant="secondary" className="gap-1" onClick={speech.stop}>
              <Square className="h-3.5 w-3.5" aria-hidden />
              Detener
            </Button>
          </div>
        ) : null}

        <div className="flex items-end gap-2">
          <Button
            type="button"
            variant={speech.listening ? 'destructive' : 'default'}
            size="icon"
            className="h-10 w-10 shrink-0 rounded-full"
            onClick={() => (speech.listening ? speech.stop() : handleStartDictation())}
            disabled={!speech.supported || loading || speech.transcribing}
            aria-label={speech.listening ? 'Detener dictado' : 'Dictar por voz'}
            title={speech.supported ? 'Dictar por voz' : 'Micrófono no disponible en este navegador'}
          >
            {speech.listening ? <MicOff className="h-4 w-4" aria-hidden /> : <Mic className="h-4 w-4" aria-hidden />}
          </Button>
          <textarea
            value={draftTranscript}
            onChange={(event) => {
              setDraftTranscript(event.target.value)
              if (reviewingTranscript && !event.target.value.trim()) {
                setReviewingTranscript(false)
              }
            }}
            rows={1}
            placeholder="Dicta con el micrófono o escribe y corrige tu turno…"
            disabled={loading || speech.listening || speech.transcribing}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                void handleConfirmSend()
              }
            }}
            className="max-h-24 min-h-10 flex-1 resize-none rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <Button
            type="button"
            className="h-10 shrink-0 rounded-xl px-3.5"
            disabled={loading || !draftTranscript.trim() || speech.listening || speech.transcribing}
            onClick={() => void handleConfirmSend()}
            aria-label="Enviar turno de voz"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
          </Button>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-1 text-[10px] text-muted-foreground">
          <span>
            Conversación por turnos sobre tus datos autorizados · Ninguna acción se ejecuta sin tu aprobación explícita.
          </span>
          {lastTurnMetrics ? (
            <span data-testid="voice-turn-latency">
              Turno: {lastTurnMetrics.totalTurnMs}ms · Respuesta: {lastTurnMetrics.orchestratorMs}ms
              {lastTurnMetrics.ttsStartMs !== null ? ` · Audio: ${lastTurnMetrics.ttsStartMs}ms` : ''}
              {' · '}
              {lastTurnMetrics.provider === 'live_provider' ? 'Proveedor real' : 'Local / navegador'}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  )
}
