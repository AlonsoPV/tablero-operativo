/**
 * Panel de Área (spec §5.5).
 * One-pager por área, checklist diario con evidencia por ítem, reporte diario.
 */

export function AreasPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Panel de área</h2>
        <p className="text-muted-foreground">
          Configuración one-pager, checklist diario y reporte de métricas (spec §5.5)
        </p>
      </div>
      <div className="flex h-[300px] items-center justify-center rounded-lg border border-dashed bg-muted/30 text-muted-foreground">
        AreaPanel (por implementar)
      </div>
    </div>
  )
}
