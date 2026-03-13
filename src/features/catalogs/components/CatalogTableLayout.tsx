import { Table } from '@/components/ui/table'
import { EmptyCatalogState } from './EmptyCatalogState'

export interface CatalogTableLayoutProps {
  /** Si true, muestra bloque de carga */
  isLoading?: boolean
  /** Si hay error, se muestra mensaje; no se muestra la tabla */
  error?: Error | null
  /** Si no hay items y no hay error, se muestra empty state */
  emptyTitle?: string
  emptyDescription?: string
  /** Cantidad de ítems (para decidir empty) */
  itemCount?: number
  /** Contenido de la tabla (TableHeader + TableBody). No renderizado si loading o error */
  children: React.ReactNode
}

export function CatalogTableLayout({
  isLoading = false,
  error = null,
  emptyTitle = 'No hay registros',
  emptyDescription = 'Ajusta los filtros o crea el primer registro.',
  itemCount = 0,
  children,
}: CatalogTableLayoutProps) {
  if (error) {
    return (
      <div
        className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive"
        role="alert"
      >
        {error.message}
      </div>
    )
  }

  if (isLoading) {
    return (
      <div
        className="flex h-64 items-center justify-center rounded-md border bg-card text-muted-foreground"
        aria-busy="true"
        aria-live="polite"
      >
        Cargando...
      </div>
    )
  }

  if (itemCount === 0) {
    return (
      <EmptyCatalogState title={emptyTitle} description={emptyDescription} />
    )
  }

  return (
    <div className="rounded-md border bg-card">
      <Table>{children}</Table>
    </div>
  )
}
