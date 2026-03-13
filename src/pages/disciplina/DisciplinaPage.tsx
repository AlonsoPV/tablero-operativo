/**
 * Métricas de Disciplina (spec §5.4, §12).
 * DisciplinaCard: % cumplimiento, acciones sin evidencia, racha días verde, reincidencias.
 * TODO: medicion_disciplina no se calcula automáticamente (spec §16.8).
 */

export function DisciplinaPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Métricas de disciplina</h2>
        <p className="text-muted-foreground">
          Cumplimiento, sin evidencia, racha en verde, reincidencias (spec §5.4)
        </p>
      </div>
      <div className="flex h-[280px] items-center justify-center rounded-lg border border-dashed bg-muted/30 text-muted-foreground">
        DisciplinaCard (por implementar). TODO: cálculo automático de medicion_disciplina.
      </div>
    </div>
  )
}
