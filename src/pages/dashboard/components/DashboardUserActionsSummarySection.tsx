import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown, Building2, Trophy, UserRound, UsersRound } from 'lucide-react'
import { SectionCard, SectionCardBody, SectionCardHeader } from '@/components/SectionCard'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { AccionDiaria } from '@/types'
import type { AccionComentario } from '@/types/accionComentario'
import type { UserProfile } from '@/features/users/types/user.types'
import {
  buildAreaActionsSummaryRows,
  buildUserActionsSummaryRows,
  compareAreaSummaryRows,
  compareUserSummaryRows,
  type AreaSummarySortKey,
  type SummarySortDir,
  type UserSummarySortKey,
} from '../utils/dashboardUserActionsSummary'

type SummaryView = 'usuario' | 'area'

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
    <th className={cn('px-4 py-3 font-semibold', className)}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          'inline-flex w-full items-center gap-1.5 rounded-md text-xs font-semibold transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
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
    <div className="space-y-0" aria-busy="true" aria-label="Cargando resumen operativo">
      {[1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="grid gap-3 border-b border-border/35 py-3 last:border-b-0"
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
    <Badge variant="secondary" className="justify-center tabular-nums">
      {value}
    </Badge>
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
        Por area
      </Button>
    </div>
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
  const [userSortKey, setUserSortKey] = useState<UserSummarySortKey>('abiertas')
  const [areaSortKey, setAreaSortKey] = useState<AreaSummarySortKey>('abiertas')
  const [sortDir, setSortDir] = useState<SummarySortDir>('desc')

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
    () => buildUserActionsSummaryRows(users, acciones, comentarios, today, areaFilter),
    [users, acciones, comentarios, today, areaFilter]
  )

  const userRows = useMemo(
    () => [...baseUserRows].sort((a, b) => compareUserSummaryRows(a, b, userSortKey, sortDir)),
    [baseUserRows, userSortKey, sortDir]
  )

  const areaRows = useMemo(() => {
    const rows = buildAreaActionsSummaryRows(baseUserRows)
    return rows.sort((a, b) => compareAreaSummaryRows(a, b, areaSortKey, sortDir))
  }, [baseUserRows, areaSortKey, sortDir])

  const rows = view === 'usuario' ? userRows : areaRows
  const emptyMessage =
    areaFilter != null && areaFilter.trim() !== ''
      ? 'No hay usuarios con area asignada para el filtro de area activo.'
      : 'No hay usuarios con area asignada para mostrar.'

  return (
    <section id="dashboard-user-actions-summary-section" className="scroll-mt-4">
      <SectionCard>
        <SectionCardHeader
          className="px-3 py-3 sm:px-4 sm:py-4 md:px-6"
          icon={UsersRound}
          eyebrow="Usuarios"
          title="Carga operativa por usuario"
          subtitle="Acciones abiertas, retrasos, bloqueos y total de puntos de gamificacion segun filtros activos. Solo usuarios con area asignada."
          action={<SummaryViewToggle view={view} onViewChange={setView} />}
        />
        <SectionCardBody className="p-0">
          {isLoading ? (
            <div className="p-4 md:p-6">
              <DashboardUserActionsSkeleton columns={view === 'usuario' ? 5 : 6} />
            </div>
          ) : rows.length === 0 ? (
            <div className="flex min-h-[180px] flex-col items-center justify-center gap-2 px-4 py-10 text-center">
              <UsersRound className="h-9 w-9 text-muted-foreground/40" aria-hidden />
              <p className="text-sm font-medium text-foreground">{emptyMessage}</p>
            </div>
          ) : view === 'usuario' ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-border/50 bg-muted/30 text-left text-xs font-semibold text-muted-foreground">
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
                      label="Acciones abiertas"
                      sortKey="abiertas"
                      activeKey={userSortKey}
                      sortDir={sortDir}
                      onSort={handleUserSort}
                    />
                    <SortableHead
                      label="En retraso"
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
                      label="Puntos de gamificacion"
                      sortKey="gamificationPoints"
                      activeKey={userSortKey}
                      sortDir={sortDir}
                      onSort={handleUserSort}
                      className="md:px-6"
                    />
                  </tr>
                </thead>
                <tbody>
                  {userRows.map((row) => (
                    <tr
                      key={row.userId}
                      className="group border-b border-border/35 transition-colors last:border-b-0 hover:bg-muted/25"
                    >
                      <td className="px-4 py-3 align-middle md:px-6">
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary ring-1 ring-primary/15">
                            {row.nombre.slice(0, 2).toLocaleUpperCase('es')}
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
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b border-border/50 bg-muted/30 text-left text-xs font-semibold text-muted-foreground">
                    <SortableHead
                      label="Area"
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
                      label="Acciones abiertas"
                      sortKey="abiertas"
                      activeKey={areaSortKey}
                      sortDir={sortDir}
                      onSort={handleAreaSort}
                    />
                    <SortableHead
                      label="En retraso"
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
                      label="Puntos de gamificacion"
                      sortKey="gamificationPoints"
                      activeKey={areaSortKey}
                      sortDir={sortDir}
                      onSort={handleAreaSort}
                      className="md:px-6"
                    />
                  </tr>
                </thead>
                <tbody>
                  {areaRows.map((row) => (
                    <tr
                      key={row.area}
                      className="group border-b border-border/35 transition-colors last:border-b-0 hover:bg-muted/25"
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
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCardBody>
      </SectionCard>
    </section>
  )
}
