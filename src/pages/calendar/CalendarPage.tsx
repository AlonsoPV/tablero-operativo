/**
 * Vista Calendario (spec §5.6).
 * Acciones por fecha, navegación temporal.
 */

import { useMemo, useState, useCallback } from 'react'
import { useUsers } from '@/features/users/hooks/useUsers'
import { CalendarView } from '@/features/calendar'
import type { AccionDiaria } from '@/types'
import { AccionFormDialog } from '@/features/operations'

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
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Calendario</h2>
        <p className="text-muted-foreground">
          Acciones por fecha. Selecciona un día para ver el detalle.
        </p>
      </div>
      <CalendarView
        responsableNames={responsableNames}
        onSelectAccion={handleSelectAccion}
      />
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
