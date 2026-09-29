import { useState, type FormEvent, type ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  Archive,
  Building2,
  CalendarRange,
  Check,
  CheckCircle2,
  Target,
  TrendingDown,
  TrendingUp,
  Users,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { todayWallClockCDMX } from '@/lib/dateUtils'
import {
  formatMetric,
  measurementStory,
  suggestedPeriodEnd,
  type KeyResult,
  type Objective,
} from './model'

const control =
  'min-h-11 w-full min-w-0 rounded-lg border border-input bg-background px-3 py-2 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-sm'

const UNIT_PRESETS = [
  { value: '%', label: '%' },
  { value: 'días', label: 'Días' },
  { value: '$', label: '$' },
  { value: 'unidades', label: 'Unidades' },
] as const

function isPresetUnit(value: string) {
  return UNIT_PRESETS.some((item) => item.value === value)
}

function parseMetric(value: string): number | null {
  const trimmed = value.trim()
  if (!trimmed || trimmed === '-' || trimmed === '.' || trimmed === '-.')
    return null
  const number = Number(trimmed)
  return Number.isFinite(number) ? number : null
}

function formatIsoDate(iso: string | null) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? '')
  if (!match) return 'Sin fecha'
  const date = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  )
  return date.toLocaleDateString('es-MX', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

function focusField(id: string) {
  document.getElementById(id)?.focus()
}

export function EditorFrame({
  title,
  description,
  steps,
  children,
  footer,
  onSubmit,
  saving = false,
}: {
  title: string
  description: string
  steps?: ReactNode
  children: ReactNode
  footer?: ReactNode
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void
  saving?: boolean
}) {
  const body = (
    <>
      <DialogHeader className="shrink-0 space-y-2 border-b px-5 py-3 pr-12 text-left">
        {steps}
        <DialogTitle className="text-left text-lg leading-snug">
          {title}
        </DialogTitle>
        <DialogDescription className="text-left text-sm leading-snug text-muted-foreground">
          {description}
        </DialogDescription>
      </DialogHeader>
      <div
        className={cn(
          'min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4',
          saving && 'pointer-events-none opacity-60'
        )}
      >
        {children}
      </div>
      {footer ? (
        <div className="shrink-0 border-t bg-card px-5 py-3">{footer}</div>
      ) : null}
    </>
  )
  const className = 'flex min-h-0 w-full flex-1 flex-col'
  if (!onSubmit) return <div className={className}>{body}</div>
  return (
    <form onSubmit={onSubmit} className={className} aria-busy={saving}>
      {body}
    </form>
  )
}

function StepTracker({
  labels,
  current,
}: {
  labels: string[]
  current: number
}) {
  return (
    <ol
      aria-label="Pasos"
      className="flex flex-wrap items-center gap-x-1 gap-y-2"
    >
      {labels.map((label, index) => {
        const step = index + 1
        const done = step < current
        const active = step === current
        return (
          <li
            key={label}
            className="flex items-center gap-1.5"
            aria-current={active ? 'step' : undefined}
          >
            {index > 0 && (
              <span className="mx-1 h-px w-4 bg-border" aria-hidden />
            )}
            <span
              className={cn(
                'flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold',
                active && 'bg-primary text-primary-foreground',
                done && 'bg-primary/15 text-primary',
                !active && !done && 'bg-muted text-muted-foreground'
              )}
            >
              {done ? <Check className="h-3.5 w-3.5" aria-hidden /> : step}
            </span>
            <span
              className={cn(
                'text-xs font-medium',
                !active && !done && 'text-muted-foreground'
              )}
            >
              {label}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

function Section({
  icon: Icon,
  title,
  hint,
  children,
  divided,
}: {
  icon: LucideIcon
  title: string
  hint?: string
  children: ReactNode
  divided?: boolean
}) {
  return (
    <section
      className={cn('space-y-3', divided && 'border-t border-border/60 pt-5')}
    >
      <div className="space-y-1">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Icon className="h-4 w-4 text-primary" aria-hidden />
          {title}
        </h3>
        {hint ? (
          <p className="text-xs leading-relaxed text-muted-foreground">
            {hint}
          </p>
        ) : null}
      </div>
      {children}
    </section>
  )
}

function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string
  label: string
  hint?: string
  error?: string
  children: ReactNode
}) {
  return (
    <div className="grid min-w-0 gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-sm text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p
          id={`${id}-hint`}
          className="text-xs leading-relaxed text-muted-foreground"
        >
          {hint}
        </p>
      ) : null}
    </div>
  )
}

function FormFooter({
  error,
  leading,
  primary,
}: {
  error?: string
  leading: ReactNode
  primary: ReactNode
}) {
  return (
    <div className="space-y-3">
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-2">
        {leading}
        {primary}
      </div>
    </div>
  )
}

function ChoiceCard({
  selected,
  title,
  hint,
  icon: Icon,
  onSelect,
}: {
  selected: boolean
  title: string
  hint: string
  icon: LucideIcon
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        'flex min-h-[4.75rem] flex-col items-start gap-1 rounded-xl border p-3 text-left transition-colors',
        selected
          ? 'border-primary bg-primary/5 ring-1 ring-primary'
          : 'hover:bg-muted/50'
      )}
    >
      <span className="flex items-center gap-2 text-sm font-semibold">
        <Icon className="h-4 w-4 text-primary" aria-hidden />
        {title}
      </span>
      <span className="text-xs leading-snug text-muted-foreground">{hint}</span>
    </button>
  )
}

export function ObjectiveForm({
  objective,
  areas,
  users,
  canManageCompany,
  scopeLocked,
  onSubmit,
  onCancel,
  onSavingChange,
}: {
  objective?: Objective
  areas: { id: string; nombre: string; can_manage: boolean }[]
  users: { id: string; nombre: string }[]
  canManageCompany: boolean
  scopeLocked: boolean
  onSubmit: (values: {
    nombre_okr: string
    descripcion: string
    scope: 'company' | 'team'
    area_id: string | null
    owner_user_id: string
    start_date: string
    end_date: string
    activo: boolean
  }) => Promise<void>
  onCancel: () => void
  onSavingChange: (saving: boolean) => void
}) {
  const editing = Boolean(objective)
  const manageableAreas = areas.filter(
    (area) => area.can_manage || area.id === objective?.area_id
  )
  const [step, setStep] = useState<1 | 2>(1)
  const [nombre, setNombre] = useState(objective?.nombre_okr ?? '')
  const [descripcion, setDescripcion] = useState(objective?.descripcion ?? '')
  const [scope, setScope] = useState<'company' | 'team'>(
    objective?.scope ?? (canManageCompany ? 'company' : 'team')
  )
  const [areaId, setAreaId] = useState(() => {
    if (objective?.area_id) return objective.area_id
    const managed = areas.filter((area) => area.can_manage)
    return managed.length === 1 ? managed[0].id : ''
  })
  const [startDate, setStartDate] = useState(
    objective?.start_date ?? todayWallClockCDMX()
  )
  const [endDate, setEndDate] = useState(objective?.end_date ?? '')
  const [ownerId, setOwnerId] = useState(objective?.owner_user_id ?? '')
  const [activo, setActivo] = useState(objective?.activo ?? true)
  const [attempted, setAttempted] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const companyAvailable = canManageCompany || scope === 'company'
  const teamAvailable =
    areas.some((area) => area.can_manage) || scope === 'team'
  const canChooseScope = !scopeLocked && companyAvailable && teamAvailable
  const areaName =
    areas.find((area) => area.id === (objective?.area_id ?? areaId))?.nombre ??
    'Equipo'

  const errors = validate()

  function validate() {
    const next: {
      nombre?: string
      area?: string
      owner?: string
      dates?: string
    } = {}
    if (nombre.trim().length < 3)
      next.nombre = 'Escribe un objetivo de al menos 3 caracteres.'
    const checkPeriod = editing || step === 2
    if (!checkPeriod) return next
    if (scope === 'team' && !areaId) next.area = 'Selecciona el equipo.'
    if (!ownerId) next.owner = 'Selecciona un responsable activo.'
    if (!startDate || !endDate)
      next.dates = 'Indica el inicio y el fin del periodo.'
    else if (endDate < startDate)
      next.dates = 'La fecha de fin no puede ser anterior al inicio.'
    return next
  }

  function show(field: keyof ReturnType<typeof validate>) {
    return attempted ? errors[field] : undefined
  }

  async function save() {
    const current = validate()
    setAttempted(true)
    if (current.nombre || current.area || current.owner || current.dates) {
      focusField(
        current.nombre
          ? 'okr-name'
          : current.area
            ? 'okr-area'
            : current.owner
              ? 'okr-owner'
              : 'okr-end'
      )
      return
    }
    setSaving(true)
    onSavingChange(true)
    setError('')
    try {
      await onSubmit({
        nombre_okr: nombre.trim(),
        descripcion: descripcion.trim(),
        scope,
        area_id: scope === 'team' ? areaId : null,
        owner_user_id: ownerId,
        start_date: startDate,
        end_date: endDate,
        activo: editing ? activo : true,
      })
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'No se pudieron guardar los cambios'
      )
    } finally {
      setSaving(false)
      onSavingChange(false)
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editing && step === 1) {
      setAttempted(true)
      if (nombre.trim().length < 3) {
        focusField('okr-name')
        return
      }
      setAttempted(false)
      setStep(2)
      return
    }
    void save()
  }

  const quarterEnd = suggestedPeriodEnd(startDate, 'quarter')
  const yearEnd = suggestedPeriodEnd(startDate, 'year')

  return (
    <EditorFrame
      onSubmit={handleSubmit}
      saving={saving}
      steps={
        editing ? undefined : (
          <StepTracker labels={['Objetivo', 'Periodo']} current={step} />
        )
      }
      title={editing ? 'Editar objetivo' : 'Nuevo objetivo'}
      description={
        editing
          ? 'Ajusta el enunciado, el ámbito y el periodo de seguimiento.'
          : step === 1
            ? 'Describe el resultado que quieres lograr. Los números van en el resultado clave.'
            : 'Elige quién lo persigue y hasta cuándo se va a medir.'
      }
      footer={
        <FormFooter
          error={error}
          leading={
            !editing && step === 2 ? (
              <Button
                type="button"
                variant="outline"
                disabled={saving}
                onClick={() => {
                  setAttempted(false)
                  setStep(1)
                }}
              >
                Atrás
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                disabled={saving}
                onClick={onCancel}
              >
                Cancelar
              </Button>
            )
          }
          primary={
            <Button
              type="submit"
              disabled={saving}
              className="w-full whitespace-normal"
            >
              {saving
                ? 'Guardando…'
                : editing
                  ? 'Guardar cambios'
                  : step === 1
                    ? 'Continuar'
                    : 'Crear y agregar KR'}
            </Button>
          }
        />
      }
    >
      <div className="space-y-5">
        {(editing || step === 1) && (
          <Section
            icon={Target}
            title="Enunciado"
            hint="Una frase clara, sin métricas. El número se define en el KR."
          >
            <Field id="okr-name" label="Objetivo" error={show('nombre')}>
              <textarea
                id="okr-name"
                autoFocus
                required
                rows={2}
                maxLength={250}
                value={nombre}
                disabled={saving}
                aria-invalid={Boolean(show('nombre'))}
                aria-describedby={show('nombre') ? 'okr-name-error' : undefined}
                placeholder="Mejorar la experiencia de entrega al cliente"
                className={cn(control, 'resize-y font-medium')}
                onChange={(event) => setNombre(event.target.value)}
              />
            </Field>
            <Field
              id="okr-description"
              label="Descripción"
              hint="Opcional. Explica por qué importa, no cómo se mide."
            >
              <textarea
                id="okr-description"
                rows={3}
                value={descripcion}
                disabled={saving}
                placeholder="Qué cambia si este objetivo se cumple."
                className={cn(control, 'resize-y')}
                onChange={(event) => setDescripcion(event.target.value)}
              />
            </Field>
          </Section>
        )}

        {!editing && step === 2 && (
          <p className="rounded-xl bg-muted/50 px-3 py-2 text-sm leading-snug">
            <span className="text-muted-foreground">Objetivo · </span>
            <span className="font-medium">{nombre.trim()}</span>
          </p>
        )}

        {(editing || step === 2) && (
          <Section
            icon={scope === 'company' ? Building2 : Users}
            title="Ámbito"
            hint={
              scopeLocked
                ? undefined
                : 'Empresa lo ve toda la organización. Equipo lo limita a un área.'
            }
            divided={editing}
          >
            {scopeLocked ? (
              <div className="rounded-xl border bg-muted/40 p-3 text-sm">
                <p className="font-medium">
                  {scope === 'company' ? 'Empresa' : `Equipo · ${areaName}`}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  El ámbito queda fijo porque este objetivo ya tiene resultados
                  clave. Puedes editar el enunciado y las fechas.
                </p>
              </div>
            ) : canChooseScope ? (
              <div
                role="radiogroup"
                aria-label="Ámbito"
                className="grid grid-cols-2 gap-2"
              >
                {companyAvailable && (
                  <ChoiceCard
                    selected={scope === 'company'}
                    title="Empresa"
                    hint="Toda la organización"
                    icon={Building2}
                    onSelect={() => setScope('company')}
                  />
                )}
                {teamAvailable && (
                  <ChoiceCard
                    selected={scope === 'team'}
                    title="Equipo"
                    hint="Un área específica"
                    icon={Users}
                    onSelect={() => setScope('team')}
                  />
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Este objetivo es de{' '}
                <span className="font-medium text-foreground">
                  {scope === 'company' ? 'empresa' : 'equipo'}
                </span>
                .
              </p>
            )}
            {scope === 'team' && !scopeLocked && (
              <Field id="okr-area" label="Equipo" error={show('area')}>
                <select
                  id="okr-area"
                  required
                  value={areaId}
                  disabled={saving}
                  aria-invalid={Boolean(show('area'))}
                  className={control}
                  onChange={(event) => setAreaId(event.target.value)}
                >
                  <option value="">Seleccionar equipo</option>
                  {manageableAreas.map((area) => (
                    <option key={area.id} value={area.id}>
                      {area.nombre}
                    </option>
                  ))}
                </select>
              </Field>
            )}
          </Section>
        )}

        {(editing || step === 2) && (
          <Section
            icon={CalendarRange}
            title="Periodo"
            hint="El inicio y el fin cuentan dentro del seguimiento."
            divided
          >
            <Field
              id="okr-owner"
              label="Responsable del objetivo"
              error={show('owner')}
            >
              <select
                id="okr-owner"
                required
                value={ownerId}
                disabled={saving}
                aria-invalid={Boolean(show('owner'))}
                className={control}
                onChange={(event) => setOwnerId(event.target.value)}
              >
                <option value="">Seleccionar responsable</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.nombre}
                  </option>
                ))}
              </select>
            </Field>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ['quarter', 'Fin de trimestre', quarterEnd],
                  ['year', 'Fin de año', yearEnd],
                ] as const
              ).map(([kind, label, value]) => (
                <button
                  key={kind}
                  type="button"
                  disabled={saving || !value}
                  onClick={() => value && setEndDate(value)}
                  className={cn(
                    'rounded-full border px-3 text-xs font-medium',
                    value && endDate === value
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:bg-muted/60'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field id="okr-start" label="Fecha de inicio">
                <input
                  id="okr-start"
                  type="date"
                  required
                  value={startDate}
                  disabled={saving}
                  className={control}
                  onChange={(event) => {
                    const next = event.target.value
                    setStartDate(next)
                    if (endDate && next && endDate < next) setEndDate(next)
                  }}
                />
              </Field>
              <Field id="okr-end" label="Fecha de fin" error={show('dates')}>
                <input
                  id="okr-end"
                  type="date"
                  required
                  min={startDate || undefined}
                  value={endDate}
                  disabled={saving}
                  aria-invalid={Boolean(show('dates'))}
                  className={control}
                  onChange={(event) => setEndDate(event.target.value)}
                />
              </Field>
            </div>
          </Section>
        )}

        {editing && (
          <Section
            icon={Archive}
            title="Seguimiento"
            hint="Archivar conserva el historial y bloquea mediciones e iniciativas nuevas."
            divided
          >
            <div
              role="radiogroup"
              aria-label="Disponibilidad"
              className="grid grid-cols-2 gap-2"
            >
              {(
                [
                  [true, 'En seguimiento'],
                  [false, 'Archivado'],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={label}
                  type="button"
                  role="radio"
                  aria-checked={activo === value}
                  disabled={saving}
                  onClick={() => setActivo(value)}
                  className={cn(
                    'rounded-xl border px-3 py-2 text-sm font-medium',
                    activo === value
                      ? 'border-primary bg-primary/5 text-foreground ring-1 ring-primary'
                      : 'text-muted-foreground hover:bg-muted/50'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </Section>
        )}
      </div>
    </EditorFrame>
  )
}

function ObjectiveContext({
  objective,
  areaName,
  saved,
}: {
  objective: Objective
  areaName: string | null
  saved?: boolean
}) {
  const Icon = saved ? CheckCircle2 : Target
  return (
    <div
      className={cn(
        'flex items-center gap-2.5 rounded-lg px-3 py-2',
        saved ? 'bg-primary/5' : 'bg-muted/40'
      )}
    >
      <Icon className="h-4 w-4 shrink-0 text-primary" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium leading-snug">
          {objective.nombre_okr}
        </p>
        <p className="text-xs text-muted-foreground">
          {saved ? 'Objetivo guardado · ' : ''}
          {objective.scope === 'company'
            ? 'Empresa'
            : `Equipo · ${areaName ?? 'Equipo'}`}
          {' · '}
          {formatIsoDate(objective.start_date)} –{' '}
          {formatIsoDate(objective.end_date)}
        </p>
      </div>
    </div>
  )
}

export function KeyResultForm({
  objective,
  areaName,
  kr,
  users,
  followUp,
  onSubmit,
  onCancel,
  onSavingChange,
}: {
  objective: Objective
  areaName: string | null
  kr?: KeyResult
  users: { id: string; nombre: string }[]
  followUp?: boolean
  onSubmit: (values: {
    title: string
    baseline_value: number
    target_value: number
    unit: string
    owner_user_id: string
  }) => Promise<void>
  onCancel: () => void
  onSavingChange: (saving: boolean) => void
}) {
  const editing = Boolean(kr)
  const [title, setTitle] = useState(kr?.title ?? '')
  const [baseline, setBaseline] = useState(
    kr?.baseline_value == null ? '' : String(kr.baseline_value)
  )
  const [target, setTarget] = useState(kr ? String(kr.target_value) : '')
  const [unit, setUnit] = useState(kr?.unit ?? '')
  const [customUnit, setCustomUnit] = useState(
    () => Boolean(kr?.unit) && !isPresetUnit(kr?.unit ?? '')
  )
  const [ownerId, setOwnerId] = useState(kr?.owner_user_id ?? '')
  const [attempted, setAttempted] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState<{ title: string; story: string } | null>(
    null
  )

  const base = parseMetric(baseline)
  const goal = parseMetric(target)
  const story =
    base != null && goal != null ? measurementStory(base, goal, unit) : null
  const errors = {
    title:
      title.trim().length < 3
        ? 'Escribe un resultado de al menos 3 caracteres.'
        : undefined,
    baseline: base == null ? 'Indica la línea base.' : undefined,
    target:
      goal == null
        ? 'Indica la meta.'
        : story?.direction === 'same'
          ? story.label
          : undefined,
    owner: ownerId ? undefined : 'Selecciona quién registra este resultado.',
  }

  function show(field: keyof typeof errors) {
    return attempted ? errors[field] : undefined
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setAttempted(true)
    if (errors.title || errors.baseline || errors.target || errors.owner) {
      focusField(
        errors.title
          ? 'kr-title'
          : errors.baseline
            ? 'kr-baseline'
            : errors.target
              ? 'kr-target'
              : 'kr-owner'
      )
      return
    }
    setSaving(true)
    onSavingChange(true)
    setError('')
    try {
      await onSubmit({
        title: title.trim(),
        baseline_value: base as number,
        target_value: goal as number,
        unit: unit.trim(),
        owner_user_id: ownerId,
      })
      if (!editing) {
        setSaved({
          title: title.trim(),
          story: story && story.direction !== 'same' ? story.label : '',
        })
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'No se pudieron guardar los cambios'
      )
    } finally {
      setSaving(false)
      onSavingChange(false)
    }
  }

  function addAnother() {
    setTitle('')
    setBaseline('')
    setTarget('')
    setAttempted(false)
    setError('')
    setSaved(null)
  }

  if (saved) {
    return (
      <EditorFrame
        title="Resultado clave listo"
        description="Ya puedes medirlo o sumar otro resultado al mismo objetivo."
        steps={
          followUp ? (
            <StepTracker
              labels={['Objetivo', 'Periodo', 'Resultado']}
              current={4}
            />
          ) : undefined
        }
        footer={
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant="outline" onClick={addAnother}>
              Agregar otro
            </Button>
            <Button type="button" onClick={onCancel}>
              Listo
            </Button>
          </div>
        }
      >
        <div className="space-y-3 py-1 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <CheckCircle2 className="h-6 w-6" aria-hidden />
          </div>
          <div className="space-y-1">
            <p className="break-words text-base font-semibold">{saved.title}</p>
            {saved.story ? (
              <p className="text-sm text-muted-foreground">{saved.story}</p>
            ) : null}
          </div>
          <p className="text-sm leading-relaxed text-muted-foreground">
            El avance se calcula de la línea base a la meta. Las iniciativas no
            modifican ese porcentaje.
          </p>
        </div>
      </EditorFrame>
    )
  }

  const TrendIcon = story?.direction === 'down' ? TrendingDown : TrendingUp

  return (
    <EditorFrame
      onSubmit={(event) => void handleSubmit(event)}
      saving={saving}
      steps={
        followUp ? (
          <StepTracker
            labels={['Objetivo', 'Periodo', 'Resultado']}
            current={3}
          />
        ) : undefined
      }
      title={editing ? 'Editar resultado clave' : 'Nuevo resultado clave'}
      description={
        editing
          ? 'Ajusta la métrica, el rango y quién da seguimiento.'
          : 'Qué se mide, de dónde a dónde, y quién registra el avance.'
      }
      footer={
        <FormFooter
          error={error}
          leading={
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={onCancel}
            >
              Cancelar
            </Button>
          }
          primary={
            <Button
              type="submit"
              disabled={saving}
              className="w-full whitespace-normal"
            >
              {saving
                ? 'Guardando…'
                : editing
                  ? 'Guardar cambios'
                  : 'Guardar resultado clave'}
            </Button>
          }
        />
      }
    >
      <div className="space-y-3">
        <ObjectiveContext
          objective={objective}
          areaName={areaName}
          saved={followUp}
        />
        <Field id="kr-title" label="Qué vas a medir" error={show('title')}>
          <textarea
            id="kr-title"
            autoFocus
            rows={2}
            maxLength={250}
            value={title}
            disabled={saving}
            aria-invalid={Boolean(show('title'))}
            placeholder="Una frase comprobable, p. ej. Reducir el tiempo de entrega de 10 a 4 días"
            className={cn(control, 'resize-y font-medium')}
            onChange={(event) => setTitle(event.target.value)}
          />
        </Field>
        <div className="space-y-3">
          <div>
            <p className="mb-1.5 text-sm font-medium">Unidad</p>
            <div
              role="radiogroup"
              aria-label="Unidad de medida"
              className="flex flex-wrap gap-1.5"
            >
              {UNIT_PRESETS.map((item) => {
                const selected = !customUnit && unit === item.value
                return (
                  <button
                    key={item.value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    disabled={saving}
                    onClick={() => {
                      setCustomUnit(false)
                      setUnit(item.value)
                    }}
                    className={cn(
                      '!min-h-9 h-9 rounded-full border px-3 text-sm font-medium',
                      selected
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'text-muted-foreground hover:bg-muted/60'
                    )}
                  >
                    {item.label}
                  </button>
                )
              })}
              <button
                type="button"
                role="radio"
                aria-checked={customUnit}
                disabled={saving}
                onClick={() => {
                  setCustomUnit(true)
                  if (isPresetUnit(unit)) setUnit('')
                }}
                className={cn(
                  '!min-h-9 h-9 rounded-full border px-3 text-sm font-medium',
                  customUnit
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-muted/60'
                )}
              >
                Otra
              </button>
            </div>
            {customUnit && (
              <div className="mt-2">
                <Field id="kr-unit" label="Unidad personalizada">
                  <input
                    id="kr-unit"
                    maxLength={50}
                    value={unit}
                    disabled={saving}
                    placeholder="entregas, puntos, horas…"
                    className={control}
                    onChange={(event) => setUnit(event.target.value)}
                  />
                </Field>
              </div>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field id="kr-baseline" label="Línea base" error={show('baseline')}>
              <input
                id="kr-baseline"
                required
                type="number"
                step="any"
                inputMode="decimal"
                value={baseline}
                disabled={saving}
                aria-invalid={Boolean(show('baseline'))}
                className={control}
                onChange={(event) => setBaseline(event.target.value)}
              />
            </Field>
            <Field id="kr-target" label="Meta" error={show('target')}>
              <input
                id="kr-target"
                required
                type="number"
                step="any"
                inputMode="decimal"
                value={target}
                disabled={saving}
                aria-invalid={Boolean(show('target'))}
                className={control}
                onChange={(event) => setTarget(event.target.value)}
              />
            </Field>
            <Field
              id="kr-owner"
              label="Quién da seguimiento"
              error={show('owner')}
            >
              <select
                id="kr-owner"
                required
                value={ownerId}
                disabled={saving}
                aria-invalid={Boolean(show('owner'))}
                className={control}
                onChange={(event) => setOwnerId(event.target.value)}
              >
                <option value="">Seleccionar</option>
                {ownerId && !users.some((user) => user.id === ownerId) && (
                  <option value={ownerId}>Responsable actual</option>
                )}
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.nombre}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <p
            className={cn(
              'flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm leading-snug',
              story?.direction === 'same'
                ? 'bg-destructive/10 text-destructive'
                : story
                  ? 'bg-primary/5 text-foreground'
                  : 'bg-muted/40 text-muted-foreground'
            )}
            aria-live="polite"
          >
            {story && story.direction !== 'same' ? (
              <TrendIcon className="h-4 w-4 shrink-0 text-primary" aria-hidden />
            ) : null}
            {story?.label ??
              'Completa línea base y meta para ver si el indicador sube o baja.'}
          </p>
          {editing && kr?.current_value != null && (
            <p className="text-xs leading-relaxed text-muted-foreground">
              Valor actual:{' '}
              <span className="font-medium text-foreground">
                {formatMetric(kr.current_value)} {kr.unit}
              </span>
              . Cambiar la línea base o la meta recalcula el avance y conserva
              las mediciones.
            </p>
          )}
        </div>
      </div>
    </EditorFrame>
  )
}
