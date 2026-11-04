import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Loader2, Mic, MicOff, Square } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { SpeechButton } from '@/components/ui/SpeechButton'
import {
  requestAssistantTextAnalysis,
  type AssistantAudioIntent,
  type AssistantAudioResult,
} from '@/lib/assistantAudioClient'
import { speakWithBrowser } from '@/lib/elevenLabsTtsClient'
import { todayWallClockCDMX } from '@/lib/dateUtils'
import { cn } from '@/lib/utils'
import { ActionDraftList } from '@/features/ai-support/components/ActionDraftList'
import { useSpeechRecognition } from '@/features/ai-support/useSpeechRecognition'
import { looksLikeDraftCorrection } from '@/features/ai-support/writeIntent'
import { buildVoiceValidationSpeech, groundActionDrafts } from '@/features/ai-support/groundActionDrafts'
import { formatWorkDateLabel } from '@/features/ai-support/parseWorkFacts'

function useAutoSpeak(text: string | null) {
  const lastRef = useRef('')
  useEffect(() => {
    const value = text?.trim() ?? ''
    if (!value || value === lastRef.current) return
    lastRef.current = value
    try {
      speakWithBrowser(value)
    } catch {
      // El navegador puede no tener TTS; la UI sigue siendo la fuente de validacion.
    }
    return () => {
      if (typeof window !== 'undefined') window.speechSynthesis?.cancel()
    }
  }, [text])
}

type AssistantVoicePanelProps = {
  context: string
  contextHints: string[]
  compact?: boolean
  createdBy: string | null
  className?: string
  composerLead?: ReactNode
}

