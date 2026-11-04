import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { CopilotProposal } from '@/features/ai-support/copilot/types'
import { cancelAssistantOp, confirmAssistantOp } from '@/features/ai-support/services/assistantOpsClient'

type ProposalStatus = 'pending' | 'confirmed' | 'cancelled' | 'error'

type AssistantProposalCardProps = {
  proposal: CopilotProposal
  compact?: boolean
  onResolved?: (status: 'confirmed' | 'cancelled', href?: string) => void
}

export function AssistantProposalCard({
  proposal,
  compact = false,
  onResolved,
}: AssistantProposalCardProps) {
  const [status, setStatus] = useState<ProposalStatus>('pending')
  const [busy, setBusy] = useState<'confirm' | 'cancel' | null>(null)
  const [resultHref, setResultHref] = useState(proposal.record?.href)
  const [error, setError] = useState<string | null>(null)

  const confirm = async () => {
    setBusy('confirm')
    setError(null)
    try {
      const result = await confirmAssistantOp(proposal.id)
      setStatus('confirmed')
      const href = result.result?.href || proposal.record?.href
      setResultHref(href)
      onResolved?.('confirmed', href)
      toast.success('Operacion ejecutada.')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo confirmar.'
      setError(message)
      setStatus('error')
      toast.error(message)
    } finally {
      setBusy(null)
    }
  }

  const cancel = async () => {
    setBusy('cancel')
    setError(null)
    try {
      await cancelAssistantOp(proposal.id)
      setStatus('cancelled')
      onResolved?.('cancelled')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo cancelar.'
      setError(message)
      toast.error(message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <section
      className={cn(
        'mt-3 space-y-2.5 rounded-2xl bg-muted/30 px-3 py-2.5 ring-1 ring-border/50',
        compact && 'px-2.5 py-2'
      )}
      aria-label={proposal.title}
    >
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-primary">
          {proposal.title}
        </p>
        <p className={cn('mt-0.5 text-foreground', compact ? 'text-[13px] leading-5' : 'text-sm leading-6')}>
          {proposal.summary}
        </p>
      </div>
      {proposal.fields.length > 0 ? (
        <dl className="space-y-1">
          {proposal.fields.map((field) => (
            <div key={`${field.label}-${field.to}`} className="flex gap-2 text-[12px] leading-5">
              <dt className="w-24 shrink-0 text-muted-foreground">{field.label}</dt>
              <dd className="min-w-0 text-foreground">
                {field.from ? (
                  <>
                    <span className="text-muted-foreground line-through">{field.from}</span>
                    {' → '}
                  </>
                ) : null}
                {field.to}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
      {error ? <p className="text-[11px] text-destructive">{error}</p> : null}
      {status === 'confirmed' ? (
        <p className="text-[12px] text-foreground">
          Ejecutado.
          {resultHref ? (
            <>
              {' '}
              <Link
                to={resultHref}
                className="inline-flex items-center gap-0.5 font-medium text-primary hover:underline"
              >
                Abrir registro
                <ArrowUpRight className="h-3 w-3" aria-hidden />
              </Link>
            </>
          ) : null}
        </p>
      ) : status === 'cancelled' ? (
        <p className="text-[12px] text-muted-foreground">Operacion cancelada.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            className="h-8 rounded-full px-3"
            disabled={busy !== null}
            onClick={() => void confirm()}
          >
            {busy === 'confirm' ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
            Confirmar
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-8 rounded-full px-3"
            disabled={busy !== null}
            onClick={() => void cancel()}
          >
            {busy === 'cancel' ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
            Cancelar
          </Button>
        </div>
      )}
    </section>
  )
}
