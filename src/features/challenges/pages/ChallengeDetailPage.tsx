import { useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  HelpCircle,
  Lightbulb,
  MessageSquare,
  Send,
  ThumbsUp,
  Trash2,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { SectionCard, SectionCardBody, SectionCardHeader } from '@/components/SectionCard'
import { ROUTES } from '@/constants'
import { formatDateTimeCDMX } from '@/lib/dateUtils'
import { cn } from '@/lib/utils'
import { useCurrentUser } from '@/features/users/hooks/useCurrentUser'
import { useUsers } from '@/features/users/hooks/useUsers'
import { useAreas } from '@/features/catalogs/hooks/useAreas'
import { isAdminByRole, isDirectionByRole, isSuperAdminByRole } from '@/features/auth/lib/permissions'
import {
  useChallenge,
  useChallengeComments,
  useCreateChallengeComment,
  useDeleteChallengeComment,
  useToggleChallengeVote,
  useUpdateChallengeComment,
} from '../hooks/useChallenges'
import { isChallengeOpen } from '../services/challenges.service'
import { ChallengeMetaBadges } from '../components/ChallengeAboutSection'
import { ChallengeIdeasSection } from '../components/ChallengeIdeasSection'
import { AmbientOrbs, AnimatedNumber } from '../components/ChallengeMotion'
import {
  CHALLENGE_SUPPORT_LABEL,
  CHALLENGE_SUPPORT_LABEL_ACTIVE,
  CHALLENGE_SUPPORT_TOOLTIP,
} from '../constants'
import {
  CHALLENGE_STATUS_BADGE,
  CHALLENGE_STATUS_LABEL,
  challengeTimeProgress,
  dateLabel,
  daysRemaining,
  userInitials,
} from '../utils'

export function ChallengeDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { data: currentUser } = useCurrentUser()
  const { data: users = [] } = useUsers({ activo: true })
  const { data: areas = [] } = useAreas({ activo: true })
  const { data: challenge, isLoading, isError, error, refetch } = useChallenge(id, currentUser?.id)
  const { data: comments = [], isLoading: commentsLoading } = useChallengeComments(id)
  const toggleVote = useToggleChallengeVote(currentUser?.id)
  const createComment = useCreateChallengeComment(id ?? '')
  const updateComment = useUpdateChallengeComment(id ?? '')
  const deleteComment = useDeleteChallengeComment(id ?? '')
  const [content, setContent] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingContent, setEditingContent] = useState('')
  const [commentsOpen, setCommentsOpen] = useState(false)

  const userNames = useMemo(() => {
    const map: Record<string, string> = {}
    if (currentUser?.id) map[currentUser.id] = currentUser.nombre
    for (const user of users) map[user.id] = user.nombre
    return map
  }, [currentUser?.id, currentUser?.nombre, users])
  const areaNames = useMemo(() => Object.fromEntries(areas.map((area) => [area.id, area.nombre])), [areas])

  const openForParticipation = challenge ? isChallengeOpen(challenge) : false
  const canManageChallenge = Boolean(
    currentUser && (isAdminByRole(currentUser.rol) || isDirectionByRole(currentUser.rol) || isSuperAdminByRole(currentUser.rol))
  )

  const handleVote = async () => {
    if (!challenge) return
    try {
      await toggleVote.mutateAsync({ challenge })
      toast.success(challenge.voted_by_me ? 'Apoyo retirado' : 'Gracias por considerar importante este reto')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo actualizar tu apoyo')
    }
  }

  const handleComment = async (event: FormEvent) => {
    event.preventDefault()
    if (!challenge || !currentUser?.id) return
    const text = content.trim()
    if (text.length < 2) return
    try {
      await createComment.mutateAsync({ challenge_id: challenge.id, user_id: currentUser.id, content: text })
      setContent('')
      toast.success('Comentario publicado')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo publicar el comentario')
    }
  }

  const saveEditedComment = async () => {
    if (!editingId) return
    const text = editingContent.trim()
    if (text.length < 2) return
    try {
      await updateComment.mutateAsync({ id: editingId, content: text })
      setEditingId(null)
      setEditingContent('')
      toast.success('Comentario actualizado')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo actualizar el comentario')
    }
  }

  const removeComment = async (commentId: string) => {
    try {
      await deleteComment.mutateAsync(commentId)
      toast.success('Comentario eliminado')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo eliminar el comentario')
    }
  }

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-5xl px-3 py-5 sm:px-6 sm:py-6">
        <div className="h-[360px] animate-pulse rounded-2xl bg-muted/50" />
      </div>
    )
  }

  if (isError || !challenge) {
    return (
      <div className="mx-auto w-full max-w-4xl px-3 py-5 sm:px-6 sm:py-6">
        <SectionCard>
          <SectionCardBody className="flex min-h-72 flex-col items-center justify-center gap-3 text-center">
            <p className="text-sm font-semibold">No se pudo abrir el Challenge.</p>
            <p className="max-w-md text-sm text-muted-foreground">
              {error instanceof Error ? error.message : 'Revisa permisos o conexion.'}
            </p>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => navigate(ROUTES.CHALLENGES)}>
                Volver
              </Button>
              <Button type="button" onClick={() => void refetch()}>
                Reintentar
              </Button>
            </div>
          </SectionCardBody>
        </SectionCard>
      </div>
    )
  }

  const remaining = daysRemaining(challenge)
  const progress = challengeTimeProgress(challenge)
  const creatorName = userNames[challenge.created_by] ?? 'Usuario'
  const isActive = challenge.effective_status === 'active'
  const areaName = challenge.area_id ? areaNames[challenge.area_id] : null
  const question = challenge.question?.trim()
  const context = challenge.context?.trim()
  const success = challenge.success_criteria?.trim()
  const bodyFallback =
    !question && !context ? challenge.description?.trim() || null : null

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 overflow-x-hidden px-3 py-5 sm:gap-5 sm:px-6 sm:py-6">
      <Button asChild variant="ghost" size="sm" className="w-fit gap-1.5">
        <Link to={ROUTES.CHALLENGES}>
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Challenges
        </Link>
      </Button>

      <section className="relative overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br from-card via-card to-primary/[0.06] shadow-sm animate-challenge-fade-up motion-reduce:animate-none">
        <AmbientOrbs />
        <div className="relative space-y-4 p-5 sm:p-6">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className={CHALLENGE_STATUS_BADGE[challenge.effective_status]}>
              {CHALLENGE_STATUS_LABEL[challenge.effective_status]}
            </Badge>
            {isActive ? (
              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60 motion-reduce:animate-none" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
                </span>
                {remaining} día{remaining === 1 ? '' : 's'} restante{remaining === 1 ? '' : 's'}
              </span>
            ) : null}
            <span className="text-[11px] text-muted-foreground">
              {creatorName}
              {areaName ? ` · ${areaName}` : ''}
              {' · '}
              Cierre {dateLabel(challenge.end_date ?? challenge.proposed_end_date)}
            </span>
          </div>

          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-[1.85rem]">
            {challenge.title}
          </h1>

          <ChallengeMetaBadges challenge={challenge} areaName={areaName} />

          {question ? (
            <p className="rounded-xl border border-primary/15 bg-primary/[0.04] px-4 py-3 text-sm font-medium leading-relaxed text-foreground">
              {question}
            </p>
          ) : null}

          {context ? (
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{context}</p>
          ) : null}

          {bodyFallback ? (
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{bodyFallback}</p>
          ) : null}

          {success ? (
            <p className="text-sm leading-relaxed">
              <span className="font-semibold text-foreground">Éxito: </span>
              <span className="text-muted-foreground">{success}</span>
            </p>
          ) : null}

          {progress != null ? (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>
                  {dateLabel(challenge.start_date ?? challenge.proposed_start_date)}
                  {' → '}
                  {dateLabel(challenge.end_date ?? challenge.proposed_end_date)}
                </span>
                <span className="tabular-nums font-medium">{progress}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted/80">
                <div
                  className="h-full origin-left rounded-full bg-gradient-to-r from-primary/70 to-primary animate-challenge-progress motion-reduce:animate-none"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          ) : null}

          <div className="flex flex-col gap-3 border-t border-border/50 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
              <InlineStat icon={Lightbulb} value={challenge.metrics.ideas ?? 0} label="ideas" />
              <InlineStat icon={ThumbsUp} value={challenge.metrics.ideaVotes ?? 0} label="apoyos" />
              <InlineStat icon={MessageSquare} value={challenge.metrics.ideaComments ?? 0} label="comentarios" />
              <InlineStat icon={Users} value={challenge.metrics.participants} label="participantes" />
            </div>

            <TooltipProvider>
              <div className="flex items-center gap-1.5">
                <Button
                  type="button"
                  disabled={!openForParticipation || toggleVote.isPending}
                  variant={challenge.voted_by_me ? 'secondary' : 'default'}
                  onClick={() => void handleVote()}
                  className={cn(
                    'h-10 gap-2',
                    !challenge.voted_by_me && 'shadow-sm shadow-primary/20'
                  )}
                >
                  <ThumbsUp
                    className={cn('h-4 w-4', challenge.voted_by_me && 'fill-current')}
                    aria-hidden
                  />
                  {challenge.voted_by_me ? CHALLENGE_SUPPORT_LABEL_ACTIVE : CHALLENGE_SUPPORT_LABEL}
                </Button>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button type="button" variant="ghost" size="icon" className="h-10 w-10 shrink-0">
                      <HelpCircle className="h-4 w-4 text-muted-foreground" aria-hidden />
                      <span className="sr-only">Qué significa apoyar</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-xs text-left leading-relaxed">
                    {CHALLENGE_SUPPORT_TOOLTIP}
                  </TooltipContent>
                </Tooltip>
              </div>
            </TooltipProvider>
          </div>
        </div>
      </section>

      {challenge.effective_status === 'finished' && challenge.result_summary?.trim() ? (
        <SectionCard>
          <SectionCardHeader title="Resultado" icon={CheckCircle2} />
          <SectionCardBody>
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{challenge.result_summary.trim()}</p>
          </SectionCardBody>
        </SectionCard>
      ) : null}

      <ChallengeIdeasSection
        challenge={challenge}
        currentUser={currentUser}
        userNames={userNames}
        openForParticipation={openForParticipation}
      />

      <section className="rounded-xl border border-border/60 bg-card shadow-sm">
        <button
          type="button"
          onClick={() => setCommentsOpen((open) => !open)}
          className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-muted/30 sm:px-5"
          aria-expanded={commentsOpen}
        >
          <span className="flex min-w-0 items-center gap-2">
            <MessageSquare className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="text-sm font-semibold text-foreground">Conversación general</span>
            <Badge variant="secondary" className="tabular-nums">
              {comments.length}
            </Badge>
          </span>
          <ChevronDown
            className={cn(
              'h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200',
              commentsOpen && 'rotate-180'
            )}
            aria-hidden
          />
        </button>

        <div
          className={cn(
            'grid transition-[grid-template-rows] duration-300 ease-out',
            commentsOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
          )}
        >
          <div className="overflow-hidden">
            <div className="space-y-3 border-t border-border/50 px-4 py-4 sm:px-5">
              <p className="text-xs text-muted-foreground">
                Para soluciones, usa ideas. Aquí solo conversación general.
              </p>

              {commentsLoading ? (
                <p className="text-sm text-muted-foreground">Cargando comentarios...</p>
              ) : comments.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border/70 px-3 py-6 text-center text-sm text-muted-foreground">
                  Aún no hay comentarios.
                </p>
              ) : (
                <div className="space-y-2.5">
                  {comments.map((comment) => {
                    const author = userNames[comment.user_id] ?? 'Usuario'
                    const canEdit = comment.user_id === currentUser?.id || canManageChallenge
                    return (
                      <article key={comment.id} className="flex gap-2.5 rounded-lg border border-border/50 bg-background/70 p-2.5">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground">
                          {userInitials(author)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-sm font-medium">{author}</p>
                              <time className="text-[11px] text-muted-foreground">
                                {formatDateTimeCDMX(comment.created_at)}
                              </time>
                            </div>
                            {canEdit ? (
                              <div className="flex gap-1">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    setEditingId(comment.id)
                                    setEditingContent(comment.content)
                                  }}
                                >
                                  Editar
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => void removeComment(comment.id)}
                                >
                                  <Trash2 className="h-4 w-4" aria-hidden />
                                  <span className="sr-only">Eliminar comentario</span>
                                </Button>
                              </div>
                            ) : null}
                          </div>
                          {editingId === comment.id ? (
                            <div className="mt-2 space-y-2">
                              <textarea
                                value={editingContent}
                                onChange={(event) => setEditingContent(event.target.value)}
                                rows={3}
                                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
                              />
                              <div className="flex justify-end gap-2">
                                <Button type="button" variant="outline" size="sm" onClick={() => setEditingId(null)}>
                                  Cancelar
                                </Button>
                                <Button type="button" size="sm" onClick={() => void saveEditedComment()}>
                                  Guardar
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed">{comment.content}</p>
                          )}
                        </div>
                      </article>
                    )
                  })}
                </div>
              )}

              {openForParticipation ? (
                <form
                  onSubmit={(event) => void handleComment(event)}
                  className="rounded-lg border border-border/60 bg-muted/10 p-2.5"
                >
                  <textarea
                    value={content}
                    onChange={(event) => setContent(event.target.value)}
                    rows={3}
                    placeholder="Escribe un comentario..."
                    className="w-full resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                  />
                  <div className="mt-1.5 flex justify-end">
                    <Button
                      type="submit"
                      size="sm"
                      className="gap-1.5"
                      disabled={!content.trim() || createComment.isPending}
                    >
                      <Send className="h-4 w-4" aria-hidden />
                      Publicar
                    </Button>
                  </div>
                </form>
              ) : null}
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

function InlineStat({
  icon: Icon,
  value,
  label,
}: {
  icon: typeof Lightbulb
  value: number
  label: string
}) {
  return (
    <span className="inline-flex items-center gap-1.5 text-muted-foreground">
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="font-semibold tabular-nums text-foreground">
        <AnimatedNumber value={value} />
      </span>
      {label}
    </span>
  )
}
