/**
 * Dashboard ejecutivo: salud del portafolio, KPIs, cadena, prioridad, pulso por filtros y acciones del día.
 */

import { useMemo, useState, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  useAcciones,
  useCommentCounts,
  useChecklistProgressByAccionIds,
  AccionFormDialog,
  KanbanToolbar,
  hasKanbanActiveFilters,
} from '@/features/operations'
import { useUsers } from '@/features/users/hooks/useUsers'
import { useCurrentUser } from '@/features/users/hooks/useCurrentUser'
import { usesOperationalDashboardByRole } from '@/features/auth/lib/permissions'
import { usePriorities } from '@/features/catalogs/hooks/usePriorities'
import { useStatuses } from '@/features/catalogs/hooks/useStatuses'
import type { AccionDiaria } from '@/types'
import type { AccionesFilter } from '@/services/acciones.service'
import {
  dropdownOptionsByCatalogKeyQueryKey,
  fetchDropdownOptionsByCatalogKey,
} from '@/features/catalogs/hooks/useDropdownOptions'
import { DashboardHeader } from './components/DashboardHeader'
import { DashboardActionsSection } from './components/DashboardActionsSection'
import { DashboardUserActionsSummarySection } from './components/DashboardUserActionsSummarySection'
import { DashboardUserLoginChartSection } from './components/DashboardUserLoginChartSection'
import { DashboardRedUploadsByWeekSection } from './components/DashboardRedUploadsByWeekSection'
import { DashboardFechaCompromisoChangesSection } from './components/DashboardFechaCompromisoChangesSection'
import { DashboardExecutivePanel } from './components/DashboardExecutivePanel'
import { useOperationalDashboardMetrics } from './hooks/useOperationalDashboardMetrics'
import { SectionCard, SectionCardBody, SectionCardHeader } from '@/components/SectionCard'
import { todayWallClockCDMX } from '@/lib/dateUtils'
import { accionComentariosService } from '@/services/accionComentarios.service'

const DEFAULT_FILTER: AccionesFilter = {}
const DEFAULT_TREND_DAYS = 30

type Period = { start: string; end: string }

