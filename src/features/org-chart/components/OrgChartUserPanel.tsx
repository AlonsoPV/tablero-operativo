import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ChevronRight,
  Network,
  Target,
  Users,
  X,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ROUTES } from '@/constants'
import { useRouteAccess } from '@/features/auth/hooks/useRouteAccess'
import { okrService } from '@/features/okrs/service'
import {
  krProgress,
  objectivePeriod,
  type KeyResult,
  type Objective,
} from '@/features/okrs/model'
import {
  ProgressBar,
  metricText,
  progressTone,
  toneTextClass,
} from '@/features/okrs/okrPresentation'
import { todayWallClockCDMX } from '@/lib/dateUtils'
import { cn } from '@/lib/utils'
import type { OrgChartUser, OrgChartUserActionStats } from '../types/orgChart.types'
import {
  buildCommandChainRows,
  getDirectReports,
  getManager,
  initialsFromName,
} from '../utils/orgHierarchy'
import { OrgChartHierarchyEditor } from './OrgChartHierarchyEditor'

type PanelTab = 'trabajo' | 'equipo' | 'editar'

interface OrgChartUserPanelProps {
  user: OrgChartUser
  users: OrgChartUser[]
  actionStats: OrgChartUserActionStats
  canEditHierarchy: boolean
  canOpenUserAdmin?: boolean
  currentUserId?: string | null
  onClose?: () => void
}

function Avatar({ name }: { name: string }) {
  return (
    <span
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sky-500/15 text-xs font-semibold text-sky-700 ring-1 ring-sky-500/20 dark:text-sky-300"
      aria-hidden
    >
      {initialsFromName(name)}
    </span>
  )
}

function summaryParts(parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' · ')
}

