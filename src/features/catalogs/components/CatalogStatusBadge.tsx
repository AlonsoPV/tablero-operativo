import { Badge } from '@/components/ui/badge'

interface CatalogStatusBadgeProps {
  activo: boolean
}

export function CatalogStatusBadge({ activo }: CatalogStatusBadgeProps) {
  return (
    <Badge variant={activo ? 'success' : 'muted'}>
      {activo ? 'Activo' : 'Inactivo'}
    </Badge>
  )
}
