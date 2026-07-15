import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Ban,
  Building2,
  CircleDot,
  Trophy,
  UserRound,
  UsersRound,
} from 'lucide-react'
import { SectionCard, SectionCardBody, SectionCardHeader } from '@/components/SectionCard'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase/client'
import type { AccionDiaria } from '@/types'
import type { AccionComentario } from '@/types/accionComentario'
import type { UserProfile } from '@/features/users/types/user.types'
import { orgChartScoreService } from '@/features/disciplina/services/orgChartScore.service'
import {
  buildAreaActionsSummaryRows,
  buildUserActionsSummaryRows,
  compareAreaSummaryRows,
  compareUserSummaryRows,
  initialsFromDisplayName,
  summarizeAreaActionsRows,
  summarizeUserActionsRows,
  type ActionsSummaryTotals,
  type AreaActionsSummaryRow,
  type AreaSummarySortKey,
  type SummarySortDir,
  type UserActionsSummaryRow,
  type UserSummarySortKey,
} from '../utils/dashboardUserActionsSummary'

type SummaryView = 'usuario' | 'area'

type AcademyProgressCountRow = {
  user_id: string
  completed_count: number
}

interface DashboardUserActionsSummarySectionProps {
  users: UserProfile[]
  acciones: AccionDiaria[]
  comentarios: AccionComentario[]
  today: string
  areaFilter?: string
  isLoading?: boolean
}

function SortableHead({
  label,
  sortKey,
  activeKey,
  sortDir,
  onSort,
  align = 'right',
  className,
}: {
  label: string
  sortKey: string
  activeKey: string
  sortDir: SummarySortDir
  onSort: (key: string) => void
  align?: 'left' | 'right'
  className?: string
}) {
  const active = activeKey === sortKey
  const Icon = active ? (sortDir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown

  return (
    <th className={cn('px-3 py-3 font-semibold md:px-4', className)}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          'inline-flex w-full items-center gap-1.5 rounded-md text-[11px] font-semibold uppercase tracking-wide transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          align === 'right' ? 'justify-end text-right' : 'justify-start text-left',
          active ? 'text-foreground' : 'text-muted-foreground'
        )}
        aria-label={`Ordenar por ${label}`}
      >
        <span>{label}</span>
        <Icon className={cn('h-3.5 w-3.5', !active && 'opacity-45')} aria-hidden />
      </button>
    </th>
  )
}

function DashboardUserActionsSkeleton({ columns }: { columns: number }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Cargando resumen operativo">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-16 animate-pulse rounded-xl bg-muted/60" />
        ))}
      </div>
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="grid gap-3 rounded-xl border border-border/40 p-4"
          style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: columns }).map((_, j) => (
            <div key={j} className="h-4 animate-pulse rounded bg-muted" />
          ))}
        </div>
      ))}
    </div>
  )
}

function MetricCell({
  value,
  tone = 'default',
}: {
  value: number
  tone?: 'default' | 'warning' | 'danger'
}) {
  if (tone === 'warning') {
    return (
      <span className={cn('font-semibold tabular-nums', value > 0 ? 'text-orange-600' : 'text-muted-foreground')}>
        {value}
      </span>
    )
  }

  if (tone === 'danger') {
    return (
      <span className={cn('font-semibold tabular-nums', value > 0 ? 'text-destructive' : 'text-muted-foreground')}>
        {value}
      </span>
    )
  }

  return (
    <Badge variant="secondary" className="min-w-[2rem] justify-center tabular-nums">
      {value}
    </Badge>
  )
}

function SummaryStat({
  label,
  value,
  icon: Icon,
  tone = 'default',
}: {
  label: string
  value: number
  icon: typeof CircleDot
  tone?: 'default' | 'warning' | 'danger' | 'accent'
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-muted/15 px-3 py-3">
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <Icon
          className={cn(
            'h-3.5 w-3.5',
            tone === 'warning' && 'text-orange-500',
            tone === 'danger' && 'text-destructive',
            tone === 'accent' && 'text-amber-500'
          )}
          aria-hidden
        />
        <span>{label}</span>
      </div>
      <p
        className={cn(
          'mt-1 text-2xl font-semibold tabular-nums tracking-tight',
          tone === 'warning' && value > 0 && 'text-orange-600',
          tone === 'danger' && value > 0 && 'text-destructive'
        )}
      >
        {value}
      </p>
    </div>
  )
}

