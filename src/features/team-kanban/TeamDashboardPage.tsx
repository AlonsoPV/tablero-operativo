import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { BarChart3, Clock3, Columns3, ShieldAlert, UsersRound } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ROUTES } from '@/constants'
import { cn } from '@/lib/utils'
import { TeamAreaSelector } from './components/TeamAreaSelector'
import { TeamDashboardExecutivePanel } from './components/TeamDashboardExecutivePanel'
import { useTeamAreaScope } from './hooks/useTeamAreaScope'
import { useTeamDashboard } from './hooks/useTeamDashboard'
import type { TeamDashboardAlertType, TeamDashboardDrillDown, TeamDashboardPeriod } from './utils/teamDashboardMetrics'

const periodOptions: Array<{ value: TeamDashboardPeriod; label: string }> = [
  { value: '7d', label: 'Últimos 7 días' },
  { value: '30d', label: 'Últimos 30 días' },
  { value: 'month', label: 'Este mes' },
]

function formatDueDate(value: string | null) {
  if (!value) return 'Sin fecha'
  return new Date(value).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })
}

function alertLabel(type: TeamDashboardAlertType) {
  if (type === 'vencida') return 'Vencida'
  if (type === 'bloqueada') return 'Bloqueada'
  return 'Roja hoy'
}