function addDays(ymd: string, days: number): string {
  const date = new Date(`${ymd}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function diffDaysInclusive(start: string, end: string): number {
  const startMs = Date.parse(`${start}T00:00:00Z`)
  const endMs = Date.parse(`${end}T00:00:00Z`)
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) return DEFAULT_TREND_DAYS
  return Math.max(1, Math.round((endMs - startMs) / 86_400_000) + 1)
}

function currentPeriodFromFilter(filter: AccionesFilter, today: string): Period {
  if (filter.fecha) return { start: filter.fecha, end: filter.fecha }
  if (filter.fecha_min && filter.fecha_max) return { start: filter.fecha_min, end: filter.fecha_max }
  if (filter.fecha_min) return { start: filter.fecha_min, end: addDays(filter.fecha_min, DEFAULT_TREND_DAYS - 1) }
  if (filter.fecha_max) return { start: addDays(filter.fecha_max, -(DEFAULT_TREND_DAYS - 1)), end: filter.fecha_max }
  return { start: addDays(today, -(DEFAULT_TREND_DAYS - 1)), end: today }
}

function previousFilterFromPeriod(filter: AccionesFilter, period: Period): AccionesFilter {
  const days = diffDaysInclusive(period.start, period.end)
  const previousEnd = addDays(period.start, -1)
  const previousStart = addDays(previousEnd, -(days - 1))
  const next: AccionesFilter = { ...filter }
  delete next.fecha
  delete next.fecha_min
  delete next.fecha_max
  return { ...next, fecha_min: previousStart, fecha_max: previousEnd }
}

export function DashboardPage() {
  const qc = useQueryClient()
  const today = todayWallClockCDMX()
  const { data: currentUser } = useCurrentUser()
  const usesOperationalDashboard = usesOperationalDashboardByRole(currentUser?.rol)
  const prefetchEvidenceCatalog = useCallback(async () => {
    await qc.prefetchQuery({
      queryKey: dropdownOptionsByCatalogKeyQueryKey('evidencia_esperada'),
      queryFn: () => fetchDropdownOptionsByCatalogKey('evidencia_esperada'),
      staleTime: 10 * 60_000,
    })
  }, [qc])

  const [filter, setFilter] = useState<AccionesFilter>(() => ({
    ...DEFAULT_FILTER,
  }))
  const [filtersExpanded, setFiltersExpanded] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingAccion, setEditingAccion] = useState<AccionDiaria | null>(null)
  const [drillDown, setDrillDown] = useState<{ title: string; acciones: AccionDiaria[] } | null>(null)

  const filterForQuery = useMemo(() => ({ ...filter }), [filter])
  const currentPeriod = useMemo(() => currentPeriodFromFilter(filterForQuery, today), [filterForQuery, today])
  const gamificationHistoryStart = useMemo(() => addDays(today, -90), [today])
  const redUploadsHistoryStart = useMemo(() => addDays(today, -(7 * 8 - 1)), [today])
  const previousFilterForQuery = useMemo(
    () => previousFilterFromPeriod(filterForQuery, currentPeriod),
    [currentPeriod, filterForQuery]
  )
  const {
    data: acciones = [],
    isLoading,
    isError: accionesError,
    error: accionesErrorObj,
    refetch: retryAcciones,
  } = useAcciones(filterForQuery)
  const { data: previousAcciones = [], isLoading: previousAccionesLoading } = useAcciones(previousFilterForQuery)
  const { data: gamificationAcciones = [], isLoading: gamificationAccionesLoading } = useAcciones({
    fecha_min: gamificationHistoryStart,
  })
  const redUploadsFilter = useMemo(
    (): AccionesFilter => ({
      created_at_min: redUploadsHistoryStart,
      ...(filter.area ? { area: filter.area } : {}),
      ...(filter.responsable ? { responsable: filter.responsable } : {}),
      ...(filter.created_by ? { created_by: filter.created_by } : {}),
    }),
    [filter.area, filter.created_by, filter.responsable, redUploadsHistoryStart]
  )
  const {
    data: redUploadAcciones = [],
    isLoading: redUploadAccionesLoading,
  } = useAcciones(redUploadsFilter)
  const accionIds = useMemo(() => acciones.map((a) => a.id), [acciones])
  const gamificationAccionIds = useMemo(
    () => gamificationAcciones.map((accion) => accion.id),
    [gamificationAcciones]
  )
  const { data: commentCounts = {} } = useCommentCounts(accionIds)
  const { data: checklistProgressByAccionId = {} } = useChecklistProgressByAccionIds(accionIds)
  const { data: accionComentarios = [], isLoading: comentariosLoading } = useQuery({
    queryKey: ['dashboard', 'accion-comentarios', accionIds],
    queryFn: () => accionComentariosService.listByAccionIds(accionIds),
    enabled: accionIds.length > 0,
    staleTime: 5 * 60_000,
    retry: 1,
  })
  const { data: gamificationComentarios = [], isLoading: gamificationComentariosLoading } = useQuery({
    queryKey: ['dashboard', 'gamification-comentarios', gamificationAccionIds],
    queryFn: () => accionComentariosService.listByAccionIds(gamificationAccionIds),
    enabled: gamificationAccionIds.length > 0,
    staleTime: 5 * 60_000,
    retry: 1,
  })
  const { data: users = [] } = useUsers({ activo: true })
  const { data: priorities = [] } = usePriorities({ activo: true })
  const { data: statuses = [] } = useStatuses()

  const executiveMetrics = useOperationalDashboardMetrics({
    actions: acciones,
    previousActions: previousAcciones,
    users,
    priorities,
    statuses,
    today,
    currentPeriod,
  })

  const responsableNames = useMemo(() => {
    const map: Record<string, string> = {}
    users.forEach((u) => {
      map[u.id] = u.nombre
    })
    return map
  }, [users])

  const advancedFiltersActive = useMemo(() => hasKanbanActiveFilters(filter), [filter])

  const handleFilterChange = useCallback((next: AccionesFilter | Partial<AccionesFilter>) => {
    setDrillDown(null)
    setFilter((prev) => {
      const merged: AccionesFilter = { ...prev, ...next }
      return merged
    })
  }, [])

  const handleClearFilters = useCallback(() => {
    setDrillDown(null)
    setFilter({ ...DEFAULT_FILTER })
  }, [])

  const handleDrillDown = useCallback((input: { title: string; actions: AccionDiaria[] }) => {
    setDrillDown({ title: input.title, acciones: input.actions })
    window.requestAnimationFrame(() => {
      document.getElementById('dashboard-section-actions')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }, [])

  const handleCreate = useCallback(() => {
    void prefetchEvidenceCatalog()
    setEditingAccion(null)
    setDialogOpen(true)
  }, [prefetchEvidenceCatalog])

  const handleSelectAccion = useCallback((accion: AccionDiaria) => {
    void prefetchEvidenceCatalog()
    setEditingAccion(accion)
    setDialogOpen(true)
  }, [prefetchEvidenceCatalog])

  const handleDialogSuccess = useCallback(() => {
    setEditingAccion(null)
  }, [])

  return (
    <div id="dashboard-page" className="dashboard-page min-h-0">
      <div className="mx-auto w-full max-w-7xl space-y-6 overflow-x-hidden px-3 py-5 sm:space-y-8 sm:px-6 sm:py-6">
        <section
          className="dashboard-control-center relative z-20 overflow-visible rounded-2xl border border-border/60 bg-gradient-to-br from-card via-card to-muted/25 p-5 shadow-sm sm:p-6"
          aria-labelledby="dashboard-title"
        >
          <DashboardHeader
            filtersExpanded={filtersExpanded}
            advancedFiltersActive={advancedFiltersActive}
            eyebrow={usesOperationalDashboard ? 'Tablero operativo' : 'Tablero ejecutivo'}
            onToggleFilters={() => setFiltersExpanded((v) => !v)}
            filtersPanel={
              <KanbanToolbar
                filter={filter}
                onFilterChange={handleFilterChange}
                onClear={handleClearFilters}
                layout="dashboard"
                advancedExpanded
              />
            }
          />
        </section>

        <section
          id="dashboard-section-metrics"
          className="dashboard-section-metrics scroll-mt-4"
        >
          <DashboardExecutivePanel
            metrics={executiveMetrics}
            priorities={priorities}
            isLoading={isLoading || previousAccionesLoading}
            onDrillDown={handleDrillDown}
          />
        </section>

        {false ? (
        <section
            id="dashboard-section-metrics"
            className="dashboard-section-metrics scroll-mt-4"
          >
            <DashboardExecutivePanel
              metrics={executiveMetrics}
              isLoading={isLoading || previousAccionesLoading}
              onDrillDown={handleDrillDown}
            />
            {false && false ? (
            <SectionCard>
              <SectionCardHeader
                className="px-3 py-3 sm:px-4 sm:py-4 md:px-6"
                eyebrow="Pulso"
                title="Resumen de acciones"
                subtitle="Totales según filtros activos."
              />
              <SectionCardBody className="p-3 sm:p-4 md:p-6">
                {null}
              </SectionCardBody>
            </SectionCard>
            ) : null}
          </section>
        ) : null}

        {!accionesError ? (
          <DashboardUserActionsSummarySection
            users={users}
            acciones={acciones}
            comentarios={accionComentarios}
            gamificationAcciones={gamificationAcciones}
            gamificationComentarios={gamificationComentarios}
            today={today}
            areaFilter={filter.area}
            isLoading={isLoading || comentariosLoading}
            isGamificationLoading={gamificationAccionesLoading || gamificationComentariosLoading}
          />
        ) : null}

        <div id="dashboard-section-actions" className="dashboard-section-actions min-w-0 w-full scroll-mt-4">
          {accionesError ? (
            <SectionCard>
              <SectionCardHeader
                eyebrow="Acciones"
                title="No se pudieron cargar las acciones"
                subtitle={
                  accionesErrorObj instanceof Error
                    ? accionesErrorObj.message
                    : 'Revisa tu conexion o permisos e intenta nuevamente.'
                }
                action={
                  <button
                    type="button"
                    onClick={() => void retryAcciones()}
                    className="rounded-md border border-border bg-background px-3 py-2 text-sm font-medium hover:bg-muted"
                  >
                    Reintentar
                  </button>
                }
              />
            </SectionCard>
          ) : (
            <DashboardActionsSection
              acciones={drillDown?.acciones ?? acciones}
              isLoading={isLoading}
              commentCounts={commentCounts}
              responsableNames={responsableNames}
              checklistProgressByAccionId={checklistProgressByAccionId}
              onSelectAccion={handleSelectAccion}
              onNewAction={handleCreate}
              fechaResumen={filter.fecha_max ?? filter.fecha_min ?? today}
              title={drillDown ? `Detalle: ${drillDown.title}` : undefined}
              eyebrow={drillDown ? 'Drill-down' : undefined}
              subtitle={
                drillDown
                  ? `${drillDown.acciones.length} accion${drillDown.acciones.length !== 1 ? 'es' : ''} relacionadas con ${drillDown.title}.`
                  : undefined
              }
              onClearDrillDown={drillDown ? () => setDrillDown(null) : undefined}
            />
          )}
        </div>

        <DashboardUserLoginChartSection />

        <DashboardRedUploadsByWeekSection
          actions={redUploadAcciones}
          users={users}
          priorities={priorities}
          today={today}
          isLoading={redUploadAccionesLoading}
          onDrillDown={handleDrillDown}
        />

        <DashboardFechaCompromisoChangesSection />

        {false ? (
        <section
          id="dashboard-section-metrics"
          className="dashboard-section-metrics scroll-mt-4 border-t border-border/40 pt-4 sm:pt-6"
        >
          <SectionCard>
            <SectionCardHeader
              className="px-3 py-3 sm:px-4 sm:py-4 md:px-6"
              eyebrow="Pulso"
              title="Resumen de acciones"
              subtitle="Totales según filtros activos."
            />
            <SectionCardBody className="p-3 sm:p-4 md:p-6">
              {null}
            </SectionCardBody>
          </SectionCard>
        </section>
        ) : null}
      </div>

      <AccionFormDialog
        dialogId="dashboard-accion-dialog"
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        accion={editingAccion}
        defaultFecha={filter.fecha_max ?? filter.fecha_min ?? today}
        onSuccess={handleDialogSuccess}
        responsableNames={responsableNames}
      />
    </div>
  )
}
