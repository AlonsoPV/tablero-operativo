import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowUpRight,
  Building2,
  CalendarRange,
  ChevronRight,
  Flag,
  Target,
  UserRound,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { ROUTES } from '@/constants'
import {
  formatMetric,
  krProgress,
  type KeyResult,
  type Objective,
  type OkrData,
} from './model'
import {
  comparableChange,
  measurementLabel,
  measurementsFor,
  reportDate,
} from './reporting'
import {
  ProgressBar,
  StatusSquare,
  metricText,
  progressTone,
  toneTextClass,
  type ProgressTone,
} from './okrPresentation'

const BUCKETS = [
  '0-10%',
  '10-20%',
  '20-30%',
  '30-40%',
  '40-50%',
  '50-60%',
  '60-70%',
  '70-80%',
  '80-90%',
  '90-100%',
] as const

function bucketIndex(progress: number) {
  const clamped = Math.max(0, Math.min(100, progress))
  return Math.min(9, Math.floor(clamped / 10))
}

function ownerInitials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

function OwnerAvatar({ name }: { name: string }) {
  const initials = ownerInitials(name)
  return (
    <span
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold uppercase text-muted-foreground"
      title={name}
      aria-hidden
    >
      {initials || <UserRound className="h-3.5 w-3.5" />}
    </span>
  )
}

function CardShell({
  title,
  children,
  className,
}: {
  title: string
  children: ReactNode
  className?: string
}) {
  return (
    <section
      className={cn(
        'overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm',
        className
      )}
    >
      <header className="flex items-center gap-2 border-b border-border/50 px-4 py-3 sm:px-5">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-muted">
          <Target className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
        </span>
        <h2 className="text-sm font-semibold tracking-tight sm:text-[15px]">
          {title}
        </h2>
      </header>
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  )
}

function KeyResultSummaryCard({
  kr,
  objective,
  data,
}: {
  kr: KeyResult
  objective: Objective
  data: OkrData
}) {
  const history = measurementsFor(data.checkIns, kr.id)
  const change = comparableChange(history)
  const owner =
    data.users.find((user) => user.id === kr.owner_user_id)?.nombre ??
    'Sin dueño'
  const scopeLabel =
    objective.scope === 'company'
      ? 'Empresa'
      : (data.areas.find((area) => area.id === objective.area_id)?.nombre ??
        'Equipo')
  const periodLabel = `${reportDate(objective.start_date)} — ${reportDate(objective.end_date)}`
  const value =
    kr.current_value == null ? '—' : formatMetric(kr.current_value)

  return (
    <CardShell title="Resumen del resultado clave">
      <div className="relative overflow-hidden rounded-xl bg-amber-50 px-4 py-5 dark:bg-amber-500/10">
        <p className="text-5xl font-semibold tabular-nums tracking-tight text-amber-600 dark:text-amber-400 sm:text-6xl">
          {value}
        </p>
        <div className="absolute right-3 top-3 flex flex-col items-end gap-1">
          <OwnerAvatar name={owner} />
          {change != null ? (
            <span
              className={cn(
                'text-xs font-semibold tabular-nums',
                change > 0
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : change < 0
                    ? 'text-rose-600 dark:text-rose-400'
                    : 'text-muted-foreground'
              )}
            >
              {change > 0 ? '+' : ''}
              {formatMetric(change)}%
            </span>
          ) : null}
        </div>
        {kr.unit ? (
          <p className="mt-1 text-xs font-medium text-amber-800/70 dark:text-amber-200/70">
            {kr.unit}
          </p>
        ) : null}
      </div>
      <h3 className="mt-4 text-base font-semibold leading-snug sm:text-lg">
        {kr.title}
      </h3>
      <p className="mt-3 flex items-start gap-1.5 text-xs leading-relaxed text-muted-foreground">
        <Building2 className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        <span className="min-w-0">
          {scopeLabel} · {periodLabel}
          <span className="text-border"> / </span>
          {objective.nombre_okr}
        </span>
      </p>
    </CardShell>
  )
}

