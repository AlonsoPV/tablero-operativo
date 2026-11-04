import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { AssistantStructuredReply } from '@/features/ai-support/assistantBriefing'

type StructuredAssistantReplyProps = {
  reply: AssistantStructuredReply
  compact?: boolean
}

function Row({
  label,
  children,
  compact,
}: {
  label: string
  children: ReactNode
  compact?: boolean
}) {
  return (
    <div className="space-y-0.5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-primary">{label}</p>
      <div
        className={cn(
          'text-foreground/90',
          compact ? 'text-[13px] leading-5' : 'text-sm leading-6'
        )}
      >
        {children}
      </div>
    </div>
  )
}

export function StructuredAssistantReply({ reply, compact }: StructuredAssistantReplyProps) {
  return (
    <div className={cn('space-y-2.5', compact ? 'text-[13px]' : 'text-sm')}>
      <Row label="Hallazgo" compact={compact}>
        {reply.finding}
      </Row>
      {reply.evidence ? (
        <Row label="Evidencia" compact={compact}>
          {reply.evidence}
        </Row>
      ) : null}
      {reply.recommendation ? (
        <Row label="Recomendacion" compact={compact}>
          {reply.recommendation}
        </Row>
      ) : null}
      {reply.nextAction ? (
        <Row label="Siguiente accion" compact={compact}>
          {reply.nextAction}
        </Row>
      ) : null}
      {reply.record ? (
        <div className="pt-0.5">
          <Link
            to={reply.record.href}
            className="inline-flex max-w-full items-center gap-1 truncate rounded-full bg-muted/50 px-2.5 py-1 text-[11px] font-medium text-primary ring-1 ring-border/45 transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="truncate">Abrir: {reply.record.title}</span>
            <ArrowUpRight className="h-3 w-3 shrink-0" aria-hidden />
          </Link>
        </div>
      ) : null}
    </div>
  )
}
