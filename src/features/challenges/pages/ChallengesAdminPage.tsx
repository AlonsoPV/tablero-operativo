import { useMemo, useState, type ReactElement, type ReactNode } from 'react'
import { Link, Navigate } from 'react-router-dom'
import {
  CheckCircle2,
  Eye,
  Flag,
  Lightbulb,
  Pencil,
  SlidersHorizontal,
  ThumbsUp,
  XCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SectionCard, SectionCardBody, SectionCardHeader } from '@/components/SectionCard'
import { ROUTES } from '@/constants'
import { cn } from '@/lib/utils'
import { useCurrentUser } from '@/features/users/hooks/useCurrentUser'
import { useUsers } from '@/features/users/hooks/useUsers'
import { useAreas } from '@/features/catalogs/hooks/useAreas'
import { isAdminByRole, isSuperAdminByRole } from '@/features/auth/lib/permissions'
import { notificacionesService } from '@/services/notificaciones.service'
import { ChallengeFormDialog } from '../components/ChallengeFormDialog'
import {
  useApproveChallenge,
  useChallenges,
  useChallengeUniqueParticipantCount,
  useFinishChallenge,
  useRejectChallenge,
} from '../hooks/useChallenges'
import type { ChallengeFilter, ChallengeListItem } from '../types'
import { audienceSummaryLabel } from '../challengeForm.utils'
import { CHALLENGE_IMPACT_LABEL } from '../constants'
import {
  CHALLENGE_STATUS_BADGE,
  CHALLENGE_STATUS_LABEL,
  dateLabel,
} from '../utils'

const ALL = 'all'

function canManageChallenges(rol: string | null | undefined) {
  return isAdminByRole(rol) || isSuperAdminByRole(rol)
}

