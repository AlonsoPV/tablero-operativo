import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Flame,
  Gauge,
  GraduationCap,
  MessageSquare,
  MinusCircle,
  PenLine,
  RefreshCw,
  ShieldCheck,
  Target,
  Users,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SectionCard, SectionCardBody, SectionCardHeader } from '@/components/SectionCard'
import { useAcciones } from '@/features/operations/hooks'
import { useCurrentUser } from '@/features/users/hooks/useCurrentUser'
import { accionComentariosService } from '@/services/accionComentarios.service'
import { calendarNotesService } from '@/services/calendarNotes.service'
import { calendarRemindersService } from '@/services/calendarReminders.service'
import { addCalendarDays, todayWallClockCDMX } from '@/lib/dateUtils'
import { cn } from '@/lib/utils'
import {
  buildActionGamificationMetrics,
  getUserOwnedActions,
  getUserRelevantComments,
  type ActionGamificationMetrics,
  type ActionGamificationRule,
  type ActionGamificationTone,
} from '@/features/disciplina/utils/actionGamification'
import { DisciplinaOperativoSection } from './components/DisciplinaOperativoSection'
import { useAcademyProgress } from '@/features/academy'

const RECENT_CALENDAR_ITEMS_LIMIT = 6
type MetricTone = 'neutral' | 'good' | 'warn' | 'risk'

