import { useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, FileText, Flag, MessageSquare, MoreHorizontal, Send, Star, ThumbsUp } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SectionCard, SectionCardBody, SectionCardHeader } from '@/components/SectionCard'
import { ROUTES } from '@/constants'
import { formatDateTimeCDMX } from '@/lib/dateUtils'
import { cn } from '@/lib/utils'
import { useCurrentUser } from '@/features/users/hooks/useCurrentUser'
import { useUsers } from '@/features/users/hooks/useUsers'
import { isAdminByRole, isSuperAdminByRole } from '@/features/auth/lib/permissions'
import { notificacionesService } from '@/services/notificaciones.service'
import { useChallenge } from '../hooks/useChallenges'
import {
  useChallengeIdea,
  useChallengeIdeaAttachments,
  useChallengeIdeaComments,
  useCreateChallengeIdeaComment,
  useModerateChallengeIdeaComment,
  useReportChallengeContent,
  useToggleChallengeIdeaCommentVote,
  useToggleChallengeIdeaVote,
  useUpdateChallengeIdea,
} from '../hooks/useChallengeIdeas'
import { challengeIdeasService } from '../services/challengeIdeas.service'
import { isChallengeOpen } from '../services/challenges.service'
import type { ChallengeIdeaCommentListItem, ChallengeIdeaCommentSort, ChallengeReportReason } from '../types'
import { dateLabel, userInitials } from '../utils'

const REPORT_REASONS: Array<{ value: ChallengeReportReason; label: string }> = [
  { value: 'inappropriate', label: 'Contenido inapropiado' },
  { value: 'duplicate', label: 'Duplicado' },
  { value: 'off_topic', label: 'Fuera del Challenge' },
  { value: 'other', label: 'Otro' },
]

