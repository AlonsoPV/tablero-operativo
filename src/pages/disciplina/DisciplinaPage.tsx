import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  AlertTriangle,
  CheckCircle2,
  Flame,
  Gauge,
  GraduationCap,
  MessageSquare,
  PenLine,
  RefreshCw,
  ShieldCheck,
  Target,
  Trophy,
  Users,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SectionCard, SectionCardBody, SectionCardHeader } from '@/components/SectionCard'
import { ROUTES } from '@/constants'
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
import { orgChartScoreService } from '@/features/disciplina/services/orgChartScore.service'

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
  const {
    data: orgChartScore = null,
    isLoading: orgChartScoreLoading,
  } = useQuery({
    queryKey: ['disciplina', 'org-chart-score', currentUser?.id ?? ''],
    queryFn: () => orgChartScoreService.getByUser(currentUser!.id),
    enabled: Boolean(currentUser?.id),
    staleTime: 30_000,
  })

  const personalMetrics = useMemo(
    () => buildPersonalMetrics(
      currentUser?.id,
      personalActions,
      personalComments,
      today,
      academyModulesCompleted,
      orgChartScore
    ),
    [academyModulesCompleted, currentUser?.id, orgChartScore, personalActions, personalComments, today]
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
  const loading = loadingActions || loadingComments || orgChartScoreLoading
  const hasError = actionsError

  return (
    <div
      id="disciplina-page"
      className="disciplina-page mx-auto w-full max-w-7xl space-y-4 overflow-x-hidden px-3 py-4 sm:space-y-6 sm:px-6 sm:py-6"
    >
      <header
        id="disciplina-header"
        className="disciplina-header overflow-hidden rounded-xl border border-border/60 bg-card shadow-sm"
      >
        <div className="grid gap-3 px-3 py-3 sm:gap-4 sm:px-4 sm:py-4 md:px-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="flex min-w-0 items-start gap-3">
            <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted">
              <Gauge className="h-4 w-4 text-muted-foreground" aria-hidden />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Disciplina</p>
              <h1 className="mt-0.5 text-xl font-semibold leading-snug tracking-tight text-foreground sm:text-2xl">
                Tu disciplina operativa
              </h1>
              <p className="mt-0.5 max-w-3xl text-xs leading-relaxed text-muted-foreground sm:text-sm">
                {heroStoryCopy(personalMetrics, blockedActions)}
              </p>
            </div>
          </div>
          <div className="grid min-w-0 grid-cols-3 gap-1.5 sm:gap-2 lg:min-w-[420px]">
            <HeroMetric
              label="Cumplimiento"
              value={`${personalMetrics.fulfillmentPercent}%`}
              helper="Ganado / posible"
              tone={personalMetrics.levelTone}
            />
            <HeroMetric
              label="Racha"
              value={String(personalMetrics.participationStreak)}
              helper={`Dia${personalMetrics.participationStreak === 1 ? '' : 's'} de cadencia`}
            />
            <HeroMetric
              label="Retrasos"
              value={String(personalMetrics.overdue)}
              helper="Riesgo"
              tone={personalMetrics.overdue > 0 ? 'negative' : 'neutral'}
            />
          </div>
        </div>
      </header>

      {hasError ? (
        <SectionCard>
          <SectionCardBody className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4 md:p-6">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">No se pudo cargar tu información operativa.</p>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground sm:text-sm">
                Puedes reintentar sin salir de Disciplina.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-9 w-full shrink-0 rounded-lg text-xs sm:w-auto sm:text-sm"
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
        <div className="grid gap-4 sm:gap-6">
          <SkeletonBlock className="h-64 sm:h-72" />
          <SkeletonBlock className="h-56 sm:h-72" />
        </div>
      ) : currentUser ? (
        <div className="grid gap-4 sm:gap-6">
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
                title="Tu cumplimiento explicado como historia"
                subtitle="Primero la lectura, luego la causa y al final el siguiente movimiento recomendado."
                icon={Target}
              />
              <SectionCardBody className="space-y-3 p-3 sm:space-y-4 sm:p-4 md:p-6">
                <DisciplinaScoreExplained
                  metrics={personalMetrics}
                  positiveRules={positiveRules}
                  consequenceRules={consequenceRules}
                />
              </SectionCardBody>
            </SectionCard>
          </section>
        </div>
      ) : (
        <SectionCard>
          <SectionCardBody className="p-3 sm:p-4 md:p-6">
            <div className="rounded-lg border border-dashed border-border/60 bg-muted/20 px-4 py-8 text-center">
              <p className="text-sm font-medium text-foreground">Inicia sesion para ver tu disciplina operativa.</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Tu cumplimiento, racha y retrasos se calculan con tus acciones.
              </p>
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
  helper,
  tone = 'neutral',
}: {
  label: string
  value: string
  helper?: string
  tone?: ActionGamificationTone
}) {
  return (
    <div
      className={cn(
        'flex flex-col justify-center rounded-lg border px-2 py-2 sm:px-3 sm:py-2.5',
        toneSurface(scoreToneToMetricTone(tone))
      )}
    >
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-xl font-semibold leading-none tracking-tight tabular-nums text-foreground sm:text-2xl">
        {value}
      </p>
      {helper ? <p className="mt-1 text-[10px] leading-tight text-muted-foreground">{helper}</p> : null}
    </div>
  )
}

function DisciplinaScoreExplained({
  metrics,
  positiveRules,
  consequenceRules,
}: {
  metrics: PersonalMetrics
  positiveRules: ActionGamificationRule[]
  consequenceRules: ActionGamificationRule[]
}) {
  const activePositive = positiveRules.filter((rule) => rule.count > 0)
  const activeNegative = consequenceRules.filter((rule) => rule.count > 0)

  return (
    <div className="space-y-3 sm:space-y-4">
      <ScoreHeroPanel metrics={metrics} />
      <ScoreImpactPanel metrics={metrics} />
      <ScoreActivitySection activePositive={activePositive} activeNegative={activeNegative} metrics={metrics} />
      <ScoreAwardStrategyPanel metrics={metrics} />
      <ScoreNextActionSection metrics={metrics} />
    </div>
  )
}

function ScoreSectionLabel({
  step,
  title,
  titleId,
  subtitle,
  meta,
}: {
  step: string
  title: string
  /** Para `aria-labelledby` en la sección contenedora. */
  titleId?: string
  subtitle?: string
  /** Cifra de referencia alineada a la derecha del encabezado. */
  meta?: string
}) {
  return (
    <div className="mb-2 flex items-start gap-3">
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-bold text-muted-foreground">
        {step}
      </span>
      <div className="min-w-0 flex-1">
        <h3 id={titleId} className="text-[15px] font-semibold leading-snug text-foreground sm:text-base">
          {title}
        </h3>
        {subtitle ? (
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground sm:text-sm">{subtitle}</p>
        ) : null}
      </div>
      {meta ? (
        <span className="mt-0.5 shrink-0 rounded-full border border-border/60 bg-background/80 px-2.5 py-1 text-xs font-medium tabular-nums text-foreground">
          {meta}
        </span>
      ) : null}
    </div>
  )
}

function ScoreHeroPanel({ metrics }: { metrics: PersonalMetrics }) {
  const netoTone = scoreToneToMetricTone(metrics.levelTone)
  const penaltyAbs = Math.abs(metrics.penaltyPoints)
  const progress = Math.max(0, Math.min(100, metrics.fulfillmentPercent))
  const pendingPoints = Math.max(0, metrics.possiblePoints - metrics.earnedPoints)

  return (
    <section aria-labelledby="disciplina-score-hero">
      <ScoreSectionLabel
        step="1"
        titleId="disciplina-score-hero"
        title="La lectura"
        subtitle="Qué tan bien convertiste tus oportunidades en puntos reales"
      />
      <div className={cn('overflow-hidden rounded-lg border', toneSurface(netoTone))}>
        <div className="grid gap-3 p-3 sm:gap-4 sm:p-4 lg:grid-cols-[minmax(0,1fr)_minmax(15rem,18rem)] lg:items-start">
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
              <p
                className={cn(
                  'text-4xl font-bold leading-none tabular-nums tracking-tight sm:text-5xl',
                  fulfillmentTextTone(metrics.fulfillmentPercent)
                )}
              >
                {metrics.fulfillmentPercent}%
              </p>
              <span className="rounded-full border border-border/60 bg-background/80 px-2.5 py-1 text-xs font-medium text-foreground">
                {metrics.level}
              </span>
            </div>
            <p className="mt-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Cumplimiento de gamificacion
            </p>
            <div
              className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted"
              role="img"
              aria-label={`${metrics.earnedPoints} de ${metrics.possiblePoints} puntos capturados`}
            >
              <div
                className={cn('h-full rounded-full transition-all', fulfillmentBarTone(metrics.fulfillmentPercent))}
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs tabular-nums">
              <span className="font-semibold text-emerald-700 dark:text-emerald-300">
                +{metrics.earnedPoints} capturados
              </span>
              <span
                className={cn(
                  'font-semibold',
                  pendingPoints > 0 ? 'text-amber-700 dark:text-amber-300' : 'text-muted-foreground'
                )}
              >
                {pendingPoints > 0 ? `Faltan ${pendingPoints}` : 'Sin pendientes'} de {metrics.possiblePoints}
              </span>
            </div>
            <p className="mt-3 max-w-xl text-xs leading-relaxed text-muted-foreground sm:text-sm">
              {scoreNarrativeCopy(metrics)}
            </p>
          </div>

          <div className="overflow-hidden rounded-lg border border-border/60 bg-background/90">
            <p className="border-b border-border/50 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Desglose de puntos
            </p>
            <dl className="divide-y divide-border/40">
              <ScoreFigureRow label="Posibles" hint="Maximo del periodo" value={String(metrics.possiblePoints)} />
              <ScoreFigureRow label="Ganados" hint="Ya capturados" value={`+${metrics.earnedPoints}`} tone="good" />
              <ScoreFigureRow
                label="Por capturar"
                hint="Diferencia contra el maximo"
                value={pendingPoints > 0 ? `-${pendingPoints}` : '0'}
                tone={pendingPoints > 0 ? 'warn' : 'neutral'}
              />
              <ScoreFigureRow
                label="Penalizacion"
                hint="Resta por retrasos"
                value={`-${penaltyAbs}`}
                tone={penaltyAbs > 0 ? 'risk' : 'neutral'}
              />
              <ScoreFigureRow
                label="Neto"
                hint="Ganados menos penalizacion"
                value={`${formatSignedPoints(metrics.totalPoints)} pts`}
                tone={metrics.totalPoints < 0 ? 'risk' : 'neutral'}
                emphasis
              />
            </dl>
          </div>
        </div>
      </div>
    </section>
  )
}

function ScoreFigureRow({
  label,
  hint,
  value,
  tone = 'neutral',
  emphasis = false,
}: {
  label: string
  hint?: string
  value: string
  tone?: MetricTone
  emphasis?: boolean
}) {
  return (
    <div className={cn('flex items-center justify-between gap-3 px-3 py-2', emphasis && 'bg-muted/20')}>
      <dt className="min-w-0">
        <span className={cn('text-xs', emphasis ? 'font-semibold text-foreground' : 'text-muted-foreground')}>
          {label}
        </span>
        {hint ? <span className="mt-0.5 block text-[10px] leading-tight text-muted-foreground">{hint}</span> : null}
      </dt>
      <dd
        className={cn(
          'shrink-0 tabular-nums',
          emphasis ? 'text-base font-bold' : 'text-sm font-semibold',
          tone === 'good' && 'text-emerald-700 dark:text-emerald-300',
          tone === 'warn' && 'text-amber-700 dark:text-amber-300',
          tone === 'risk' && 'text-destructive',
          tone === 'neutral' && 'text-foreground'
        )}
      >
        {value}
      </dd>
    </div>
  )
}

function PossiblePointsBreakdown({ metrics }: { metrics: PersonalMetrics }) {
  const rows = metrics.rules
    .filter((rule) => rule.pointsPerUnit > 0)
    .map((rule) => ({
      rule,
      possible: possiblePointsForRule(rule, metrics),
      earned: Math.max(0, rule.points),
    }))
    .filter((row) => row.possible > 0 || row.earned > 0)

  if (rows.length === 0) return null

  return (
    <div className="mt-3 overflow-hidden rounded-lg border border-border/60 bg-background sm:mt-4">
      <div className="border-b border-border/60 bg-muted/20 px-3 py-2 sm:grid sm:grid-cols-[minmax(0,1fr)_4.5rem_4.5rem] sm:gap-3 sm:px-4">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          De donde salen tus {metrics.possiblePoints} puntos posibles
        </p>
        <span className="hidden text-right text-[10px] font-semibold uppercase tracking-wide text-muted-foreground sm:block">
          Ganado
        </span>
        <span className="hidden text-right text-[10px] font-semibold uppercase tracking-wide text-muted-foreground sm:block">
          Posible
        </span>
      </div>
      <ul className="divide-y divide-border/50">
        {rows.map(({ rule, earned, possible }) => (
          <li
            key={rule.key}
            className="px-3 py-2.5 sm:grid sm:grid-cols-[minmax(0,1fr)_4.5rem_4.5rem] sm:items-center sm:gap-3 sm:px-4"
          >
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">{rule.label}</p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                {possiblePointsSourceText(rule, metrics)}
              </p>
            </div>
            <div className="mt-1.5 flex items-center gap-3 text-xs tabular-nums sm:mt-0 sm:contents">
              <span className="font-semibold text-emerald-700 dark:text-emerald-300 sm:text-right sm:text-sm">
                <span className="text-muted-foreground sm:hidden">Ganado </span>+{earned}
              </span>
              <span className="font-semibold text-foreground sm:text-right sm:text-sm">
                <span className="text-muted-foreground sm:hidden">Posible </span>
                {possible}
              </span>
            </div>
          </li>
        ))}
      </ul>
      <div className="border-t border-border/60 bg-muted/10 px-3 py-2.5 sm:px-4">
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Las penalizaciones no reducen los puntos posibles; afectan el neto operativo y el score de premio.
        </p>
      </div>
    </div>
  )
}

function possiblePointsForRule(rule: ActionGamificationRule, metrics: PersonalMetrics) {
  if (rule.pointsPerUnit < 0) return 0
  if (rule.key === 'onTimeClosed') return metrics.closedUserActions * rule.pointsPerUnit
  return Math.max(0, rule.points)
}

function possiblePointsSourceText(rule: ActionGamificationRule, metrics: PersonalMetrics) {
  if (rule.key === 'onTimeClosed') {
    return `Cerrar en tiempo las ${metrics.closedUserActions} accion${metrics.closedUserActions === 1 ? '' : 'es'} cerrada${metrics.closedUserActions === 1 ? '' : 's'}: ${metrics.closedUserActions} x ${rule.pointsPerUnit} pts.`
  }
  if (rule.key === 'academyModulesCompleted') {
    return `Completar modulos de Academia: ${rule.count} x ${rule.pointsPerUnit} pts.`
  }
  if (rule.key === 'commentsMade') {
    return `Comentar seguimientos con contexto: ${rule.count} x ${rule.pointsPerUnit} pts.`
  }
  if (rule.key === 'created') {
    return `Crear acciones con responsable y fecha: ${rule.count} x ${rule.pointsPerUnit} pts.`
  }
  if (rule.key === 'assigned') {
    return `Recibir o tomar responsabilidad de acciones: ${rule.count} x ${rule.pointsPerUnit} pts.`
  }
  if (rule.key === 'participationStreak') {
    return `Mantener racha diaria creando, comentando o cerrando: ${rule.count} x ${rule.pointsPerUnit} pts.`
  }
  if (rule.key === 'orgProfileCompleted') {
    return `Mantener completo el perfil organizacional: bono de ${rule.pointsPerUnit} pts.`
  }
  return rule.helper
}

function MiniScoreStat({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone: MetricTone
}) {
  return (
    <div className={cn('flex flex-col justify-center rounded-lg border px-2 py-2 sm:px-3 sm:py-2.5', toneSurface(tone))}>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={cn(
          'mt-0.5 text-base font-bold leading-none tabular-nums',
          tone === 'good' && 'text-emerald-700 dark:text-emerald-300',
          tone === 'risk' && 'text-destructive',
          tone === 'neutral' && 'text-foreground'
        )}
      >
        {value}
      </p>
    </div>
  )
}

function ScoreImpactPanel({ metrics }: { metrics: PersonalMetrics }) {
  const overdueRule = metrics.rules.find((rule) => rule.key === 'overdue')
  if (!overdueRule || overdueRule.count === 0) return null

  return (
    <section aria-labelledby="disciplina-score-impact">
      <div className="grid gap-2 rounded-lg border border-destructive/30 bg-destructive/[0.06] px-3 py-2.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-3 sm:px-4 sm:py-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden />
          <p id="disciplina-score-impact" className="text-xs leading-relaxed text-muted-foreground sm:text-sm">
            <span className="font-semibold text-foreground">Impacto por retraso:</span> acciones directas en
            Retraso dentro de Kanban.
          </p>
        </div>
        <p className="text-sm font-bold tabular-nums text-destructive sm:text-right">
          {overdueRule.count} x {formatSignedPoints(overdueRule.pointsPerUnit)} = {formatSignedPoints(overdueRule.points)} pts
        </p>
      </div>
    </section>
  )
}

function ScoreAwardStrategyPanel({ metrics }: { metrics: PersonalMetrics }) {
  return (
    <section aria-labelledby="disciplina-award-strategy">
      <ScoreSectionLabel
        step="3"
        titleId="disciplina-award-strategy"
        title="Como se traduce a premio"
        subtitle="El cumplimiento no compite solo contra puntos brutos"
      />
      <div className="grid gap-2 rounded-lg border border-border/60 bg-background px-3 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-3 sm:px-4 sm:py-3.5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Trophy className="h-4 w-4 text-amber-500" aria-hidden />
            <p className="text-sm font-semibold text-foreground">Criterio recomendado para premios</p>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground sm:text-sm">
            Compite dentro de tu banda ({metrics.workloadBand}) con score ajustado: 40% alcance Kanban, 25%
            cierre en tiempo, 15% sin retrasos, 10% desarrollo y colaboracion, y 10% consistencia.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-1.5 sm:min-w-[13rem] sm:gap-2">
          <MiniScoreStat label="Premio" value={String(metrics.awardScore)} tone={metrics.awardScore >= 70 ? 'good' : 'warn'} />
          <MiniScoreStat label="Carga" value={String(metrics.assigned)} tone="neutral" />
        </div>
      </div>
    </section>
  )
}

function ScoreActivitySection({
  activePositive,
  activeNegative,
  metrics,
}: {
  activePositive: ActionGamificationRule[]
  activeNegative: ActionGamificationRule[]
  metrics: PersonalMetrics
}) {
  const activeCount = activePositive.length + activeNegative.length
  const activityRows = useMemo(
    () =>
      [
        ...activePositive.map((rule) => ({ rule, variant: 'positive' as const })),
        ...activeNegative.map((rule) => ({ rule, variant: 'negative' as const })),
      ].sort((a, b) => Math.abs(b.rule.points) - Math.abs(a.rule.points)),
    [activeNegative, activePositive]
  )

  return (
    <section aria-labelledby="disciplina-score-activity">
      <ScoreSectionLabel
        step="2"
        titleId="disciplina-score-activity"
        title="Lo que movio el marcador"
        subtitle={
          activeCount > 0
            ? `${activeCount} conducta${activeCount === 1 ? '' : 's'} que movieron tu puntaje`
            : 'Aún no hay actividades registradas en el periodo'
        }
        meta={`${metrics.possiblePoints} pts posibles`}
      />

      {activeCount > 0 ? (
        <div className="overflow-hidden rounded-lg border border-border/60 bg-background">
          <div className="hidden border-b border-border/60 bg-muted/20 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground sm:grid sm:grid-cols-[minmax(0,1fr)_5.5rem_4.5rem_4rem] sm:gap-3 sm:px-4">
            <span>Actividad y lectura</span>
            <span className="text-center">Veces</span>
            <span className="text-center">Pts c/u</span>
            <span className="text-right">Total</span>
          </div>
          <ul className="divide-y divide-border/50">
            {activityRows.map(({ rule, variant }) => (
              <ActivityScoreRow key={rule.key} rule={rule} variant={variant} />
            ))}
          </ul>
          <div className="grid grid-cols-2 gap-2 border-t border-border/60 bg-muted/10 px-3 py-3 sm:grid-cols-3 sm:px-4">
            <div className="text-center sm:text-left">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Ganados</p>
              <p className="text-sm font-bold tabular-nums text-emerald-700 dark:text-emerald-300">
                +{activityRows.filter((row) => row.variant === 'positive').reduce((sum, row) => sum + row.rule.points, 0)}
              </p>
            </div>
            <div className="text-center sm:text-left">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Perdidos</p>
              <p className="text-sm font-bold tabular-nums text-destructive">
                {formatSignedPoints(
                  activityRows.filter((row) => row.variant === 'negative').reduce((sum, row) => sum + row.rule.points, 0)
                )}
              </p>
            </div>
            <div className="col-span-2 text-center sm:col-span-1 sm:text-right">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Subtotal actividades</p>
              <p className="text-sm font-bold tabular-nums text-foreground">
                {formatSignedPoints(activityRows.reduce((sum, row) => sum + row.rule.points, 0))}
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-border/60 bg-muted/20 px-4 py-8 text-center">
          <p className="text-sm font-medium text-foreground">Sin actividades con puntos todavía</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Cierra acciones, comenta o crea tareas para ver el desglose aquí.
          </p>
        </div>
      )}

      <PossiblePointsBreakdown metrics={metrics} />

      <div className="mt-3 flex flex-col gap-2.5 rounded-lg border border-border/50 bg-muted/10 px-3 py-3 sm:mt-4 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:px-4">
        <p className="min-w-0 text-xs leading-relaxed text-muted-foreground sm:text-sm">
          <span className="font-semibold text-foreground">Cómo sumar o perder puntos:</span> las reglas completas
          de gamificación viven en el Manual.
        </p>
        <Button
          variant="outline"
          size="sm"
          className="h-9 w-full shrink-0 rounded-lg text-xs sm:h-8 sm:w-auto sm:text-sm"
          asChild
        >
          <Link to={`${ROUTES.MANUAL}?seccion=gamificacion`}>Ver reglas en el Manual</Link>
        </Button>
      </div>
    </section>
  )
}

function ActivityScoreRow({
  rule,
  variant,
}: {
  rule: ActionGamificationRule
  variant: 'positive' | 'negative'
}) {
  const Icon = ruleIcon(rule.key)
  const pointsTone =
    variant === 'negative' || rule.points < 0 ? 'text-destructive' : 'text-emerald-700 dark:text-emerald-300'

  return (
    <li className="px-3 py-2.5 sm:grid sm:grid-cols-[minmax(0,1fr)_5.5rem_4.5rem_4rem] sm:items-center sm:gap-3 sm:px-4">
      <div className="flex min-w-0 items-start gap-2.5">
        <div
          className={cn(
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border',
            variant === 'positive'
              ? 'border-emerald-500/20 bg-emerald-500/10'
              : 'border-destructive/20 bg-destructive/10'
          )}
        >
          <Icon
            className={cn(
              'h-4 w-4',
              variant === 'positive' ? 'text-emerald-700 dark:text-emerald-300' : 'text-destructive'
            )}
            aria-hidden
          />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">{rule.label}</p>
          <p className="mt-0.5 text-[11px] font-medium leading-relaxed text-foreground/80">
            Realizado: {activityDoneText(rule)}
          </p>
          <p className="line-clamp-1 text-[11px] leading-relaxed text-muted-foreground">{rule.helper}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground sm:hidden">
            <span>
              {rule.count} × {formatSignedPoints(rule.pointsPerUnit)} pts
            </span>
            <span className={cn('font-bold', pointsTone)}>{formatSignedPoints(rule.points)} pts</span>
          </div>
        </div>
      </div>
      <p className="mt-2 hidden text-center text-sm font-semibold tabular-nums text-foreground sm:mt-0 sm:block">{rule.count}</p>
      <p className="hidden text-center text-sm font-medium tabular-nums text-muted-foreground sm:block">
        {formatSignedPoints(rule.pointsPerUnit)}
      </p>
      <p className={cn('hidden text-right text-base font-bold tabular-nums sm:block sm:text-lg', pointsTone)}>
        {formatSignedPoints(rule.points)}
      </p>
    </li>
  )
}

function activityDoneText(rule: ActionGamificationRule) {
  if (rule.count === 0) return 'sin registro en el periodo'
  if (rule.key === 'onTimeClosed') return `${rule.count} cierre${rule.count === 1 ? '' : 's'} en tiempo`
  if (rule.key === 'academyModulesCompleted') return `${rule.count} modulo${rule.count === 1 ? '' : 's'} completado${rule.count === 1 ? '' : 's'}`
  if (rule.key === 'overdue') return `${rule.count} accion${rule.count === 1 ? '' : 'es'} directa${rule.count === 1 ? '' : 's'} en retraso`
  if (rule.key === 'commentsMade') return `${rule.count} comentario${rule.count === 1 ? '' : 's'} de seguimiento`
  if (rule.key === 'created') return `${rule.count} accion${rule.count === 1 ? '' : 'es'} creada${rule.count === 1 ? '' : 's'}`
  if (rule.key === 'assigned') return `${rule.count} accion${rule.count === 1 ? '' : 'es'} asignada${rule.count === 1 ? '' : 's'}`
  if (rule.key === 'participationStreak') return `${rule.count} dia${rule.count === 1 ? '' : 's'} de racha`
  return `${rule.count} actividad${rule.count === 1 ? '' : 'es'}`
}

function ScoreNextActionSection({ metrics }: { metrics: PersonalMetrics }) {
  return (
    <section aria-labelledby="disciplina-score-next">
      <ScoreSectionLabel
        step="4"
        titleId="disciplina-score-next"
        title="El siguiente movimiento"
        subtitle="Una recomendación accionable"
      />
      <NextActionPanel metrics={metrics} />
    </section>
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
    <div className={cn('overflow-hidden rounded-lg border border-border/60 border-l-4 bg-background', accentBorder)}>
      <div className={cn('px-3 py-3 sm:px-4 sm:py-3.5', toneSurface(next.tone))}>
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted">
            <Icon className="h-4 w-4 text-muted-foreground" aria-hidden />
          </div>
          <div className="min-w-0">
            <h4 className="text-[15px] font-semibold leading-snug text-foreground sm:text-base">{next.title}</h4>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground sm:text-sm">{next.text}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

function SkeletonBlock({ className }: { className?: string }) {
  return <div className={cn('h-64 animate-pulse rounded-xl border border-border/60 bg-muted/20', className)} />
}

function toneSurface(tone: MetricTone) {
  if (tone === 'good') return 'border-emerald-500/30 bg-emerald-500/5'
  if (tone === 'warn') return 'border-amber-500/30 bg-amber-500/5'
  if (tone === 'risk') return 'border-destructive/30 bg-destructive/5'
  return 'border-border/60 bg-muted/10'
}

function heroStoryCopy(metrics: PersonalMetrics, blocked: number) {
  if (blocked > 0) {
    return `Tu historia de hoy tiene ${blocked} bloqueo${blocked === 1 ? '' : 's'} que conviene resolver antes de sumar mas carga.`
  }
  if (metrics.overdue > 0) {
    return `Vas con ${metrics.fulfillmentPercent}% de cumplimiento, pero ${metrics.overdue} retraso${metrics.overdue === 1 ? '' : 's'} esta${metrics.overdue === 1 ? '' : 'n'} presionando el neto operativo.`
  }
  if (metrics.fulfillmentPercent >= 85) {
    return `Buen ritmo: convertiste la mayor parte de tus puntos posibles y no tienes retrasos visibles que contaminen la lectura.`
  }
  if (metrics.earnedPoints > 0) {
    return `Hay actividad positiva, pero todavia hay puntos posibles por capturar con cierres, seguimiento o racha.`
  }
  return 'Tu tablero esta listo para empezar: una accion creada, un comentario o un cierre puede activar la disciplina del dia.'
}

function scoreNarrativeCopy(metrics: PersonalMetrics) {
  if (metrics.possiblePoints <= 0) {
    return 'Todavia no hay puntos posibles registrados. La pantalla empezara a contar cuando tengas acciones, cierres, comentarios, academia o perfil organizacional completo.'
  }
  if (metrics.penaltyPoints < 0) {
    return `La parte positiva va en ${metrics.earnedPoints} puntos, pero el neto queda en ${formatSignedPoints(metrics.totalPoints)} por penalizaciones. El cumplimiento mide oportunidad capturada; el neto muestra riesgo operativo.`
  }
  return `Capturaste ${metrics.earnedPoints} de ${metrics.possiblePoints} puntos posibles. Si quieres subir el porcentaje, el camino mas directo es cerrar en tiempo, documentar seguimiento y mantener racha.`
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

function fulfillmentTextTone(percent: number) {
  if (percent >= 85) return 'text-emerald-700 dark:text-emerald-300'
  if (percent >= 60) return 'text-amber-700 dark:text-amber-300'
  return 'text-destructive'
}

function fulfillmentBarTone(percent: number) {
  if (percent >= 85) return 'bg-emerald-500'
  if (percent >= 60) return 'bg-amber-500'
  return 'bg-destructive'
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
  return Gauge
}
