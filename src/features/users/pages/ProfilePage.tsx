import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Building2,
  CalendarClock,
  ChevronRight,
  Info,
  Link2,
  Map as MapIcon,
  MoreHorizontal,
  Network,
  Pencil,
  Target,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  SectionCard,
  SectionCardBody,
  SectionCardHeader,
} from '@/components/SectionCard'
import { ROUTES } from '@/constants'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { useRouteAccess } from '@/features/auth/hooks/useRouteAccess'
import { canEditOwnOrgProfileByRole } from '@/features/auth/lib/permissions'
import { useHierarchyPeers } from '@/features/org-chart/hooks/useOrgChart'
import {
  getDirectReports,
  getManager,
  initialsFromName,
  mapManagerUpdateError,
} from '@/features/org-chart/utils/orgHierarchy'
import { okrService } from '@/features/okrs/service'
import {
  krProgress,
  objectivePeriod,
  type KeyResult,
  type Objective,
} from '@/features/okrs/model'
import {
  ProgressBar,
  metricText,
  progressTone,
  toneTextClass,
} from '@/features/okrs/okrPresentation'
import { measurementLabel, measurementsFor } from '@/features/okrs/reporting'
import { useAcciones } from '@/features/operations/hooks/useAcciones'
import { todayWallClockCDMX } from '@/lib/dateUtils'
import { cn } from '@/lib/utils'
import type { AccionDiaria } from '@/types'
import { useCurrentUser, useUpdateUser } from '../hooks'
import {
  EditProfileDialog,
  type EditProfileSaveInput,
} from '../components/EditProfileDialog'
import { ProfileHierarchyEditor } from '../components/ProfileHierarchyEditor'

const CLOSED_STATES = new Set(['Hecho', 'Verificado'])

function formatDateLong(iso: string) {
  try {
    return new Date(iso).toLocaleDateString('es-MX', {
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

function Avatar({
  name,
  size = 'lg',
}: {
  name: string
  size?: 'sm' | 'md' | 'lg'
}) {
  const sizeClass =
    size === 'lg'
      ? 'h-16 w-16 text-lg'
      : size === 'md'
        ? 'h-10 w-10 text-sm'
        : 'h-8 w-8 text-xs'
  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full bg-sky-500/15 font-semibold text-sky-700 ring-1 ring-sky-500/20 dark:text-sky-300',
        sizeClass
      )}
      aria-hidden
    >
      {initialsFromName(name)}
    </div>
  )
}

function EmptyBlock({ children }: { children: ReactNode }) {
  return (
    <p className="px-1 py-6 text-center text-sm text-muted-foreground">
      {children}
    </p>
  )
}

function StatCell({
  value,
  label,
  hint,
}: {
  value: ReactNode
  label: string
  hint?: string
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-3 py-4 text-center">
      <p className="text-2xl font-semibold tabular-nums tracking-tight text-foreground sm:text-3xl">
        {value}
      </p>
      <p className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        {label}
        {hint ? (
          <span title={hint} className="inline-flex">
            <Info className="h-3 w-3" aria-hidden />
            <span className="sr-only">{hint}</span>
          </span>
        ) : null}
      </p>
    </div>
  )
}

function PersonChip({
  name,
  subtitle,
}: {
  name: string
  subtitle?: string | null
}) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <Avatar name={name} size="sm" />
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{name}</p>
        {subtitle ? (
          <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
        ) : null}
      </div>
    </div>
  )
}