function SummaryTotalsBar({
  view,
  totals,
}: {
  view: SummaryView
  totals: ActionsSummaryTotals
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
      <SummaryStat
        label={view === 'usuario' ? 'Usuarios' : 'Áreas'}
        value={totals.count}
        icon={view === 'usuario' ? UsersRound : Building2}
      />
      <SummaryStat label="Abiertas" value={totals.abiertas} icon={CircleDot} />
      <SummaryStat label="En retraso" value={totals.retraso} icon={AlertTriangle} tone="warning" />
      <SummaryStat label="Bloqueadas" value={totals.bloqueadas} icon={Ban} tone="danger" />
      <SummaryStat label="Puntos" value={totals.gamificationPoints} icon={Trophy} tone="accent" />
    </div>
  )
}

function SummaryViewToggle({
  view,
  onViewChange,
}: {
  view: SummaryView
  onViewChange: (view: SummaryView) => void
}) {
  return (
    <div className="flex flex-wrap gap-1 rounded-lg border border-border/70 bg-muted/20 p-1">
      <Button
        type="button"
        variant={view === 'usuario' ? 'secondary' : 'ghost'}
        size="sm"
        className={cn('gap-1.5 rounded-md', view === 'usuario' && 'shadow-sm')}
        onClick={() => onViewChange('usuario')}
        aria-pressed={view === 'usuario'}
      >
        <UserRound className="h-4 w-4 shrink-0" aria-hidden />
        Por usuario
      </Button>
      <Button
        type="button"
        variant={view === 'area' ? 'secondary' : 'ghost'}
        size="sm"
        className={cn('gap-1.5 rounded-md', view === 'area' && 'shadow-sm')}
        onClick={() => onViewChange('area')}
        aria-pressed={view === 'area'}
      >
        <Building2 className="h-4 w-4 shrink-0" aria-hidden />
        Por área
      </Button>
    </div>
  )
}

