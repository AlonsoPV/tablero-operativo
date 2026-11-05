import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { UserProfile } from '../types/user.types'
import { Pencil, UserCheck, UserX } from 'lucide-react'
import { UserPersonBadge } from './UserPersonBadge'
import {
  formatUserDateLong,
  userAreaLabels,
  userRoleLabels,
} from '../utils/userDisplay'

interface UserDetailCardProps {
  user: UserProfile
  email?: string | null
  onEdit: () => void
  onToggleStatus: () => void
  isToggling?: boolean
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd className="text-sm text-foreground">{children}</dd>
    </div>
  )
}

export function UserDetailCard({
  user,
  email,
  onEdit,
  onToggleStatus,
  isToggling = false,
}: UserDetailCardProps) {
  const roles = userRoleLabels(user)
  const areas = userAreaLabels(user)

  return (
    <section className="overflow-hidden rounded-xl border border-border/60 bg-card shadow-sm">
      <div className="border-b border-border/60 bg-gradient-to-br from-muted/40 via-card to-card px-5 py-5 sm:px-6 sm:py-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <UserPersonBadge nombre={user.nombre} size="lg" />
            <div className="min-w-0 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-2xl font-semibold tracking-tight text-foreground">
                  {user.nombre}
                </h1>
                <Badge variant={user.activo ? 'success' : 'muted'}>
                  {user.activo ? 'Activo' : 'Inactivo'}
                </Badge>
              </div>
              <p className="truncate text-sm text-muted-foreground" title={email ?? undefined}>
                {email ?? 'Sin correo vinculado'}
              </p>
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                {roles.map((role) => (
                  <Badge key={role} variant="secondary" className="font-normal">
                    {role}
                  </Badge>
                ))}
              </div>
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
            <Button variant="default" size="sm" onClick={onEdit}>
              <Pencil className="mr-1.5 h-4 w-4" />
              Editar ficha
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={onToggleStatus}
              disabled={isToggling}
            >
              {user.activo ? (
                <>
                  <UserX className="mr-1.5 h-4 w-4" />
                  Desactivar
                </>
              ) : (
                <>
                  <UserCheck className="mr-1.5 h-4 w-4" />
                  Activar
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-6 px-5 py-5 sm:grid-cols-2 sm:px-6 sm:py-6 lg:grid-cols-3">
        <Field label="Área principal">
          {user.area?.trim() || 'Sin área'}
        </Field>
        <Field label="Áreas adicionales">
          {areas.filter((area) => area !== user.area).length
            ? areas.filter((area) => area !== user.area).join(', ')
            : 'Ninguna'}
        </Field>
        <Field label="Alta en el tablero">{formatUserDateLong(user.created_at)}</Field>
        <Field label="Última actualización">{formatUserDateLong(user.updated_at)}</Field>
        <Field label="Correo de acceso">
          <span className="break-all">{email ?? '—'}</span>
        </Field>
        <Field label="Cuenta Auth">
          {user.user_id ? 'Vinculada' : 'Sin cuenta Auth'}
        </Field>
      </div>

      <details className="border-t border-border/60 bg-muted/15 px-5 py-3 sm:px-6">
        <summary className="cursor-pointer select-none text-xs font-medium text-muted-foreground hover:text-foreground">
          Identificadores técnicos
        </summary>
        <dl className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              ID de perfil
            </dt>
            <dd>
              <code className="break-all rounded bg-muted px-1.5 py-0.5 text-xs">{user.id}</code>
            </dd>
          </div>
          <div className="space-y-1">
            <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              user_id (Auth)
            </dt>
            <dd>
              <code className="break-all rounded bg-muted px-1.5 py-0.5 text-xs">
                {user.user_id || '—'}
              </code>
            </dd>
          </div>
        </dl>
      </details>
    </section>
  )
}
