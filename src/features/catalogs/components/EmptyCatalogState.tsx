interface EmptyCatalogStateProps {
  title?: string
  description?: string
}

export function EmptyCatalogState({
  title = 'No hay registros',
  description = 'Ajusta los filtros o crea el primer registro.',
}: EmptyCatalogStateProps) {
  return (
    <div className="rounded-md border bg-card">
      <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
        <p className="text-muted-foreground">{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  )
}