export function DisciplinaPage() {
  const today = todayWallClockCDMX()
  const [fecha] = useState(today)
  const { data: currentUser } = useCurrentUser()
  const historyStart = useMemo(() => addCalendarDays(today, -90), [today])
  const {
    data: acciones = [],
    isLoading: loadingActions,
    isError: actionsError,
    refetch: retryActions,
  } = useAcciones({ fecha_min: historyStart })
  const actionIds = useMemo(() => acciones.map((action) => action.id), [acciones])
  const {
    data: comentarios = [],
    isLoading: loadingComments,
    isError: commentsError,
    refetch: retryComments,
  } = useQuery({
    queryKey: ['disciplina', 'comentarios', actionIds],
    queryFn: () => accionComentariosService.listByAccionIds(actionIds),
    enabled: actionIds.length > 0,
    staleTime: 30_000,
    retry: 1,
  })
  const personalActions = useMemo(
    () => getUserOwnedActions(currentUser?.id, acciones, comentarios),
    [acciones, comentarios, currentUser?.id]
  )
  const personalComments = useMemo(
    () => getUserRelevantComments(currentUser?.id, comentarios, personalActions),
    [comentarios, currentUser?.id, personalActions]
  )
  const {
    data: recentReminders = [],
    isLoading: remindersLoading,
    isError: remindersError,
  } = useQuery({
    queryKey: ['disciplina', 'calendar-reminders', currentUser?.id ?? ''],
    queryFn: () => calendarRemindersService.listRecentByUser(currentUser!.id, RECENT_CALENDAR_ITEMS_LIMIT),
    enabled: Boolean(currentUser?.id),
    staleTime: 30_000,
  })
  const {
    data: recentNotes = [],
    isLoading: notesLoading,
    isError: notesError,
  } = useQuery({
    queryKey: ['disciplina', 'calendar-notes', currentUser?.id ?? ''],
    queryFn: () => calendarNotesService.listRecentByUser(currentUser!.id, RECENT_CALENDAR_ITEMS_LIMIT),
    enabled: Boolean(currentUser?.id),
    staleTime: 30_000,
  })
  const { completedCount: academyModulesCompleted } = useAcademyProgress()

  const personalMetrics = useMemo(
    () => buildPersonalMetrics(currentUser?.id, personalActions, personalComments, today, academyModulesCompleted),
    [academyModulesCompleted, currentUser?.id, personalActions, personalComments, today]
  )
  const positiveRules = useMemo(
    () => personalMetrics.rules.filter((rule) => rule.pointsPerUnit > 0),
    [personalMetrics.rules]
  )
  const consequenceRules = useMemo(
    () => personalMetrics.rules.filter((rule) => rule.pointsPerUnit < 0),
    [personalMetrics.rules]
  )
  const blockedActions = useMemo(
    () => personalActions.filter((action) => action.estado === 'Bloqueado').length,
    [personalActions]
  )
  const todayOwnedActions = useMemo(() => {
    if (!currentUser?.id) return []
    const todayList = acciones.filter((action) => action.fecha === fecha)
    return getUserOwnedActions(currentUser.id, todayList, comentarios)
  }, [acciones, comentarios, currentUser?.id, fecha])
  const todayBlockedActions = useMemo(
    () => todayOwnedActions.filter((action) => action.estado === 'Bloqueado').length,
    [todayOwnedActions]
  )
  const loading = loadingActions || loadingComments
  const hasError = actionsError

  return (
    <div
      id="disciplina-page"
      className="disciplina-page mx-auto w-full max-w-7xl space-y-4 overflow-x-hidden px-3 py-4 sm:space-y-6 sm:px-6 sm:py-6"
    >
      <header
        id="disciplina-header"
        className="disciplina-header overflow-hidden rounded-xl border border-border bg-card shadow-sm"
      >
        <div className="grid gap-4 p-4 sm:p-5 lg:grid-cols-[1fr_auto] lg:items-center">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Disciplina</p>
            <h1 className="mt-0.5 text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
              Tu dia operativo
            </h1>
            <p className="mt-1.5 max-w-3xl text-xs leading-relaxed text-muted-foreground sm:mt-2 sm:text-sm">
              {heroAlertCopy(blockedActions, personalMetrics.overdue)}
            </p>
          </div>
          <div className="grid min-w-0 grid-cols-3 gap-2 lg:min-w-[420px]">
            <HeroMetric label="Puntaje" value={`${formatSignedPoints(personalMetrics.totalPoints)} pts`} tone={personalMetrics.levelTone} />
            <HeroMetric label="Racha" value={`${personalMetrics.participationStreak} dia${personalMetrics.participationStreak === 1 ? '' : 's'}`} />
            <HeroMetric label="Retrasos" value={String(personalMetrics.overdue)} tone={personalMetrics.overdue > 0 ? 'negative' : 'neutral'} />
          </div>
        </div>
      </header>

      {hasError ? (
        <SectionCard>
          <SectionCardBody className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-foreground">No se pudo cargar tu información operativa.</p>
              <p className="text-sm text-muted-foreground">Puedes reintentar sin salir de Disciplina.</p>
            </div>
            <Button
              variant="outline"
              onClick={() => {
                void retryActions()
                if (commentsError) void retryComments()
              }}
            >
              <RefreshCw className="h-4 w-4" aria-hidden />
              Reintentar
            </Button>
          </SectionCardBody>
        </SectionCard>
      ) : null}

      {loading ? (
        <div className="grid gap-4 sm:gap-6 lg:grid-cols-2 lg:items-start">
          <SkeletonBlock className="h-64 sm:h-72" />
          <SkeletonBlock className="h-56 sm:h-72" />
        </div>
      ) : currentUser ? (
        <div className="grid gap-4 sm:gap-6 lg:grid-cols-2 lg:items-start">
          <DisciplinaOperativoSection
            fecha={fecha}
            usuarioId={currentUser.id}
            accionesCount={todayOwnedActions.length}
            accionesBloqueadas={todayBlockedActions}
            reminders={recentReminders}
            notes={recentNotes}
            remindersLoading={remindersLoading}
            notesLoading={notesLoading}
            remindersError={remindersError}
            notesError={notesError}
          />

          <section id="disciplina-indicadores" aria-labelledby="disciplina-acciones-heading">
            <SectionCard className="h-full">
              <SectionCardHeader
                className="px-3 py-3 sm:px-4 sm:py-4 md:px-6"
                titleId="disciplina-acciones-heading"
                eyebrow="Disciplina"
                title="Tu puntaje explicado"
                subtitle="Qué suma, qué resta y qué conviene mejorar."
                icon={Target}
              />
              <SectionCardBody className="space-y-3 p-3 sm:space-y-4 sm:p-4 md:p-6">
                <ScoreCompactPanel metrics={personalMetrics} />
                <ScoreDetailDisclosure
                  positiveRules={positiveRules}
                  consequenceRules={consequenceRules}
                  metrics={personalMetrics}
                />
              </SectionCardBody>
            </SectionCard>
          </section>
        </div>
      ) : (
        <SectionCard>
          <SectionCardBody>
            <div className="flex h-48 items-center justify-center rounded-lg border border-dashed border-border/60 bg-muted/20 text-sm text-muted-foreground">
              Inicia sesion para ver tu disciplina operativa.
            </div>
          </SectionCardBody>
        </SectionCard>
      )}
    </div>
  )
}

type PersonalMetrics = ActionGamificationMetrics

const buildPersonalMetrics = buildActionGamificationMetrics

function HeroMetric({
  label,
  value,
  tone = 'neutral',
}: {
  label: string
  value: string
  tone?: ActionGamificationTone
}) {
  return (
    <div className={cn('rounded-lg border px-2.5 py-2.5 text-center', heroMetricTone(tone))}>
      <p className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground sm:text-[10px]">
        {label}
      </p>
      <p className="mt-0.5 text-base font-semibold tabular-nums text-foreground sm:text-lg">{value}</p>
    </div>
  )
}

