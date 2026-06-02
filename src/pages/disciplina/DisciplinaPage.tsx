import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  CalendarCheck,
  CheckCircle2,
  Clock3,
  MessageSquare,
  PenLine,
  RefreshCw,
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
import type { AccionDiaria } from '@/types'
import type { AccionComentario } from '@/types/accionComentario'
import { DisciplinaAcademyRegistro } from './components/DisciplinaAcademyRegistro'
import { DisciplinaAccionesCard } from './components/DisciplinaAccionesCard'
import { DisciplinaCalendarioSection } from './components/DisciplinaCalendarioSection'

const DONE_STATES = new Set(['Hecho', 'Verificado'])
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

  const personalMetrics = useMemo(
    () => buildPersonalMetrics(currentUser?.id, personalActions, personalComments, today),
    [currentUser?.id, personalActions, personalComments, today]
  )
  const loading = loadingActions
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
        <div className="p-4 sm:p-5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Disciplina</p>
          <h1 className="mt-0.5 text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
            Tu día operativo
          </h1>
          <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground sm:mt-2 sm:max-w-2xl sm:text-sm">
            Acciones de hoy y formación. Cierra pendientes con evidencia.
          </p>
          <div className="mt-3 grid grid-cols-3 divide-x divide-border rounded-lg border border-border bg-muted/20 text-center sm:mt-4">
            <HeaderStat label="Mis acciones" value={String(personalActions.length)} />
            <HeaderStat label="Asignadas" value={String(personalMetrics.assigned)} />
            <HeaderStat label="Comentarios" value={loadingComments ? '…' : String(personalComments.length)} />
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
        <div className="grid gap-3 sm:gap-4 lg:grid-cols-3">
          <SkeletonBlock className="h-52 lg:col-span-2 sm:h-64" />
          <SkeletonBlock className="h-40 sm:h-64" />
        </div>
      ) : currentUser ? (
        <>
          <section id="disciplina-seguimiento" aria-labelledby="disciplina-seguimiento-heading">
            <SectionCard>
              <SectionCardHeader
                className="px-3 py-3 sm:px-4 sm:py-4 md:px-6"
                titleId="disciplina-seguimiento-heading"
                eyebrow="Hoy"
                title="Seguimiento operativo"
                subtitle="Acciones del día y Academia."
                icon={CalendarCheck}
              />
              <SectionCardBody className="space-y-4 p-3 sm:space-y-5 sm:p-4 md:p-6">
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.2fr_0.8fr] lg:gap-5">
                  <DisciplinaAccionesCard fecha={fecha} usuarioId={currentUser.id} />
                  <DisciplinaAcademyRegistro />
                </div>
              </SectionCardBody>
            </SectionCard>
          </section>

          <DisciplinaCalendarioSection
            reminders={recentReminders}
            notes={recentNotes}
            remindersLoading={remindersLoading}
            notesLoading={notesLoading}
            remindersError={remindersError}
            notesError={notesError}
          />

          <section id="disciplina-indicadores" aria-labelledby="disciplina-acciones-heading">
            <SectionCard>
              <SectionCardHeader
                className="px-3 py-3 sm:px-4 sm:py-4 md:px-6"
                titleId="disciplina-acciones-heading"
                eyebrow="90 días"
                title="Indicadores de acciones"
                subtitle="Creadas, asignadas o donde te etiquetaron."
                icon={Target}
              />
              <SectionCardBody className="space-y-4 p-3 sm:space-y-5 sm:p-4 md:p-6">
                <div className="grid gap-3 lg:grid-cols-[1fr_1fr] lg:gap-4">
                  <ActionSummaryPanel metrics={personalMetrics} />
                  <div className="grid grid-cols-2 gap-2 sm:gap-3">
                    <ActionMetricCard
                      icon={Clock3}
                      label="Cerradas en tiempo"
                      value={`${personalMetrics.onTimeClosed}/${personalMetrics.closedUserActions}`}
                      helper={`${personalMetrics.onTimeRate}% dentro de fecha`}
                      tone={personalMetrics.onTimeRate >= 80 ? 'good' : personalMetrics.onTimeRate >= 50 ? 'warn' : 'neutral'}
                    />
                    <ActionMetricCard
                      icon={PenLine}
                      label="Generadas por ti"
                      value={String(personalMetrics.created)}
                      helper="Acciones creadas en el periodo"
                    />
                    <ActionMetricCard
                      icon={MessageSquare}
                      label="Comentarios hechos"
                      value={String(personalMetrics.commentsMade)}
                      helper="Participacion en conversaciones"
                    />
                    <ActionMetricCard
                      icon={Users}
                      label="Etiquetado en comentarios"
                      value={String(personalMetrics.taggedComments)}
                      helper={`${personalMetrics.taggedActions} accion(es) donde te involucraron`}
                    />
                  </div>
                </div>

                <div className="grid gap-4">
                  <ParticipationCard metrics={personalMetrics} />
                </div>
              </SectionCardBody>
            </SectionCard>
          </section>
        </>
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

