import { AssistantProposalCard } from '@/features/ai-support/components/AssistantProposalCard'
import type { CopilotProposal } from '@/features/ai-support/copilot/types'
import {
  communicationStatusLabel,
  mapProposalStatusToLifecycle,
  toActionCardView,
} from '@/features/ai-support/copilot/actionLifecycle'
import { cn } from '@/lib/utils'

type SessionOp = CopilotProposal & {
  status?: string
  errorMessage?: string | null
  deliveryStatus?: string | null
}

function isPendingReview(op: SessionOp) {
  const status = op.status || 'pending'
  if (status === 'confirmed' || status === 'cancelled') return false
  return true
}

export function countPendingCommunications(ops: SessionOp[]) {
  return ops.filter(isPendingReview).length
}

export function GuideCommunicationsSection({
  ops,
  readOnly = false,
  onUpdated,
  onResolved,
  showPendingChip = true,
}: {
  ops: SessionOp[]
  /** Invite / lectura: muestra borradores sin permitir envío. */
  readOnly?: boolean
  onUpdated?: (proposal: CopilotProposal) => void
  onResolved?: (id: string, status: 'confirmed' | 'cancelled') => void
  showPendingChip?: boolean
}) {
  if (!ops.length) return null

  const pendingCount = countPendingCommunications(ops)

  return (
    <section className="space-y-3" aria-label="Comunicaciones por aprobar">
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base font-semibold tracking-tight">Comunicaciones por aprobar</h2>
          {showPendingChip && pendingCount > 0 ? (
            <span className="rounded-full border border-[#D97706]/35 bg-[#D97706]/10 px-2.5 py-0.5 text-[11px] font-medium text-[#B45309]">
              {pendingCount} comunicacion{pendingCount === 1 ? '' : 'es'} pendiente
              {pendingCount === 1 ? '' : 's'}
            </span>
          ) : null}
        </div>
        <p className="text-sm text-muted-foreground">
          {readOnly
            ? 'Borradores preparados en la entrevista. Inicia sesion como el dueno para editar, aprobar y enviar.'
            : 'WhatsApp y correos listos para revisar. Enviardián prepara; tu apruebas; Scrumban envia.'}
        </p>
      </div>
      <ul className="space-y-2">
        {ops.map((item) => {
          const rawStatus = item.status || 'pending'
          const cardStatus =
            rawStatus === 'confirmed'
              ? 'confirmed'
              : rawStatus === 'cancelled'
                ? 'cancelled'
                : item.errorMessage
                  ? 'error'
                  : 'pending'
          const view = toActionCardView(item, {
            status:
              rawStatus === 'executing'
                ? 'executing'
                : cardStatus === 'error'
                  ? 'error'
                  : cardStatus,
            errorMessage: item.errorMessage,
          })
          const label = communicationStatusLabel({
            lifecycle: mapProposalStatusToLifecycle(
              rawStatus === 'executing'
                ? 'executing'
                : cardStatus === 'error'
                  ? 'error'
                  : cardStatus === 'confirmed'
                    ? 'confirmed'
                    : cardStatus === 'cancelled'
                      ? 'cancelled'
                      : item.workspace?.needsInfo || item.workspace?.incomplete
                        ? 'needs_info'
                        : 'pending'
            ),
            deliveryStatus: item.deliveryStatus,
            incomplete: item.workspace?.incomplete,
            errorMessage: item.errorMessage,
          })
          const channelTone =
            view.kind === 'whatsapp'
              ? 'text-[#15803D]'
              : view.kind === 'email'
                ? 'text-[#1D4ED8]'
                : 'text-muted-foreground'
          return (
            <li key={item.id}>
              <p className={cn('mb-1 text-[11px] font-medium uppercase tracking-wide', channelTone)}>
                {view.kind === 'whatsapp' ? 'WhatsApp' : view.kind === 'email' ? 'Correo' : 'Mensaje'}
                {' · '}
                <span className="text-muted-foreground normal-case tracking-normal">{label}</span>
              </p>
              <AssistantProposalCard
                proposal={item}
                status={cardStatus}
                readOnly={readOnly}
                onUpdated={readOnly ? undefined : onUpdated}
                onResolved={readOnly ? undefined : (next) => onResolved?.(item.id, next)}
              />
            </li>
          )
        })}
      </ul>
    </section>
  )
}