function ScoreCompactPanel({ metrics }: { metrics: PersonalMetrics }) {
  const netoTone = scoreToneToMetricTone(metrics.levelTone)

  return (
    <div className="rounded-xl border border-border/70 bg-muted/10 p-3 sm:p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Puntaje del día</p>
          <h3 className="mt-0.5 text-base font-semibold tracking-tight text-foreground sm:mt-1 sm:text-lg">
            Resumen de tu disciplina
          </h3>
        </div>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-background sm:h-9 sm:w-9">
          <Gauge className="h-3.5 w-3.5 text-muted-foreground sm:h-4 sm:w-4" aria-hidden />
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-1.5 sm:mt-4 sm:grid-cols-3 sm:gap-2">
        <ScoreAmountCard label="Puntos ganados" value={metrics.earnedPoints} tone="good" />
        <ScoreAmountCard
          label="Puntos perdidos"
          value={metrics.penaltyPoints}
          tone={metrics.penaltyPoints < 0 ? 'risk' : 'neutral'}
        />
        <ScoreAmountCard
          label="Resultado total"
          value={metrics.totalPoints}
          tone={netoTone}
          className="col-span-2 sm:col-span-1"
          emphasized
        />
      </div>
      <div className="mt-3 grid gap-2 sm:mt-4 sm:gap-3 lg:grid-cols-2">
        <ScoreFactor icon={CheckCircle2} title="Te suma puntos" text={helpingCopy(metrics)} tone="good" />
        <ScoreFactor
          icon={AlertTriangle}
          title="Te resta puntos"
          text={affectingCopy(metrics)}
          tone={metrics.penaltyPoints < 0 ? 'risk' : 'neutral'}
        />
      </div>
    </div>
  )
}

function ScoreDetailDisclosure({
  positiveRules,
  consequenceRules,
  metrics,
}: {
  positiveRules: ActionGamificationRule[]
  consequenceRules: ActionGamificationRule[]
  metrics: PersonalMetrics
}) {
  const ruleCount = positiveRules.length + consequenceRules.length

  return (
    <details className="group overflow-hidden rounded-xl border border-border/60 bg-background">
      <summary className="flex min-h-11 cursor-pointer list-none touch-manipulation items-center justify-between gap-3 px-3 py-3 transition-colors hover:bg-muted/25 sm:px-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">Ver desglose</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {ruleCount > 0
              ? `${ruleCount} conducta${ruleCount === 1 ? '' : 's'} registrada${ruleCount === 1 ? '' : 's'} en el periodo`
              : 'Conductas que suman o restan puntos'}
          </p>
        </div>
        <ChevronDown
          className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
          aria-hidden
        />
      </summary>
      <div className="space-y-4 border-t border-border/60 bg-muted/10 p-3 sm:p-4">
        <div className="grid gap-3 sm:gap-4 lg:grid-cols-2">
          <RuleGroup
            variant="positive"
            title="A tu favor"
            rules={positiveRules}
            emptyText="Aún no hay puntos a tu favor en este periodo."
          />
          <RuleGroup
            variant="negative"
            title="En contra"
            rules={consequenceRules}
            emptyText="Sin puntos en contra visibles por ahora."
          />
        </div>
        <NextActionPanel metrics={metrics} />
      </div>
    </details>
  )
}

function ScoreAmountCard({
  label,
  value,
  tone,
  className,
  emphasized = false,
}: {
  label: string
  value: number
  tone: MetricTone
  className?: string
  emphasized?: boolean
}) {
  return (
    <div
      className={cn(
        'rounded-lg border p-2.5 sm:p-3',
        toneSurface(tone),
        emphasized && 'ring-1 ring-border/70',
        className
      )}
    >
      <p className="text-[10px] font-medium leading-snug text-muted-foreground sm:text-[11px]">
        {label}
      </p>
      <p
        className={cn(
          'mt-0.5 font-semibold tabular-nums text-foreground sm:mt-1',
          emphasized ? 'text-2xl sm:text-2xl' : 'text-lg sm:text-2xl'
        )}
      >
        {formatSignedPoints(value)}
      </p>
    </div>
  )
}