function KeyResultsDistributionCard({
  keyResults,
}: {
  keyResults: KeyResult[]
}) {
  const counts = useMemo(() => {
    const next = Array.from({ length: 10 }, () => 0)
    for (const kr of keyResults) {
      next[bucketIndex(krProgress(kr))] += 1
    }
    return next
  }, [keyResults])
  const max = Math.max(1, ...counts)

  return (
    <CardShell title="Iniciativas activas">
      <div
        className="flex h-44 items-end justify-between gap-1 sm:gap-1.5"
        role="img"
        aria-label="Distribución de resultados clave por avance"
      >
        {counts.map((count, index) => (
          <div
            key={BUCKETS[index]}
            className="flex min-w-0 flex-1 flex-col items-center gap-1"
          >
            <span className="text-[10px] font-semibold tabular-nums text-muted-foreground sm:text-xs">
              {count}
            </span>
            <div
              className="w-full max-w-[2rem] rounded-t-md bg-sky-500/90"
              style={{
                height: `${Math.max(count === 0 ? 4 : 12, (count / max) * 120)}px`,
              }}
              title={`${BUCKETS[index]}: ${count}`}
            />
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-between gap-1 text-[9px] text-muted-foreground sm:text-[10px]">
        {BUCKETS.map((label) => (
          <span key={label} className="min-w-0 flex-1 truncate text-center">
            {label}
          </span>
        ))}
      </div>
      <p className="mt-3 text-center text-xs text-muted-foreground">
        Distribución de resultados clave
      </p>
    </CardShell>
  )
}

function ProgressRow({
  kr,
  objective,
  data,
  open,
  onToggle,
}: {
  kr: KeyResult
  objective: Objective
  data: OkrData
  open: boolean
  onToggle: () => void
}) {
  const progress = krProgress(kr)
  const tone: ProgressTone = progressTone(progress)
  const owner =
    data.users.find((user) => user.id === kr.owner_user_id)?.nombre ??
    'Sin dueño'
  const scopeLabel =
    objective.scope === 'company'
      ? 'Empresa'
      : (data.areas.find((area) => area.id === objective.area_id)?.nombre ??
        'Equipo')
  const planLabel = `${scopeLabel} · ${reportDate(objective.start_date)} — ${reportDate(objective.end_date)}`
  const currentLabel = metricText(kr.current_value, kr.unit)
  const history = measurementsFor(data.checkIns, kr.id)
  const lastUpdate = measurementLabel(kr, history)
  const initiatives = data.initiatives.filter(
    (item) => item.key_result_id === kr.id
  ).length

  return (
    <li className="border-b border-border/50 last:border-b-0">
      <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto_minmax(7rem,0.8fr)] items-center gap-3 px-4 py-3 sm:gap-4 sm:px-5">
        <button
          type="button"
          aria-expanded={open}
          onClick={onToggle}
          className="flex min-w-0 items-start gap-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronRight
            className={cn(
              'mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform',
              open && 'rotate-90'
            )}
            aria-hidden
          />
          <StatusSquare tone={tone} />
          <span className="min-w-0 truncate text-sm font-medium leading-snug">
            {kr.title}
          </span>
        </button>

        <p className="hidden min-w-0 items-center gap-1.5 truncate text-xs text-muted-foreground md:flex">
          <Building2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="truncate">{planLabel}</span>
        </p>

        <OwnerAvatar name={owner} />

        <div className="min-w-0">
          <p
            className={cn(
              'truncate text-right text-xs font-semibold tabular-nums sm:text-sm',
              toneTextClass(tone)
            )}
          >
            {currentLabel}
          </p>
          <div className="mt-1.5">
            <ProgressBar
              value={progress}
              label={`Avance de ${kr.title}`}
              size="sm"
              tone={tone}
            />
          </div>
        </div>
      </div>

      {open && (
        <div className="border-t border-border/40 bg-muted/15 px-4 py-4 sm:px-5">
          <div className="rounded-xl border border-border/60 bg-card p-3.5 shadow-sm sm:p-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 space-y-3">
                <div className="flex items-start gap-2.5">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400">
                    <Flag className="h-4 w-4" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Objetivo
                    </p>
                    <p className="mt-0.5 text-sm font-semibold leading-snug text-foreground">
                      {objective.nombre_okr}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <Building2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    {scopeLabel}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <CalendarRange className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    {reportDate(objective.start_date)} —{' '}
                    {reportDate(objective.end_date)}
                  </span>
                  <span className="inline-flex items-center gap-1.5 md:hidden">
                    <UserRound className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    {owner}
                  </span>
                </div>
              </div>

              <Button asChild variant="outline" size="sm" className="h-9 shrink-0 self-start">
                <Link to={`${ROUTES.OKRS}?objective=${objective.id}`}>
                  Abrir en OKRs
                  <ArrowUpRight className="ml-1.5 h-3.5 w-3.5" />
                </Link>
              </Button>
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-4">
              {[
                {
                  label: 'Línea base',
                  value: metricText(kr.baseline_value, kr.unit),
                },
                {
                  label: 'Actual',
                  value: currentLabel,
                  emphasize: true,
                },
                {
                  label: 'Meta',
                  value: metricText(kr.target_value, kr.unit),
                },
                {
                  label: 'Avance',
                  value: `${Math.round(progress)}%`,
                  emphasize: true,
                },
              ].map((item) => (
                <div
                  key={item.label}
                  className="rounded-lg border border-border/50 bg-muted/25 px-3 py-2.5"
                >
                  <p className="text-[11px] text-muted-foreground">{item.label}</p>
                  <p
                    className={cn(
                      'mt-0.5 truncate text-sm font-semibold tabular-nums',
                      item.emphasize && toneTextClass(tone)
                    )}
                  >
                    {item.value}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span>
                {initiatives}{' '}
                {initiatives === 1 ? 'iniciativa vinculada' : 'iniciativas vinculadas'}
              </span>
              <span aria-hidden>·</span>
              <span>{lastUpdate}</span>
            </div>
          </div>
        </div>
      )}
    </li>
  )
}

function CompanyProgressCard({
  rows,
  data,
}: {
  rows: { kr: KeyResult; objective: Objective }[]
  data: OkrData
}) {
  const [openIds, setOpenIds] = useState<Set<string>>(() => new Set())

  return (
    <section className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm">
      <header className="flex items-center gap-2 border-b border-border/50 px-4 py-3 sm:px-5">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-muted">
          <Target className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
        </span>
        <h2 className="text-sm font-semibold tracking-tight sm:text-[15px]">
          Avance de OKRs
        </h2>
      </header>

      <div className="hidden grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto_minmax(7rem,0.8fr)] gap-3 border-b border-border/50 px-4 py-2 text-xs font-medium text-muted-foreground sm:gap-4 sm:px-5 md:grid">
        <span className="pl-6">Resultado clave</span>
        <span>Plan</span>
        <span className="w-7 text-center">Dueño</span>
        <span className="text-right">Progreso</span>
      </div>

      {!rows.length ? (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground sm:px-5">
          No hay resultados clave en este alcance.
        </p>
      ) : (
        <ul>
          {rows.map(({ kr, objective }) => (
            <ProgressRow
              key={kr.id}
              kr={kr}
              objective={objective}
              data={data}
              open={openIds.has(kr.id)}
              onToggle={() =>
                setOpenIds((current) => {
                  const next = new Set(current)
                  if (next.has(kr.id)) next.delete(kr.id)
                  else next.add(kr.id)
                  return next
                })
              }
            />
          ))}
        </ul>
      )}
    </section>
  )
}

export function OkrDashboardOverview({
  data,
  objectives,
}: {
  data: OkrData
  objectives: Objective[]
}) {
  const objectiveById = useMemo(
    () => new Map(objectives.map((item) => [item.id, item])),
    [objectives]
  )
  const rows = useMemo(
    () =>
      data.keyResults
        .filter((kr) => objectiveById.has(kr.okr_id))
        .map((kr) => ({
          kr,
          objective: objectiveById.get(kr.okr_id)!,
        })),
    [data.keyResults, objectiveById]
  )
  const featured = useMemo(() => {
    if (!rows.length) return null
    const withHistory = [...rows].sort((a, b) => {
      const aHistory = measurementsFor(data.checkIns, a.kr.id)
      const bHistory = measurementsFor(data.checkIns, b.kr.id)
      const aAt = aHistory[0]?.created_at ?? ''
      const bAt = bHistory[0]?.created_at ?? ''
      return bAt.localeCompare(aAt)
    })
    return withHistory[0]
  }, [rows, data.checkIns])

  if (!rows.length) return null

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        {featured ? (
          <KeyResultSummaryCard
            kr={featured.kr}
            objective={featured.objective}
            data={data}
          />
        ) : null}
        <KeyResultsDistributionCard
          keyResults={rows.map((row) => row.kr)}
        />
      </div>
      <CompanyProgressCard rows={rows} data={data} />
    </div>
  )
}
