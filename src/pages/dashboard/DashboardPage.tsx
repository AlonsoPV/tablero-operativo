/**
 * Dashboard Ejecutivo — rediseño tipo SaaS. Header, KPIs, filtros, control de acciones, semáforo.
 */

import { useMemo, useState, useCallback } from 'react'
import {
  useAcciones,
  useCommentCounts,
  AccionFormDialog,
  KanbanToolbar,
  metricasFromAcciones,
} from '@/features/operations'
import { KPISemaforoGrid } from '@/features/metrics'
import { useUsers } from '@/features/users/hooks/useUsers'
import type { AccionDiaria } from '@/types'
import type { AccionesFilter } from '@/services/acciones.service'
import { DashboardHeader } from './components/DashboardHeader'
import { DashboardKpiCards } from './components/DashboardKpiCards'
import { DashboardActionsSection } from './components/DashboardActionsSection'
import { Activity } from 'lucide-react'
import { todayCDMX } from '@/lib/dateUtils'

const DEFAULT_FILTER: AccionesFilter = {}

export function DashboardPage() {
  const today = todayCDMX()
  const [filter, setFilter] = useState<AccionesFilter>(() => ({
    ...DEFAULT_FILTER,
    fecha_creacion: today,
  }))
  const [filtersExpanded, setFiltersExpanded] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingAccion, setEditingAccion] = useState<AccionDiaria | null>(null)

  const { data: acciones = [], isLoading } = useAcciones(filter)
  const { data: commentCounts = {} } = useCommentCounts(acciones.map((a) => a.id))
  const { data: users = [] } = useUsers({ activo: true })

  const metricas = useMemo(() => metricasFromAcciones(acciones), [acciones])

  const responsableNames = useMemo(() => {
    const map: Record<string, string> = {}
    users.forEach((u) => {
      map[u.id] = u.nombre
    })
    return map
  }, [users])

  const handleFilterChange = useCallback((next: AccionesFilter | Partial<AccionesFilter>) => {
    setFilter((prev) => ({ ...prev, ...next }))
  }, [])

  const handleClearFilters = useCallback(() => {
    setFilter({ ...DEFAULT_FILTER, fecha_creacion: today })
  }, [today])

  const handleCreate = useCallback(() => {
    setEditingAccion(null)
    setDialogOpen(true)
  }, [])

  const handleSelectAccion = useCallback((accion: AccionDiaria) => {
    setEditingAccion(accion)
    setDialogOpen(true)
  }, [])

  const handleDialogSuccess = useCallback(() => {
    setEditingAccion(null)
  }, [])

  return (
    <div id="dashboard-page" className="dashboard-page flex flex-col gap-6">
      <DashboardHeader
        filtersExpanded={filtersExpanded}
        onToggleFilters={() => setFiltersExpanded((v) => !v)}
        onNewAction={handleCreate}
      />

      <div id="dashboard-toolbar" className="dashboard-toolbar-wrapper">
        <KanbanToolbar
          filter={filter}
          onFilterChange={handleFilterChange}
          onClear={handleClearFilters}
          visible={filtersExpanded}
        />
      </div>

      <section id="dashboard-section-metrics" className="dashboard-section-metrics">
        <h2 className="sr-only">Métricas del día</h2>
        <DashboardKpiCards metricas={metricas} isLoading={isLoading} />
      </section>

      <div id="dashboard-section-actions" className="dashboard-section-actions">
        <DashboardActionsSection
        acciones={acciones}
        isLoading={isLoading}
        commentCounts={commentCounts}
        responsableNames={responsableNames}
        onSelectAccion={handleSelectAccion}
        onNewAction={handleCreate}
      />
      </div>

      <section id="dashboard-section-semaforo" className="dashboard-section-semaforo rounded-xl border border-border/50 bg-card shadow-sm overflow-hidden">
        <div className="dashboard-semaforo-header border-b border-border/50 bg-muted/20 px-4 py-3 sm:px-5">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
              <Activity className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h2 id="dashboard-semaforo-title" className="text-sm font-semibold text-foreground">
                Semáforo KPI
              </h2>
              <p className="text-xs text-muted-foreground">
                Estado por KPI según umbrales (verde / amarillo / rojo)
              </p>
            </div>
          </div>
        </div>
        <div className="dashboard-semaforo-content p-4">
          <KPISemaforoGrid fecha={filter.fecha_creacion ?? today} />
        </div>
      </section>

      <AccionFormDialog
        dialogId="dashboard-accion-dialog"
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        accion={editingAccion}
        defaultFecha={filter.fecha_creacion ?? today}
        onSuccess={handleDialogSuccess}
        responsableNames={responsableNames}
      />
    </div>
  )
}
