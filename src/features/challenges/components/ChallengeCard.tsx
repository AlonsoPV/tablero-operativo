import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight, CalendarDays, MessageSquare, ThumbsUp, Users } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { ROUTES } from '@/constants'
import { cn } from '@/lib/utils'
import type { ChallengeListItem } from '../types'
import {
  CHALLENGE_STATUS_BADGE,
  CHALLENGE_STATUS_LABEL,
  challengeTimeProgress,
  dateLabel,
  daysRemaining,
  userInitials,
} from '../utils'
import { ChallengeMetaBadges } from './ChallengeAboutSection'

type ChallengeCardProps = {
  challenge: ChallengeListItem
  creatorName: string
  areaName?: string | null
}

export function ChallengeCard({ challenge, creatorName, areaName }: ChallengeCardProps) {
  const remaining = daysRemaining(challenge)
  const status = challenge.effective_status
  const isActive = status === 'active'
  const progress = challengeTimeProgress(challenge)
  const preview =
    challenge.question?.trim() || challenge.context?.trim() || challenge.description

  return (
    <Link
      to={`${ROUTES.CHALLENGES}/${challenge.id}`}
      className={cn(
        'group relative flex min-h-[16rem] flex-col overflow-hidden rounded-xl border bg-card p-4 shadow-sm transition duration-300 sm:p-5',
        'hover:-translate-y-1 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        isActive ? 'border-primary/20 bg-gradient-to-br from-card via-card to-primary/[0.04]' : 'border-border/60'
      )}
    >
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent opacity-0 transition duration-300 group-hover:opacity-100"
        aria-hidden
      />

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-2.5 flex flex-wrap items-center gap-2">
            <Badge variant="outline" className={cn('text-[10px]', CHALLENGE_STATUS_BADGE[status])}>
              {CHALLENGE_STATUS_LABEL[status]}
            </Badge>
            {isActive ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium tabular-nums text-emerald-700 dark:text-emerald-300">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60 motion-reduce:animate-none" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
                </span>
                {remaining} día{remaining === 1 ? '' : 's'} restante{remaining === 1 ? '' : 's'}
              </span>
            ) : null}
          </div>
          <h2 className="line-clamp-2 text-base font-semibold leading-snug text-foreground transition-colors group-hover:text-primary sm:text-[1.05rem]">
            {challenge.title}
          </h2>
        </div>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary ring-1 ring-primary/10 transition duration-300 group-hover:scale-110 group-hover:bg-primary/15">
          {userInitials(creatorName)}
        </div>
      </div>

      <p className="mt-2.5 line-clamp-2 text-sm leading-relaxed text-muted-foreground">{preview}</p>

      <div className="mt-3">
        <ChallengeMetaBadges challenge={challenge} areaName={areaName} />
      </div>

      {isActive && progress != null ? (
        <div className="mt-3.5 space-y-1.5">
          <div className="flex items-center justify-between text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            <span>Avance del periodo</span>
            <span className="tabular-nums">{progress}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted/70">
            <div
              className="h-full origin-left rounded-full bg-gradient-to-r from-primary/80 to-primary animate-challenge-progress motion-reduce:animate-none"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-1.5">
        <Metric
          icon={<ThumbsUp className="h-3.5 w-3.5" aria-hidden />}
          value={challenge.metrics.votes}
          label="apoyos"
          highlight={challenge.metrics.votes > 0}
        />
        <Metric
          icon={<MessageSquare className="h-3.5 w-3.5" aria-hidden />}
          value={challenge.metrics.comments}
          label="comentarios"
        />
        <Metric
          icon={<Users className="h-3.5 w-3.5" aria-hidden />}
          value={challenge.metrics.participants}
          label="participantes"
        />
      </div>

      <div className="mt-auto flex items-end justify-between gap-3 border-t border-border/40 pt-4">
        <div className="min-w-0 text-[11px] leading-relaxed text-muted-foreground">
          <p className="truncate">{creatorName}</p>
          <p className="inline-flex items-center gap-1">
            <CalendarDays className="h-3 w-3 shrink-0" aria-hidden />
            Cierre {dateLabel(challenge.end_date ?? challenge.proposed_end_date)}
          </p>
        </div>
        <span
          className={cn(
            'inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold transition duration-300',
            isActive
              ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/25 group-hover:translate-x-0.5 group-hover:bg-primary/90'
              : 'bg-muted text-foreground group-hover:bg-muted/80'
          )}
        >
          {isActive ? 'Participar' : 'Ver detalle'}
          <ArrowUpRight className="h-3.5 w-3.5 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden />
        </span>
      </div>
    </Link>
  )
}

function Metric({
  icon,
  value,
  label,
  highlight,
}: {
  icon: ReactNode
  value: number
  label: string
  highlight?: boolean
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition',
        highlight
          ? 'border-primary/25 bg-primary/8 text-foreground'
          : 'border-border/60 bg-muted/20 text-muted-foreground'
      )}
    >
      {icon}
      <span className="tabular-nums text-foreground">{value}</span>
      {label}
    </span>
  )
}
