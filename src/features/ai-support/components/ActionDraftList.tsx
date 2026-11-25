import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowUpRight, Check, ListChecks, Loader2, Pencil, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SpeechButton } from '@/components/ui/SpeechButton'
import { ROUTES } from '@/constants'
import { cn } from '@/lib/utils'
import {
  actionDraftSpeechText,
  type AssistantActionDraft,
  type AssistantAudioResult,
} from '@/lib/assistantAudioClient'
import { createActionFromDraft } from '@/features/ai-support/createActionFromDraft'
import { formatWorkDateLabel } from '@/features/ai-support/parseWorkFacts'
import { friendlyAssistantError } from '@/features/ai-support/assistantErrors'
import { SectionEyebrow, StatusPill } from '@/features/ai-support/components/ui'
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

function isoDatePart(hint: string | null) {
  return hint?.match(/^(20\d{2}-\d{2}-\d{2})/)?.[1] ?? ''
}

function draftKey(draft: AssistantActionDraft, index: number) {
  return `${index}:${draft.title}`
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
  const [editingId, setEditingId] = useState<string | null>(null)
  const [edits, setEdits] = useState<Record<string, AssistantActionDraft>>({})
  const [created, setCreated] = useState<Record<string, AccionDiaria>>({})
  const drafts = result.actionDrafts.map((draft, index) => edits[draftKey(draft, index)] ?? draft)
  const keys = result.actionDrafts.map(draftKey)
  const uniqueMissing = missingAfterDrafts(result)
  const pendingCount = keys.filter((key) => !created[key]).length
  const busy = creatingAll || creatingId !== null

  const updateDraft = (key: string, base: AssistantActionDraft, patch: Partial<AssistantActionDraft>) => {
    setEdits((prev) => ({ ...prev, [key]: { ...(prev[key] ?? base), ...patch } }))
  }

  const invalidate = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ACCIONES_QUERY_KEY }),
      qc.invalidateQueries({ queryKey: ACCION_CHECKPOINTS_KEY }),
      qc.invalidateQueries({ queryKey: ['assistant-operational-context'] }),
    ])

  const createOne = async (draft: AssistantActionDraft, key: string) => {
    if (!draft.title.trim()) {
      toast.error('Agrega un titulo antes de confirmar.')
      return
    }
    setCreatingId(key)
    try {
      const row = await createActionFromDraft(draft, createdBy)
      setCreated((prev) => ({ ...prev, [key]: row }))
      setEditingId(null)
      await invalidate()
      onCreated?.(draft, row)
    } catch (error) {
      toast.error(friendlyAssistantError(error))
    } finally {
      setCreatingId(null)
    }
  }

  const createAll = async () => {
    setCreatingAll(true)
    let count = 0
    try {
      for (let index = 0; index < drafts.length; index += 1) {
        const key = keys[index]!
        if (created[key] || !drafts[index]!.title.trim()) continue
        const row = await createActionFromDraft(drafts[index]!, createdBy)
        setCreated((prev) => ({ ...prev, [key]: row }))
        onCreated?.(drafts[index]!, row)
        count += 1
      }
      setEditingId(null)
      await invalidate()
      if (count > 0) toast.success(`${count} acciones creadas y asignadas a ti.`)
    } catch (error) {
      toast.error(friendlyAssistantError(error))
    } finally {
      setCreatingAll(false)
    }
  }

  if (drafts.length === 0) {
    if (uniqueMissing.length === 0) return null
    return (
      <div className="space-y-1 rounded-2xl bg-warning/[0.07] px-3 py-2.5 ring-1 ring-warning/25">
        <p className="text-xs font-semibold text-foreground">Me falta esto para armar la propuesta</p>
        <ul className="list-disc space-y-0.5 pl-4 text-xs text-muted-foreground">
          {uniqueMissing.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>
    )
  }

  return (
    <section className="space-y-2" aria-label="Borradores de acción para confirmar">
      <div className="flex items-center justify-between gap-2 px-1">
        <SectionEyebrow icon={ListChecks}>
          {drafts.length === 1 ? 'Borrador de acción' : `${drafts.length} borradores de acción`}
        </SectionEyebrow>
        {drafts.length > 1 && pendingCount > 0 ? (
          <Button
            type="button"
            size="sm"
            onClick={() => void createAll()}
            disabled={busy}
            className={cn('rounded-full', compact ? 'h-7 gap-1 px-2.5 text-[11px]' : 'h-8 gap-1')}
          >
            {creatingAll ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <Sparkles className="h-3.5 w-3.5" aria-hidden />
            )}
            Confirmar todas
          </Button>
        ) : null}
      </div>

      {uniqueMissing.length > 0 ? (
        <div className="rounded-xl bg-warning/[0.07] px-3 py-2 ring-1 ring-warning/25">
          <p className="text-[11px] font-semibold text-foreground">Valida o completa</p>
          <ul className="mt-0.5 list-disc space-y-0.5 pl-4 text-[11px] text-muted-foreground">
            {uniqueMissing.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="divide-y divide-border/60 overflow-hidden rounded-2xl bg-card ring-1 ring-border/70">
        {drafts.map((draft, index) => {
          const key = keys[index]!
          const done = created[key]
          const editing = editingId === key && !done
          const gaps = draftGaps(draft)
          const meta = [
            draft.priority.replace('_', ' '),
            draft.ownerHint,
            draft.dueDateHint ? formatWorkDateLabel(draft.dueDateHint) : null,
          ].filter(Boolean)

          return (
            <article key={key} className={cn('space-y-2', compact ? 'p-3' : 'p-3.5')}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  {editing ? (
                    <Input
                      value={draft.title}
                      onChange={(event) => updateDraft(key, draft, { title: event.target.value })}
                      aria-label="Titulo de la accion"
                      className="h-8 text-sm font-semibold"
                    />
                  ) : (
                    <p className="text-sm font-semibold leading-5 text-foreground">{draft.title}</p>
                  )}
                  {!editing && meta.length > 0 ? (
                    <p className="mt-0.5 text-[11px] text-muted-foreground">{meta.join(' · ')}</p>
                  ) : null}
                </div>
                {done ? (
                  <StatusPill tone="success">Creada</StatusPill>
                ) : (
                  <StatusPill tone="warning">Borrador</StatusPill>
                )}
              </div>

              {editing ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="space-y-1 sm:col-span-2">
                    <span className="text-[11px] font-medium text-muted-foreground">Descripción</span>
                    <textarea
                      value={draft.description}
                      onChange={(event) => updateDraft(key, draft, { description: event.target.value })}
                      rows={2}
                      className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-xs leading-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-[11px] font-medium text-muted-foreground">Fecha límite</span>
                    <Input
                      type="date"
                      value={isoDatePart(draft.dueDateHint)}
                      onChange={(event) =>
                        updateDraft(key, draft, { dueDateHint: event.target.value || null })
                      }
                      className="h-8 text-xs"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-[11px] font-medium text-muted-foreground">Evidencia de cierre</span>
                    <Input
                      value={draft.evidenceExpected}
                      onChange={(event) => updateDraft(key, draft, { evidenceExpected: event.target.value })}
                      className="h-8 text-xs"
                    />
                  </label>
                </div>
              ) : (
                <>
                  {draft.description ? (
                    <p className="text-xs leading-5 text-foreground/85">{draft.description}</p>
                  ) : null}
                  {draft.objective || draft.evidenceExpected ? (
                    <dl className="grid gap-x-4 gap-y-0.5 text-[11px] text-muted-foreground sm:grid-cols-2">
                      {draft.objective ? (
                        <div>
                          <dt className="inline font-medium text-foreground">Objetivo: </dt>
                          <dd className="inline">{draft.objective}</dd>
                        </div>
                      ) : null}
                      {draft.evidenceExpected ? (
                        <div>
                          <dt className="inline font-medium text-foreground">Evidencia: </dt>
                          <dd className="inline">{draft.evidenceExpected}</dd>
                        </div>
                      ) : null}
                    </dl>
                  ) : null}
                  {draft.activities.length > 0 ? (
                    <ol className="list-decimal space-y-0.5 pl-4 text-[11px] text-muted-foreground">
                      {draft.activities.map((activity) => (
                        <li key={activity}>{activity}</li>
                      ))}
                    </ol>
                  ) : null}
                  {gaps.length > 0 && !done ? (
                    <p className="text-[11px] text-warning">Por confirmar: {gaps.join(', ')}.</p>
                  ) : null}
                </>
              )}

              {done ? (
                <div className="animate-in fade-in-0 flex flex-wrap items-center gap-2 rounded-xl bg-success/[0.08] px-2.5 py-1.5 text-xs text-foreground ring-1 ring-success/25 duration-200">
                  <Check className="h-3.5 w-3.5 text-success" aria-hidden />
                  <span>Acción creada y asignada a ti.</span>
                  <Link
                    to={`${ROUTES.KANBAN}?accion=${encodeURIComponent(done.id)}`}
                    className="inline-flex items-center gap-0.5 font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    Ver acción
                    <ArrowUpRight className="h-3 w-3" aria-hidden />
                  </Link>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                  <Button
                    type="button"
                    size="sm"
                    disabled={busy}
                    onClick={() => void createOne(draft, key)}
                    className="h-8 gap-1 rounded-full"
                  >
                    {creatingId === key ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                    ) : (
                      <Check className="h-3.5 w-3.5" aria-hidden />
                    )}
                    {creatingId === key ? 'Creando…' : 'Confirmar creación'}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => setEditingId(editing ? null : key)}
                    className="h-8 gap-1 rounded-full"
                  >
                    <Pencil className="h-3.5 w-3.5" aria-hidden />
                    {editing ? 'Listo' : 'Editar'}
                  </Button>
                  <SpeechButton text={actionDraftSpeechText(draft)} />
                </div>
              )}
            </article>
          )
        })}
      </div>
    </section>
  )
}
