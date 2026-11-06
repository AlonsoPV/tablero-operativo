import { Link } from 'react-router-dom'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { UserProfile } from '../types/user.types'
import { Eye, MoreHorizontal, Pencil, UserCheck, UserX, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ROUTES } from '@/constants'
import { UserPersonBadge } from './UserPersonBadge'
import { formatUserDate, userAreaLabels, userRoleLabels } from '../utils/userDisplay'

interface UsersTableProps {
  users: UserProfile[]
  onEdit: (user: UserProfile) => void
  onToggleStatus: (user: UserProfile) => void
  isLoading?: boolean
}

function detailPath(id: string) {
  return ROUTES.SETTINGS_USERS_DETAIL.replace(':id', id)
}

export function UsersTable({
  users,
  onEdit,
  onToggleStatus,
  isLoading,
}: UsersTableProps) {
  if (isLoading) {
    return (
      <div
        className="flex h-[320px] items-center justify-center rounded-xl border border-border/60 bg-card text-sm text-muted-foreground"
        aria-busy="true"
        aria-live="polite"
      >
        Cargando listado…
      </div>
    )
  }

  if (!users.length) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border/80 bg-card/60 px-6 py-16 text-center">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Users className="h-5 w-5" aria-hidden />
        </span>
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">Sin coincidencias</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            No hay usuarios con estos filtros. Ajusta la búsqueda o invita a alguien nuevo.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border/60 bg-card shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-border/60 bg-muted/25 px-4 py-2.5">
        <p className="text-xs font-medium text-muted-foreground">
          {users.length} {users.length === 1 ? 'persona' : 'personas'}
        </p>
        <p className="hidden text-xs text-muted-foreground sm:block">
          Acciones: ver ficha, editar o cambiar estatus
        </p>
      </div>
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="sticky left-0 z-[1] min-w-[220px] bg-card pl-4">Persona</TableHead>
            <TableHead className="min-w-[140px]">Rol</TableHead>
            <TableHead className="min-w-[120px]">Área</TableHead>
            <TableHead className="w-[100px]">Estatus</TableHead>
            <TableHead className="hidden min-w-[140px] lg:table-cell">Alta</TableHead>
            <TableHead className="sticky right-0 z-[1] w-[1%] bg-card pr-4 text-right">
              Acciones
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((user) => {
            const roles = userRoleLabels(user)
            const areas = userAreaLabels(user)
            return (
              <TableRow key={user.id} className="group">
                <TableCell className="sticky left-0 z-[1] bg-card pl-4 group-hover:bg-muted/50">
                  <Link
                    to={detailPath(user.id)}
                    className="flex min-w-0 items-center gap-3 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <UserPersonBadge nombre={user.nombre} />
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-foreground group-hover:text-primary">
                        {user.nombre}
                      </span>
                      <span
                        className="block truncate text-xs text-muted-foreground"
                        title={user.email ?? undefined}
                      >
                        {user.email ?? 'Sin correo'}
                      </span>
                    </span>
                  </Link>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {roles.slice(0, 2).map((role) => (
                      <Badge key={role} variant="secondary" className="font-normal">
                        {role}
                      </Badge>
                    ))}
                    {roles.length > 2 ? (
                      <Badge variant="outline" className="font-normal">
                        +{roles.length - 2}
                      </Badge>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell>
                  {areas.length ? (
                    <div className="min-w-0">
                      <p className="truncate text-sm text-foreground">{areas[0]}</p>
                      {areas.length > 1 ? (
                        <p className="truncate text-xs text-muted-foreground">
                          +{areas.length - 1} más
                        </p>
                      ) : null}
                    </div>
                  ) : (
                    <span className="text-sm text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>
                  <Badge
                    variant={user.activo ? 'success' : 'muted'}
                    className={cn(!user.activo && 'text-muted-foreground')}
                  >
                    {user.activo ? 'Activo' : 'Inactivo'}
                  </Badge>
                </TableCell>
                <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">
                  {formatUserDate(user.created_at)}
                </TableCell>
                <TableCell className="sticky right-0 z-[1] bg-card pr-4 text-right group-hover:bg-muted/50">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                        <span className="sr-only">Acciones de {user.nombre}</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuItem asChild>
                        <Link to={detailPath(user.id)}>
                          <Eye className="mr-2 h-4 w-4" />
                          Ver detalle
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onEdit(user)}>
                        <Pencil className="mr-2 h-4 w-4" />
                        Editar ficha
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => onToggleStatus(user)}
                        className={cn(!user.activo && 'text-emerald-700 focus:text-emerald-700')}
                      >
                        {user.activo ? (
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
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
