import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { MessageSquare, ThumbsUp } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ROUTES } from '@/constants'
import { cn } from '@/lib/utils'
import type { ChallengeIdeaListItem } from '../types'
import { dateLabel, userInitials } from '../utils'

export function ChallengeIdeaCard({
  idea,
  authorName,
  currentUserId,
  openForParticipation,
  onVote,
  compact,
}: {
  idea: ChallengeIdeaListItem
  authorName: string
  currentUserId?: string | null
  openForParticipation: boolean
  onVote: (idea: ChallengeIdeaListItem) => void
  compact?: boolean
}) {
  const ownIdea = idea.author_user_id === currentUserId
  const hidden = idea.moderation_status === 'hidden'
  return (
    <article className={cn(
      'rounded-xl border border-border/60 bg-card p-4 shadow-sm transition duration-300 hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-md hover:shadow-primary/5',
      compact ? 'space-y-3' : 'space-y-4',
      hidden && 'opacity-70'
    )}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap gap-2">
            {idea.status === 'selected' ? <Badge className="bg-emerald-600 text-white">Seleccionada</Badge> : null}
            {hidden ? <Badge variant="outline">Oculta</Badge> : null}
          </div>
          <h3 className="line-clamp-2 text-base font-semibold leading-snug text-foreground sm:text-lg">
            {idea.title}
          </h3>
        </div>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
          {userInitials(authorName)}
        </div>
      </div>

      <p className="line-clamp-3 text-sm leading-relaxed text-muted-foreground">{idea.description}</p>

      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{authorName}</span>
        <span>{dateLabel(idea.created_at.slice(0, 10))}</span>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <Metric icon={<ThumbsUp />} value={idea.metrics.votes} label="apoyos" />
          <Metric icon={<MessageSquare />} value={idea.metrics.comments} label="comentarios" />
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant={idea.voted_by_me ? 'secondary' : 'outline'}
            size="sm"
            disabled={!openForParticipation || ownIdea}
            onClick={() => onVote(idea)}
            title={ownIdea ? 'No puedes votar tu propia propuesta.' : undefined}
          >
            <ThumbsUp className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            {idea.voted_by_me ? 'Apoyada' : 'Apoyar'}
          </Button>
          <Button asChild size="sm">
            <Link to={`${ROUTES.CHALLENGES}/${idea.challenge_id}/ideas/${idea.id}`}>Ver idea</Link>
          </Button>
        </div>
      </div>
    </article>
  )
}

function Metric({ icon, value, label }: { icon: ReactNode; value: number; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/25 px-2.5 py-1 text-xs font-medium text-muted-foreground [&_svg]:h-3.5 [&_svg]:w-3.5">
      {icon}
      <span className="tabular-nums text-foreground">{value}</span>
      {label}
    </span>
  )
}
