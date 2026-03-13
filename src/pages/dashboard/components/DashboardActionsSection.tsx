/**
 * Sección "Control de acciones" con header refinado y tabla.
 */

import { ClipboardList } from 'lucide-react'
import { AccionesControlTable } from '@/features/operations'
import type { AccionDiaria } from '@/types'

export interface DashboardActionsSectionProps {
  acciones: AccionDiaria[]
  isLoading?: boolean
  responsableNames?: Record<string, string>
  onSelectAccion?: (accion: AccionDiaria) => void
  onNewAction?: () => void
}

export function DashboardActionsSection({
  acciones,
  isLoading,
  responsableNames = {},
  onSelectAccion,
  onNewAction,
}: DashboardActionsSectionProps) {
  return (
    <div className="rounded-xl border border-border/50 bg-card shadow-sm overflow-hidden">
      <div className="border-b border-border/50 bg-muted/20 px-4 py-3 sm:px-5">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
            <ClipboardList className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-foreground">
              Control de acciones
            </h2>
            <p className="text-xs text-muted-foreground">
              Lista filtrable. Clic en una fila para editar.
            </p>
          </div>
        </div>
      </div>
      <div className="p-0">
        <AccionesControlTable
          acciones={acciones}
          isLoading={isLoading}
          onSelectAccion={onSelectAccion}
          responsableNames={responsableNames}
          emptyMessage="No hay acciones registradas para esta fecha."
          emptyActionLabel="Crear acción"
          onEmptyAction={onNewAction}
        />
      </div>
    </div>
  )
}