interface PersonalMetrics {
  assigned: number
  closedAssigned: number
  userActions: number
  closedUserActions: number
  closeRate: number
  onTimeClosed: number
  onTimeRate: number
  created: number
  taggedActions: number
  commentsMade: number
  taggedComments: number
  participationStreak: number
  participationDays: string[]
}

function buildPersonalMetrics(
  userId: string | undefined,
  actions: AccionDiaria[],
  comments: AccionComentario[],
  today: string
): PersonalMetrics {
  if (!userId) {
    return {
      assigned: 0,
      closedAssigned: 0,
      userActions: 0,
      closedUserActions: 0,
      closeRate: 0,
      onTimeClosed: 0,
      onTimeRate: 0,
      created: 0,
      taggedActions: 0,
      commentsMade: 0,
      taggedComments: 0,
      participationStreak: 0,
      participationDays: [],
    }
  }

  const assigned = actions.filter((action) => action.responsable === userId)
  const closedAssigned = assigned.filter(isDone)
  const created = actions.filter((action) => action.created_by === userId)
  const commentsMade = comments.filter((comment) => comment.created_by === userId)
  const taggedComments = comments.filter((comment) => isTaggedInComment(comment, userId))
  const taggedActionIds = new Set(taggedComments.map((comment) => comment.accion_id))
  const taggedActions = actions.filter((action) => taggedActionIds.has(action.id))
  const userActions = uniqueActions([...assigned, ...created, ...taggedActions])
  const closedUserActions = userActions.filter(isDone)
  const onTimeClosed = closedUserActions.filter(isClosedOnTime)
  const participationDays = new Set<string>()

  created.forEach((action) => participationDays.add(toDayKey(action.created_at)))
  closedUserActions.forEach((action) => participationDays.add(toDayKey(action.verified_at || action.completed_at || action.updated_at)))
  commentsMade.forEach((comment) => participationDays.add(toDayKey(comment.created_at)))

  return {
    assigned: assigned.length,
    closedAssigned: closedAssigned.length,
    userActions: userActions.length,
    closedUserActions: closedUserActions.length,
    closeRate: percentage(closedUserActions.length, userActions.length),
    onTimeClosed: onTimeClosed.length,
    onTimeRate: percentage(onTimeClosed.length, closedUserActions.length),
    created: created.length,
    taggedActions: taggedActions.length,
    commentsMade: commentsMade.length,
    taggedComments: taggedComments.length,
    participationStreak: calculateParticipationStreak(participationDays, today),
    participationDays: [...participationDays].sort().reverse(),
  }
}

function ParticipationCard({ metrics }: { metrics: PersonalMetrics }) {
  return (
    <div className="rounded-lg border border-border/70 bg-muted/10 p-3 sm:p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">Racha de participación</p>
          <p className="mt-0.5 hidden text-xs text-muted-foreground sm:block">
            Días seguidos con cierre, creación o comentario.
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-2xl font-semibold tabular-nums text-foreground sm:text-3xl">
            {metrics.participationStreak}
          </p>
          <p className="text-[10px] text-muted-foreground sm:text-xs">días</p>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-1.5 sm:mt-4 sm:gap-2">
        <MiniStat label="Involucradas" value={String(metrics.userActions)} />
        <MiniStat label="Creadas" value={String(metrics.created)} />
        <MiniStat label="Dias con actividad" value={String(metrics.participationDays.length)} />
      </div>
    </div>
  )
}

function ActionSummaryPanel({ metrics }: { metrics: PersonalMetrics }) {
  const tone = getTone(metrics.closeRate)
  return (
    <div className={cn('rounded-xl border p-3 sm:p-4 lg:p-5', toneSurface(tone))}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground sm:text-xs">
            Cumplimiento
          </p>
          <div className="mt-2 flex items-end gap-2 sm:mt-3">
            <span className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl lg:text-5xl">
              {metrics.closeRate}%
            </span>
            <span className="pb-0.5 text-xs text-muted-foreground sm:pb-2 sm:text-sm">
              {metrics.closedUserActions}/{metrics.userActions}
            </span>
          </div>
        </div>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-background sm:h-10 sm:w-10">
          <CheckCircle2 className="h-4 w-4 text-muted-foreground sm:h-5 sm:w-5" aria-hidden />
        </div>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-background sm:mt-4 sm:h-2">
        <div className={cn('h-full rounded-full', toneBar(tone))} style={{ width: `${metrics.closeRate}%` }} />
      </div>
      <div className="mt-3 grid grid-cols-3 gap-1.5 sm:mt-4 sm:gap-2">
        <MiniStat label="Asignadas" value={String(metrics.assigned)} />
        <MiniStat label="Creadas" value={String(metrics.created)} />
        <MiniStat label="Pendientes" value={String(Math.max(metrics.userActions - metrics.closedUserActions, 0))} />
      </div>
      <p className="mt-3 text-xs text-muted-foreground sm:mt-4 sm:text-sm">{actionCopy(metrics)}</p>
    </div>
  )
}