function UserMobileCard({ row }: { row: UserActionsSummaryRow }) {
  const isCritical = row.retraso > 0 || row.bloqueadas > 0

  return (
    <article
      className={cn(
        'rounded-xl border p-4 transition-colors',
        isCritical ? 'border-orange-200/80 bg-orange-50/40 dark:border-orange-900/40 dark:bg-orange-950/20' : 'border-border/60 bg-background'
      )}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary ring-1 ring-primary/15">
          {initialsFromDisplayName(row.nombre)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-foreground">{row.nombre}</p>
          <p className="truncate text-xs text-muted-foreground">{row.area}</p>
        </div>
        <span className="inline-flex items-center gap-1 text-sm font-semibold tabular-nums">
          <Trophy className="h-3.5 w-3.5 text-amber-500" aria-hidden />
          {row.gamificationPoints}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-muted/30 px-2 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Abiertas</p>
          <p className="mt-0.5 text-sm font-semibold tabular-nums">{row.abiertas}</p>
        </div>
        <div className="rounded-lg bg-muted/30 px-2 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Retraso</p>
          <p className={cn('mt-0.5 text-sm font-semibold tabular-nums', row.retraso > 0 && 'text-orange-600')}>
            {row.retraso}
          </p>
        </div>
        <div className="rounded-lg bg-muted/30 px-2 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Bloq.</p>
          <p className={cn('mt-0.5 text-sm font-semibold tabular-nums', row.bloqueadas > 0 && 'text-destructive')}>
            {row.bloqueadas}
          </p>
        </div>
      </div>
    </article>
  )
}

function AreaMobileCard({ row }: { row: AreaActionsSummaryRow }) {
  return (
    <article className="rounded-xl border border-border/60 bg-background p-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary ring-1 ring-primary/15">
          <Building2 className="h-4 w-4" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-foreground">{row.area}</p>
          <p className="text-xs text-muted-foreground">{row.usuarios} usuario{row.usuarios !== 1 ? 's' : ''}</p>
        </div>
        <span className="inline-flex items-center gap-1 text-sm font-semibold tabular-nums">
          <Trophy className="h-3.5 w-3.5 text-amber-500" aria-hidden />
          {row.gamificationPoints}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-muted/30 px-2 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Abiertas</p>
          <p className="mt-0.5 text-sm font-semibold tabular-nums">{row.abiertas}</p>
        </div>
        <div className="rounded-lg bg-muted/30 px-2 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Retraso</p>
          <p className={cn('mt-0.5 text-sm font-semibold tabular-nums', row.retraso > 0 && 'text-orange-600')}>
            {row.retraso}
          </p>
        </div>
        <div className="rounded-lg bg-muted/30 px-2 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Bloq.</p>
          <p className={cn('mt-0.5 text-sm font-semibold tabular-nums', row.bloqueadas > 0 && 'text-destructive')}>
            {row.bloqueadas}
          </p>
        </div>
      </div>
    </article>
  )
}

export function DashboardUserActionsSummarySection({
  users,
  acciones,
  comentarios,
  today,
  areaFilter,
  isLoading,
}: DashboardUserActionsSummarySectionProps) {
  const [view, setView] = useState<SummaryView>('usuario')
  const [search, setSearch] = useState('')
  const [userSortKey, setUserSortKey] = useState<UserSummarySortKey>('abiertas')
  const [areaSortKey, setAreaSortKey] = useState<AreaSummarySortKey>('abiertas')
  const [sortDir, setSortDir] = useState<SummarySortDir>('desc')
  const { data: orgChartScores = [], isLoading: orgChartScoresLoading } = useQuery({
    queryKey: ['disciplina', 'org-chart-scores-visible'],
    queryFn: () => orgChartScoreService.listVisible(),
    staleTime: 30_000,
  })
  const { data: academyProgressCounts = [], isLoading: academyProgressLoading } = useQuery({
    queryKey: ['academy', 'progress-counts-visible'],
    queryFn: async (): Promise<AcademyProgressCountRow[]> => {
      const { data, error } = await supabase.rpc('academy_progress_counts_visible')
      if (error) {
        if (
          error.code === 'PGRST202' ||
          error.message?.toLowerCase().includes('academy_progress_counts_visible')
        ) {
          return []
        }
        throw error
      }
      return (data ?? []) as AcademyProgressCountRow[]
    },
    staleTime: 30_000,
  })
  const orgChartScoreMap = useMemo(
    () => new Map(orgChartScores.map((score) => [score.user_id, score])),
    [orgChartScores]
  )
  const academyProgressCountMap = useMemo(
    () => new Map(academyProgressCounts.map((row) => [row.user_id, Number(row.completed_count) || 0])),
    [academyProgressCounts]
  )

  const handleUserSort = (key: string) => {
    const nextKey = key as UserSummarySortKey
    if (userSortKey === nextKey) {
      setSortDir((current) => (current === 'asc' ? 'desc' : 'asc'))
      return
    }
    setUserSortKey(nextKey)
    setSortDir(nextKey === 'nombre' ? 'asc' : 'desc')
  }

  const handleAreaSort = (key: string) => {
    const nextKey = key as AreaSummarySortKey
    if (areaSortKey === nextKey) {
      setSortDir((current) => (current === 'asc' ? 'desc' : 'asc'))
      return
    }
    setAreaSortKey(nextKey)
    setSortDir(nextKey === 'area' ? 'asc' : 'desc')
  }

  const baseUserRows = useMemo(
    () =>
      buildUserActionsSummaryRows(
        users,
        acciones,
        comentarios,
        today,
        areaFilter,
        orgChartScoreMap,
        academyProgressCountMap
      ),
    [users, acciones, comentarios, today, areaFilter, orgChartScoreMap, academyProgressCountMap]
  )

  const userRows = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase()
    const filtered = normalizedSearch
      ? baseUserRows.filter(
          (row) =>
            row.nombre.toLowerCase().includes(normalizedSearch) ||
            row.area.toLowerCase().includes(normalizedSearch)
        )
      : baseUserRows

    return [...filtered].sort((a, b) => compareUserSummaryRows(a, b, userSortKey, sortDir))
  }, [baseUserRows, search, userSortKey, sortDir])

  const areaRows = useMemo(() => {
    const rows = buildAreaActionsSummaryRows(baseUserRows)
    const normalizedSearch = search.trim().toLowerCase()
    const filtered = normalizedSearch
      ? rows.filter((row) => row.area.toLowerCase().includes(normalizedSearch))
      : rows

    return filtered.sort((a, b) => compareAreaSummaryRows(a, b, areaSortKey, sortDir))
  }, [baseUserRows, search, areaSortKey, sortDir])

  const rows = view === 'usuario' ? userRows : areaRows
  const totals = useMemo(
    () =>
      view === 'usuario'
        ? summarizeUserActionsRows(userRows)
        : summarizeAreaActionsRows(areaRows),
    [areaRows, userRows, view]
  )

  const emptyMessage =
    areaFilter != null && areaFilter.trim() !== ''
      ? 'No hay usuarios con área asignada para el filtro activo.'
      : 'No hay usuarios con área asignada para mostrar.'

  const filteredEmptyMessage =
    search.trim() !== ''
      ? `Sin resultados para “${search.trim()}”.`
      : emptyMessage

  return (
    <section id="dashboard-user-actions-summary-section" className="scroll-mt-4">
      <SectionCard>
        <SectionCardHeader
          className="px-3 py-3 sm:px-4 sm:py-4 md:px-6"
          icon={UsersRound}
          eyebrow="Usuarios"
          title="Carga operativa por usuario"
          subtitle="Backlog abierto, retrasos, bloqueos y puntos de gamificación. Solo usuarios con área asignada."
          action={<SummaryViewToggle view={view} onViewChange={setView} />}
        />
        <SectionCardBody className="space-y-4 p-4 md:p-6">
          {isLoading || orgChartScoresLoading || academyProgressLoading ? (
            <DashboardUserActionsSkeleton columns={view === 'usuario' ? 5 : 6} />
          ) : baseUserRows.length === 0 ? (
            <div className="flex min-h-[180px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border/70 bg-muted/10 px-4 py-10 text-center">
              <UsersRound className="h-9 w-9 text-muted-foreground/40" aria-hidden />
              <p className="text-sm font-medium text-foreground">{emptyMessage}</p>
              <p className="max-w-md text-xs text-muted-foreground">
                Asigna área en Configuración → Usuarios para incluir personas en este resumen.
              </p>
            </div>
          ) : (
            <>
              <SummaryTotalsBar view={view} totals={totals} />

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-muted-foreground">
                  {view === 'usuario'
                    ? `${rows.length} usuario${rows.length !== 1 ? 's' : ''} visible${rows.length !== 1 ? 's' : ''}`
                    : `${rows.length} área${rows.length !== 1 ? 's' : ''} visible${rows.length !== 1 ? 's' : ''}`}
                  {search.trim() ? ` · filtro “${search.trim()}”` : null}
                </p>
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={view === 'usuario' ? 'Buscar usuario o área…' : 'Buscar área…'}
                  className="h-9 max-w-xs bg-background"
                  aria-label={view === 'usuario' ? 'Buscar usuario o área' : 'Buscar área'}
                />
              </div>

              {rows.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border/70 bg-muted/10 px-4 py-8 text-center text-sm text-muted-foreground">
                  {filteredEmptyMessage}
                </div>
              ) : view === 'usuario' ? (
                <>
                  <div className="grid gap-3 md:hidden">
                    {userRows.map((row) => (
                      <UserMobileCard key={row.userId} row={row} />
                    ))}
                  </div>

                  <div className="hidden overflow-x-auto rounded-xl border border-border/60 md:block">
                    <table className="w-full min-w-[720px] text-sm">
                      <thead>
                        <tr className="border-b border-border/50 bg-muted/30 text-left text-muted-foreground">
                          <SortableHead
                            label="Usuario"
                            sortKey="nombre"
                            activeKey={userSortKey}
                            sortDir={sortDir}
                            onSort={handleUserSort}
                            align="left"
                            className="md:px-6"
                          />
                          <SortableHead
                            label="Abiertas"
                            sortKey="abiertas"
                            activeKey={userSortKey}
                            sortDir={sortDir}
                            onSort={handleUserSort}
                          />
                          <SortableHead
                            label="Retraso"
                            sortKey="retraso"
                            activeKey={userSortKey}
                            sortDir={sortDir}
                            onSort={handleUserSort}
                          />
                          <SortableHead
                            label="Bloqueadas"
                            sortKey="bloqueadas"
                            activeKey={userSortKey}
                            sortDir={sortDir}
                            onSort={handleUserSort}
                          />
                          <SortableHead
                            label="Puntos"
                            sortKey="gamificationPoints"
                            activeKey={userSortKey}
                            sortDir={sortDir}
                            onSort={handleUserSort}
                            className="md:px-6"
                          />
                        </tr>
                      </thead>
                      <tbody>
                        {userRows.map((row) => {
                          const isCritical = row.retraso > 0 || row.bloqueadas > 0
                          return (
                            <tr
                              key={row.userId}
                              className={cn(
                                'group border-b border-border/35 transition-colors last:border-b-0 hover:bg-muted/25',
                                isCritical && 'bg-orange-50/30 dark:bg-orange-950/10'
                              )}
                            >
                              <td className="px-4 py-3 align-middle md:px-6">
                                <div className="flex min-w-0 items-center gap-3">
                                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary ring-1 ring-primary/15">
                                    {initialsFromDisplayName(row.nombre)}
                                  </div>
                                  <div className="min-w-0">
                                    <p className="truncate font-medium text-foreground transition-colors group-hover:text-primary">
                                      {row.nombre}
                                    </p>
                                    <p className="mt-0.5 truncate text-xs text-muted-foreground">{row.area}</p>
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-right align-middle">
                                <MetricCell value={row.abiertas} />
                              </td>
                              <td className="px-4 py-3 text-right align-middle">
                                <MetricCell value={row.retraso} tone="warning" />
                              </td>
                              <td className="px-4 py-3 text-right align-middle">
                                <MetricCell value={row.bloqueadas} tone="danger" />
                              </td>
                              <td className="px-4 py-3 text-right align-middle md:px-6">
                                <span
                                  className={cn(
                                    'inline-flex items-center justify-end gap-1.5 font-semibold tabular-nums',
                                    row.gamificationPoints < 0 ? 'text-destructive' : 'text-foreground'
                                  )}
                                >
                                  <Trophy className="h-3.5 w-3.5 text-amber-500" aria-hidden />
                                  {row.gamificationPoints}
                                </span>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <>
                  <div className="grid gap-3 md:hidden">
                    {areaRows.map((row) => (
                      <AreaMobileCard key={row.area} row={row} />
                    ))}
                  </div>

                  <div className="hidden overflow-x-auto rounded-xl border border-border/60 md:block">
                    <table className="w-full min-w-[760px] text-sm">
                      <thead>
                        <tr className="border-b border-border/50 bg-muted/30 text-left text-muted-foreground">
                          <SortableHead
                            label="Área"
                            sortKey="area"
                            activeKey={areaSortKey}
                            sortDir={sortDir}
                            onSort={handleAreaSort}
                            align="left"
                            className="md:px-6"
                          />
                          <SortableHead
                            label="Usuarios"
                            sortKey="usuarios"
                            activeKey={areaSortKey}
                            sortDir={sortDir}
                            onSort={handleAreaSort}
                          />
                          <SortableHead
                            label="Abiertas"
                            sortKey="abiertas"
                            activeKey={areaSortKey}
                            sortDir={sortDir}
                            onSort={handleAreaSort}
                          />
                          <SortableHead
                            label="Retraso"
                            sortKey="retraso"
                            activeKey={areaSortKey}
                            sortDir={sortDir}
                            onSort={handleAreaSort}
                          />
                          <SortableHead
                            label="Bloqueadas"
                            sortKey="bloqueadas"
                            activeKey={areaSortKey}
                            sortDir={sortDir}
                            onSort={handleAreaSort}
                          />
                          <SortableHead
                            label="Puntos"
                            sortKey="gamificationPoints"
                            activeKey={areaSortKey}
                            sortDir={sortDir}
                            onSort={handleAreaSort}
                            className="md:px-6"
                          />
                        </tr>
                      </thead>
                      <tbody>
                        {areaRows.map((row) => {
                          const isCritical = row.retraso > 0 || row.bloqueadas > 0
                          return (
                            <tr
                              key={row.area}
                              className={cn(
                                'group border-b border-border/35 transition-colors last:border-b-0 hover:bg-muted/25',
                                isCritical && 'bg-orange-50/30 dark:bg-orange-950/10'
                              )}
                            >
                              <td className="px-4 py-3 align-middle md:px-6">
                                <div className="flex min-w-0 items-center gap-3">
                                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary ring-1 ring-primary/15">
                                    <Building2 className="h-4 w-4" aria-hidden />
                                  </div>
                                  <p className="truncate font-medium text-foreground transition-colors group-hover:text-primary">
                                    {row.area}
                                  </p>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-right align-middle">
                                <MetricCell value={row.usuarios} />
                              </td>
                              <td className="px-4 py-3 text-right align-middle">
                                <MetricCell value={row.abiertas} />
                              </td>
                              <td className="px-4 py-3 text-right align-middle">
                                <MetricCell value={row.retraso} tone="warning" />
                              </td>
                              <td className="px-4 py-3 text-right align-middle">
                                <MetricCell value={row.bloqueadas} tone="danger" />
                              </td>
                              <td className="px-4 py-3 text-right align-middle md:px-6">
                                <span
                                  className={cn(
                                    'inline-flex items-center justify-end gap-1.5 font-semibold tabular-nums',
                                    row.gamificationPoints < 0 ? 'text-destructive' : 'text-foreground'
                                  )}
                                >
                                  <Trophy className="h-3.5 w-3.5 text-amber-500" aria-hidden />
                                  {row.gamificationPoints}
                                </span>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              <p className="text-[11px] leading-relaxed text-muted-foreground">
                Abiertas: acciones no cerradas asignadas al usuario. Retraso: estado Retraso o fuera de fecha
                compromiso. Bloqueadas: estado Bloqueado. Puntos: gamificación personal del periodo, academia y
                perfil organizacional.
              </p>
            </>
          )}
        </SectionCardBody>
      </SectionCard>
    </section>
  )
}