function ScoreFactor({
  icon: Icon,
  title,
  text,
  tone,
}: {
  icon: typeof CheckCircle2
  title: string
  text: string
  tone: MetricTone
}) {
  return (
    <div className={cn('flex gap-2.5 rounded-lg border p-2.5 sm:gap-3 sm:p-3', toneSurface(tone))}>
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-background sm:h-8 sm:w-8">
        <Icon className="h-3.5 w-3.5 text-muted-foreground sm:h-4 sm:w-4" aria-hidden />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold text-foreground sm:text-sm">{title}</p>
        <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground sm:text-xs">{text}</p>
      </div>
    </div>
  )
}

function RuleGroup({
  title,
  rules,
  emptyText,
  variant,
}: {
  title: string
  rules: ActionGamificationRule[]
  emptyText: string
  variant: 'positive' | 'negative'
}) {
  const total = rules.reduce((sum, rule) => sum + rule.points, 0)
  const HeaderIcon = variant === 'positive' ? CheckCircle2 : AlertTriangle

  return (
    <div className="overflow-hidden rounded-xl border border-border/60 bg-background shadow-sm">
      <div
        className={cn(
          'flex items-center gap-2.5 border-b px-3 py-2.5 sm:px-3.5',
          variant === 'positive'
            ? 'border-emerald-500/20 bg-emerald-500/[0.07]'
            : 'border-destructive/20 bg-destructive/[0.06]'
        )}
      >
        <HeaderIcon
          className={cn(
            'h-4 w-4 shrink-0',
            variant === 'positive' ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'
          )}
          aria-hidden
        />
        <h3 className="min-w-0 flex-1 text-sm font-semibold text-foreground">{title}</h3>
        {rules.length > 0 ? (
          <span
            className={cn(
              'shrink-0 text-sm font-bold tabular-nums',
              variant === 'positive' ? 'text-emerald-700 dark:text-emerald-300' : 'text-destructive'
            )}
          >
            {formatSignedPoints(total)}
          </span>
        ) : (
          <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
            0
          </span>
        )}
      </div>
      {rules.length > 0 ? (
        <ul className="divide-y divide-border/50">
          {rules.map((rule) => (
            <GamificationRuleRow key={rule.key} rule={rule} variant={variant} />
          ))}
        </ul>
      ) : (
        <p className="px-3 py-4 text-xs leading-relaxed text-muted-foreground sm:px-3.5">{emptyText}</p>
      )}
    </div>
  )
}

