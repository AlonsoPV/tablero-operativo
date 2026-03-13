/**
 * Reportes Históricos (spec §5.8).
 * Filtro por líder/responsable, tendencias de cumplimiento, exportación PDF/Excel.
 */

export function ReportesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Reportes históricos</h2>
        <p className="text-muted-foreground">
          Filtros, tendencias y exportación PDF/Excel (spec §5.8)
        </p>
      </div>
      <div className="flex h-[400px] items-center justify-center rounded-lg border border-dashed bg-muted/30 text-muted-foreground">
        HistoricalReports (por implementar)
      </div>
    </div>
  )
}
