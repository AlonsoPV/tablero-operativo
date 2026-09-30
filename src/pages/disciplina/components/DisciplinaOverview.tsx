import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Flame,
  Gauge,
  GraduationCap,
  MessageSquare,
  PenLine,
  Target,
  Trophy,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { ROUTES } from '@/constants'
import type {
  ActionGamificationMetrics,
  ActionGamificationRule,
} from '@/features/disciplina/utils/actionGamification'

function CardShell({
  title,
  icon: Icon = Target,
  children,
  action,
  className,
}: {
  title: string
  icon?: LucideIcon
  children: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <section
      className={cn(
        'overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm',
        className
      )}
    >
      <header className="flex items-center justify-between gap-3 border-b border-border/50 px-4 py-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted">
            <Icon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
          </span>
          <h2 className="truncate text-sm font-semibold tracking-tight sm:text-[15px]">
            {title}
          </h2>
        </div>
        {action}
      </header>
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  )
}

function formatSigned(value: number) {
  if (value > 0) return `+${value}`
  return String(value)
}

function fulfillmentTone(percent: number) {
  if (percent >= 85)
    return {
      box: 'bg-emerald-50 dark:bg-emerald-500/10',
      value: 'text-emerald-600 dark:text-emerald-400',
      helper: 'text-emerald-800/70 dark:text-emerald-200/70',
      bar: 'bg-emerald-500',
      text: 'text-emerald-600 dark:text-emerald-400',
    }
  if (percent >= 60)
    return {
      box: 'bg-amber-50 dark:bg-amber-500/10',
      value: 'text-amber-600 dark:text-amber-400',
      helper: 'text-amber-800/70 dark:text-amber-200/70',
      bar: 'bg-amber-500',
      text: 'text-amber-600 dark:text-amber-400',
    }
  return {
    box: 'bg-rose-50 dark:bg-rose-500/10',
    value: 'text-rose-600 dark:text-rose-400',
    helper: 'text-rose-800/70 dark:text-rose-200/70',
    bar: 'bg-rose-500',
    text: 'text-rose-600 dark:text-rose-400',
  }
}

function ruleIcon(key: ActionGamificationRule['key']): LucideIcon {
  if (key === 'onTimeClosed') return CheckCircle2
  if (key === 'academyModulesCompleted') return GraduationCap
  if (key === 'overdue') return AlertTriangle
  if (key === 'commentsMade') return MessageSquare
  if (key === 'created') return PenLine
  if (key === 'assigned') return Users
  if (key === 'participationStreak') return Flame
  return Gauge
}

function SummaryCard({ metrics }: { metrics: ActionGamificationMetrics }) {
  const tone = fulfillmentTone(metrics.fulfillmentPercent)
  const pending = Math.max(0, metrics.possiblePoints - metrics.earnedPoints)

  return (
    <CardShell title="Resumen de disciplina" icon={Gauge}>
      <div className={cn('relative overflow-hidden rounded-xl px-3 py-4 sm:px-4', tone.box)}>
        <p
          className={cn(
            'text-4xl font-semibold tabular-nums tracking-tight sm:text-5xl',
            tone.value
          )}
        >
          {metrics.fulfillmentPercent}%
        </p>
        <p className={cn('mt-1 text-xs font-medium', tone.helper)}>
          cumplimiento · {metrics.level}
        </p>
        <div className="absolute right-3 top-3 text-right">
          <span className={cn('text-sm font-semibold tabular-nums', tone.text)}>
            {formatSigned(metrics.totalPoints)} pts
          </span>
        </div>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className={cn('h-full rounded-full transition-all', tone.bar)}
          style={{
            width: `${Math.max(0, Math.min(100, metrics.fulfillmentPercent))}%`,
          }}
        />
      </div>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
        {metrics.earnedPoints}/{metrics.possiblePoints} capturados
        {' · '}
        Racha {metrics.participationStreak}d
        {' · '}
        {metrics.overdue} retraso{metrics.overdue === 1 ? '' : 's'}
        {pending > 0 ? ` · faltan ${pending}` : ''}
      </p>
    </CardShell>
  )
}