function NextActionPanel({ metrics }: { metrics: PersonalMetrics }) {
  const next = nextAction(metrics)
  const Icon = next.icon
  const accentBorder =
    next.tone === 'risk'
      ? 'border-l-destructive'
      : next.tone === 'warn'
        ? 'border-l-amber-500'
        : next.tone === 'good'
          ? 'border-l-emerald-500'
          : 'border-l-border'

  return (
    <div className={cn('overflow-hidden rounded-xl border border-border/60 border-l-4 bg-background shadow-sm', accentBorder)}>
      <div className={cn('px-3 py-3 sm:px-4 sm:py-3.5', toneSurface(next.tone))}>
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-background shadow-sm">
            <Icon className="h-4 w-4 text-muted-foreground" aria-hidden />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Qué conviene mejorar
            </p>
            <h3 className="mt-1 text-sm font-semibold leading-snug text-foreground sm:text-base">{next.title}</h3>
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground sm:text-sm">{next.text}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

function GamificationRuleRow({
  rule,
  variant,
}: {
  rule: ActionGamificationRule
  variant: 'positive' | 'negative'
}) {
  const Icon = ruleIcon(rule.key)

  return (
    <li className="flex items-center gap-3 px-3 py-2.5 sm:px-3.5 sm:py-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-muted/30">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium leading-snug text-foreground">{rule.label}</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          {rule.count} × {formatSignedPoints(rule.pointsPerUnit)} pts c/u
        </p>
      </div>
      <span
        className={cn(
          'shrink-0 text-base font-bold tabular-nums sm:text-lg',
          variant === 'negative' || rule.points < 0 ? 'text-destructive' : 'text-emerald-700 dark:text-emerald-300'
        )}
      >
        {formatSignedPoints(rule.points)}
      </span>
    </li>
  )
}

function SkeletonBlock({ className }: { className?: string }) {
  return <div className={cn('h-64 animate-pulse rounded-xl border border-border bg-muted/20', className)} />
}

function toneSurface(tone: MetricTone) {
  if (tone === 'good') return 'border-emerald-500/30 bg-emerald-500/5'
  if (tone === 'warn') return 'border-amber-500/30 bg-amber-500/5'
  if (tone === 'risk') return 'border-destructive/30 bg-destructive/5'
  return 'border-border/70 bg-muted/10'
}

function heroMetricTone(tone: ActionGamificationTone) {
  if (tone === 'positive') return 'border-emerald-500/30 bg-emerald-500/5'
  if (tone === 'warning') return 'border-amber-500/30 bg-amber-500/5'
  if (tone === 'negative') return 'border-destructive/30 bg-destructive/5'
  return 'border-border/70 bg-muted/10'
}

function heroAlertCopy(blocked: number, overdue: number) {
  if (blocked > 0) return `${blocked} accion bloqueada${blocked === 1 ? '' : 's'} requiere${blocked === 1 ? '' : 'n'} atencion.`
  if (overdue > 0) return `${overdue} accion${overdue === 1 ? '' : 'es'} en retraso requiere${overdue === 1 ? '' : 'n'} atencion.`
  return 'Sin bloqueos visibles. Entra a tus acciones y protege el cierre del dia.'
}

function helpingCopy(metrics: PersonalMetrics) {
  const parts = [
    metrics.onTimeClosed > 0 ? `${metrics.onTimeClosed} cerrada${metrics.onTimeClosed === 1 ? '' : 's'} a tiempo` : '',
    metrics.academyModulesCompleted > 0
      ? `${metrics.academyModulesCompleted} módulo${metrics.academyModulesCompleted === 1 ? '' : 's'} de Academia`
      : '',
    metrics.commentsMade > 0 ? `${metrics.commentsMade} comentario${metrics.commentsMade === 1 ? '' : 's'}` : '',
    metrics.created > 0 ? `${metrics.created} creada${metrics.created === 1 ? '' : 's'}` : '',
  ].filter(Boolean)
  return parts.length > 0 ? parts.join(' · ') : 'Todavia no hay conductas sumando puntos en este periodo.'
}

function affectingCopy(metrics: PersonalMetrics) {
  const parts = [
    metrics.overdue > 0 ? `${metrics.overdue} en retraso` : '',
    metrics.rejected > 0 ? `${metrics.rejected} rechazada${metrics.rejected === 1 ? '' : 's'}` : '',
  ].filter(Boolean)
  return parts.length > 0 ? parts.join(' · ') : 'Sin friccion negativa visible por ahora.'
}

function nextAction(metrics: PersonalMetrics): {
  title: string
  text: string
  tone: MetricTone
  icon: typeof CheckCircle2
} {
  if (metrics.overdue > 0) {
    return {
      title: 'Recupera retrasos primero',
      text: 'Cada accion atrasada resta puntos y ensucia la lectura del tablero. Limpia esas acciones antes de abrir mas carga.',
      tone: 'risk',
      icon: AlertTriangle,
    }
  }
  if (metrics.onTimeClosed === 0 && metrics.assigned > 0) {
    return {
      title: 'Convierte una asignada en cierre',
      text: 'Tienes responsabilidad visible; el salto mas claro viene de cerrar una accion en tiempo con evidencia.',
      tone: 'warn',
      icon: CheckCircle2,
    }
  }
  if (metrics.commentsMade === 0 && metrics.userActions > 0) {
    return {
      title: 'Deja rastro de seguimiento',
      text: 'Un comentario oportuno mantiene contexto, mueve participacion y evita que el avance dependa de memoria.',
      tone: 'warn',
      icon: MessageSquare,
    }
  }
  if (metrics.participationStreak === 0) {
    return {
      title: 'Activa la racha de hoy',
      text: 'Crea, comenta o cierra una accion para que el dia cuente dentro de tu disciplina operativa.',
      tone: 'neutral',
      icon: Flame,
    }
  }
  return {
    title: 'Protege la cadencia',
    text: 'El balance esta estable. Mantener la racha y cerrar en tiempo vale mas que generar actividad sin cierre.',
    tone: 'good',
    icon: ShieldCheck,
  }
}

function scoreToneToMetricTone(tone: ActionGamificationTone): MetricTone {
  if (tone === 'positive') return 'good'
  if (tone === 'warning') return 'warn'
  if (tone === 'negative') return 'risk'
  return 'neutral'
}

function formatSignedPoints(value: number) {
  if (value > 0) return `+${value}`
  return String(value)
}

function ruleIcon(key: ActionGamificationRule['key']) {
  if (key === 'onTimeClosed') return CheckCircle2
  if (key === 'academyModulesCompleted') return GraduationCap
  if (key === 'overdue') return AlertTriangle
  if (key === 'commentsMade') return MessageSquare
  if (key === 'created') return PenLine
  if (key === 'assigned') return Users
  if (key === 'participationStreak') return Flame
  if (key === 'rejected') return MinusCircle
  return Gauge
}