export function TeamDashboardPage() {
  const navigate = useNavigate()
  const [period, setPeriod] = useState<TeamDashboardPeriod>('30d')
  const scope = useTeamAreaScope()
  const dashboard = useTeamDashboard(scope.areaId, period)
  const metrics = dashboard.metrics
  const maxLoad = useMemo(
    () => Math.max(1, ...(metrics?.loadByMember.map((item) => item.activeCount) ?? [1])),
    [metrics?.loadByMember]
  )

  const openBoard = (filter?: string, extra?: Record<string, string>) => {
    if (!scope.areaId) return
    const params = new URLSearchParams({ area: scope.areaId })
    if (filter) params.set('alert', filter)
    Object.entries(extra ?? {}).forEach(([key, value]) => params.set(key, value))
    navigate(`${ROUTES.TEAM_KANBAN_BOARD}?${params.toString()}`)
  }

  const handleExecutiveDrillDown = (input: TeamDashboardDrillDown) => {
    openBoard(input.alert, input.assigneeId ? { user: input.assigneeId } : undefined)
  }

  if (scope.isLoading) {
    return <p className="py-16 text-center text-muted-foreground">Cargando equipos...</p>
  }

  if (scope.error) {
    return <p className="m-6 rounded-lg border border-destructive/30 p-4 text-destructive">{scope.error.message}</p>
  }

  if (!scope.visibleAreas.length) {
    return (
      <div className="m-6 rounded-xl border border-dashed p-8 text-center">
        <p className="font-semibold text-foreground">Sin equipos disponibles</p>
        <p className="mt-1 text-sm text-muted-foreground">No tienes áreas asignadas para consultar un dashboard de equipo.</p>
      </div>
    )
  }

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-3 py-5 sm:px-6 sm:py-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0 space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Dashboard por Equipos</p>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Gestión por Equipos</h1>
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Mide carga, bloqueos y cumplimiento del área activa sin mezclar información de otros equipos.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_220px] lg:w-[560px]">
          <TeamAreaSelector areas={scope.visibleAreas} selectedId={scope.areaId} onSelect={scope.setAreaId} />
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Periodo cumplimiento</p>
            <Select value={period} onValueChange={(value) => setPeriod(value as TeamDashboardPeriod)}>
              <SelectTrigger className="h-11 rounded-xl border-border/70 bg-card font-semibold shadow-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {periodOptions.map((item) => (
                  <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </header>

      {dashboard.isLoading ? (
        <p className="py-16 text-center text-muted-foreground">Calculando métricas...</p>
      ) : dashboard.error ? (
        <p className="rounded-lg border border-destructive/30 p-4 text-destructive">{dashboard.error.message}</p>
      ) : metrics ? (
        <>
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard
              title="Acciones activas"
              value={String(metrics.activeActions)}
              detail="acciones abiertas"
              icon={Columns3}
              onClick={() => openBoard('active')}
            />
            <KpiCard
              title="Acciones vencidas"
              value={String(metrics.overdueActions)}
              detail={`${metrics.overduePercent}% del activo`}
              icon={Clock3}
              tone="warning"
              onClick={() => openBoard('overdue')}
            />
            <KpiCard
              title="Acciones bloqueadas"
              value={String(metrics.blockedActions)}
              detail="requieren intervención"
              icon={ShieldAlert}
              tone="danger"
              onClick={() => openBoard('blocked')}
            />
            <KpiCard
              title="Cumplimiento en tiempo"
              value={metrics.onTimeCompliancePercent == null ? 'Sin datos' : `${metrics.onTimeCompliancePercent}%`}
              detail={`${metrics.closedActionsInPeriod} cerradas en periodo`}
              icon={BarChart3}
              tone={metrics.onTimeCompliancePercent != null && metrics.onTimeCompliancePercent < 85 ? 'warning' : 'success'}
              onClick={() => openBoard()}
            />
          </section>

          <TeamDashboardExecutivePanel
            metrics={metrics}
            isLoading={dashboard.isLoading}
            onDrillDown={handleExecutiveDrillDown}
          />

          <section className="grid gap-4 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
            <Card className="rounded-2xl border-border/70 shadow-sm">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-base font-semibold text-foreground">Carga por integrante</p>
                    <p className="text-xs text-muted-foreground">Acciones activas ordenadas de mayor a menor.</p>
                  </div>
                  <UsersRound className="h-5 w-5 text-muted-foreground" aria-hidden />
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {metrics.loadByMember.length ? metrics.loadByMember.map((item) => (
                  <button
                    key={item.userId}
                    type="button"
                    onClick={() => openBoard('user', { user: item.userId })}
                    className="group w-full rounded-xl border border-transparent p-2 text-left transition hover:border-border hover:bg-muted/40"
                  >
                    <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
                      <span className="truncate font-medium text-foreground">{item.name}</span>
                      <span className="tabular-nums text-muted-foreground">{item.activeCount}</span>
                    </div>
                    <div className="h-2 rounded-full bg-muted">
                      <div
                        className="h-2 rounded-full bg-primary transition-all"
                        style={{ width: `${Math.max(8, (item.activeCount / maxLoad) * 100)}%` }}
                      />
                    </div>
                  </button>
                )) : (
                  <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                    No hay acciones activas en esta área.
                  </p>
                )}
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-border/70 shadow-sm">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-base font-semibold text-foreground">Requiere atención</p>
                    <p className="text-xs text-muted-foreground">Vencidas, bloqueadas y rojas para hoy.</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => openBoard('attention')}>Ver todas</Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-2.5">
                {metrics.attentionItems.length ? metrics.attentionItems.map((item) => (
                  <button
                    key={item.action.id}
                    type="button"
                    onClick={() => openBoard(item.alertType)}
                    className="w-full rounded-xl border border-border/60 bg-card/60 p-3 text-left transition hover:border-primary/35 hover:bg-primary/5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-foreground">{item.action.titulo}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {item.assigneeName} · {formatDueDate(item.action.fecha_limite)} · {item.stateName}
                        </p>
                      </div>
                      <Badge variant="outline" className="shrink-0">{alertLabel(item.alertType)}</Badge>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">Prioridad: {item.action.prioridad}</p>
                  </button>
                )) : (
                  <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                    Sin alertas inmediatas para preparar la daily.
                  </p>
                )}
              </CardContent>
            </Card>
          </section>

          <div className="flex justify-end">
            <Button asChild variant="ghost" className="gap-2">
              <Link to={`${ROUTES.TEAM_KANBAN_BOARD}?area=${scope.areaId}`}>Abrir Kanban del equipo</Link>
            </Button>
          </div>
        </>
      ) : null}
    </main>
  )
}

function KpiCard({
  title,
  value,
  detail,
  icon: Icon,
  tone = 'neutral',
  onClick,
}: {
  title: string
  value: string
  detail: string
  icon: typeof Columns3
  tone?: 'neutral' | 'success' | 'warning' | 'danger'
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-2xl border bg-card p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md',
        tone === 'success' && 'border-emerald-200 bg-emerald-50/70',
        tone === 'warning' && 'border-amber-200 bg-amber-50/70',
        tone === 'danger' && 'border-red-200 bg-red-50/70',
        tone === 'neutral' && 'border-border/70'
      )}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
        <Icon className="h-4 w-4 text-muted-foreground" aria-hidden />
      </div>
      <p className="text-2xl font-semibold tracking-tight text-foreground">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </button>
  )
}