export function ChallengeIdeaDetailPage() {
  const { challengeId, ideaId } = useParams()
  const navigate = useNavigate()
  const { data: currentUser } = useCurrentUser()
  const { data: users = [] } = useUsers({ activo: true })
  const { data: challenge } = useChallenge(challengeId, currentUser?.id)
  const { data: idea, isLoading, isError, error, refetch } = useChallengeIdea(ideaId, currentUser?.id)
  const { data: attachments = [] } = useChallengeIdeaAttachments(ideaId)
  const [commentSort, setCommentSort] = useState<ChallengeIdeaCommentSort>('useful')
  const { data: comments = [], isLoading: commentsLoading } = useChallengeIdeaComments(ideaId, commentSort, currentUser?.id)
  const [content, setContent] = useState('')
  const [replyTo, setReplyTo] = useState<ChallengeIdeaCommentListItem | null>(null)
  const [replyContent, setReplyContent] = useState('')
  const toggleVote = useToggleChallengeIdeaVote(currentUser?.id)
  const toggleCommentVote = useToggleChallengeIdeaCommentVote(currentUser?.id)
  const createComment = useCreateChallengeIdeaComment(ideaId ?? '', challengeId)
  const updateIdea = useUpdateChallengeIdea(challengeId)
  const moderateComment = useModerateChallengeIdeaComment(ideaId ?? '')
  const reportContent = useReportChallengeContent()

  const userNames = useMemo(() => {
    const map: Record<string, string> = {}
    if (currentUser?.id) map[currentUser.id] = currentUser.nombre
    for (const user of users) map[user.id] = user.nombre
    return map
  }, [currentUser?.id, currentUser?.nombre, users])

  const canManage = Boolean(
    currentUser && (isAdminByRole(currentUser.rol) || isSuperAdminByRole(currentUser.rol))
  )
  const openForParticipation = challenge ? isChallengeOpen(challenge) : false
  const ownIdea = idea?.author_user_id === currentUser?.id
  const authorName = idea ? userNames[idea.author_user_id] ?? 'Usuario' : 'Usuario'

  const notify = async (usuarioId: string | null | undefined, tipo: string, titulo: string, mensaje: string) => {
    if (!usuarioId || usuarioId === currentUser?.id) return
    try {
      await notificacionesService.create({
        usuario_id: usuarioId,
        tipo,
        prioridad: 'Normal',
        payload: {
          titulo,
          mensaje,
          challenge_id: challengeId ?? null,
          idea_id: ideaId ?? null,
          autor_id: currentUser?.id ?? null,
          autor_nombre: currentUser?.nombre ?? null,
        },
      })
    } catch {
      // La participación principal no debe fallar si la notificación secundaria no se envió.
    }
  }

  const notifyMentions = async (text: string) => {
    const normalizedText = normalizeMentionText(text)
    const mentionedIds = users
      .filter((user) => user.id !== currentUser?.id)
      .filter((user) => normalizedText.includes(`@${normalizeMentionText(user.nombre)}`))
      .map((user) => user.id)
    await Promise.all(
      [...new Set(mentionedIds)].map((userId) =>
        notify(userId, 'challenge_idea_mention', 'Te mencionaron en una idea', 'Fuiste etiquetado en la conversación de una idea.')
      )
    )
  }

  const handleIdeaVote = async () => {
    if (!idea) return
    try {
      await toggleVote.mutateAsync({ idea })
      toast.success(idea.voted_by_me ? 'Apoyo retirado' : 'Gracias por apoyar esta idea')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo actualizar tu apoyo')
    }
  }

  const handleComment = async (event: FormEvent) => {
    event.preventDefault()
    if (!idea || !currentUser?.id) return
    const text = content.trim()
    if (text.length < 2) return
    try {
      await createComment.mutateAsync({ idea_id: idea.id, user_id: currentUser.id, content: text })
      setContent('')
      await notify(idea.author_user_id, 'challenge_idea_comment', 'Nueva retroalimentación', 'Alguien comentó tu idea.')
      await notifyMentions(text)
      toast.success('Comentario publicado')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo publicar el comentario')
    }
  }

  const handleReply = async (event: FormEvent) => {
    event.preventDefault()
    if (!idea || !currentUser?.id || !replyTo) return
    const text = replyContent.trim()
    if (text.length < 2) return
    try {
      await createComment.mutateAsync({
        idea_id: idea.id,
        user_id: currentUser.id,
        content: text,
        parent_comment_id: replyTo.id,
      })
      await notify(idea.author_user_id, 'challenge_idea_reply', 'Nueva respuesta en tu idea', 'Alguien respondió dentro de tu idea.')
      await notify(replyTo.user_id, 'challenge_idea_comment_reply', 'Respondieron tu comentario', 'Alguien respondió a tu comentario.')
      await notifyMentions(text)
      setReplyTo(null)
      setReplyContent('')
      toast.success('Respuesta publicada')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo publicar la respuesta')
    }
  }

  const handleReport = async (target: { ideaId?: string; commentId?: string }) => {
    if (!currentUser?.id || !challengeId) return
    const reason = window.prompt(`Motivo: ${REPORT_REASONS.map((item) => item.label).join(', ')}`, 'Fuera del Challenge')
    const match = REPORT_REASONS.find((item) => item.label.toLowerCase() === reason?.trim().toLowerCase())
    try {
      await reportContent.mutateAsync({
        reporter_user_id: currentUser.id,
        challenge_id: challengeId,
        idea_id: target.ideaId ?? null,
        comment_id: target.commentId ?? null,
        reason: match?.value ?? 'other',
        details: reason?.trim() || null,
      })
      toast.success('Reporte enviado a administración')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo enviar el reporte')
    }
  }

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-5xl px-3 py-5 sm:px-6 sm:py-6">
        <div className="h-[480px] animate-pulse rounded-2xl bg-muted/50" />
      </div>
    )
  }

  if (isError || !idea) {
    return (
      <div className="mx-auto w-full max-w-4xl px-3 py-5 sm:px-6 sm:py-6">
        <SectionCard>
          <SectionCardBody className="flex min-h-72 flex-col items-center justify-center gap-3 text-center">
            <p className="text-sm font-semibold">No se pudo abrir la idea.</p>
            <p className="max-w-md text-sm text-muted-foreground">
              {error instanceof Error ? error.message : 'Revisa permisos o conexión.'}
            </p>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => navigate(`${ROUTES.CHALLENGES}/${challengeId}`)}>
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

  const selected = idea.status === 'selected'

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col space-y-5 overflow-x-hidden px-3 py-5 sm:px-6 sm:py-6">
      <Button asChild variant="ghost" size="sm" className="w-fit gap-1.5">
        <Link to={`${ROUTES.CHALLENGES}/${challengeId}`}>
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Challenge
        </Link>
      </Button>

      <section className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            {challenge ? (
              <p className="text-sm text-muted-foreground">
                Challenge: <Link className="font-medium text-primary hover:underline" to={`${ROUTES.CHALLENGES}/${challenge.id}`}>{challenge.title}</Link>
              </p>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2">
              {selected ? <Badge className="bg-emerald-600 text-white">Seleccionada</Badge> : null}
              {idea.moderation_status === 'hidden' ? <Badge variant="outline">Oculta</Badge> : null}
            </div>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">{idea.title}</h1>
            <div className="mt-4 flex flex-wrap gap-2 text-xs text-muted-foreground">
              <span className="rounded-full border border-border/60 bg-background/70 px-2.5 py-1">
                {authorName}
              </span>
              <span className="rounded-full border border-border/60 bg-background/70 px-2.5 py-1">
                {dateLabel(idea.created_at.slice(0, 10))}
              </span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:min-w-72">
            <Metric icon={<ThumbsUp />} value={idea.metrics.votes} label="Apoyos" />
            <Metric icon={<MessageSquare />} value={idea.metrics.comments} label="Comentarios" />
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant={idea.voted_by_me ? 'secondary' : 'default'}
            disabled={!openForParticipation || ownIdea || toggleVote.isPending}
            title={ownIdea ? 'No puedes votar tu propia propuesta.' : undefined}
            onClick={() => void handleIdeaVote()}
            className="gap-1.5"
          >
            <ThumbsUp className="h-4 w-4" aria-hidden />
            {idea.voted_by_me ? 'Apoyada' : 'Apoyar idea'}
          </Button>
          <Button type="button" variant="outline" onClick={() => void handleReport({ ideaId: idea.id })}>
            <Flag className="mr-1.5 h-4 w-4" aria-hidden />
            Reportar
          </Button>
          {canManage ? (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => void updateIdea.mutateAsync({ id: idea.id, input: { status: 'selected', selected_by: currentUser?.id ?? null, selected_at: new Date().toISOString() } }).then(() => toast.success('Idea seleccionada')).catch((err) => toast.error(err instanceof Error ? err.message : 'No se pudo seleccionar'))}
              >
                <Star className="mr-1.5 h-4 w-4" aria-hidden />
                Seleccionar idea
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => void updateIdea.mutateAsync({ id: idea.id, input: { moderation_status: idea.moderation_status === 'hidden' ? 'visible' : 'hidden' } }).then(() => toast.success('Moderación actualizada')).catch((err) => toast.error(err instanceof Error ? err.message : 'No se pudo moderar'))}
              >
                <MoreHorizontal className="mr-1.5 h-4 w-4" aria-hidden />
                {idea.moderation_status === 'hidden' ? 'Restaurar' : 'Ocultar'}
              </Button>
            </>
          ) : null}
        </div>
      </section>

      <SectionCard>
        <SectionCardHeader title="Propuesta" icon={FileText} />
        <SectionCardBody className="space-y-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Qué propone hacer</p>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-foreground">{idea.description}</p>
          </div>
          {idea.expected_contribution?.trim() ? (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Cómo ayudaría</p>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-foreground">{idea.expected_contribution}</p>
            </div>
          ) : null}
          {attachments.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Adjuntos</p>
              <div className="flex flex-wrap gap-2">
                {attachments.map((attachment) => (
                  <Button
                    key={attachment.id}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      void challengeIdeasService.signedAttachmentUrl(attachment.storage_path)
                        .then((url) => window.open(url, '_blank', 'noopener,noreferrer'))
                        .catch((err) => toast.error(err instanceof Error ? err.message : 'No se pudo abrir el archivo'))
                    }}
                  >
                    <FileText className="mr-1.5 h-4 w-4" aria-hidden />
                    {attachment.file_name}
                  </Button>
                ))}
              </div>
            </div>
          ) : null}
        </SectionCardBody>
      </SectionCard>

      <SectionCard>
        <SectionCardHeader
          title="Conversación"
          subtitle={openForParticipation ? 'Comparte una observación, pregunta o mejora para esta idea.' : 'La participación ya está cerrada.'}
          icon={MessageSquare}
          action={
            <Select value={commentSort} onValueChange={(value) => setCommentSort(value as ChallengeIdeaCommentSort)}>
              <SelectTrigger className="h-9 w-44">
                <SelectValue placeholder="Ordenar comentarios" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="useful">Más útiles</SelectItem>
                <SelectItem value="recent">Más recientes</SelectItem>
                <SelectItem value="oldest">Más antiguos</SelectItem>
              </SelectContent>
            </Select>
          }
        />
        <SectionCardBody className="space-y-4">
          {commentsLoading ? (
            <p className="text-sm text-muted-foreground">Cargando conversación...</p>
          ) : comments.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border/70 px-4 py-8 text-center text-sm text-muted-foreground">
              Aún no hay retroalimentación.
            </p>
          ) : (
            <div className="space-y-3">
              {comments.map((comment) => (
                <CommentItem
                  key={comment.id}
                  comment={comment}
                  userNames={userNames}
                  canManage={canManage}
                  openForParticipation={openForParticipation}
                  currentUserId={currentUser?.id}
                  onReply={setReplyTo}
                  onVote={(item) => void toggleCommentVote.mutateAsync({ ideaId: idea.id, commentId: item.id, voted: item.voted_by_me })}
                  onReport={(item) => void handleReport({ commentId: item.id })}
                  onModerate={(item) => void moderateComment.mutateAsync({
                    id: item.id,
                    moderation_status: item.moderation_status === 'hidden' ? 'visible' : 'hidden',
                  })}
                />
              ))}
            </div>
          )}

          {openForParticipation ? (
            <form onSubmit={(event) => void handleComment(event)} className="rounded-xl border border-border/60 bg-muted/10 p-3">
              <textarea
                value={content}
                onChange={(event) => setContent(event.target.value)}
                rows={4}
                placeholder="Comparte una observación, pregunta o mejora para esta idea..."
                className="w-full resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
              <div className="mt-2 flex justify-end">
                <Button type="submit" size="sm" disabled={!content.trim() || createComment.isPending} className="gap-1.5">
                  <Send className="h-4 w-4" aria-hidden />
                  Publicar
                </Button>
              </div>
            </form>
          ) : null}
        </SectionCardBody>
      </SectionCard>

      {replyTo ? (
        <div className="fixed inset-x-3 bottom-3 z-50 rounded-xl border border-border bg-card p-3 shadow-lg sm:left-auto sm:w-[520px]">
          <form onSubmit={(event) => void handleReply(event)} className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Responder a {userNames[replyTo.user_id] ?? 'Usuario'}
            </p>
            <textarea
              value={replyContent}
              onChange={(event) => setReplyContent(event.target.value)}
              rows={3}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
              placeholder="Escribe tu respuesta..."
            />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setReplyTo(null)}>
                Cancelar
              </Button>
              <Button type="submit" size="sm" disabled={!replyContent.trim() || createComment.isPending}>
                Responder
              </Button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  )
}

