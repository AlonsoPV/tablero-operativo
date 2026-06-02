import { Button } from '@/components/ui/button'

export function CatalogLoadError({
  message,
  onRetry,
}: {
  message: string
  onRetry?: () => void
}) {
  return (
    <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2">
      <p className="text-xs text-destructive">{message}</p>
      {onRetry ? (
        <Button type="button" variant="outline" size="sm" className="mt-2 h-7 px-2.5 text-xs" onClick={onRetry}>
          Reintentar
        </Button>
      ) : null}
    </div>
  )
}
