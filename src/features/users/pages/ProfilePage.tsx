import { useState, type ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { SectionCard, SectionCardBody, SectionCardHeader } from '@/components/SectionCard'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { canEditOwnOrgProfileByRole } from '@/features/auth/lib/permissions'
import { useHierarchyPeers } from '@/features/org-chart/hooks/useOrgChart'
import { mapManagerUpdateError } from '@/features/org-chart/utils/orgHierarchy'
import { useCurrentUser, useUpdateUser } from '../hooks'
import { EditProfileDialog, type EditProfileSaveInput } from '../components/EditProfileDialog'
import { ProfileHierarchyEditor } from '../components/ProfileHierarchyEditor'
import {
  Building2,
  CalendarClock,
  CalendarDays,
  Mail,
  Network,
  Pencil,
  Shield,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

function formatDateLong(iso: string) {
  try {
    return new Date(iso).toLocaleDateString('es-ES', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

function formatRelativeAccess(iso: string | null | undefined): string | null {
  if (!iso) return null
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return null
  const diffMs = Date.now() - then
  const min = Math.floor(diffMs / 60_000)
  const hr = Math.floor(min / 60)
  const days = Math.floor(hr / 24)
  if (min < 1) return 'hace un momento'
  if (min < 60) return `hace ${min} min`
  if (hr < 24) return `hace ${hr} h`
  if (days === 1) return 'ayer'
  if (days < 30) return `hace ${days} días`
  return formatDateLong(iso)
}

function initialsFromName(nombre: string) {
  const parts = nombre.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function InfoRow({
  id,
  name,
  icon: Icon,
  label,
  value,
}: {
  id: string
  name: string
  icon: LucideIcon
  label: string
  value: ReactNode
}) {
  return (
    <div
      id={id}
      data-name={name}
      className="flex gap-3 border-b border-border/40 px-4 py-3.5 last:border-b-0 sm:px-5"
      {...{ name }}
    >
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted/70 text-muted-foreground">
        <Icon className="h-3.5 w-3.5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1 space-y-0.5">
        <p
          id={`${id}-label`}
          data-name={`${name}-label`}
          className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
        >
          {label}
        </p>
        <div
          id={`${id}-value`}
          data-name={`${name}-value`}
          className="text-sm font-medium leading-snug text-foreground"
        >
          {value}
        </div>
      </div>
    </div>
  )
}

export function ProfilePage() {
  const { user: authUser } = useAuth()
  const { data: user, isLoading, isError, error: profileError } = useCurrentUser()
  const showOrganizationBlock = canEditOwnOrgProfileByRole(user?.rol)
  const { data: orgUsers = [] } = useHierarchyPeers(showOrganizationBlock)
  const updateUser = useUpdateUser()
  const [editOpen, setEditOpen] = useState(false)

  const handleSaveProfile = async (input: EditProfileSaveInput) => {
    if (!user) return
    await updateUser.mutateAsync({
      id: user.id,
      input: {
        nombre: input.nombre,
        primary_area_id: input.primary_area_id,
        area_ids: input.area_ids,
        ...(input.primary_area_id == null && input.area_ids.length === 0
          ? { area: input.area }
          : {}),
      },
    })
  }

  const handleSaveHierarchy = async (input: {
    manager_user_id: string | null
    direct_report_ids: string[]
  }) => {
    if (!user) return
    try {
      await updateUser.mutateAsync({
        id: user.id,
        input: {
          manager_user_id: input.manager_user_id,
          direct_report_ids: input.direct_report_ids,
        },
      })
      toast.success('Jerarquía actualizada')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo guardar la jerarquía'
      toast.error(mapManagerUpdateError(message))
      throw err
    }
  }

  if (isLoading) {
    return (
      <div
        id="profile-loading"
        data-name="profile-loading"
        className="flex h-48 items-center justify-center text-sm text-muted-foreground"
      >
        Cargando tu perfil…
      </div>
    )
  }

  if (isError || !user) {
    return (
      <div
        id="profile-error"
        data-name="profile-error"
        className="space-y-3 rounded-2xl border border-destructive/40 bg-destructive/10 p-6 text-sm shadow-sm"
      >
        <p id="profile-error-title" data-name="profile-error-title" className="font-medium text-destructive">
          No pudimos mostrar tu ficha en el tablero.
        </p>
        {isError && profileError instanceof Error ? (
          <p
            id="profile-error-detail"
            data-name="profile-error-detail"
            className="text-xs leading-relaxed text-muted-foreground"
          >
            {profileError.message}
          </p>
        ) : null}
        {!isError && !user ? (
          <p
            id="profile-missing"
            data-name="profile-missing"
            className="text-xs leading-relaxed text-foreground/90"
          >
            Tu sesión está activa, pero aún no tienes ficha aquí. Pide a un administrador que revise tu
            alta en Usuarios.
          </p>
        ) : null}
      </div>
    )
  }

  const email = authUser?.email ?? '—'
  const areaLabel = user.area ?? 'Sin área'
  const extraAreas = (user.areas ?? []).filter((a) => a !== user.area)
  const lastAccess = formatRelativeAccess(authUser?.last_sign_in_at ?? null)

  return (
    <div id="profile-page" data-name="profile-page" className="mx-auto w-full max-w-3xl space-y-5">
      {/* Hero */}
      <SectionCard id="profile-hero-card" data-name="profile-hero-card" className="overflow-hidden">
        <div className="border-b border-border/40 bg-gradient-to-br from-primary/[0.07] via-card to-muted/20 px-4 py-5 sm:px-6 sm:py-6">
          <div
            id="profile-hero"
            data-name="profile-hero"
            className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div
              id="profile-hero-identity"
              data-name="profile-hero-identity"
              className="flex min-w-0 items-center gap-4"
            >
              <div
                id="profile-avatar"
                data-name="profile-avatar"
                className={cn(
                  'flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-base font-semibold text-primary sm:h-16 sm:w-16 sm:text-lg',
                  'bg-gradient-to-br from-primary/20 to-primary/5 ring-1 ring-primary/15'
                )}
                aria-hidden
              >
                {initialsFromName(user.nombre)}
              </div>
              <div id="profile-identity-text" data-name="profile-identity-text" className="min-w-0 space-y-2">
                <h1
                  id="profile-nombre"
                  data-name="profile-nombre"
                  className="truncate text-xl font-semibold tracking-tight text-foreground sm:text-2xl"
                >
                  {user.nombre}
                </h1>
                <div
                  id="profile-badges"
                  data-name="profile-badges"
                  className="flex flex-wrap items-center gap-2"
                >
                  <Badge
                    id="profile-badge-rol"
                    data-name="profile-badge-rol"
                    variant="secondary"
                    className="font-medium"
                  >
                    {user.rol}
                  </Badge>
                  <Badge
                    id="profile-badge-area"
                    data-name="profile-badge-area"
                    variant="outline"
                    className="font-medium text-muted-foreground"
                  >
                    {areaLabel}
                  </Badge>
                  {extraAreas.map((area) => (
                    <Badge
                      key={area}
                      id={`profile-badge-area-${area.toLowerCase().replace(/\s+/g, '-')}`}
                      data-name={`profile-badge-area-${area}`}
                      variant="outline"
                      className="font-medium text-muted-foreground"
                    >
                      {area}
                    </Badge>
                  ))}
                  <Badge
                    id="profile-badge-activo"
                    data-name="profile-badge-activo"
                    variant={user.activo ? 'success' : 'muted'}
                    className="font-medium"
                  >
                    {user.activo ? 'Activo' : 'Inactivo'}
                  </Badge>
                </div>
              </div>
            </div>
            <Button
              id="profile-btn-editar"
              name="profile-btn-editar"
              className="h-10 w-full shrink-0 sm:w-auto"
              onClick={() => setEditOpen(true)}
            >
              <Pencil className="mr-2 h-4 w-4" />
              Editar perfil
            </Button>
          </div>
        </div>
      </SectionCard>

      {/* Tu cuenta */}
      <section id="profile-section-cuenta" data-name="profile-section-cuenta">
        <SectionCard>
          <SectionCardHeader
            titleId="profile-section-cuenta-title"
            eyebrow="Cuenta"
            title="Tu cuenta"
            subtitle="Datos de acceso y seguridad de tu perfil."
            icon={Mail}
            action={
              <Button
                id="profile-cuenta-editar"
                name="profile-cuenta-editar"
                type="button"
                variant="outline"
                size="sm"
                className="h-9"
                onClick={() => setEditOpen(true)}
              >
                <Pencil className="mr-1.5 h-3.5 w-3.5" />
                Editar
              </Button>
            }
          />
          <SectionCardBody className="p-0">
            <div id="profile-cuenta-grid" data-name="profile-cuenta-grid" className="divide-y divide-border/40">
              <InfoRow
                id="profile-tile-correo"
                name="profile-tile-correo"
                icon={Mail}
                label="Correo"
                value={
                  <span id="profile-correo-value" data-name="profile-correo-value" className="break-all">
                    {email}
                  </span>
                }
              />
              <InfoRow
                id="profile-tile-areas"
                name="profile-tile-areas"
                icon={Building2}
                label="Áreas"
                value={
                  <span id="profile-areas-value" data-name="profile-areas-value">
                    {areaLabel}
                    {extraAreas.length > 0 ? ` · ${extraAreas.join(', ')}` : ''}
                  </span>
                }
              />
              <InfoRow
                id="profile-tile-seguridad"
                name="profile-tile-seguridad"
                icon={Shield}
                label="Seguridad"
                value={
                  <span
                    id="profile-seguridad-value"
                    data-name="profile-seguridad-value"
                    className="text-muted-foreground"
                  >
                    Nombre, áreas y contraseña se actualizan desde{' '}
                    <button
                      id="profile-link-editar"
                      name="profile-link-editar"
                      type="button"
                      className="font-medium text-primary hover:underline"
                      onClick={() => setEditOpen(true)}
                    >
                      Editar perfil
                    </button>
                    .
                  </span>
                }
              />
              {lastAccess ? (
                <InfoRow
                  id="profile-tile-ultimo-acceso"
                  name="profile-tile-ultimo-acceso"
                  icon={CalendarClock}
                  label="Último acceso"
                  value={lastAccess}
                />
              ) : null}
            </div>
          </SectionCardBody>
        </SectionCard>
      </section>

      {/* Organización */}
      {showOrganizationBlock ? (
        <section id="profile-section-organizacion" data-name="profile-section-organizacion">
          <SectionCard>
            <SectionCardHeader
              titleId="profile-section-organizacion-title"
              eyebrow="Jerarquía"
              title="Organización"
              subtitle="Define a quién reportas y a quiénes supervisas."
              icon={Network}
            />
            <SectionCardBody className="p-4 sm:p-5">
              <ProfileHierarchyEditor
                embedded
                key={`${user.id}-${user.manager_user_id ?? 'none'}-${orgUsers.length}`}
                userId={user.id}
                users={orgUsers}
                managerUserId={user.manager_user_id ?? null}
                onSave={handleSaveHierarchy}
                isSaving={updateUser.isPending}
              />
            </SectionCardBody>
          </SectionCard>
        </section>
      ) : null}

      {/* Información del sistema */}
      <section id="profile-section-sistema" data-name="profile-section-sistema">
        <SectionCard>
          <SectionCardHeader
            titleId="profile-section-sistema-title"
            eyebrow="Sistema"
            title="Información del sistema"
            subtitle="Metadatos de tu cuenta. El rol solo lo cambia un administrador."
            icon={ShieldCheck}
          />
          <SectionCardBody className="p-0">
            <div
              id="profile-sistema-grid"
              data-name="profile-sistema-grid"
              className="grid sm:grid-cols-3 sm:divide-x sm:divide-border/40"
            >
              <InfoRow
                id="profile-tile-rol"
                name="profile-tile-rol"
                icon={ShieldCheck}
                label="Rol"
                value={user.rol}
              />
              <InfoRow
                id="profile-tile-creada"
                name="profile-tile-creada"
                icon={CalendarDays}
                label="Cuenta creada"
                value={formatDateLong(user.created_at)}
              />
              <InfoRow
                id="profile-tile-actualizada"
                name="profile-tile-actualizada"
                icon={CalendarClock}
                label="Última actualización"
                value={formatDateLong(user.updated_at)}
              />
            </div>
            <p
              id="profile-sistema-help"
              data-name="profile-sistema-help"
              className="border-t border-border/40 bg-muted/15 px-4 py-3 text-xs leading-relaxed text-muted-foreground sm:px-5"
            >
              {showOrganizationBlock
                ? 'Puedes actualizar nombre, áreas, jerarquía y contraseña desde tu perfil.'
                : 'Puedes actualizar nombre, áreas y contraseña desde tu perfil.'}
            </p>
          </SectionCardBody>
        </SectionCard>
      </section>

      <EditProfileDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        user={user}
        onSaveProfile={handleSaveProfile}
        isSavingProfile={updateUser.isPending}
      />
    </div>
  )
}
