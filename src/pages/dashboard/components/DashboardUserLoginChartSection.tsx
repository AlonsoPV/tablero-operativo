import { useMemo, useState } from 'react'
import { CalendarCheck, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SectionCard, SectionCardBody, SectionCardHeader } from '@/components/SectionCard'
import { useDashboardUserLoginStats } from '../hooks/useDashboardUserLoginStats'
import {
  LOGIN_GRANULARITY_OPTIONS,
  loginBucketLabel,
  loginBucketPercentage,
  type LoginGranularity,
  type UserLoginBucket,
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
}: {
  buckets: UserLoginBucket[]
  granularity: LoginGranularity
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

          return (
            <g key={bucket.bucketStart}>
              <title>
                {label}: {bucket.usersLoggedIn} de {bucket.usersTotal} usuarios ({percentage}%)
              </title>
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={height}
                rx={5}
                className="fill-primary"
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
                className="fill-current text-[10px]"
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

export function DashboardUserLoginChartSection() {
  const [granularity, setGranularity] = useState<LoginGranularity>('weekly')
  const { data: buckets = [], isLoading, isError, refetch } =
    useDashboardUserLoginStats(granularity)

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
          subtitle="Usuarios activos que iniciaron sesión al menos una vez en cada periodo."
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
            <div className="space-y-3">
              {latest ? (
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className="text-2xl font-semibold tabular-nums text-foreground">
                    {latest.usersLoggedIn} de {latest.usersTotal}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    usuarios en el periodo actual ({loginBucketPercentage(latest)}%)
                  </span>
                </div>
              ) : null}
              <LoginBars buckets={buckets} granularity={granularity} />
              {allEmpty ? (
                <p className="text-xs text-muted-foreground">
                  El historial empieza a acumularse desde la activación de esta métrica.
                </p>
              ) : null}
            </div>
          )}
        </SectionCardBody>
      </SectionCard>
    </section>
  )
}