export function ProfilePage() {
  const { user: authUser } = useAuth()
  const { canAccessRoute } = useRouteAccess()
  const { data: user, isLoading, isError, error: profileError } = useCurrentUser()
  const showOrganizationBlock = canEditOwnOrgProfileByRole(user?.rol)
  const { data: orgUsers = [] } = useHierarchyPeers(Boolean(user))
  const updateUser = useUpdateUser()
  const [editOpen, setEditOpen] = useState(false)
  const [hierarchyOpen, setHierarchyOpen] = useState(false)
  const [krFilter, setKrFilter] = useState<'active' | 'all'>('active')

  const canOkrs = canAccessRoute(ROUTES.OKRS)
  const canKanban = canAccessRoute(ROUTES.KANBAN)
  const canOrgChart = canAccessRoute(ROUTES.ORG_CHART)

  const okrQuery = useQuery({
    queryKey: ['okr', 'dashboard', 'profile'],
    queryFn: okrService.dashboard,
    enabled: Boolean(user) && canOkrs,
    staleTime: 60_000,
  })

  const accionesQuery = useAcciones(
    { responsable: user?.id },
    { enabled: Boolean(user) && canKanban }
  )

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
      setHierarchyOpen(false)
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'No se pudo guardar la jerarquía'
      toast.error(mapManagerUpdateError(message))
      throw err
    }
  }

  const today = todayWallClockCDMX()
  const myKeyResults = useMemo(() => {
    if (!user || !okrQuery.data) return [] as { kr: KeyResult; objective: Objective }[]
    const byId = new Map(okrQuery.data.objectives.map((item) => [item.id, item]))
    return okrQuery.data.keyResults
      .filter((kr) => kr.owner_user_id === user.id)
      .map((kr) => ({ kr, objective: byId.get(kr.okr_id)! }))
      .filter((row) => row.objective)
  }, [okrQuery.data, user])

  const filteredKeyResults = useMemo(() => {
    if (krFilter === 'all') return myKeyResults
    return myKeyResults.filter(
      ({ objective }) =>
        objective.activo && objectivePeriod(objective, today) === 'Activo'
    )
  }, [krFilter, myKeyResults, today])

  const pendingCheckIns = useMemo(() => {
    if (!okrQuery.data) return []
    return filteredKeyResults.filter(({ kr }) => {
      if (!kr.metric_type.startsWith('manual:')) return false
      const history = measurementsFor(okrQuery.data.checkIns, kr.id)
      const label = measurementLabel(kr, history)
      return (
        label === 'Sin seguimiento registrado' ||
        history.every((item) => item.note === 'Línea base inicial')
      )
    })
  }, [filteredKeyResults, okrQuery.data])

  const openActions = useMemo(() => {
    const list = accionesQuery.data ?? []
    return list.filter((action) => !CLOSED_STATES.has(action.estado))
  }, [accionesQuery.data])

  const avgProgress = useMemo(() => {
    if (!myKeyResults.length) return null
    const total = myKeyResults.reduce(
      (sum, row) => sum + krProgress(row.kr),
      0
    )
    return Math.round(total / myKeyResults.length)
  }, [myKeyResults])

  const lastCheckIn = useMemo(() => {
    if (!user || !okrQuery.data) return null
    const mine = okrQuery.data.checkIns
      .filter(
        (item) =>
          item.created_by === user.id && item.note !== 'Línea base inicial'
      )
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
    return mine[0] ?? null
  }, [okrQuery.data, user])

  if (isLoading) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
        Cargando tu perfil…
      </div>
    )
  }

  if (isError || !user) {
    return (
      <div className="space-y-3 rounded-2xl border border-destructive/40 bg-destructive/10 p-6 text-sm shadow-sm">
        <p className="font-medium text-destructive">
          No pudimos mostrar tu ficha en el tablero.
        </p>
        {isError && profileError instanceof Error ? (
          <p className="text-xs leading-relaxed text-muted-foreground">
            {profileError.message}
          </p>
        ) : null}
        {!isError && !user ? (
          <p className="text-xs leading-relaxed text-foreground/90">
            Tu sesión está activa, pero aún no tienes ficha aquí. Pide a un
            administrador que revise tu alta en Usuarios.
          </p>
        ) : null}
      </div>
    )
  }

  const email = authUser?.email ?? '—'
  const areaLabel = user.area ?? 'Sin área'
  const extraAreas = (user.areas ?? []).filter((area) => area !== user.area)
  const teams = [areaLabel, ...extraAreas].filter(
    (area, index, list) => area && list.indexOf(area) === index
  )
  const lastAccess = formatRelativeAccess(authUser?.last_sign_in_at ?? null)
  const manager = getManager(
    { manager_user_id: user.manager_user_id ?? null },
    orgUsers
  )
  const reports = getDirectReports(user.id, orgUsers)
  const lastCheckInKr = lastCheckIn
    ? okrQuery.data?.keyResults.find((kr) => kr.id === lastCheckIn.key_result_id)
    : null

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4">
      {/* Hero */}
      <SectionCard>
        <div className="space-y-5 p-4 sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex min-w-0 items-start gap-3.5 sm:gap-4">
              <Avatar name={user.nombre} size="lg" />
              <div className="min-w-0 space-y-1.5">
                <h1 className="truncate text-xl font-semibold tracking-tight sm:text-2xl">
                  {user.nombre}
                </h1>
                <p className="truncate text-sm text-muted-foreground">{email}</p>
                <div className="flex flex-wrap items-center gap-2 pt-0.5">
                  <Badge variant="secondary" className="font-medium">
                    {user.rol}
                  </Badge>
                  <Badge
                    variant={user.activo ? 'success' : 'muted'}
                    className="font-medium"
                  >
                    {user.activo ? 'Activo' : 'Inactivo'}
                  </Badge>
                  {teams.map((team) => (
                    <Badge
                      key={team}
                      variant="outline"
                      className="font-medium text-muted-foreground"
                    >
                      {team}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-9"
                onClick={() => setEditOpen(true)}
              >
                <Pencil className="mr-1.5 h-3.5 w-3.5" />
                Editar
              </Button>
              {canOrgChart ? (
                <Button variant="outline" size="sm" className="h-9" asChild>
                  <Link to={ROUTES.ORG_CHART}>
                    <MapIcon className="mr-1.5 h-3.5 w-3.5" />
                    Ver en organigrama
                  </Link>
                </Button>
              ) : null}
              {canOkrs ? (
                <Button variant="outline" size="sm" className="h-9" asChild>
                  <Link to={ROUTES.OKRS}>
                    <Link2 className="mr-1.5 h-3.5 w-3.5" />
                    OKRs
                  </Link>
                </Button>
              ) : null}
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9"
                aria-label="Más opciones"
                onClick={() => setEditOpen(true)}
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-3 divide-x divide-border/60 rounded-xl border border-border/60 bg-muted/20">
            <StatCell
              value={canOkrs ? myKeyResults.length || '—' : '—'}
              label="Key results"
            />
            <StatCell
              value={canKanban ? openActions.length || '—' : '—'}
              label="Acciones"
            />
            <StatCell
              value={avgProgress == null ? '—' : `${avgProgress}%`}
              label="Avance"
              hint="Promedio de avance de tus resultados clave"
            />
          </div>
        </div>
      </SectionCard>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.55fr)_minmax(17rem,0.9fr)]">
        <div className="space-y-4">
          {/* Key results */}
          <SectionCard>
            <SectionCardHeader
              title="Tus key results"
              icon={Target}
              action={
                <select
                  className="h-9 min-w-[7.5rem] rounded-lg border border-border/70 bg-background px-2 text-xs font-medium"
                  value={krFilter}
                  aria-label="Filtro de key results"
                  onChange={(event) =>
                    setKrFilter(event.target.value as 'active' | 'all')
                  }
                  disabled={!canOkrs}
                >
                  <option value="active">Activos</option>
                  <option value="all">Todos</option>
                </select>
              }
            />
            <SectionCardBody className="space-y-4 p-4 sm:p-5">
              {!canOkrs ? (
                <EmptyBlock>No tienes acceso al módulo de OKRs.</EmptyBlock>
              ) : okrQuery.isPending ? (
                <EmptyBlock>Cargando key results…</EmptyBlock>
              ) : (
                <>
                  <div>
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Check-ins pendientes
                    </p>
                    {!pendingCheckIns.length ? (
                      <p className="text-sm text-muted-foreground">
                        No hay datos disponibles
                      </p>
                    ) : (
                      <ul className="space-y-2">
                        {pendingCheckIns.slice(0, 4).map(({ kr, objective }) => (
                          <li key={kr.id}>
                            <Link
                              to={`${ROUTES.OKRS}?objective=${objective.id}`}
                              className="flex items-center justify-between gap-3 rounded-xl border border-border/70 px-3 py-2.5 text-sm transition-colors hover:bg-muted/30"
                            >
                              <span className="min-w-0 truncate font-medium">
                                {kr.title}
                              </span>
                              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div className="border-t border-border/50 pt-4">
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Resultados
                    </p>
                    {!filteredKeyResults.length ? (
                      <EmptyBlock>No hay key results en este filtro.</EmptyBlock>
                    ) : (
                      <ul className="space-y-2">
                        {filteredKeyResults.slice(0, 8).map(({ kr, objective }) => {
                          const progress = krProgress(kr)
                          const tone = progressTone(progress)
                          return (
                            <li key={kr.id}>
                              <Link
                                to={`${ROUTES.OKRS}?objective=${objective.id}`}
                                className="block rounded-xl border border-border/70 px-3 py-2.5 transition-colors hover:bg-muted/25"
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <p className="truncate text-sm font-medium">
                                      {kr.title}
                                    </p>
                                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                                      {objective.nombre_okr}
                                    </p>
                                  </div>
                                  <span
                                    className={cn(
                                      'shrink-0 text-xs font-semibold tabular-nums',
                                      toneTextClass(tone)
                                    )}
                                  >
                                    {Math.round(progress)}%
                                  </span>
                                </div>
                                <div className="mt-2">
                                  <ProgressBar
                                    value={progress}
                                    label={`Avance de ${kr.title}`}
                                    size="sm"
                                    tone={tone}
                                  />
                                </div>
                                <p className="mt-1.5 text-[11px] text-muted-foreground">
                                  {metricText(kr.current_value, kr.unit)} · meta{' '}
                                  {metricText(kr.target_value, kr.unit)}
                                </p>
                              </Link>
                            </li>
                          )
                        })}
                      </ul>
                    )}
                  </div>
                </>
              )}
            </SectionCardBody>
          </SectionCard>

          {/* Tasks / Acciones */}
          <SectionCard>
            <SectionCardHeader
              title="Tus acciones"
              icon={CalendarClock}
              action={
                canKanban ? (
                  <Button variant="ghost" size="sm" className="h-8" asChild>
                    <Link to={ROUTES.KANBAN}>Ver kanban</Link>
                  </Button>
                ) : null
              }
            />
            <SectionCardBody className="p-4 sm:p-5">
              {!canKanban ? (
                <EmptyBlock>No tienes acceso al kanban.</EmptyBlock>
              ) : accionesQuery.isPending ? (
                <EmptyBlock>Cargando acciones…</EmptyBlock>
              ) : !openActions.length ? (
                <EmptyBlock>No tienes acciones abiertas asignadas.</EmptyBlock>
              ) : (
                <ul className="space-y-2">
                  {openActions.slice(0, 8).map((action) => (
                    <ActionRow key={action.id} action={action} />
                  ))}
                </ul>
              )}
            </SectionCardBody>
          </SectionCard>

          {/* Direct reports */}
          <SectionCard>
            <SectionCardHeader
              title="Reportes directos"
              subtitle="Revisa a quiénes supervisas y su rol en la organización."
              icon={Users}
              action={
                showOrganizationBlock ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8"
                    onClick={() => setHierarchyOpen(true)}
                  >
                    Administrar
                  </Button>
                ) : null
              }
            />
            <SectionCardBody className="p-4 sm:p-5">
              {!reports.length ? (
                <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
                  <span className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
                    <Users className="h-6 w-6 text-muted-foreground" aria-hidden />
                  </span>
                  <div className="space-y-1">
                    <p className="text-sm font-semibold">Sin reportes directos</p>
                    <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">
                      Esta persona no tiene a nadie reportándole en el
                      organigrama.
                    </p>
                  </div>
                </div>
              ) : (
                <ul className="space-y-2">
                  {reports.map((report) => (
                    <li
                      key={report.id}
                      className="rounded-xl border border-border/70 px-3 py-2.5"
                    >
                      <PersonChip
                        name={report.nombre}
                        subtitle={`${report.rol}${report.area ? ` · ${report.area}` : ''}`}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </SectionCardBody>
          </SectionCard>
        </div>

        <div className="space-y-4">
          {/* Reporting details */}
          <SectionCard>
            <SectionCardHeader title="Detalle de reporte" icon={Network} />
            <SectionCardBody className="space-y-5 p-4 sm:p-5">
              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Mi manager
                  </p>
                  {showOrganizationBlock ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2 text-xs"
                      onClick={() => setHierarchyOpen(true)}
                    >
                      Administrar
                    </Button>
                  ) : null}
                </div>
                {manager ? (
                  <PersonChip
                    name={manager.nombre}
                    subtitle={`${manager.rol}${manager.area ? ` · ${manager.area}` : ''}`}
                  />
                ) : (
                  <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-muted">
                      <Users className="h-3.5 w-3.5" aria-hidden />
                    </span>
                    No configurado
                  </div>
                )}
              </div>

              <div className="space-y-2.5 border-t border-border/50 pt-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Mis equipos
                </p>
                {!teams.length || (teams.length === 1 && teams[0] === 'Sin área') ? (
                  <p className="text-sm text-muted-foreground">
                    No estás en ningún equipo
                  </p>
                ) : (
                  <ul className="space-y-1.5">
                    {teams.map((team) => (
                      <li
                        key={team}
                        className="flex items-center gap-2 text-sm"
                      >
                        <Building2
                          className="h-3.5 w-3.5 text-muted-foreground"
                          aria-hidden
                        />
                        {team}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </SectionCardBody>
          </SectionCard>

          {/* Last activity */}
          <SectionCard>
            <SectionCardHeader title="Última actividad" icon={CalendarClock} />
            <SectionCardBody className="p-4 sm:p-5">
              {lastCheckIn && lastCheckInKr ? (
                <div className="space-y-2">
                  <p className="text-sm font-medium leading-snug">
                    Check-in en {lastCheckInKr.title}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {metricText(lastCheckIn.value, lastCheckInKr.unit)}
                    {' · '}
                    {formatRelativeAccess(lastCheckIn.created_at) ??
                      formatDateLong(lastCheckIn.created_at)}
                  </p>
                  {lastCheckIn.note ? (
                    <p className="rounded-xl bg-muted/40 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
                      {lastCheckIn.note}
                    </p>
                  ) : null}
                </div>
              ) : lastAccess ? (
                <div className="space-y-1">
                  <p className="text-sm font-medium">Último acceso</p>
                  <p className="text-xs text-muted-foreground">{lastAccess}</p>
                </div>
              ) : (
                <EmptyBlock>No hay actividad para mostrar</EmptyBlock>
              )}
            </SectionCardBody>
          </SectionCard>

          {/* System meta (compact) */}
          <SectionCard>
            <SectionCardHeader title="Cuenta" icon={Pencil} />
            <SectionCardBody className="space-y-3 p-4 text-sm sm:p-5">
              <MetaLine label="Correo" value={email} />
              <MetaLine label="Creada" value={formatDateLong(user.created_at)} />
              <MetaLine
                label="Actualizada"
                value={formatDateLong(user.updated_at)}
              />
              <Button
                variant="outline"
                size="sm"
                className="mt-1 w-full"
                onClick={() => setEditOpen(true)}
              >
                Editar perfil y contraseña
              </Button>
            </SectionCardBody>
          </SectionCard>
        </div>
      </div>

      <EditProfileDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        user={user}
        onSaveProfile={handleSaveProfile}
        isSavingProfile={updateUser.isPending}
      />

      {showOrganizationBlock ? (
        <Dialog open={hierarchyOpen} onOpenChange={setHierarchyOpen}>
          <DialogContent className="max-h-[min(92dvh,40rem)] overflow-y-auto sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Organización</DialogTitle>
              <DialogDescription>
                Define a quién reportas y a quiénes supervisas.
              </DialogDescription>
            </DialogHeader>
            <ProfileHierarchyEditor
              embedded
              key={`${user.id}-${user.manager_user_id ?? 'none'}-${orgUsers.length}`}
              userId={user.id}
              users={orgUsers}
              managerUserId={user.manager_user_id ?? null}
              onSave={handleSaveHierarchy}
              isSaving={updateUser.isPending}
            />
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  )
}

function MetaLine({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="min-w-0 text-right text-xs font-medium leading-snug">
        {value}
      </span>
    </div>
  )
}

function ActionRow({ action }: { action: AccionDiaria }) {
  return (
    <li>
      <Link
        to={`${ROUTES.KANBAN}?accion=${action.id}`}
        className="flex items-center justify-between gap-3 rounded-xl border border-border/70 px-3 py-2.5 transition-colors hover:bg-muted/25"
      >
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">
            {action.titulo_accion ?? 'Acción'}
          </p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {action.estado}
            {action.fecha ? ` · ${action.fecha}` : ''}
          </p>
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
      </Link>
    </li>
  )
}
