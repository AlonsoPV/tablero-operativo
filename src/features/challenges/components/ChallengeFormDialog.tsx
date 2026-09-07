import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  CalendarRange,
  Check,
  Lightbulb,
  MapPin,
  Send,
  Target,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import type { Area } from '@/features/catalogs/types/catalogs.types'
import {
  challengeToFormValues,
  toChallengeCreatePayload,
  toChallengeUpdatePayload,
  validateChallengeForm,
  validateChallengeFormStep,
  type ChallengeFormStep,
  type ChallengeFormValues,
} from '../challengeForm.utils'
import {
  CHALLENGE_SUCCESS_CRITERIA_EXAMPLES,
  CHALLENGE_SUCCESS_CRITERIA_HINT,
} from '../constants'
import { useCreateChallenge, useUpdateChallenge } from '../hooks/useChallenges'
import { useStrategicPillars } from '../hooks/useStrategicPillars'
import type { ChallengeAudienceType, ChallengeImpactType, ChallengeListItem } from '../types'
import { AmbientOrbs } from './ChallengeMotion'
import { AudienceSelector } from './AudienceSelector'
import { ImpactChipSelector } from './ImpactChipSelector'

const NO_AREA = '__none__'
const NO_PILLAR = '__none__'
const TITLE_MAX = 120
const CONTEXT_MIN = 10
const QUESTION_MIN = 10

const TEXTAREA_CLASS =
  'min-h-[5.5rem] w-full resize-y rounded-lg border border-input bg-background px-3 py-2.5 text-sm leading-relaxed shadow-sm transition focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60'

const STEPS: Array<{ id: ChallengeFormStep; label: string; hint: string }> = [
  { id: 0, label: 'Problema', hint: 'Qué resolver' },
  { id: 1, label: 'Impacto', hint: 'Alineación' },
  { id: 2, label: 'Participación', hint: 'Quién y cuándo' },
]

type ChallengeFormDialogProps = {
  open: boolean
  challenge?: ChallengeListItem | null
  currentUserId?: string | null
  areas: Area[]
  adminMode?: boolean
  onOpenChange: (open: boolean) => void
  onSaved?: (challengeId?: string) => void
}

