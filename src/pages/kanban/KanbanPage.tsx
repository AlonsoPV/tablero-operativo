/**
 * Kanban — vista rediseñada tipo SaaS/producto moderno.
 * Header premium, toolbar de filtros, tablero con columnas y cards refinadas.
 */

import { useMemo, useState, useCallback } from 'react'
import {
  useAcciones,
  KanbanBoard,
  KanbanHeader,
  KanbanToolbar,
  AccionesControlTable,
  CountdownTimer,
  AccionFormDialog,
} from '@/features/operations'
import type { KanbanViewMode } from '@/features/operations'
import { useUsers } from '@/features/users/hooks/useUsers'
import type { AccionDiaria } from '@/types'
import type { AccionesFilter } from '@/services/acciones.service'

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

const DEFAULT_FILTER: AccionesFilter = {}

export function KanbanPage() {
  const today = todayISO()
  const [filter, setFilter] = useState<AccionesFilter>(() => ({
    ...DEFAULT_FILTER,
    fecha: today,
  }))
  const [filtersExpanded, setFiltersExpanded] = useState(true)
  const [viewMode, setViewMode] = useState<KanbanViewMode>('kanban')
  const { data: acciones = [], isLoading } = useAcciones(filter)
  const { data: users = [] } = useUsers({ activo: true })
  const [editingAccion, setEditingAccion] = useState<AccionDiaria | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  const handleClearFilters = useCallback(() => {
    setFilter({ ...DEFAULT_FILTER, fecha: today })
  }, [today])

  const responsableNames = useMemo(() => {
    const map: Record<string, string> = {}
    users.forEach((u) => {
      map[u.id] = u.nombre
    })
    return map
  }, [users])

  const nextDeadline = useMemo(() => {
    const pending = acciones.filter(
      (a) => a.estado !== 'Hecho' && a.estado !== 'Verificado'
    )
    if (pending.length === 0) return null
    const sorted = [...pending].sort((a, b) => {
      const da = new Date(`${a.fecha}T${a.hora_limite}`).getTime()
      const db = new Date(`${b.fecha}T${b.hora_limite}`).getTime()
      return da - db
    })
    return sorted[0]
  }, [acciones])

  const handleSelectAccion = useCallback((accion: AccionDiaria) => {
    setEditingAccion(accion)
    setDialogOpen(true)
  }, [])

  const handleNewAction = useCallback(() => {
    setEditingAccion(null)
    setDialogOpen(true)
  }, [])

  const handleDialogClose = useCallback(() => {
    setEditingAccion(null)
    setDialogOpen(false)
  }, [])

  return (
    <div className="flex flex-col gap-6">
      <KanbanHeader
        filtersExpanded={filtersExpanded}
        onToggleFilters={() => setFiltersExpanded((v) => !v)}
        onNewAction={handleNewAction}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        rightOfTitle={
          nextDeadline ? (
            <span className="inline-flex items-center gap-2 rounded-full border border-border/50 bg-muted/30 px-3 py-1 text-xs font-medium text-muted-foreground">
              Próximo límite
              <CountdownTimer
                fecha={nextDeadline.fecha}
                hora_limite={nextDeadline.hora_limite}
                estado={nextDeadline.estado}
                variant="default"
              />
            </span>
          ) : null
        }
      />

      <KanbanToolbar
        filter={filter}
        onFilterChange={setFilter}
        onClear={handleClearFilters}
        visible={filtersExpanded}
      />

      <section className="min-h-[420px]">
        {viewMode === 'kanban' ? (
          <KanbanBoard
            acciones={acciones}
            isLoading={isLoading}
            responsableNames={responsableNames}
            onSelectAccion={handleSelectAccion}
            onNewAction={handleNewAction}
          />
        ) : (
          <div className="rounded-xl border border-border/50 bg-card overflow-hidden">
            <AccionesControlTable
              acciones={acciones}
              isLoading={isLoading}
              onSelectAccion={handleSelectAccion}
              responsableNames={responsableNames}
            />
          </div>
        )}
      </section>

      <AccionFormDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!open) handleDialogClose()
        }}
        accion={editingAccion}
        onSuccess={handleDialogClose}
      />
    </div>
  )
}