export function OrgChartUserPanel({
  user,
  users,
  actionStats,
  canEditHierarchy,
  canOpenUserAdmin = false,
  currentUserId,
  onClose,
}: OrgChartUserPanelProps) {
  const { canAccessRoute } = useRouteAccess()
  const canOkrs = canAccessRoute(ROUTES.OKRS)
  const canKanban = canAccessRoute(ROUTES.KANBAN)
  const [tab, setTab] = useState<PanelTab>('trabajo')
  const manager = getManager(user, users)
  const reports = getDirectReports(user.id, users)
  const chain = buildCommandChainRows(user.id, users)
  const today = todayWallClockCDMX()

  const okrQuery = useQuery({
    queryKey: ['okr', 'dashboard', 'org-chart-panel', user.id],
    queryFn: okrService.dashboard,
    enabled: canOkrs,
    staleTime: 60_000,
  })

  const ownedKeyResults = useMemo(() => {
    if (!okrQuery.data) return [] as { kr: KeyResult; objective: Objective }[]
    const byId = new Map(
      okrQuery.data.objectives.map((objective) => [objective.id, objective])
    )
    return okrQuery.data.keyResults
      .filter((kr) => kr.owner_user_id === user.id)
      .map((kr) => ({ kr, objective: byId.get(kr.okr_id)! }))
      .filter((row) => row.objective)
      .filter(
        ({ objective }) =>
          objective.activo && objectivePeriod(objective, today) === 'Activo'
      )
      .sort((a, b) => krProgress(a.kr) - krProgress(b.kr))
  }, [okrQuery.data, today, user.id])

  const avgProgress = useMemo(() => {
    if (!ownedKeyResults.length) return null
    const total = ownedKeyResults.reduce(
      (sum, row) => sum + krProgress(row.kr),
      0
    )
    return Math.round(total / ownedKeyResults.length)
  }, [ownedKeyResults])

  const area = user.areas?.[0] ?? user.area ?? null
  const tabs: { id: PanelTab; label: string; hidden?: boolean }[] = [
    { id: 'trabajo', label: 'Trabajo' },
    { id: 'equipo', label: 'Equipo' },
    { id: 'editar', label: 'Editar', hidden: !canEditHierarchy },
  ]

  const headline = summaryParts([
    canKanban
      ? `${actionStats.asignadas} acción${actionStats.asignadas === 1 ? '' : 'es'}`
      : null,
    actionStats.vencidas > 0 ? `${actionStats.vencidas} vencida${actionStats.vencidas === 1 ? '' : 's'}` : null,
    actionStats.bloqueadas > 0
      ? `${actionStats.bloqueadas} bloqueada${actionStats.bloqueadas === 1 ? '' : 's'}`
      : null,
    canOkrs
      ? `${ownedKeyResults.length} KR${ownedKeyResults.length === 1 ? '' : 's'}`
      : null,
    canOkrs && avgProgress != null ? `${avgProgress}% avance` : null,
  ])

  return (
    <div className="flex h-full flex-col bg-card">
      <header className="shrink-0 border-b border-border/50 px-3 py-2.5 sm:px-4">
        <div className="flex items-center gap-2.5">
          <Avatar name={user.nombre} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="min-w-0 truncate text-sm font-semibold tracking-tight">
                {user.nombre}
              </h2>
              <Badge
                variant={user.activo ? 'success' : 'muted'}
                className="h-5 shrink-0 px-1.5 text-[10px] font-medium"
              >
                {user.activo ? 'Activo' : 'Inactivo'}
              </Badge>
            </div>
            <p className="truncate text-[11px] text-muted-foreground">
              {summaryParts([user.rol, area, manager ? `→ ${manager.nombre}` : 'Sin jefe'])}
            </p>
            {headline ? (
              <p
                className={cn(
                  'mt-0.5 truncate text-[11px]',
                  actionStats.vencidas > 0 || actionStats.bloqueadas > 0
                    ? 'text-amber-800 dark:text-amber-200'
                    : 'text-muted-foreground'
                )}
              >
                {headline}
              </p>
            ) : null}
          </div>
          {onClose ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              aria-label="Cerrar"
              onClick={onClose}
            >
              <X className="h-4 w-4" />
            </Button>
          ) : null}
        </div>

        <div
          className="mt-2.5 flex gap-0.5 rounded-lg bg-muted/50 p-0.5"
          role="tablist"
          aria-label="Secciones de la ficha"
        >
          {tabs
            .filter((item) => !item.hidden)
            .map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={tab === item.id}
                className={cn(
                  'min-h-8 flex-1 rounded-md px-2 text-xs font-medium transition-colors',
                  tab === item.id
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
                onClick={() => setTab(item.id)}
              >
                {item.label}
              </button>
            ))}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3 sm:px-4">
        {tab === 'trabajo' ? (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-1.5">
              {canKanban ? (
                <Button variant="outline" size="sm" className="h-8 text-xs" asChild>
                  <Link to={ROUTES.KANBAN}>
                    Acciones
                    {actionStats.asignadas > 0 ? ` (${actionStats.asignadas})` : ''}
                  </Link>
                </Button>
              ) : null}
              {canOkrs ? (
                <Button variant="outline" size="sm" className="h-8 text-xs" asChild>
                  <Link to={ROUTES.OKRS}>
                    OKRs
                    {ownedKeyResults.length > 0
                      ? ` (${ownedKeyResults.length})`
                      : ''}
                  </Link>
                </Button>
              ) : null}
              {canOpenUserAdmin ? (
                <Button variant="ghost" size="sm" className="h-8 text-xs" asChild>
                  <Link to={`${ROUTES.SETTINGS_USERS}/${user.id}`}>
                    Ficha
                    <ChevronRight className="ml-0.5 h-3.5 w-3.5" />
                  </Link>
                </Button>
              ) : null}
            </div>

            {(actionStats.vencidas > 0 || actionStats.bloqueadas > 0) && (
              <p className="rounded-lg bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-800 dark:text-amber-200">
                {summaryParts([
                  actionStats.vencidas > 0 &&
                    `${actionStats.vencidas} vencida${actionStats.vencidas === 1 ? '' : 's'}`,
                  actionStats.bloqueadas > 0 &&
                    `${actionStats.bloqueadas} bloqueada${actionStats.bloqueadas === 1 ? '' : 's'}`,
                ])}
              </p>
            )}

            {canOkrs ? (
              <section aria-label="Key results">
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                    <Target className="h-3.5 w-3.5" aria-hidden />
                    Key results activos
                  </p>
                  {avgProgress != null ? (
                    <span className="text-[11px] font-semibold tabular-nums text-muted-foreground">
                      {avgProgress}%
                    </span>
                  ) : null}
                </div>

                {okrQuery.isPending ? (
                  <p className="py-6 text-center text-xs text-muted-foreground">
                    Cargando…
                  </p>
                ) : !ownedKeyResults.length ? (
                  <p className="rounded-lg border border-dashed border-border/70 px-3 py-4 text-center text-xs text-muted-foreground">
                    Sin KRs activos a su cargo
                  </p>
                ) : (
                  <ul className="divide-y divide-border/50 rounded-xl border border-border/70">
                    {ownedKeyResults.slice(0, 8).map(({ kr, objective }) => {
                      const progress = krProgress(kr)
                      const tone = progressTone(progress)
                      return (
                        <li key={kr.id}>
                          <Link
                            to={`${ROUTES.OKRS}?objective=${objective.id}`}
                            className="block px-2.5 py-2 transition-colors hover:bg-muted/30"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <p className="min-w-0 truncate text-xs font-medium">
                                {kr.title}
                              </p>
                              <span
                                className={cn(
                                  'shrink-0 text-[11px] font-semibold tabular-nums',
                                  toneTextClass(tone)
                                )}
                              >
                                {Math.round(progress)}%
                              </span>
                            </div>
                            <div className="mt-1.5">
                              <ProgressBar
                                value={progress}
                                label={`Avance de ${kr.title}`}
                                size="sm"
                                tone={tone}
                              />
                            </div>
                            <p className="mt-1 truncate text-[10px] text-muted-foreground">
                              {metricText(kr.current_value, kr.unit)} /{' '}
                              {metricText(kr.target_value, kr.unit)}
                              {' · '}
                              {objective.nombre_okr}
                            </p>
                          </Link>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </section>
            ) : (
              <p className="py-8 text-center text-xs text-muted-foreground">
                Sin acceso a OKRs. Usa Equipo para ver jerarquía.
              </p>
            )}
          </div>
        ) : null}

        {tab === 'equipo' ? (
          <div className="space-y-3">
            <section className="space-y-1.5">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                <Network className="h-3.5 w-3.5" aria-hidden />
                Reporta a
              </p>
              {manager ? (
                <div className="flex items-center gap-2 rounded-lg border border-border/70 px-2.5 py-2">
                  <Avatar name={manager.nombre} />
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium">{manager.nombre}</p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {manager.rol}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="rounded-lg border border-dashed border-border/70 px-3 py-3 text-xs text-muted-foreground">
                  Sin responsable superior
                </p>
              )}
            </section>

            <section className="space-y-1.5">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                <Users className="h-3.5 w-3.5" aria-hidden />
                Le reportan
                <span className="rounded bg-muted px-1 py-0.5 text-[10px] tabular-nums">
                  {reports.length}
                </span>
              </p>
              {reports.length ? (
                <ul className="divide-y divide-border/50 rounded-xl border border-border/70">
                  {reports.map((report) => (
                    <li
                      key={report.id}
                      className="flex items-center gap-2 px-2.5 py-1.5"
                    >
                      <Avatar name={report.nombre} />
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium">
                          {report.nombre}
                        </p>
                        <p className="truncate text-[11px] text-muted-foreground">
                          {report.rol}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="rounded-lg border border-dashed border-border/70 px-3 py-3 text-xs text-muted-foreground">
                  Sin subordinados directos
                </p>
              )}
            </section>

            <section className="space-y-1.5">
              <p className="text-xs font-semibold text-muted-foreground">
                Cadena de mando
              </p>
              <ol className="space-y-0.5 text-xs">
                {chain.map((row) => (
                  <li
                    key={`${row.id}-${row.nivel}`}
                    className={cn(
                      'flex items-center gap-2 rounded-md px-2 py-1',
                      row.nivel === 0 && 'bg-muted/50 font-medium'
                    )}
                    style={{ paddingLeft: `${0.5 + row.nivel * 0.75}rem` }}
                  >
                    <span className="truncate">{row.nombre}</span>
                    <span className="truncate text-[11px] text-muted-foreground">
                      {row.rol}
                    </span>
                  </li>
                ))}
              </ol>
            </section>
          </div>
        ) : null}

        {tab === 'editar' && canEditHierarchy ? (
          <OrgChartHierarchyEditor
            user={user}
            users={users}
            currentUserId={currentUserId}
            canManageAnyReports={canOpenUserAdmin}
          />
        ) : null}
      </div>
    </div>
  )
}