function Metric({ icon, value, label }: { icon: ReactNode; value: number; label: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-background/70 p-3 text-center">
      <div className="mx-auto flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary [&_svg]:h-4 [&_svg]:w-4">
        {icon}
      </div>
      <p className="mt-1 text-xl font-bold tabular-nums">{value}</p>
      <p className="text-[11px] text-muted-foreground">{label}</p>
    </div>
  )
}

function normalizeMentionText(text: string) {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function CommentItem({
  comment,
  userNames,
  canManage,
  openForParticipation,
  currentUserId,
  onReply,
  onVote,
  onReport,
  onModerate,
}: {
  comment: ChallengeIdeaCommentListItem
  userNames: Record<string, string>
  canManage: boolean
  openForParticipation: boolean
  currentUserId?: string | null
  onReply: (comment: ChallengeIdeaCommentListItem) => void
  onVote: (comment: ChallengeIdeaCommentListItem) => void
  onReport: (comment: ChallengeIdeaCommentListItem) => void
  onModerate: (comment: ChallengeIdeaCommentListItem) => void
}) {
  const author = userNames[comment.user_id] ?? 'Usuario'
  return (
    <article className={cn('rounded-xl border border-border/50 bg-background/75 p-3', comment.moderation_status === 'hidden' && 'opacity-70')}>
      <div className="flex gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
          {userInitials(author)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-sm font-medium">{author}</p>
              <time className="text-[11px] text-muted-foreground">{formatDateTimeCDMX(comment.created_at)}</time>
            </div>
            {comment.moderation_status === 'hidden' ? <Badge variant="outline">Oculto</Badge> : null}
          </div>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{comment.content}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              variant={comment.voted_by_me ? 'secondary' : 'ghost'}
              size="sm"
              disabled={!openForParticipation || comment.user_id === currentUserId}
              onClick={() => onVote(comment)}
            >
              <ThumbsUp className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              {comment.votes}
            </Button>
            {!comment.parent_comment_id && openForParticipation ? (
              <Button type="button" variant="ghost" size="sm" onClick={() => onReply(comment)}>
                Responder
              </Button>
            ) : null}
            <Button type="button" variant="ghost" size="sm" onClick={() => onReport(comment)}>
              Reportar
            </Button>
            {canManage ? (
              <Button type="button" variant="ghost" size="sm" onClick={() => onModerate(comment)}>
                {comment.moderation_status === 'hidden' ? 'Restaurar' : 'Ocultar'}
              </Button>
            ) : null}
          </div>
        </div>
      </div>
      {comment.replies.length > 0 ? (
        <div className="ml-8 mt-3 space-y-2 border-l border-border/70 pl-3">
          {comment.replies.map((reply) => (
            <CommentItem
              key={reply.id}
              comment={reply}
              userNames={userNames}
              canManage={canManage}
              openForParticipation={openForParticipation}
              currentUserId={currentUserId}
              onReply={onReply}
              onVote={onVote}
              onReport={onReport}
              onModerate={onModerate}
            />
          ))}
        </div>
      ) : null}
    </article>
  )
}
