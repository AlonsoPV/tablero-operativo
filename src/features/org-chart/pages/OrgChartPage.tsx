import { useMemo, useState } from 'react'
import { SettingsPageHeader } from '@/components/layout/SettingsPageHeader'
import { useAcciones } from '@/features/operations/hooks/useAcciones'
import { useCurrentUser } from '@/features/users/hooks/useCurrentUser'
import { useAppRole } from '@/features/auth/hooks/useAppRole'
import { canEditOrgHierarchyByRole } from '@/features/auth/lib/permissions'
import { OrgChartFiltersBar } from '../components/OrgChartFiltersBar'
import { OrgChartTree } from '../components/OrgChartTree'
import { OrgChartUserSlidePanel } from '../components/OrgChartUserSlidePanel'
import { useOrgChart } from '../hooks/useOrgChart'
import type { OrgChartFilters } from '../types/orgChart.types'
import { buildOrgChartForest, summarizeUserActions } from '../utils/orgHierarchy'

export function OrgChartPage() {
  const { data: currentUser } = useCurrentUser()
  const { data: appRole } = useAppRole()
  const { data: users = [], isLoading, isError, error } = useOrgChart()
  const { data: acciones = [] } = useAcciones({ excluir_estados: ['Verificado', 'Hecho'] })
  const [filters, setFilters] = useState<OrgChartFilters>({ soloActivos: true })
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const canEditHierarchy = canEditOrgHierarchyByRole(currentUser?.rol, appRole)

  const areas = useMemo(
    () =>
      [...new Set(users.map((user) => user.area).filter((area): area is string => Boolean(area?.trim())))].sort(
        (a, b) => a.localeCompare(b, 'es')
      ),
    [users]
  )

  const roles = useMemo(
    () => [...new Set(users.map((user) => user.rol))].sort((a, b) => a.localeCompare(b, 'es')),
    [users]
  )

  const forest = useMemo(() => buildOrgChartForest(users, filters), [filters, users])
  const selectedUser = users.find((user) => user.id === selectedId) ?? null
  const actionStats = selectedUser ? summarizeUserActions(selectedUser.id, acciones) : null

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-7rem)] w-full max-w-[100rem] flex-col gap-4 sm:gap-5">
      <SettingsPageHeader
        title="Organigrama"
        description="Visualiza la estructura jerárquica. Selecciona un usuario para ver su ficha y editar su jefe directo."
        className="shrink-0"
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
            <div className="shrink-0 border-b border-border/60 px-4 py-2.5 sm:px-5">
              <p className="text-sm font-medium text-foreground">Estructura jerárquica</p>
              <p className="text-xs text-muted-foreground">
                Dirección a la izquierda, equipos hacia la derecha. Haz clic en un usuario para abrir su ficha.
              </p>
            </div>

            <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-6 lg:p-8">
              <OrgChartTree
                roots={forest}
                selectedId={selectedId}
                onSelect={(id) => setSelectedId((current) => (current === id ? null : id))}
              />
            </div>
          </div>

          <OrgChartUserSlidePanel
            open={Boolean(selectedUser && actionStats)}
            user={selectedUser}
            users={users}
            actionStats={actionStats}
            canEditHierarchy={canEditHierarchy}
            currentUserId={currentUser?.id}
            onClose={() => setSelectedId(null)}
          />
        </>
      )}
    </div>
  )
}
