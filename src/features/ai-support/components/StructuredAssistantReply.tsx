import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, ChevronDown, Lightbulb } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { AssistantStructuredReply } from '@/features/ai-support/assistantBriefing'
import { SectionEyebrow } from '@/features/ai-support/components/ui'

type StructuredAssistantReplyProps = {
  reply: AssistantStructuredReply
  compact?: boolean
}

/** Análisis: conclusión destacada, evidencia plegable, recomendación y acción sugerida. */
export function StructuredAssistantReply({ reply, compact }: StructuredAssistantReplyProps) {
  const [showEvidence, setShowEvidence] = useState(false)
  const bodyText = compact ? 'text-[13px] leading-5' : 'text-sm leading-6'

  return (
    <div className="space-y-2.5">
      <div className="rounded-2xl bg-card px-3.5 py-3 ring-1 ring-border/70">
        <SectionEyebrow>Conclusión</SectionEyebrow>
        <p className={cn('mt-1 font-medium text-foreground', compact ? 'text-[13px] leading-5' : 'text-[15px] leading-6')}>
          {reply.finding}
        </p>
        {reply.evidence ? (
          <div className="mt-2">
            <button
              type="button"
              aria-expanded={showEvidence}
              onClick={() => setShowEvidence((value) => !value)}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {showEvidence ? 'Ocultar evidencia' : 'Ver evidencia'}
              <ChevronDown
                className={cn('h-3 w-3 transition-transform duration-150', showEvidence && 'rotate-180')}
                aria-hidden
              />
            </button>
            {showEvidence ? (
              <p
                className={cn(
                  'animate-in fade-in-0 mt-1.5 border-l-2 border-border/70 pl-3 text-muted-foreground duration-150',
                  bodyText
                )}
              >
                {reply.evidence}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      {reply.recommendation || reply.nextAction ? (
        <div className="rounded-2xl bg-primary/[0.06] px-3.5 py-3 ring-1 ring-primary/15">
          <SectionEyebrow icon={Lightbulb}>Recomendación</SectionEyebrow>
          {reply.recommendation ? <p className={cn('mt-1 text-foreground/90', bodyText)}>{reply.recommendation}</p> : null}
          {reply.nextAction && !reply.record ? (
            <p className="mt-1 text-[12px] text-muted-foreground">Siguiente: {reply.nextAction}</p>
          ) : null}
          {reply.record ? (
            <Link
              to={reply.record.href}
              className={cn(
                'mt-2.5 inline-flex max-w-full items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition',
                'hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
              )}
            >
              <span className="truncate">{reply.nextAction || `Abrir ${reply.record.title}`}</span>
              <ArrowRight className="h-3.5 w-3.5 shrink-0" aria-hidden />
            </Link>
          ) : null}
        </div>
      ) : reply.record ? (
        <Link
          to={reply.record.href}
          className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="truncate">Abrir {reply.record.title}</span>
          <ArrowRight className="h-3.5 w-3.5 shrink-0" aria-hidden />
        </Link>
      ) : null}
    </div>
  )
}
