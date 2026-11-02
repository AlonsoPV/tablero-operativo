import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  ListChecks,
  Loader2,
  Mic,
  MicOff,
  Sparkles,
  Square,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { SpeechButton } from '@/components/ui/SpeechButton'
import {
  actionDraftSpeechText,
  requestAssistantTextAnalysis,
  type AssistantActionDraft,
  type AssistantAudioIntent,
  type AssistantAudioResult,
} from '@/lib/assistantAudioClient'
import { cn } from '@/lib/utils'
import { createActionFromDraft } from '@/features/ai-support/createActionFromDraft'
import { useSpeechRecognition } from '@/features/ai-support/useSpeechRecognition'
import { ACCION_CHECKPOINTS_KEY } from '@/features/operations/hooks/useAccionCheckpoints'

const ACCIONES_QUERY_KEY = ['acciones'] as const

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
  const qc = useQueryClient()
  const [intent, setIntent] = useState<AssistantAudioIntent>('plan_actions')
  const [manualNotes, setManualNotes] = useState('')
  const [clarifications, setClarifications] = useState('')
  const [input, setInput] = useState('')
  const [analyzing, setAnalyzing] = useState(false)
  const [creatingId, setCreatingId] = useState<string | null>(null)
  const [creatingAll, setCreatingAll] = useState(false)
  const [result, setResult] = useState<AssistantAudioResult | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const runAnalysis = async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || analyzing) return

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setAnalyzing(true)
    setResult(null)

    try {
      const next = await requestAssistantTextAnalysis({
        text: trimmed,
        context: [context, manualNotes.trim() ? `Notas manuales:\n${manualNotes.trim()}` : '']
          .filter(Boolean)
          .join('\n\n'),
        clarifications: clarifications.trim() || undefined,
        intent,
        signal: controller.signal,
      })
      setResult(next)
      setInput(next.transcript || trimmed)
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return
      toast.error(error instanceof Error ? error.message : 'No se pudo interpretar la nota.')
    } finally {
      setAnalyzing(false)
    }
  }

  const speech = useSpeechRecognition({
    onFinalTranscript: (transcript) => {
      setInput(transcript)
      void runAnalysis(transcript)
    },
  })

  useEffect(() => {
    return () => abortRef.current?.abort()
  }, [])

  const drafts = result?.actionDrafts ?? []
  const canCreate = result?.validation.status === 'usable' && drafts.length > 0 && intent === 'plan_actions'

  const interpretationSpeech = useMemo(() => {
    if (!result) return ''
    const modeLabel = intent === 'plan_actions' ? 'Crear planes o acciones' : 'Solo asesoria'
    return [modeLabel, result.interpretation.executiveSummary].filter(Boolean).join('. ')
  }, [intent, result])

  const nextStepsSpeech = useMemo(() => {
    if (!result?.nextSteps.length) return ''
    return `Que hacer ahora. ${result.nextSteps.slice(0, 3).join('. ')}`
  }, [result])

  const createOne = async (draft: AssistantActionDraft, index: number) => {
    const key = `${index}:${draft.title}`
    setCreatingId(key)
    try {
      await createActionFromDraft(draft, createdBy)
      await Promise.all([
        qc.invalidateQueries({ queryKey: ACCIONES_QUERY_KEY }),
        qc.invalidateQueries({ queryKey: ACCION_CHECKPOINTS_KEY }),
      ])
      toast.success(`Accion creada: ${draft.title}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo crear la accion.')
    } finally {
      setCreatingId(null)
    }
  }

  const createAll = async () => {
    if (!drafts.length) return
    setCreatingAll(true)
    try {
      for (const draft of drafts) {
        await createActionFromDraft(draft, createdBy)
      }
      await Promise.all([
        qc.invalidateQueries({ queryKey: ACCIONES_QUERY_KEY }),
        qc.invalidateQueries({ queryKey: ACCION_CHECKPOINTS_KEY }),
      ])
      toast.success(`${drafts.length} acciones creadas y asignadas a ti.`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudieron crear todas las acciones.')
    } finally {
      setCreatingAll(false)
    }
  }

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
              <p className="text-sm font-medium">Habla un pendiente o dolor operativo</p>
              <p className="max-w-sm text-xs text-muted-foreground">
                {speech.supported
                  ? 'Al detener, la IA interpretara y propondra borradores. Tambien puedes escribir.'
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
                    Interpretacion
                  </p>
                  <p className="mt-1 text-sm leading-5">{result.interpretation.executiveSummary || result.validation.summary}</p>
                </div>
                {interpretationSpeech ? <SpeechButton text={interpretationSpeech} /> : null}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Validacion: {result.validation.status.replace(/_/g, ' ')} — {result.validation.summary}
              </p>
              {result.validation.clarificationQuestions.length > 0 ? (
                <div className="space-y-1 pt-1">
                  <p className="text-[11px] font-medium">Preguntas de aclaracion</p>
                  <ul className="list-decimal space-y-0.5 pl-4 text-[11px] text-muted-foreground">
                    {result.validation.clarificationQuestions.map((question) => (
                      <li key={question}>{question}</li>
                    ))}
                  </ul>
                  <textarea
                    value={clarifications}
                    onChange={(event) => setClarifications(event.target.value)}
                    rows={2}
                    placeholder="Responde aqui y vuelve a interpretar"
                    className="mt-1 w-full resize-none rounded-md border border-input bg-background px-2 py-1.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </div>
              ) : null}
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

            {canCreate ? (
              <section className="space-y-2" aria-label="Borradores de accion">
                <div className="flex items-center justify-between gap-2">
                  <p className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    <ListChecks className="h-3.5 w-3.5" aria-hidden />
                    Borradores
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => void createAll()}
                    disabled={creatingAll || creatingId !== null}
                    className="gap-1"
                  >
                    {creatingAll ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Sparkles className="h-3.5 w-3.5" aria-hidden />}
                    Crear todas
                  </Button>
                </div>
                {drafts.map((draft, index) => {
                  const key = `${index}:${draft.title}`
                  return (
                    <article
                      key={key}
                      className="space-y-2 rounded-lg border border-border/70 bg-card p-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold leading-5">{draft.title}</p>
                          <p className="mt-0.5 text-[11px] text-muted-foreground">
                            {draft.priority.replace('_', ' ')}
                            {draft.dueDateHint ? ` · ${draft.dueDateHint}` : ''}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <SpeechButton text={actionDraftSpeechText(draft)} />
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            disabled={creatingAll || creatingId !== null}
                            onClick={() => void createOne(draft, index)}
                          >
                            {creatingId === key ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                            ) : (
                              'Crear'
                            )}
                          </Button>
                        </div>
                      </div>
                      <p className="text-xs leading-5 text-foreground/90">{draft.description}</p>
                      {draft.objective ? (
                        <p className="text-[11px] text-muted-foreground">
                          <span className="font-medium text-foreground">Objetivo:</span> {draft.objective}
                        </p>
                      ) : null}
                      {draft.evidenceExpected ? (
                        <p className="text-[11px] text-muted-foreground">
                          <span className="font-medium text-foreground">Evidencia:</span>{' '}
                          {draft.evidenceExpected}
                        </p>
                      ) : null}
                      {draft.activities.length > 0 ? (
                        <ol className="list-decimal space-y-0.5 pl-4 text-[11px] text-muted-foreground">
                          {draft.activities.map((activity) => (
                            <li key={activity}>{activity}</li>
                          ))}
                        </ol>
                      ) : null}
                    </article>
                  )
                })}
              </section>
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
              onClick={() => speech.start()}
              disabled={analyzing}
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
        <p className="text-[10px] text-muted-foreground">Ctrl+Enter interpreta. No se crean acciones hasta que confirmes.</p>
      </div>
    </div>
  )
}
