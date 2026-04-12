/**
 * Vista Calendario (spec §5.6).
 * Acciones por fecha, navegación temporal.
 */

import { useMemo, useState, useCallback } from 'react'
import { useUsers } from '@/features/users/hooks/useUsers'
import { CalendarView } from '@/features/calendar'
import type { AccionDiaria } from '@/types'
import { AccionFormDialog } from '@/features/operations'
import { SectionCard, SectionCardBody, SectionCardHeader } from '@/components/SectionCard'

export function CalendarPage() {
  const { data: users = [] } = useUsers({ activo: true })
  const responsableNames = useMemo(() => {
    const map: Record<string, string> = {}
    users.forEach((u) => { map[u.id] = u.nombre })
    return map
  }, [users])
  const [editingAccion, setEditingAccion] = useState<AccionDiaria | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  const handleSelectAccion = useCallback((accion: AccionDiaria) => {
    setEditingAccion(accion)
    setDialogOpen(true)
  }, [])

  return (
    <div className="mx-auto w-full max-w-7xl space-y-8 px-4 py-6 sm:px-6">
      <header className="space-y-1">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Planificación</p>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Calendario de acciones</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Acciones por fecha. Selecciona un día para ver el detalle.
        </p>
      </header>
      <SectionCard>
        <SectionCardHeader
          title="Vista mensual"
          subtitle="Navega por mes y abre una acción para editarla."
        />
        <SectionCardBody className="p-0 sm:p-0">
          <CalendarView
            responsableNames={responsableNames}
            onSelectAccion={handleSelectAccion}
          />
        </SectionCardBody>
      </SectionCard>
      <AccionFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        accion={editingAccion}
        onSuccess={() => setDialogOpen(false)}
        responsableNames={responsableNames}
      />
    </div>
  )
}
