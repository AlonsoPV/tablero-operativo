import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Pencil, UserCheck, UserX, MoreHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface CatalogRowActionsProps<T extends { id: string; nombre: string; activo: boolean }> {
  item: T
  onEdit: (item: T) => void
  onToggleActivo: (item: T) => void
  /** Accesibilidad: nombre del recurso (ej. "rol", "área") */
  resourceLabel?: string
}

export function CatalogRowActions<T extends { id: string; nombre: string; activo: boolean }>({
  item,
  onEdit,
  onToggleActivo,
  resourceLabel = 'elemento',
}: CatalogRowActionsProps<T>) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          aria-label={`Acciones para ${resourceLabel}: ${item.nombre}`}
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => onEdit(item)}>
          <Pencil className="mr-2 h-4 w-4" />
          Editar
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => onToggleActivo(item)}
          className={cn(!item.activo && 'text-emerald-600')}
        >
          {item.activo ? (
            <>
              <UserX className="mr-2 h-4 w-4" />
              Desactivar
            </>
          ) : (
            <>
              <UserCheck className="mr-2 h-4 w-4" />
              Activar
            </>
          )}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
