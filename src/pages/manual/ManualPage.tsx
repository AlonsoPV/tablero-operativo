/**
 * Manual de Operaciones (spec §5.7).
 * Documentación interactiva, tutorial onboarding, chat IA.
 * TODO: prioridad opcional en v1 (spec).
 */

export function ManualPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Manual de operaciones</h2>
        <p className="text-muted-foreground">
          Documentación y tutorial (spec §5.7). Chat con asistente IA por implementar.
        </p>
      </div>
      <div className="flex h-[300px] items-center justify-center rounded-lg border border-dashed bg-muted/30 text-muted-foreground">
        Contenido del manual (por implementar)
      </div>
    </div>
  )
}
