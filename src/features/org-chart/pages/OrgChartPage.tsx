import { useMemo, useState } from 'react'
import { Check, LayoutGrid, List } from 'lucide-react'
import { SettingsPageHeader } from '@/components/layout/SettingsPageHeader'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useAcciones } from '@/features/operations/hooks/useAcciones'
import { useCurrentUser } from '@/features/users/hooks/useCurrentUser'
import { useAppRole } from '@/features/auth/hooks/useAppRole'
import { canEditOrgHierarchyByRole, canEditOrgUserHierarchy } from '@/features/auth/lib/permissions'
import { cn } from '@/lib/utils'
import { OrgChartFiltersBar } from '../components/OrgChartFiltersBar'
import { OrgChartList } from '../components/OrgChartList'
import { OrgChartTree } from '../components/OrgChartTree'
import { OrgChartUserSlidePanel } from '../components/OrgChartUserSlidePanel'
import { useOrgChart } from '../hooks/useOrgChart'
import type { OrgChartFilters } from '../types/orgChart.types'
import {
  buildOrgChartForest,
  flattenOrgChartForest,
  summarizeUserActions,
} from '../utils/orgHierarchy'

type OrgChartViewMode = 'arbol' | 'lista'

const VIEW_LABELS: Record<OrgChartViewMode, string> = {
  arbol: 'Árbol',
  lista: 'Lista',
}

export function OrgChartPage() {
  const { data: currentUser } = useCurrentUser()
  const { data: appRole } = useAppRole()
  const { data: users = [], isLoading, isError, error } = useOrgChart()
  const { data: acciones = [] } = useAcciones({ excluir_estados: ['Verificado', 'Hecho'] })
  const [filters, setFilters] = useState<OrgChartFilters>({ soloActivos: true })
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<OrgChartViewMode>('arbol')

  const canEditAnyone = canEditOrgHierarchyByRole(
    currentUser?.rol,
    appRole,
    currentUser?.area,
    currentUser?.areas
  )
  const canEditSelected = canEditOrgUserHierarchy({
    actorUserId: currentUser?.id,
    targetUserId: selectedId,
    rol: currentUser?.rol,
    appRole,
    area: currentUser?.area,
    areas: currentUser?.areas,
  })

  const areas = useMemo(() => {
    const names = new Set<string>()
    users.forEach((user) => {
      if (user.area?.trim()) names.add(user.area.trim())
      ;(user.areas ?? []).forEach((area) => {
        if (area.trim()) names.add(area.trim())
      })
    })
    return [...names].sort((a, b) => a.localeCompare(b, 'es'))
  }, [users])

  const roles = useMemo(
    () => [...new Set(users.map((user) => user.rol))].sort((a, b) => a.localeCompare(b, 'es')),
    [users]
  )

  const forest = useMemo(() => buildOrgChartForest(users, filters), [filters, users])
  const listRows = useMemo(() => flattenOrgChartForest(forest, users), [forest, users])
  const selectedUser = users.find((user) => user.id === selectedId) ?? null
  const actionStats = selectedUser ? summarizeUserActions(selectedUser.id, acciones) : null

  const handleSelect = (id: string) => {
    setSelectedId((current) => (current === id ? null : id))
  }

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-7rem)] w-full max-w-[100rem] flex-col gap-4 sm:gap-5">
      <SettingsPageHeader
        title="Organigrama"
        description="Todos pueden consultar la estructura. Cada persona edita solo su jerarquía; RH puede editar la de cualquiera."
        className="shrink-0"
        action={
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 gap-2 border-border/70 bg-card shadow-sm"
              >
                {viewMode === 'arbol' ? (
                  <LayoutGrid className="h-4 w-4" aria-hidden />
                ) : (
                  <List className="h-4 w-4" aria-hidden />
                )}
                Vista: {VIEW_LABELS[viewMode]}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[160px]">
              <DropdownMenuItem
                onClick={() => setViewMode('arbol')}
                className="flex items-center justify-between gap-3"
              >
                <span className="flex items-center gap-2">
                  <LayoutGrid className="h-4 w-4" />
                  {VIEW_LABELS.arbol}
                </span>
                {viewMode === 'arbol' ? <Check className="h-4 w-4 text-primary" /> : null}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setViewMode('lista')}
                className="flex items-center justify-between gap-3"
              >
                <span className="flex items-center gap-2">
                  <List className="h-4 w-4" />
                  {VIEW_LABELS.lista}
                </span>
                {viewMode === 'lista' ? <Check className="h-4 w-4 text-primary" /> : null}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        }
      />

      {isLoading ? (
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          Cargando organigrama...
        </div>
      ) : isError ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          {error instanceof Error ? error.message : 'No se pudo cargar el organigrama.'}
        </div>
      ) : (
        <>
          <OrgChartFiltersBar
            filters={filters}
            users={users}
            areas={areas}
            roles={roles}
            onChange={setFilters}
          />

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border/70 bg-gradient-to-br from-muted/15 via-background to-muted/10 shadow-sm">
            <div className="flex shrink-0 flex-wrap items-start justify-between gap-3 border-b border-border/60 px-4 py-2.5 sm:px-5">
              <div>
                <p className="text-sm font-medium text-foreground">
                  {viewMode === 'arbol' ? 'Estructura jerárquica' : 'Lista jerárquica'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {viewMode === 'arbol'
                    ? 'Dirección a la izquierda, equipos hacia la derecha. Haz clic en un usuario para abrir su ficha.'
                    : 'Filas compactas: Reporta a y Supervisa a van colapsados. Expándelos o haz clic en la persona para abrir su ficha.'}
                </p>
              </div>
              <p className="text-xs tabular-nums text-muted-foreground">
                {listRows.length} persona{listRows.length === 1 ? '' : 's'}
              </p>
            </div>

            <div
              className={cn(
                'min-h-0 flex-1 overflow-auto',
                viewMode === 'arbol' ? 'p-4 sm:p-6 lg:p-8' : 'p-0'
              )}
            >
              {viewMode === 'arbol' ? (
                <OrgChartTree roots={forest} selectedId={selectedId} onSelect={handleSelect} />
              ) : (
                <OrgChartList rows={listRows} selectedId={selectedId} onSelect={handleSelect} />
              )}
            </div>
          </div>

          <OrgChartUserSlidePanel
            open={Boolean(selectedUser && actionStats)}
            user={selectedUser}
            users={users}
            actionStats={actionStats}
            canEditHierarchy={canEditSelected}
            canOpenUserAdmin={canEditAnyone}
            currentUserId={currentUser?.id}
            onClose={() => setSelectedId(null)}
          />
        </>
      )}
    </div>
  )
}