export function AssistantVoicePanel({
  context,
  contextHints,
  compact = false,
  createdBy,
  className,
  composerLead,
}: AssistantVoicePanelProps) {
  const [intent, setIntent] = useState<AssistantAudioIntent>('plan_actions')
  const [manualNotes, setManualNotes] = useState('')
  const [clarifications, setClarifications] = useState('')
  const [input, setInput] = useState('')
  const [pendingHeard, setPendingHeard] = useState<string | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [result, setResult] = useState<AssistantAudioResult | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const resultRef = useRef<AssistantAudioResult | null>(null)
  resultRef.current = result

  const runAnalysis = async (text: string, correction = '') => {
    const trimmed = text.trim()
    const correctionText = correction.trim()
    if (!trimmed || analyzing) return

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setAnalyzing(true)
    setPendingHeard(null)

    const today = todayWallClockCDMX()
    const previous = resultRef.current
    const previousHint = previous?.actionDrafts[0]?.dueDateHint ?? null
    if (correctionText && previous) {
      const local = groundActionDrafts(previous, previous.transcript || trimmed, correctionText, today)
      if (local.actionDrafts[0]?.dueDateHint !== previousHint) {
        setResult(local)
        setClarifications(correctionText)
        setAnalyzing(false)
        return
      }
    }

    setResult(null)

    try {
      const next = await requestAssistantTextAnalysis({
        text: trimmed,
        context: [context, manualNotes.trim() ? `Notas manuales:\n${manualNotes.trim()}` : '']
          .filter(Boolean)
          .join('\n\n'),
        clarifications: correctionText || clarifications.trim() || undefined,
        intent,
        signal: controller.signal,
      })
      const grounded = groundActionDrafts(next, trimmed, correctionText, today)
      setResult({ ...grounded, transcript: trimmed })
      setInput(trimmed)
      if (correctionText) setClarifications(correctionText)
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return
      toast.error(error instanceof Error ? error.message : 'No se pudo interpretar la nota.')
    } finally {
      setAnalyzing(false)
    }
  }

  const speech = useSpeechRecognition({
    onTranscript: (transcript) => {
      const heard = transcript.trim()
      if (heard) setInput(heard)
    },
    onFinalTranscript: (transcript) => {
      const heard = transcript.trim()
      if (!heard) return
      setInput(heard)
      const current = resultRef.current
      if (current && looksLikeDraftCorrection(heard)) {
        void runAnalysis(current.transcript || input, heard)
        return
      }
      setResult(null)
      setPendingHeard(heard)
    },
  })

  useEffect(() => {
    return () => abortRef.current?.abort()
  }, [])

  const interpretationSpeech = useMemo(() => {
    if (!result) return ''
    return buildVoiceValidationSpeech(result.transcript || input, result)
  }, [input, result])

  const autoSpeakText = analyzing
    ? null
    : pendingHeard
      ? `Te escuche: ${pendingHeard}. Si esta bien, confirma. Si no, vuelve a dictar.`
      : result
        ? interpretationSpeech
        : null
  useAutoSpeak(autoSpeakText)

  const nextStepsSpeech = useMemo(() => {
    if (!result?.nextSteps.length) return ''
    return `Que hacer ahora. ${result.nextSteps.slice(0, 3).join('. ')}`
  }, [result])

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col overflow-hidden', className)}>
      <div className={cn('shrink-0 space-y-2 border-b border-border/60', compact ? 'px-2 py-1.5' : 'px-3 py-2')}>
        <div className="flex flex-wrap gap-1">
          {(
            [
              { id: 'plan_actions' as const, label: 'Crear planes o acciones' },
              { id: 'advisory' as const, label: 'Solo asesoria' },
            ] as const
          ).map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => {
                setIntent(option.id)
                setResult(null)
              }}
              className={cn(
                'rounded-md px-2 py-1 text-[11px] font-medium transition',
                intent === option.id
                  ? 'bg-primary/10 text-primary'
                  : 'bg-muted text-muted-foreground hover:text-foreground'
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
        {contextHints.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {contextHints.map((hint) => (
              <span
                key={hint}
                className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
              >
                {hint}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      <div className={cn('min-h-0 flex-1 space-y-3 overflow-y-auto', compact ? 'px-2 py-2' : 'px-3 py-3')}>
        {!result && !analyzing && !speech.listening && !input ? (
          <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
            <button
              type="button"
              onClick={() => (speech.listening ? speech.stop() : speech.start())}
              disabled={!speech.supported}
              className={cn(
                'inline-flex h-16 w-16 items-center justify-center rounded-full border shadow-sm transition',
                speech.supported
                  ? 'border-primary/30 bg-primary/10 text-primary hover:bg-primary/15'
                  : 'border-border bg-muted text-muted-foreground'
              )}
              aria-label="Dictar nota"
            >
              <Mic className="h-7 w-7" aria-hidden />
            </button>
            <div className="space-y-1">
              <p className="text-sm font-medium">Habla el pendiente, con fecha si ya la tienes</p>
              <p className="max-w-sm text-xs text-muted-foreground">
                {speech.supported
                  ? 'Al detener, te leo lo que escuche para que lo valides. Luego armo la propuesta.'
                  : 'Este navegador no soporta microfono; pega o escribe la nota abajo.'}
              </p>
            </div>
          </div>
        ) : null}

        {speech.listening ? (
          <div className="flex items-center justify-between gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-primary">Escuchando… {speech.seconds}s</p>
              <p className="truncate text-[11px] text-muted-foreground">
                {speech.interimText || 'Habla con claridad…'}
              </p>
            </div>
            <Button type="button" size="sm" variant="secondary" className="gap-1" onClick={speech.stop}>
              <Square className="h-3.5 w-3.5" aria-hidden />
              Detener
            </Button>
          </div>
        ) : null}

        {speech.error ? (
          <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-900 dark:text-amber-100">
            {speech.error}
          </p>
        ) : null}

        {pendingHeard && !analyzing ? (
          <section className="space-y-2 rounded-lg border border-primary/25 bg-primary/5 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">Asi te escuche</p>
            <p className="text-sm leading-5">{pendingHeard}</p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" onClick={() => void runAnalysis(pendingHeard)}>
                Confirmar e interpretar
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => {
                  setPendingHeard(null)
                  speech.supported ? speech.start() : undefined
                }}
              >
                Volver a dictar
              </Button>
            </div>
          </section>
        ) : null}

        {analyzing ? (
          <div className="flex items-center gap-2 rounded-lg border border-border/70 bg-background px-3 py-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Interpretando nota…
          </div>
        ) : null}

        {result ? (
          <div className="space-y-3">
            <section className="space-y-1.5 rounded-lg border border-border/70 bg-background p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Validacion
                  </p>
                  <p className="mt-1 text-sm leading-5">
                    {result.interpretation.executiveSummary || result.validation.summary}
                  </p>
                  {result.actionDrafts[0]?.dueDateHint ? (
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Fecha usada: {formatWorkDateLabel(result.actionDrafts[0].dueDateHint)}
                    </p>
                  ) : null}
                </div>
                {interpretationSpeech ? <SpeechButton text={interpretationSpeech} /> : null}
              </div>
              {result.validation.clarificationQuestions.length > 0 ? (
                <div className="space-y-1 pt-1">
                  <p className="text-[11px] font-medium">Valida esto</p>
                  <ul className="list-decimal space-y-0.5 pl-4 text-[11px] text-muted-foreground">
                    {result.validation.clarificationQuestions.map((question) => (
                      <li key={question}>{question}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <div className="space-y-1.5 pt-1">
                <textarea
                  value={clarifications}
                  onChange={(event) => setClarifications(event.target.value)}
                  rows={2}
                  placeholder="Si lei mal, corrige: por ejemplo la fecha"
                  className="w-full resize-none rounded-md border border-input bg-background px-2 py-1.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={!clarifications.trim() || analyzing}
                  onClick={() => void runAnalysis(result.transcript || input, clarifications)}
                >
                  Aplicar correccion
                </Button>
              </div>
            </section>

            {result.nextSteps.length > 0 ? (
              <section className="space-y-1.5 rounded-lg border border-border/70 bg-background p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Que hacer ahora
                  </p>
                  {nextStepsSpeech ? <SpeechButton text={nextStepsSpeech} /> : null}
                </div>
                <ol className="list-decimal space-y-1 pl-4 text-sm leading-5">
                  {result.nextSteps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
              </section>
            ) : null}

            {intent === 'plan_actions' ? (
              <ActionDraftList result={result} createdBy={createdBy} compact={compact} />
            ) : null}
          </div>
        ) : null}
      </div>

      <div className={cn('shrink-0 space-y-2 border-t border-border/70 bg-card', compact ? 'p-2' : 'p-3')}>
        {!compact ? (
          <textarea
            value={manualNotes}
            onChange={(event) => setManualNotes(event.target.value)}
            rows={2}
            placeholder="Contexto manual opcional (area, cliente, plazo…)"
            className="w-full resize-none rounded-md border border-input bg-background px-2.5 py-1.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        ) : null}
        <div className="flex flex-wrap items-end gap-2">
          {composerLead ? <div className="flex w-full min-w-0 items-center gap-1">{composerLead}</div> : null}
          {!speech.listening && speech.supported ? (
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-10 w-10 shrink-0"
              onClick={() => void speech.start()}
              disabled={analyzing || speech.transcribing}
              aria-label="Dictar"
            >
              <Mic className="h-4 w-4" aria-hidden />
            </Button>
          ) : null}
          {speech.listening ? (
            <Button
              type="button"
              variant="secondary"
              size="icon"
              className="h-10 w-10 shrink-0"
              onClick={speech.stop}
              aria-label="Detener dictado"
            >
              <MicOff className="h-4 w-4" aria-hidden />
            </Button>
          ) : null}
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            rows={compact ? 2 : 3}
            placeholder="Dicta o escribe el pendiente…"
            className={cn(
              'flex-1 resize-none rounded-lg border border-input bg-background px-2.5 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring',
              compact && 'text-[13px]'
            )}
            disabled={analyzing || speech.listening}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                event.preventDefault()
                void runAnalysis(input)
              }
            }}
          />
          <Button
            type="button"
            className="h-10 shrink-0"
            disabled={analyzing || !input.trim()}
            onClick={() => {
              abortRef.current?.abort()
              void runAnalysis(input)
            }}
          >
            {analyzing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : 'Interpretar'}
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground">
          En voz, primero valida lo escuchado. Si la fecha sale mal, dicta la correccion. No se crea hasta que apruebes.
        </p>
      </div>
    </div>
  )
}
