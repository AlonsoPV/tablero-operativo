import { useEffect, useMemo, useState } from 'react'
import { CalendarCheck, RefreshCw, UserRoundCheck, UserRoundX } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { SectionCard, SectionCardBody, SectionCardHeader } from '@/components/SectionCard'
import { cn } from '@/lib/utils'
import { useDashboardUserLoginStats } from '../hooks/useDashboardUserLoginStats'
import {
  LOGIN_GRANULARITY_OPTIONS,
  formatLoginTimestamp,
  loginBucketDateRangeLabel,
  loginBucketLabel,
  loginBucketPercentage,
  type LoginGranularity,
  type UserLoginBucket,
  type UserLoginPerson,
} from '../utils/dashboardUserLoginStats'

const CHART_WIDTH = 760
const CHART_HEIGHT = 260
const PAD_LEFT = 46
const PAD_RIGHT = 18
const PAD_TOP = 18
const PAD_BOTTOM = 54

function LoginBars({
  buckets,
  granularity,
  selectedStart,
  onSelect,
}: {
  buckets: UserLoginBucket[]
  granularity: LoginGranularity
  selectedStart: string | null
  onSelect: (bucket: UserLoginBucket) => void
}) {
  const innerWidth = CHART_WIDTH - PAD_LEFT - PAD_RIGHT
  const innerHeight = CHART_HEIGHT - PAD_TOP - PAD_BOTTOM
  const slotWidth = innerWidth / Math.max(1, buckets.length)
  const barWidth = Math.min(52, slotWidth * 0.58)
  const yAt = (percentage: number) => PAD_TOP + innerHeight * (1 - percentage / 100)
  const ticks = [0, 25, 50, 75, 100]

  return (
    <div className="w-full overflow-x-auto pb-1">
      <svg
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        className="min-w-[640px] text-muted-foreground"
        role="img"
        aria-label="Porcentaje de usuarios activos que iniciaron sesión en cada periodo"
      >
        {ticks.map((tick) => {
          const y = yAt(tick)
          return (
            <g key={tick}>
              <line
                x1={PAD_LEFT}
                y1={y}
                x2={CHART_WIDTH - PAD_RIGHT}
                y2={y}
                stroke="currentColor"
                strokeOpacity={0.14}
              />
              <text x={PAD_LEFT - 8} y={y + 4} textAnchor="end" className="fill-current text-[10px]">
                {tick}%
              </text>
            </g>
          )
        })}

        {buckets.map((bucket, index) => {
          const percentage = loginBucketPercentage(bucket)
          const height = percentage === 0 ? 0 : Math.max(3, innerHeight * (percentage / 100))
          const x = PAD_LEFT + slotWidth * index + (slotWidth - barWidth) / 2
          const y = PAD_TOP + innerHeight - height
          const label = loginBucketLabel(bucket, granularity)
          const selected = selectedStart === bucket.bucketStart

          return (
            <g
              key={bucket.bucketStart}
              className="cursor-pointer"
              onClick={() => onSelect(bucket)}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  onSelect(bucket)
                }
              }}
            >
              <title>
                {label}: {bucket.usersLoggedIn} de {bucket.usersTotal} usuarios ({percentage}%). Clic para ver quién.
              </title>
              <rect
                x={x}
                y={PAD_TOP}
                width={barWidth}
                height={innerHeight}
                className="fill-transparent"
              />
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={height}
                rx={5}
                className={selected ? 'fill-foreground' : 'fill-primary'}
              />
              <text
                x={x + barWidth / 2}
                y={Math.max(PAD_TOP + 10, y - 7)}
                textAnchor="middle"
                className="fill-foreground text-[10px] font-semibold"
              >
                {bucket.usersLoggedIn}/{bucket.usersTotal}
              </text>
              <text
                x={x + barWidth / 2}
                y={CHART_HEIGHT - 25}
                textAnchor="middle"
                className={cn('text-[10px]', selected ? 'fill-foreground font-semibold' : 'fill-current')}
              >
                {label}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

function PersonRow({
  person,
  showLoginAt,
}: {
  person: UserLoginPerson
  showLoginAt?: boolean
}) {
  return (
    <li className="flex items-start justify-between gap-3 rounded-lg border border-border/50 bg-background/70 px-3 py-2.5">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-foreground">{person.nombre}</p>
        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
          {[person.rol, person.area].filter(Boolean).join(' · ') || 'Sin área/rol'}
        </p>
      </div>
      {showLoginAt ? (
        <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
          {formatLoginTimestamp(person.lastLoginAt)}
        </span>
      ) : null}
    </li>
  )
}

function PeriodPeoplePanel({
  bucket,
  granularity,
}: {
  bucket: UserLoginBucket
  granularity: LoginGranularity
}) {
  const [tab, setTab] = useState<'in' | 'out'>('in')
  const range = loginBucketDateRangeLabel(bucket)
  const label = loginBucketLabel(bucket, granularity)
  const people = tab === 'in' ? bucket.loggedInUsers : bucket.absentUsers

  return (
    <div className="overflow-hidden rounded-xl border border-border/60 bg-muted/15">
      <div className="flex flex-col gap-3 border-b border-border/50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">
            Periodo {label}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Del {range}. Se cuenta 1 acceso por usuario (último login del periodo).
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Presentes o ausentes">
          <Button
            type="button"
            size="sm"
            variant={tab === 'in' ? 'secondary' : 'outline'}
            className="h-8 gap-1.5 text-xs"
            aria-selected={tab === 'in'}
            onClick={() => setTab('in')}
          >
            <UserRoundCheck className="h-3.5 w-3.5" aria-hidden />
            Entraron ({bucket.loggedInUsers.length})
          </Button>
          <Button
            type="button"
            size="sm"
            variant={tab === 'out' ? 'secondary' : 'outline'}
            className="h-8 gap-1.5 text-xs"
            aria-selected={tab === 'out'}
            onClick={() => setTab('out')}
          >
            <UserRoundX className="h-3.5 w-3.5" aria-hidden />
            No entraron ({bucket.absentUsers.length})
          </Button>
        </div>
      </div>

      {people.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">
          {tab === 'in'
            ? 'Nadie de la base activa inició sesión en este periodo.'
            : 'Todos los usuarios activos iniciaron sesión en este periodo.'}
        </p>
      ) : (
        <ul className="grid max-h-72 gap-2 overflow-y-auto p-3 sm:grid-cols-2">
          {people.map((person) => (
            <PersonRow key={person.userId} person={person} showLoginAt={tab === 'in'} />
          ))}
        </ul>
      )}
    </div>
  )
}

export function DashboardUserLoginChartSection() {
  const [granularity, setGranularity] = useState<LoginGranularity>('weekly')
  const { data: buckets = [], isLoading, isError, refetch } =
    useDashboardUserLoginStats(granularity)
  const [selectedStart, setSelectedStart] = useState<string | null>(null)

  useEffect(() => {
    setSelectedStart(buckets.at(-1)?.bucketStart ?? null)
  }, [buckets, granularity])

  const selected = useMemo(
    () => buckets.find((bucket) => bucket.bucketStart === selectedStart) ?? buckets.at(-1) ?? null,
    [buckets, selectedStart]
  )
  const latest = buckets.at(-1)
  const allEmpty = useMemo(
    () => buckets.every((bucket) => bucket.usersLoggedIn === 0),
    [buckets]
  )

  return (
    <section
      id="dashboard-section-user-logins"
      className="scroll-mt-4"
      aria-labelledby="dashboard-user-logins-title"
    >
      <SectionCard>
        <SectionCardHeader
          icon={CalendarCheck}
          eyebrow="Adopción"
          title="Inicios de sesión de usuarios"
          titleId="dashboard-user-logins-title"
          subtitle="Quién de la base activa entró al menos una vez en cada periodo. Elige una barra para ver nombres y horarios."
          action={
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Agrupar actividad por periodo">
              {LOGIN_GRANULARITY_OPTIONS.map((option) => (
                <Button
                  key={option.value}
                  type="button"
                  variant={granularity === option.value ? 'secondary' : 'outline'}
                  size="sm"
                  className="h-8 text-xs"
                  aria-pressed={granularity === option.value}
                  onClick={() => setGranularity(option.value)}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          }
        />
        <SectionCardBody>
          {isLoading ? (
            <div className="h-[260px] animate-pulse rounded-lg bg-muted/45" aria-label="Cargando actividad" />
          ) : isError ? (
            <div className="flex min-h-48 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border/60 text-center">
              <p className="text-sm text-destructive">No se pudo cargar la actividad de acceso.</p>
              <Button variant="outline" size="sm" className="gap-2" onClick={() => void refetch()}>
                <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                Reintentar
              </Button>
            </div>
          ) : buckets.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted-foreground">
              Aún no hay periodos disponibles.
            </p>
          ) : (
            <div className="space-y-4">
              {latest ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-2xl font-semibold tabular-nums text-foreground">
                    {latest.usersLoggedIn} de {latest.usersTotal}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    usuarios activos en el periodo actual ({loginBucketPercentage(latest)}%)
                  </span>
                  <Badge variant="outline" className="tabular-nums">
                    {loginBucketDateRangeLabel(latest)}
                  </Badge>
                </div>
              ) : null}

              <LoginBars
                buckets={buckets}
                granularity={granularity}
                selectedStart={selected?.bucketStart ?? null}
                onSelect={(bucket) => setSelectedStart(bucket.bucketStart)}
              />

              {selected ? (
                <PeriodPeoplePanel bucket={selected} granularity={granularity} />
              ) : null}

              {allEmpty ? (
                <p className="text-xs text-muted-foreground">
                  El historial se alimenta con cada inicio de sesión (o primer acceso del día). Si está vacío, aún no hay eventos registrados.
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Fuente: eventos de login reales. Un usuario cuenta una sola vez por periodo aunque entre varias veces.
                </p>
              )}
            </div>
          )}
        </SectionCardBody>
      </SectionCard>
    </section>
  )
}