export function ChallengeFormDialog({
  open,
  challenge = null,
  currentUserId,
  areas,
  adminMode,
  onOpenChange,
  onSaved,
}: ChallengeFormDialogProps) {
  const createChallenge = useCreateChallenge()
  const updateChallenge = useUpdateChallenge()
  const { data: pillars = [] } = useStrategicPillars()
  const isEdit = Boolean(challenge)
  const [form, setForm] = useState<ChallengeFormValues>(() => challengeToFormValues(challenge))
  const [step, setStep] = useState<ChallengeFormStep>(0)
  const [stepDirection, setStepDirection] = useState<'next' | 'back'>('next')

  const steps = useMemo(() => {
    if (!adminMode) return STEPS
    return [...STEPS, { id: 3 as ChallengeFormStep, label: 'Publicación', hint: 'Cierre oficial' }]
  }, [adminMode])

  const maxStep = (steps[steps.length - 1]?.id ?? 2) as ChallengeFormStep

  useEffect(() => {
    if (!open) return
    setForm(challengeToFormValues(challenge))
    setStep(0)
    setStepDirection('next')
  }, [challenge, open])

  const isPending = createChallenge.isPending || updateChallenge.isPending
  const sortedAreas = useMemo(
    () => [...areas].sort((a, b) => a.nombre.localeCompare(b.nombre)),
    [areas]
  )

  const titleLength = form.title.length
  const contextLength = form.context.trim().length
  const questionLength = form.question.trim().length
  const showOtherImpact = form.impacts.includes('other')
  const progress = ((step + 1) / steps.length) * 100

  const setField = <K extends keyof ChallengeFormValues>(key: K, value: ChallengeFormValues[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const goNext = () => {
    const validation = validateChallengeFormStep(form, step, { adminMode })
    if (!validation.ok) {
      toast.error(validation.message)
      return
    }
    if (step >= maxStep) return
    setStepDirection('next')
    setStep((prev) => (prev + 1) as ChallengeFormStep)
  }

  const goBack = () => {
    if (step <= 0) return
    setStepDirection('back')
    setStep((prev) => (prev - 1) as ChallengeFormStep)
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (step < maxStep) {
      goNext()
      return
    }

    const validation = validateChallengeForm(form)
    if (!validation.ok) {
      toast.error(validation.message)
      return
    }
    if (!currentUserId) {
      toast.error('No se pudo resolver tu usuario.')
      return
    }

    try {
      if (challenge) {
        const saved = await updateChallenge.mutateAsync({
          id: challenge.id,
          input: toChallengeUpdatePayload(form, { adminMode }),
        })
        toast.success('Challenge actualizado')
        onSaved?.(saved.id)
      } else {
        const saved = await createChallenge.mutateAsync(toChallengeCreatePayload(form, currentUserId))
        toast.success('Challenge enviado para aprobación')
        onSaved?.(saved.id)
      }
      onOpenChange(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo guardar el challenge.')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(92dvh,820px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
        <div className="relative overflow-hidden border-b border-border/60 bg-gradient-to-br from-muted/40 via-background to-primary/[0.07] px-5 py-4 sm:px-6">
          <AmbientOrbs className="opacity-70" />
          <DialogHeader className="relative space-y-1 text-left">
            <DialogTitle className="flex items-center gap-2 text-lg font-semibold tracking-tight">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/15">
                <Lightbulb className="h-4 w-4" aria-hidden />
              </span>
              {isEdit ? 'Editar Challenge' : 'Proponer Challenge'}
            </DialogTitle>
            <DialogDescription className="text-sm leading-relaxed">
              {steps[step]?.hint ?? 'Define el problema, el impacto y quién debería participar.'}
            </DialogDescription>
          </DialogHeader>

          <div className="relative mt-4 space-y-3">
            <div className="h-1.5 overflow-hidden rounded-full bg-muted/80">
              <div
                className="h-full rounded-full bg-gradient-to-r from-primary/70 to-primary transition-[width] duration-500 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
            <ol className="grid gap-2" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
              {steps.map((item) => {
                const done = item.id < step
                const current = item.id === step
                return (
                  <li key={item.id} className="min-w-0">
                    <button
                      type="button"
                      onClick={() => {
                        if (item.id <= step) {
                          setStepDirection(item.id < step ? 'back' : 'next')
                          setStep(item.id)
                        }
                      }}
                      disabled={item.id > step}
                      className={cn(
                        'flex w-full items-center gap-2 rounded-lg px-1.5 py-1 text-left transition',
                        current && 'bg-primary/8',
                        item.id > step && 'opacity-50'
                      )}
                    >
                      <span
                        className={cn(
                          'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold transition',
                          done && 'bg-primary text-primary-foreground',
                          current && 'bg-primary/15 text-primary ring-2 ring-primary/25',
                          !done && !current && 'bg-muted text-muted-foreground'
                        )}
                      >
                        {done ? <Check className="h-3.5 w-3.5" aria-hidden /> : item.id + 1}
                      </span>
                      <span className="min-w-0">
                        <span
                          className={cn(
                            'block truncate text-[11px] font-semibold',
                            current ? 'text-foreground' : 'text-muted-foreground'
                          )}
                        >
                          {item.label}
                        </span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ol>
          </div>
        </div>

        <form onSubmit={(event) => void handleSubmit(event)} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
            <div
              key={step}
              className={cn(
                'space-y-5 duration-300 animate-in fade-in-0 motion-reduce:animate-none',
                stepDirection === 'next' ? 'slide-in-from-right-4' : 'slide-in-from-left-4'
              )}
            >
              {step === 0 ? (
                <FormSection title="Challenge" description="¿Qué queremos resolver?">
                  <Field
                    label="Título"
                    htmlFor="challenge-title"
                    meta={
                      <span
                        className={cn(
                          'tabular-nums',
                          titleLength > TITLE_MAX - 15 ? 'text-amber-600' : 'text-muted-foreground'
                        )}
                      >
                        {titleLength}/{TITLE_MAX}
                      </span>
                    }
                  >
                    <Input
                      id="challenge-title"
                      value={form.title}
                      onChange={(event) => setField('title', event.target.value)}
                      maxLength={TITLE_MAX}
                      className="h-10 rounded-lg"
                      placeholder="Ej. Entregas incompletas por documentación faltante"
                      autoFocus
                    />
                  </Field>

                  <Field
                    label="Contexto"
                    htmlFor="challenge-context"
                    meta={
                      <span
                        className={cn(
                          'tabular-nums',
                          contextLength >= CONTEXT_MIN ? 'text-emerald-600' : 'text-muted-foreground'
                        )}
                      >
                        {contextLength}/{CONTEXT_MIN} min.
                      </span>
                    }
                  >
                    <textarea
                      id="challenge-context"
                      value={form.context}
                      onChange={(event) => setField('context', event.target.value)}
                      rows={3}
                      className={TEXTAREA_CLASS}
                      placeholder="Describe el problema y el contexto operativo."
                    />
                  </Field>

                  <Field
                    label="Pregunta del Challenge"
                    htmlFor="challenge-question"
                    meta={
                      <span
                        className={cn(
                          'tabular-nums',
                          questionLength >= QUESTION_MIN ? 'text-emerald-600' : 'text-muted-foreground'
                        )}
                      >
                        {questionLength}/{QUESTION_MIN} min.
                      </span>
                    }
                  >
                    <textarea
                      id="challenge-question"
                      value={form.question}
                      onChange={(event) => setField('question', event.target.value)}
                      rows={2}
                      className={TEXTAREA_CLASS}
                      placeholder="Ej. ¿Cómo podemos reducir entregas incompletas por documentación faltante?"
                    />
                  </Field>
                </FormSection>
              ) : null}

              {step === 1 ? (
                <FormSection
                  title="Impacto y alineación"
                  description="¿Qué queremos mejorar y dónde se ubica el problema?"
                  icon={Target}
                >
                  <Field label="Impacto esperado" htmlFor="challenge-impacts">
                    <ImpactChipSelector
                      value={form.impacts}
                      onChange={(impacts: ChallengeImpactType[]) => setField('impacts', impacts)}
                    />
                  </Field>

                  {showOtherImpact ? (
                    <div className="duration-200 animate-in fade-in-0 slide-in-from-top-2 motion-reduce:animate-none">
                      <Field label="Especifica el impacto" htmlFor="challenge-other-impact" required>
                        <Input
                          id="challenge-other-impact"
                          value={form.other_impact}
                          onChange={(event) => setField('other_impact', event.target.value)}
                          className="h-10 rounded-lg"
                          placeholder="Describe el impacto"
                        />
                      </Field>
                    </div>
                  ) : null}

                  <Field label="Área relacionada" htmlFor="challenge-area" icon={MapPin} optional>
                    <Select
                      value={form.area_id ?? NO_AREA}
                      onValueChange={(value) => setField('area_id', value === NO_AREA ? null : value)}
                    >
                      <SelectTrigger id="challenge-area" className="h-10 rounded-lg">
                        <SelectValue placeholder="Selecciona área" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NO_AREA}>Sin área específica</SelectItem>
                        {sortedAreas.map((area) => (
                          <SelectItem key={area.id} value={area.id}>
                            {area.nombre}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>

                  <Field label="Pilar estratégico" htmlFor="challenge-pillar" optional>
                    <Select
                      value={form.strategic_pillar_id ?? NO_PILLAR}
                      onValueChange={(value) =>
                        setField('strategic_pillar_id', value === NO_PILLAR ? null : value)
                      }
                    >
                      <SelectTrigger id="challenge-pillar" className="h-10 rounded-lg">
                        <SelectValue placeholder="Sin pilar asociado" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NO_PILLAR}>Sin pilar asociado</SelectItem>
                        {pillars.map((pillar) => (
                          <SelectItem key={pillar.id} value={pillar.id}>
                            {pillar.nombre}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                </FormSection>
              ) : null}

              {step === 2 ? (
                <>
                  <FormSection
                    title="Participación"
                    description="¿Quién debería ver y participar?"
                    icon={Users}
                  >
                    <AudienceSelector
                      audienceType={form.audience_type}
                      audienceAreaId={form.audience_area_id}
                      audienceAreaIds={form.audience_area_ids}
                      areas={areas}
                      onAudienceTypeChange={(value: ChallengeAudienceType) => {
                        setField('audience_type', value)
                        if (value !== 'single_area') setField('audience_area_id', null)
                        if (value !== 'multiple_areas') setField('audience_area_ids', [])
                      }}
                      onSingleAreaChange={(areaId) => setField('audience_area_id', areaId)}
                      onMultipleAreasChange={(areaIds) => setField('audience_area_ids', areaIds)}
                    />

                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Inicio propuesto" htmlFor="challenge-proposed-start" required={!adminMode}>
                        <Input
                          id="challenge-proposed-start"
                          type="date"
                          value={form.proposed_start_date}
                          onChange={(event) => setField('proposed_start_date', event.target.value)}
                          className="h-10 rounded-lg"
                        />
                      </Field>
                      <Field label="Cierre propuesto" htmlFor="challenge-proposed-end" required={!adminMode}>
                        <Input
                          id="challenge-proposed-end"
                          type="date"
                          value={form.proposed_end_date}
                          onChange={(event) => setField('proposed_end_date', event.target.value)}
                          className="h-10 rounded-lg"
                          required={!isEdit && !adminMode}
                        />
                      </Field>
                    </div>
                  </FormSection>

                  <FormSection
                    title="Resultado"
                    description="¿Cómo sabremos si funcionó?"
                    icon={CalendarRange}
                  >
                    <Field label="Criterio de éxito" htmlFor="challenge-success" optional>
                      <textarea
                        id="challenge-success"
                        value={form.success_criteria}
                        onChange={(event) => setField('success_criteria', event.target.value)}
                        rows={2}
                        className={TEXTAREA_CLASS}
                        placeholder="Ej. Reducir 20% el tiempo de liberación de evidencias."
                      />
                      <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                        {CHALLENGE_SUCCESS_CRITERIA_HINT}{' '}
                        {CHALLENGE_SUCCESS_CRITERIA_EXAMPLES.slice(0, 2).join(' ')}
                      </p>
                    </Field>
                  </FormSection>
                </>
              ) : null}

              {step === 3 && adminMode ? (
                <FormSection title="Publicación" description="Fechas oficiales y cierre del reto.">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Inicio publicado" htmlFor="challenge-start">
                      <Input
                        id="challenge-start"
                        type="date"
                        value={form.start_date}
                        onChange={(event) => setField('start_date', event.target.value)}
                        className="h-10 rounded-lg bg-background"
                      />
                    </Field>
                    <Field label="Cierre publicado" htmlFor="challenge-end">
                      <Input
                        id="challenge-end"
                        type="date"
                        value={form.end_date}
                        onChange={(event) => setField('end_date', event.target.value)}
                        className="h-10 rounded-lg bg-background"
                      />
                    </Field>
                  </div>
                  <Field label="Conclusión / Resultado" htmlFor="challenge-result">
                    <textarea
                      id="challenge-result"
                      value={form.result_summary}
                      onChange={(event) => setField('result_summary', event.target.value)}
                      rows={3}
                      className={cn(TEXTAREA_CLASS, 'min-h-[5rem] bg-background')}
                      placeholder="Resultado o conclusión al cerrar el challenge."
                    />
                  </Field>
                </FormSection>
              ) : null}
            </div>
          </div>

          <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-border/60 bg-muted/20 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <Button
              type="button"
              variant="ghost"
              className="h-10 rounded-lg"
              onClick={() => (step === 0 ? onOpenChange(false) : goBack())}
            >
              {step === 0 ? (
                'Cancelar'
              ) : (
                <span className="inline-flex items-center gap-1.5">
                  <ArrowLeft className="h-4 w-4" aria-hidden />
                  Anterior
                </span>
              )}
            </Button>
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              {step < maxStep ? (
                <Button type="submit" className="h-10 gap-1.5 rounded-lg px-5 shadow-sm shadow-primary/20">
                  Continuar
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </Button>
              ) : (
                <Button type="submit" disabled={isPending} className="h-10 gap-1.5 rounded-lg px-5 shadow-sm shadow-primary/20">
                  <Send className="h-4 w-4" aria-hidden />
                  {isEdit ? 'Guardar cambios' : 'Enviar para aprobación'}
                </Button>
              )}
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function FormSection({
  title,
  description,
  icon: Icon,
  children,
}: {
  title: string
  description: string
  icon?: typeof CalendarRange
  children: ReactNode
}) {
  return (
    <section className="space-y-3 rounded-xl border border-border/50 bg-card/60 p-4 shadow-sm transition hover:border-border">
      <div className="flex items-start gap-2.5">
        {Icon ? (
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon className="h-4 w-4" aria-hidden />
          </span>
        ) : null}
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  )
}

function Field({
  label,
  htmlFor,
  meta,
  optional,
  required,
  icon: Icon,
  children,
}: {
  label: string
  htmlFor: string
  meta?: ReactNode
  optional?: boolean
  required?: boolean
  icon?: typeof MapPin
  children: ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          {Icon ? <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden /> : null}
          <Label htmlFor={htmlFor} className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {label}
            {optional ? (
              <span className="ml-1 font-normal normal-case tracking-normal text-muted-foreground/80">
                (opcional)
              </span>
            ) : null}
            {required ? <span className="ml-0.5 text-destructive">*</span> : null}
          </Label>
        </div>
        {meta ? <span className="shrink-0 text-[11px]">{meta}</span> : null}
      </div>
      {children}
    </div>
  )
}