function PointsDistributionCard({
  metrics,
}: {
  metrics: ActionGamificationMetrics
}) {
  const rows = useMemo(
    () =>
      metrics.rules
        .filter((rule) => rule.pointsPerUnit > 0)
        .map((rule) => ({
          rule,
          earned: Math.max(0, rule.points),
        }))
        .filter((row) => row.earned > 0 || row.rule.count > 0)
        .sort((a, b) => b.earned - a.earned)
        .slice(0, 6),
    [metrics.rules]
  )
  const max = Math.max(1, ...rows.map((row) => row.earned))

  return (
    <CardShell title="Distribución de puntos" icon={Trophy}>
      {!rows.length ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Aún no hay puntos positivos en el periodo.
        </p>
      ) : (
        <>
          <div
            className="flex h-36 items-end justify-between gap-1.5 sm:gap-2"
            role="img"
            aria-label="Distribución de puntos ganados por conducta"
          >
            {rows.map(({ rule, earned }) => (
              <div
                key={rule.key}
                className="flex min-w-0 flex-1 flex-col items-center gap-1"
                title={`${rule.label}: ${earned} pts`}
              >
                <span className="text-[10px] font-semibold tabular-nums text-muted-foreground sm:text-xs">
                  {earned}
                </span>
                <div
                  className="w-full max-w-[2.25rem] rounded-t-md bg-sky-500/90"
                  style={{
                    height: `${Math.max(
                      earned === 0 ? 4 : 14,
                      (earned / max) * 120
                    )}px`,
                  }}
                />
                <span className="w-full truncate text-center text-[9px] text-muted-foreground sm:text-[10px]">
                  {rule.label}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-center text-xs text-muted-foreground">
            Puntos ganados por conducta
          </p>
        </>
      )}
    </CardShell>
  )
}

function MarkerRow({
  rule,
  open,
  onToggle,
}: {
  rule: ActionGamificationRule
  open: boolean
  onToggle: () => void
}) {
  const Icon = ruleIcon(rule.key)
  const negative = rule.points < 0 || rule.pointsPerUnit < 0
  const tone = negative
    ? 'text-rose-600 dark:text-rose-400'
    : 'text-emerald-600 dark:text-emerald-400'
  const square = negative ? 'bg-rose-500' : 'bg-emerald-500'
  const bar = negative ? 'bg-rose-500' : 'bg-emerald-500'
  const progress = Math.min(
    100,
    Math.abs(rule.pointsPerUnit) > 0
      ? (Math.abs(rule.points) /
          Math.max(Math.abs(rule.pointsPerUnit) * Math.max(rule.count, 1), 1)) *
        100
      : 0
  )

  return (
    <li className="border-b border-border/50 last:border-b-0">
      <div className="grid grid-cols-[minmax(0,1.6fr)_auto_minmax(7rem,0.8fr)] items-center gap-3 px-4 py-3 sm:gap-4 sm:px-5">
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
          <span
            className={cn('mt-0.5 h-3.5 w-3.5 shrink-0 rounded-[4px]', square)}
            aria-hidden
          />
          <span className="min-w-0 truncate text-sm font-medium leading-snug">
            {rule.label}
          </span>
        </button>

        <span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:inline-flex">
          <Icon className="h-3.5 w-3.5" aria-hidden />
          {rule.count}×
        </span>

        <div className="min-w-0">
          <p className={cn('truncate text-right text-xs font-semibold tabular-nums sm:text-sm', tone)}>
            {formatSigned(rule.points)} pts
          </p>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className={cn('h-full rounded-full', bar)}
              style={{ width: `${Math.max(8, progress)}%` }}
            />
          </div>
        </div>
      </div>

      {open && (
        <div className="border-t border-border/40 bg-muted/15 px-4 py-4 sm:px-5">
          <div className="rounded-xl border border-border/60 bg-card p-3.5 shadow-sm sm:p-4">
            <div className="flex items-start gap-3">
              <span
                className={cn(
                  'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                  negative
                    ? 'bg-rose-500/10 text-rose-600'
                    : 'bg-emerald-500/10 text-emerald-600'
                )}
              >
                <Icon className="h-4 w-4" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{rule.label}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {rule.helper}
                </p>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  {[
                    { label: 'Veces', value: String(rule.count) },
                    {
                      label: 'Pts c/u',
                      value: formatSigned(rule.pointsPerUnit),
                    },
                    {
                      label: 'Total',
                      value: formatSigned(rule.points),
                      emphasize: true,
                    },
                  ].map((item) => (
                    <div
                      key={item.label}
                      className="rounded-lg border border-border/50 bg-muted/25 px-3 py-2.5"
                    >
                      <p className="text-[11px] text-muted-foreground">
                        {item.label}
                      </p>
                      <p
                        className={cn(
                          'mt-0.5 text-sm font-semibold tabular-nums',
                          item.emphasize && tone
                        )}
                      >
                        {item.value}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </li>
  )
}

function MarkerTable({ metrics }: { metrics: ActionGamificationMetrics }) {
  const [openIds, setOpenIds] = useState<Set<string>>(() => new Set())
  const [showAll, setShowAll] = useState(false)
  const rows = useMemo(
    () =>
      [...metrics.rules]
        .filter((rule) => rule.count > 0)
        .sort((a, b) => Math.abs(b.points) - Math.abs(a.points)),
    [metrics.rules]
  )
  const visible = showAll ? rows : rows.slice(0, 5)
  const hidden = Math.max(0, rows.length - visible.length)

  return (
    <section className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm">
      <header className="flex items-center justify-between gap-3 border-b border-border/50 px-4 py-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted">
            <Target className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
          </span>
          <h2 className="text-sm font-semibold tracking-tight sm:text-[15px]">
            Tu marcador
          </h2>
        </div>
        <Button asChild variant="ghost" size="sm" className="h-8 text-xs">
          <Link to={`${ROUTES.MANUAL}?seccion=gamificacion`}>Ver reglas</Link>
        </Button>
      </header>

      <div className="hidden grid-cols-[minmax(0,1.6fr)_auto_minmax(7rem,0.8fr)] gap-3 border-b border-border/50 px-4 py-2 text-xs font-medium text-muted-foreground sm:gap-4 sm:px-5 sm:grid">
        <span className="pl-6">Conducta</span>
        <span>Veces</span>
        <span className="text-right">Puntos</span>
      </div>

      {!rows.length ? (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground sm:px-5">
          Sin actividades con puntos todavía. Cierra, comenta o crea una acción
          para activar el marcador.
        </p>
      ) : (
        <>
          <ul>
            {visible.map((rule) => (
              <MarkerRow
                key={rule.key}
                rule={rule}
                open={openIds.has(rule.key)}
                onToggle={() =>
                  setOpenIds((current) => {
                    const next = new Set(current)
                    if (next.has(rule.key)) next.delete(rule.key)
                    else next.add(rule.key)
                    return next
                  })
                }
              />
            ))}
          </ul>
          {hidden > 0 || showAll ? (
            <div className="border-t border-border/50 px-4 py-2.5 sm:px-5">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 w-full text-xs"
                onClick={() => setShowAll((value) => !value)}
              >
                {showAll ? 'Mostrar menos' : `Ver ${hidden} más`}
              </Button>
            </div>
          ) : null}
        </>
      )}
    </section>
  )
}

export function DisciplinaOverview({
  metrics,
  nextActionTitle,
  nextActionText,
  onOpenHoy,
}: {
  metrics: ActionGamificationMetrics
  nextActionTitle?: string
  nextActionText?: string
  onOpenHoy?: () => void
}) {
  return (
    <div className="space-y-3">
      {(nextActionTitle || nextActionText) && (
        <section className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-card p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-4">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Siguiente movimiento
            </p>
            <p className="mt-0.5 text-sm font-semibold">{nextActionTitle}</p>
            {nextActionText ? (
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                {nextActionText}
              </p>
            ) : null}
          </div>
          {onOpenHoy ? (
            <Button
              type="button"
              size="sm"
              className="h-9 shrink-0"
              onClick={onOpenHoy}
            >
              Ir a Hoy
            </Button>
          ) : null}
        </section>
      )}
      <div className="grid gap-3 lg:grid-cols-2">
        <SummaryCard metrics={metrics} />
        <PointsDistributionCard metrics={metrics} />
      </div>
      <MarkerTable metrics={metrics} />
    </div>
  )
}
