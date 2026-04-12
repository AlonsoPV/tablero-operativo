/**
 * Sección "Control de acciones" con header refinado y tabla.
 */

import { ClipboardList } from 'lucide-react'
import { AccionesControlTable } from '@/features/operations'
import type { AccionDiaria } from '@/types'

export interface DashboardActionsSectionProps {
  acciones: AccionDiaria[]
  isLoading?: boolean
  commentCounts?: Record<string, number>
  responsableNames?: Record<string, string>
  checklistProgressByAccionId?: Record<string, { total: number; completed: number }>
  onSelectAccion?: (accion: AccionDiaria) => void
  onNewAction?: () => void
}

export function DashboardActionsSection({
  acciones,
  isLoading,
  commentCounts = {},
  responsableNames = {},
  checklistProgressByAccionId = {},
  onSelectAccion,
  onNewAction,
}: DashboardActionsSectionProps) {
  return (
    <div id="dashboard-actions-section" className="dashboard-actions-section rounded-xl border border-border/50 bg-card shadow-sm overflow-hidden">
      <div className="dashboard-actions-section-header border-b border-border/50 bg-muted/15 px-4 py-3.5 sm:px-6">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <ClipboardList className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Ejecución
            </p>
            <h2 id="dashboard-actions-title" className="mt-1 text-base font-semibold text-foreground">
              Acciones del día
            </h2>
            <p className="text-sm text-muted-foreground">
              Filtra arriba; abre una fila para editar o cerrar el ciclo.
            </p>
          </div>
        </div>
      </div>
      <div className="dashboard-actions-section-body p-0">
        <AccionesControlTable
          acciones={acciones}
          isLoading={isLoading}
          commentCounts={commentCounts}
          onSelectAccion={onSelectAccion}
          responsableNames={responsableNames}
          checklistProgressByAccionId={checklistProgressByAccionId}
          emptyMessage="No hay acciones registradas para esta fecha."
          emptyActionLabel="Crear acción"
          onEmptyAction={onNewAction}
        />
      </div>
    </div>
  )
}
