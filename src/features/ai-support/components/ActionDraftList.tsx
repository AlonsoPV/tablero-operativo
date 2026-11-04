import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ListChecks, Loader2, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { SpeechButton } from '@/components/ui/SpeechButton'
import {
  actionDraftSpeechText,
  type AssistantActionDraft,
  type AssistantAudioResult,
} from '@/lib/assistantAudioClient'
import { createActionFromDraft } from '@/features/ai-support/createActionFromDraft'
import { formatWorkDateLabel } from '@/features/ai-support/parseWorkFacts'
import { ACCION_CHECKPOINTS_KEY } from '@/features/operations/hooks/useAccionCheckpoints'
import type { AccionDiaria } from '@/types'

const ACCIONES_QUERY_KEY = ['acciones'] as const

type ActionDraftListProps = {
  result: AssistantAudioResult
  createdBy: string | null
  compact?: boolean
  onCreated?: (draft: AssistantActionDraft, created: AccionDiaria) => void
}

function draftGaps(draft: AssistantActionDraft) {
  const gaps: string[] = []
  if (!draft.ownerHint) gaps.push('responsable')
  if (!draft.dueDateHint) gaps.push('fecha')
  if (!draft.evidenceExpected) gaps.push('evidencia de cierre')
  return gaps
}

function missingAfterDrafts(result: AssistantAudioResult) {
  const hasDate = result.actionDrafts.some((draft) => Boolean(draft.dueDateHint))
  const source =
    result.validation.missingPoints.length > 0
      ? result.validation.missingPoints
      : result.validation.clarificationQuestions
  return [...new Set(source.map((item) => item.trim()).filter(Boolean))]
    .filter((item) => !(hasDate && /fecha|plazo|entrega|compromiso/i.test(item)))
    .slice(0, 4)
}

export function ActionDraftList({
  result,
  createdBy,
  compact = false,
  onCreated,
}: ActionDraftListProps) {
  const qc = useQueryClient()
  const [creatingId, setCreatingId] = useState<string | null>(null)
  const [creatingAll, setCreatingAll] = useState(false)
  const drafts = result.actionDrafts
  const uniqueMissing = missingAfterDrafts(result)

  const createOne = async (draft: AssistantActionDraft, index: number) => {
    const key = `${index}:${draft.title}`
    setCreatingId(key)
    try {
      const created = await createActionFromDraft(draft, createdBy)
      await Promise.all([
        qc.invalidateQueries({ queryKey: ACCIONES_QUERY_KEY }),
        qc.invalidateQueries({ queryKey: ACCION_CHECKPOINTS_KEY }),
      ])
      onCreated?.(draft, created)
      toast.success(
        `Accion creada: ${draft.title}${draft.dueDateHint ? ` · ${formatWorkDateLabel(draft.dueDateHint)}` : ''}`
      )
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
        const created = await createActionFromDraft(draft, createdBy)
        onCreated?.(draft, created)
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

  if (drafts.length === 0) {
    if (uniqueMissing.length === 0) return null
    return (
      <div className="space-y-1 pt-1">
        <p className="text-[11px] font-medium">Valida esto para armar la propuesta</p>
        <ul className="list-decimal space-y-0.5 pl-4 text-[11px] text-muted-foreground">
          {uniqueMissing.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>
    )
  }

  return (
    <section className="space-y-2" aria-label="Propuestas para aprobar">
      <div className="flex items-center justify-between gap-2">
        <p className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          <ListChecks className="h-3.5 w-3.5" aria-hidden />
          Para aprobar
        </p>
        {drafts.length > 1 ? (
          <Button
            type="button"
            size="sm"
            onClick={() => void createAll()}
            disabled={creatingAll || creatingId !== null}
            className={compact ? 'h-7 gap-1 px-2 text-[11px]' : 'gap-1'}
          >
            {creatingAll ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <Sparkles className="h-3.5 w-3.5" aria-hidden />
            )}
            Aprobar todas
          </Button>
        ) : null}
      </div>
      {uniqueMissing.length > 0 ? (
        <div className="rounded-lg border border-amber-500/25 bg-amber-500/8 px-2.5 py-2">
          <p className="text-[11px] font-medium text-foreground">Valida o completa</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[11px] text-muted-foreground">
            {uniqueMissing.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-[11px] text-muted-foreground">
          Revisa titulo y fecha. Si esta bien, apruebala. Si no, corrige el dato.
        </p>
      )}
      {drafts.map((draft, index) => {
        const key = `${index}:${draft.title}`
        const gaps = draftGaps(draft)
        return (
          <article key={key} className="space-y-2 rounded-lg border border-border/70 bg-card p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold leading-5">{draft.title}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {draft.priority.replace('_', ' ')}
                  {draft.ownerHint ? ` · ${draft.ownerHint}` : ''}
                  {draft.dueDateHint ? ` · ${formatWorkDateLabel(draft.dueDateHint)}` : ''}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <SpeechButton text={actionDraftSpeechText(draft)} />
                <Button
                  type="button"
                  size="sm"
                  disabled={creatingAll || creatingId !== null}
                  onClick={() => void createOne(draft, index)}
                >
                  {creatingId === key ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                  ) : (
                    'Aprobar'
                  )}
                </Button>
              </div>
            </div>
            {draft.description ? (
              <p className="text-xs leading-5 text-foreground/90">{draft.description}</p>
            ) : null}
            {draft.objective ? (
              <p className="text-[11px] text-muted-foreground">
                <span className="font-medium text-foreground">Objetivo:</span> {draft.objective}
              </p>
            ) : null}
            {draft.evidenceExpected ? (
              <p className="text-[11px] text-muted-foreground">
                <span className="font-medium text-foreground">Evidencia:</span> {draft.evidenceExpected}
              </p>
            ) : null}
            {draft.activities.length > 0 ? (
              <ol className="list-decimal space-y-0.5 pl-4 text-[11px] text-muted-foreground">
                {draft.activities.map((activity) => (
                  <li key={activity}>{activity}</li>
                ))}
              </ol>
            ) : null}
            {gaps.length > 0 ? (
              <p className="text-[11px] text-muted-foreground">
                Por confirmar: {gaps.join(', ')}.
              </p>
            ) : null}
          </article>
        )
      })}
    </section>
  )
}
