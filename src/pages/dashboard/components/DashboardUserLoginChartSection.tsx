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

const CHART_WIDTH = 520
const CHART_HEIGHT = 168
const PAD_LEFT = 36
const PAD_RIGHT = 10
const PAD_TOP = 16
const PAD_BOTTOM = 36

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
  const barWidth = Math.min(36, slotWidth * 0.55)
  const yAt = (percentage: number) => PAD_TOP + innerHeight * (1 - percentage / 100)
  const ticks = [0, 50, 100]

  return (
    <div className="w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        className="min-w-full text-muted-foreground"
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
                strokeOpacity={0.12}
              />
              <text x={PAD_LEFT - 6} y={y + 3} textAnchor="end" className="fill-current text-[9px]">
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
                {label}: {bucket.usersLoggedIn}/{bucket.usersTotal} ({percentage}%)
              </title>
              <rect x={x} y={PAD_TOP} width={barWidth} height={innerHeight} className="fill-transparent" />
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={height}
                rx={4}
                className={selected ? 'fill-foreground' : 'fill-primary'}
              />
              <text
                x={x + barWidth / 2}
                y={CHART_HEIGHT - 14}
                textAnchor="middle"
                className={cn('text-[9px]', selected ? 'fill-foreground font-semibold' : 'fill-current')}
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
    <li className="flex items-center justify-between gap-2 px-3 py-2">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-foreground">{person.nombre}</p>
        <p className="truncate text-[11px] text-muted-foreground">
          {[person.rol, person.area].filter(Boolean).join(' · ') || 'Sin área/rol'}
        </p>
      </div>
      {showLoginAt ? (
        <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
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
  const people = tab === 'in' ? bucket.loggedInUsers : bucket.absentUsers

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border/50">
      <div className="flex items-center justify-between gap-2 border-b border-border/50 px-3 py-2">
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold text-foreground">
            {loginBucketLabel(bucket, granularity)}
          </p>
          <p className="truncate text-[10px] text-muted-foreground">
            {loginBucketDateRangeLabel(bucket)}
          </p>
        </div>
        <div className="flex shrink-0 gap-1" role="tablist" aria-label="Presentes o ausentes">
          <button
            type="button"
            className={cn(
              'inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition',
              tab === 'in'
                ? 'bg-muted text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            )}
            aria-selected={tab === 'in'}
            onClick={() => setTab('in')}
          >
            <UserRoundCheck className="h-3 w-3" aria-hidden />
            {bucket.loggedInUsers.length}
          </button>
          <button
            type="button"
            className={cn(
              'inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition',
              tab === 'out'
                ? 'bg-muted text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            )}
            aria-selected={tab === 'out'}
            onClick={() => setTab('out')}
          >
            <UserRoundX className="h-3 w-3" aria-hidden />
            {bucket.absentUsers.length}
          </button>
        </div>
      </div>

      {people.length === 0 ? (
        <p className="px-3 py-6 text-center text-xs text-muted-foreground">
          {tab === 'in' ? 'Nadie inició sesión.' : 'Todos iniciaron sesión.'}
        </p>
      ) : (
        <ul className="min-h-0 flex-1 divide-y divide-border/35 overflow-y-auto overscroll-contain">
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
      className="flex h-full min-h-0 scroll-mt-4 flex-col"
      aria-labelledby="dashboard-user-logins-title"
    >
      <SectionCard className="flex h-full flex-col">
        <SectionCardHeader
          icon={CalendarCheck}
          eyebrow="Adopción"
          title="Inicios de sesión"
          titleId="dashboard-user-logins-title"
          subtitle="Usuarios activos que entraron al menos una vez."
          action={
            <div className="flex flex-wrap gap-1" role="group" aria-label="Agrupar por periodo">
              {LOGIN_GRANULARITY_OPTIONS.map((option) => (
                <Button
                  key={option.value}
                  type="button"
                  variant={granularity === option.value ? 'secondary' : 'outline'}
                  size="sm"
                  className="h-7 px-2 text-[11px]"
                  aria-pressed={granularity === option.value}
                  onClick={() => setGranularity(option.value)}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          }
        />
        <SectionCardBody className="flex min-h-0 flex-1 flex-col gap-3 p-3 sm:p-4 md:p-5">
          {isLoading ? (
            <div className="h-48 animate-pulse rounded-lg bg-muted/45" aria-label="Cargando actividad" />
          ) : isError ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
              <p className="text-sm text-destructive">No se pudo cargar la actividad.</p>
              <Button variant="outline" size="sm" className="gap-2" onClick={() => void refetch()}>
                <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                Reintentar
              </Button>
            </div>
          ) : buckets.length === 0 ? (
            <p className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
              Aún no hay periodos disponibles.
            </p>
          ) : (
            <>
              {latest ? (
                <div className="flex flex-wrap items-end gap-x-2 gap-y-1">
                  <span className="text-2xl font-semibold tabular-nums leading-none text-foreground">
                    {latest.usersLoggedIn}/{latest.usersTotal}
                  </span>
                  <Badge variant="secondary" className="h-6 tabular-nums">
                    {loginBucketPercentage(latest)}%
                  </Badge>
                  <span className="text-xs text-muted-foreground">periodo actual</span>
                </div>
              ) : null}

              <LoginBars
                buckets={buckets}
                granularity={granularity}
                selectedStart={selected?.bucketStart ?? null}
                onSelect={(bucket) => setSelectedStart(bucket.bucketStart)}
              />

              {selected ? <PeriodPeoplePanel bucket={selected} granularity={granularity} /> : null}

              <p className="text-[11px] text-muted-foreground">
                {allEmpty
                  ? 'Aún no hay eventos de login registrados.'
                  : 'Toca una barra para ver quién entró o faltó.'}
              </p>
            </>
          )}
        </SectionCardBody>
      </SectionCard>
    </section>
  )
}