function ActionMetricCard({
  icon: Icon,
  label,
  value,
  helper,
  tone = 'neutral',
}: {
  icon: typeof CheckCircle2
  label: string
  value: string
  helper: string
  tone?: MetricTone
}) {
  return (
    <div className={cn('rounded-lg border p-2.5 sm:p-3 md:p-4', toneSurface(tone))}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-background sm:h-8 sm:w-8">
          <Icon className="h-3.5 w-3.5 text-muted-foreground sm:h-4 sm:w-4" aria-hidden />
        </div>
        <span className="text-lg font-semibold tabular-nums text-foreground sm:text-xl md:text-2xl">{value}</span>
      </div>
      <p className="mt-2 text-xs font-semibold text-foreground sm:mt-2.5 sm:text-sm">{label}</p>
      <p className="mt-0.5 hidden text-[10px] leading-snug text-muted-foreground sm:block sm:text-xs">{helper}</p>
    </div>
  )
}

function HeaderStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-2 py-2.5 sm:px-4 sm:py-3">
      <p className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground sm:text-[10px]">
        {label}
      </p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums text-foreground sm:mt-1 sm:text-xl">{value}</p>
    </div>
  )
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border/60 bg-background px-2 py-1.5 sm:px-3 sm:py-2">
      <p className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground sm:text-[10px]">
        {label}
      </p>
      <p className="mt-0.5 text-base font-semibold tabular-nums text-foreground sm:mt-1 sm:text-lg">{value}</p>
    </div>
  )
}

function SkeletonBlock({ className }: { className?: string }) {
  return <div className={cn('h-64 animate-pulse rounded-xl border border-border bg-muted/20', className)} />
}

function isDone(action: AccionDiaria) {
  return DONE_STATES.has(action.estado)
}

function isTaggedInComment(comment: AccionComentario, userId: string): boolean {
  return comment.asignado === userId || comment.etiquetas?.includes(userId)
}

function uniqueActions(actions: AccionDiaria[]): AccionDiaria[] {
  return [...new Map(actions.map((action) => [action.id, action])).values()]
}

function getUserOwnedActions(
  userId: string | undefined,
  actions: AccionDiaria[],
  comments: AccionComentario[]
): AccionDiaria[] {
  if (!userId) return []
  const taggedActionIds = new Set(
    comments.filter((comment) => isTaggedInComment(comment, userId)).map((comment) => comment.accion_id)
  )
  return uniqueActions(
    actions.filter(
      (action) => action.created_by === userId || action.responsable === userId || taggedActionIds.has(action.id)
    )
  )
}

function getUserRelevantComments(
  userId: string | undefined,
  comments: AccionComentario[],
  personalActions: AccionDiaria[]
): AccionComentario[] {
  if (!userId) return []
  const personalActionIds = new Set(personalActions.map((action) => action.id))
  return comments.filter(
    (comment) => isTaggedInComment(comment, userId) || personalActionIds.has(comment.accion_id)
  )
}

function isClosedOnTime(action: AccionDiaria) {
  const closedAt = action.verified_at || action.completed_at || action.updated_at
  const dueAt = new Date(`${action.fecha}T${action.hora_limite || '23:59'}`)
  return new Date(closedAt).getTime() <= dueAt.getTime()
}

function percentage(part: number, total: number) {
  if (total <= 0) return 0
  return Math.round((part / total) * 100)
}

function getTone(value: number): MetricTone {
  if (value >= 80) return 'good'
  if (value >= 50) return 'warn'
  return 'neutral'
}

function toneSurface(tone: MetricTone) {
  if (tone === 'good') return 'border-emerald-500/30 bg-emerald-500/5'
  if (tone === 'warn') return 'border-amber-500/30 bg-amber-500/5'
  if (tone === 'risk') return 'border-destructive/30 bg-destructive/5'
  return 'border-border/70 bg-muted/10'
}

function toneBar(tone: MetricTone) {
  if (tone === 'good') return 'bg-emerald-500'
  if (tone === 'warn') return 'bg-amber-500'
  if (tone === 'risk') return 'bg-destructive'
  return 'bg-primary'
}

function actionCopy(metrics: PersonalMetrics) {
  if (metrics.userActions === 0) return 'Sin acciones creadas, asignadas o etiquetadas en el periodo; tu participacion se mide por comentarios.'
  if (metrics.closeRate >= 80) return 'Tus acciones visibles van bien encaminadas; manten el cierre en fecha.'
  if (metrics.closeRate >= 50) return 'Tienes avance parcial; revisa pendientes y fechas comprometidas.'
  return 'Conviene priorizar cierres antes de generar mas carga operativa.'
}

function toDayKey(value: string | null | undefined) {
  if (!value) return ''
  return new Date(value).toISOString().slice(0, 10)
}

function calculateParticipationStreak(days: Set<string>, today: string) {
  let streak = 0
  let cursor = today
  while (days.has(cursor)) {
    streak += 1
    cursor = addCalendarDays(cursor, -1)
  }
  return streak
}