export function ChallengesAdminPage() {
  const { data: currentUser } = useCurrentUser()
  const { data: users = [] } = useUsers({ activo: true })
  const { data: areas = [] } = useAreas({ activo: true })
  const [filter, setFilter] = useState<ChallengeFilter>({ status: 'all' })
  const [editing, setEditing] = useState<ChallengeListItem | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const { data: challenges = [], isLoading, isError, error, refetch } = useChallenges(filter, currentUser?.id)
  const challengeIds = useMemo(() => challenges.map((challenge) => challenge.id), [challenges])
  const { data: uniqueParticipants = 0 } = useChallengeUniqueParticipantCount(challengeIds)
  const approve = useApproveChallenge()
  const reject = useRejectChallenge()
  const finish = useFinishChallenge()

  const userNames = useMemo(() => Object.fromEntries(users.map((user) => [user.id, user.nombre])), [users])
  const areaNames = useMemo(() => Object.fromEntries(areas.map((area) => [area.id, area.nombre])), [areas])

  if (currentUser && !canManageChallenges(currentUser.rol)) {
    return <Navigate to={ROUTES.CHALLENGES} replace />
  }

  const pending = challenges.filter((item) => item.status === 'pending').length
  const active = challenges.filter((item) => item.effective_status === 'active').length
  const finished = challenges.filter((item) => item.effective_status === 'finished').length
  const totalIdeas = challenges.reduce((sum, item) => sum + (item.metrics.ideas ?? 0), 0)
  const engagement = challenges.reduce(
    (sum, item) => sum + (item.metrics.ideaVotes ?? 0) + (item.metrics.ideaComments ?? 0),
    0
  )
  const notifyCreator = async (challenge: ChallengeListItem, tipo: string, titulo: string, mensaje: string) => {
    if (!challenge.created_by || challenge.created_by === currentUser?.id) return
    try {
      await notificacionesService.create({
        usuario_id: challenge.created_by,
        tipo,
        prioridad: 'Normal',
        payload: {
          titulo,
          mensaje,
          challenge_id: challenge.id,
          challenge_titulo: challenge.title,
          autor_id: currentUser?.id ?? null,
          autor_nombre: currentUser?.nombre ?? null,
        },
      })
    } catch {
      // La aprobacion no debe fallar si el correo/notificacion secundaria no se pudo enviar.
    }
  }

  const handleApprove = async (challenge: ChallengeListItem) => {
    if (!currentUser?.id) return
    const startDate = challenge.start_date ?? challenge.proposed_start_date ?? new Date().toISOString().slice(0, 10)
    const endDate = challenge.end_date ?? challenge.proposed_end_date
    if (!endDate) {
      toast.error('Define una fecha de cierre antes de aprobar.')
      setEditing(challenge)
      setDialogOpen(true)
      return
    }
    try {
      const saved = await approve.mutateAsync({ id: challenge.id, approvedBy: currentUser.id, startDate, endDate })
      await notifyCreator({ ...challenge, ...saved } as ChallengeListItem, 'challenge_aprobado', 'Challenge aprobado', 'Tu Challenge fue aprobado y publicado.')
      toast.success('Challenge aprobado')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo aprobar el Challenge')
    }
  }

  const handleReject = async (challenge: ChallengeListItem) => {
    const reason = window.prompt('Motivo del rechazo')
    if (!reason?.trim()) {
      toast.error('El motivo del rechazo es obligatorio.')
      return
    }
    try {
      const saved = await reject.mutateAsync({ id: challenge.id, reason: reason.trim() })
      await notifyCreator({ ...challenge, ...saved } as ChallengeListItem, 'challenge_rechazado', 'Challenge rechazado', reason.trim())
      toast.success('Challenge rechazado')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo rechazar el Challenge')
    }
  }

  const handleFinish = async (challenge: ChallengeListItem) => {
    const resultSummary = window.prompt('Resultado o conclusion del Challenge', challenge.result_summary ?? '')
    try {
      await finish.mutateAsync({ id: challenge.id, resultSummary: resultSummary?.trim() || challenge.result_summary })
      toast.success('Challenge finalizado')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo finalizar el Challenge')
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col space-y-6 overflow-x-hidden px-3 py-5 sm:px-6 sm:py-6">
      <header className="flex flex-col gap-4 rounded-2xl border border-border/60 bg-card p-5 shadow-sm sm:p-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-medium text-primary">
            <SlidersHorizontal className="h-4 w-4" aria-hidden />
            Administracion
          </div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Challenges
          </h1>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Revisa propuestas, aprueba publicaciones y consulta resultados de participacion.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link to={ROUTES.CHALLENGES}>Vista publica</Link>
        </Button>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <AdminKpi label="Pendientes de aprobacion" value={pending} icon={<Lightbulb />} tone="amber" />
        <AdminKpi label="Activos" value={active} icon={<CheckCircle2 />} tone="emerald" />
        <AdminKpi label="Ideas propuestas" value={totalIdeas} icon={<Lightbulb />} tone="blue" />
        <AdminKpi label="Participantes únicos" value={uniqueParticipants} icon={<ThumbsUp />} tone="emerald" />
        <AdminKpi label="Engagement" value={engagement} icon={<Flag />} tone="slate" />
        <AdminKpi label="Finalizados" value={finished} icon={<Flag />} tone="slate" />
      </div>

      <SectionCard>
        <SectionCardHeader
          title="Gestion de Challenges"
          subtitle="Filtros simples para revision, aprobacion y cierre."
          action={
            <Button
              type="button"
              onClick={() => {
                setEditing(null)
                setDialogOpen(true)
              }}
            >
              Nuevo
            </Button>
          }
        />
        <SectionCardBody className="space-y-4">
          <div className="grid gap-3 md:grid-cols-4">
            <Field label="Estado" htmlFor="admin-challenge-status">
              <Select
                value={filter.status ?? 'all'}
                onValueChange={(value) =>
                  setFilter((prev) => ({ ...prev, status: value as ChallengeFilter['status'] }))
                }
              >
                <SelectTrigger id="admin-challenge-status">
                  <SelectValue placeholder="Estado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="pending">Pendientes</SelectItem>
                  <SelectItem value="active">Activos</SelectItem>
                  <SelectItem value="finished">Finalizados</SelectItem>
                  <SelectItem value="rejected">Rechazados</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Area" htmlFor="admin-challenge-area">
              <Select
                value={filter.areaId ?? ALL}
                onValueChange={(value) => setFilter((prev) => ({ ...prev, areaId: value === ALL ? null : value }))}
              >
                <SelectTrigger id="admin-challenge-area">
                  <SelectValue placeholder="Area" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Todas</SelectItem>
                  {areas.map((area) => (
                    <SelectItem key={area.id} value={area.id}>{area.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Desde" htmlFor="admin-challenge-from">
              <Input
                id="admin-challenge-from"
                type="date"
                value={filter.dateFrom ?? ''}
                onChange={(event) => setFilter((prev) => ({ ...prev, dateFrom: event.target.value || null }))}
              />
            </Field>
            <Field label="Hasta" htmlFor="admin-challenge-to">
              <Input
                id="admin-challenge-to"
                type="date"
                value={filter.dateTo ?? ''}
                onChange={(event) => setFilter((prev) => ({ ...prev, dateTo: event.target.value || null }))}
              />
            </Field>
          </div>

          {isError ? (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center">
              <p className="text-sm font-semibold">No se pudieron cargar los Challenges.</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {error instanceof Error ? error.message : 'Revisa permisos o conexion.'}
              </p>
              <Button type="button" variant="outline" className="mt-3" onClick={() => void refetch()}>
                Reintentar
              </Button>
            </div>
          ) : isLoading ? (
            <div className="h-72 animate-pulse rounded-xl bg-muted/50" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead className="border-b border-border/60 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Challenge</th>
                    <th className="px-3 py-2">Creador</th>
                    <th className="px-3 py-2">Estado</th>
                    <th className="px-3 py-2 text-right">Ideas</th>
                    <th className="px-3 py-2 text-right">Apoyos</th>
                    <th className="px-3 py-2 text-right">Comentarios</th>
                    <th className="px-3 py-2 text-right">Participantes</th>
                    <th className="px-3 py-2">Inicio</th>
                    <th className="px-3 py-2">Cierre</th>
                    <th className="px-3 py-2 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {challenges.map((challenge) => (
                    <tr key={challenge.id} className="align-top">
                      <td className="max-w-xs px-3 py-3">
                        <p className="line-clamp-2 font-medium text-foreground">{challenge.title}</p>
                        <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                          {challenge.area_id ? areaNames[challenge.area_id] ?? 'Área' : 'Sin área'}
                          {challenge.strategic_pillar ? ` · ${challenge.strategic_pillar.nombre}` : ''}
                        </p>
                        <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">
                          {challenge.impacts.length > 0
                            ? challenge.impacts
                                .map((impact) =>
                                  impact === 'other' && challenge.other_impact?.trim()
                                    ? challenge.other_impact.trim()
                                    : CHALLENGE_IMPACT_LABEL[impact]
                                )
                                .join(' · ')
                            : 'Sin impacto definido'}
                        </p>
                        <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">
                          Audiencia:{' '}
                          {audienceSummaryLabel({
                            audience_type: challenge.audience_type,
                            audience_area_id: challenge.audience_area_id,
                            audience_area_ids: challenge.audience_area_ids,
                            areaNames,
                          })}
                        </p>
                      </td>
                      <td className="px-3 py-3 text-muted-foreground">{userNames[challenge.created_by] ?? 'Usuario'}</td>
                      <td className="px-3 py-3">
                        <Badge variant="outline" className={CHALLENGE_STATUS_BADGE[challenge.effective_status]}>
                          {CHALLENGE_STATUS_LABEL[challenge.effective_status]}
                        </Badge>
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">{challenge.metrics.ideas ?? 0}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{challenge.metrics.ideaVotes ?? 0}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{challenge.metrics.ideaComments ?? 0}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{challenge.metrics.participants}</td>
                      <td className="px-3 py-3 text-muted-foreground">{dateLabel(challenge.start_date ?? challenge.proposed_start_date)}</td>
                      <td className="px-3 py-3 text-muted-foreground">{dateLabel(challenge.end_date ?? challenge.proposed_end_date)}</td>
                      <td className="px-3 py-3">
                        <div className="flex justify-end gap-1">
                          <Button asChild variant="ghost" size="icon">
                            <Link to={`${ROUTES.CHALLENGES}/${challenge.id}`}>
                              <Eye className="h-4 w-4" aria-hidden />
                              <span className="sr-only">Ver</span>
                            </Link>
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setEditing(challenge)
                              setDialogOpen(true)
                            }}
                          >
                            <Pencil className="h-4 w-4" aria-hidden />
                            <span className="sr-only">Editar</span>
                          </Button>
                          {challenge.status === 'pending' ? (
                            <>
                              <Button type="button" variant="ghost" size="icon" onClick={() => void handleApprove(challenge)}>
                                <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden />
                                <span className="sr-only">Aprobar</span>
                              </Button>
                              <Button type="button" variant="ghost" size="icon" onClick={() => void handleReject(challenge)}>
                                <XCircle className="h-4 w-4 text-red-600" aria-hidden />
                                <span className="sr-only">Rechazar</span>
                              </Button>
                            </>
                          ) : null}
                          {challenge.effective_status === 'active' ? (
                            <Button type="button" variant="ghost" size="icon" onClick={() => void handleFinish(challenge)}>
                              <Flag className="h-4 w-4" aria-hidden />
                              <span className="sr-only">Finalizar</span>
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {challenges.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="px-3 py-12 text-center text-sm text-muted-foreground">
                        Sin Challenges para los filtros seleccionados.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          )}
        </SectionCardBody>
      </SectionCard>

      <ChallengeFormDialog
        open={dialogOpen}
        challenge={editing}
        adminMode
        currentUserId={currentUser?.id}
        areas={areas}
        onOpenChange={(open) => {
          setDialogOpen(open)
          if (!open) setEditing(null)
        }}
      />
    </div>
  )
}

function AdminKpi({
  label,
  value,
  icon,
  tone,
}: {
  label: string
  value: number
  icon: ReactElement
  tone: 'amber' | 'emerald' | 'blue' | 'slate'
}) {
  const classes = {
    amber: 'bg-amber-500/10 text-amber-700 dark:text-amber-200',
    emerald: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-200',
    blue: 'bg-blue-500/10 text-blue-700 dark:text-blue-200',
    slate: 'bg-slate-500/10 text-slate-700 dark:text-slate-200',
  }
  return (
    <div className="rounded-xl border border-border/60 bg-card p-4 shadow-sm">
      <div className={cn('flex h-9 w-9 items-center justify-center rounded-lg [&_svg]:h-4 [&_svg]:w-4', classes[tone])}>
        {icon}
      </div>
      <p className="mt-3 text-2xl font-bold tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  )
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string
  htmlFor: string
  children: ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  )
}
