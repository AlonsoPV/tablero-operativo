/**
 * Vista Calendario (spec §5.6).
 * Acciones por fecha, navegación temporal.
 */

export function CalendarPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Calendario</h2>
        <p className="text-muted-foreground">
          Acciones por fecha (spec §5.6)
        </p>
      </div>
      <div className="flex h-[400px] items-center justify-center rounded-lg border border-dashed bg-muted/30 text-muted-foreground">
        CalendarView (por implementar)
      </div>
    </div>
  )
}
