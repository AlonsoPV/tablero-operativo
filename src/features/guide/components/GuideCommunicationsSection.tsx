import { AssistantProposalCard } from '@/features/ai-support/components/AssistantProposalCard'
import type { CopilotProposal } from '@/features/ai-support/copilot/types'
import {
  communicationStatusLabel,
  mapProposalStatusToLifecycle,
  toActionCardView,
} from '@/features/ai-support/copilot/actionLifecycle'
import {
  countActionablePendingOps,
  isCommunicationPendingTool,
} from '@/features/ai-support/copilot/pendingOpTaxonomy'
import { Link } from 'react-router-dom'
import { ROUTES } from '@/constants'
import { guideVoiceLoginState } from '@/features/guide/voiceLogin'
import { cn } from '@/lib/utils'

type SessionOp = CopilotProposal & {
  status?: string
  errorMessage?: string | null
  deliveryStatus?: string | null
}

function isPendingReview(op: SessionOp) {
  return countActionablePendingOps([op]) > 0
}

export function countPendingCommunications(ops: SessionOp[]) {
  return countActionablePendingOps(ops)
}

export function GuideCommunicationsSection({
  ops,
  readOnly = false,
  confirmOp,
  cancelOp,
  disableEdit = false,
  onUpdated,
  onResolved,
  showPendingChip = true,
  title,
  subtitle,
  showLoginCta = false,
}: {
  ops: SessionOp[]
  /** Invite / lectura: muestra borradores sin permitir envío. */
  readOnly?: boolean
  confirmOp?: (opId: string) => Promise<{ result?: { href?: string } | null }>
  cancelOp?: (opId: string) => Promise<void>
  disableEdit?: boolean
  onUpdated?: (proposal: CopilotProposal) => void
  onResolved?: (id: string, status: 'confirmed' | 'cancelled') => void
  showPendingChip?: boolean
  title?: string
  subtitle?: string
  /** CTA de login cuando la liga es solo lectura. */
  showLoginCta?: boolean
}) {
  if (!ops.length) return null

  const pendingCount = countPendingCommunications(ops)
  const allComms = ops.every((op) => isCommunicationPendingTool(op.tool))
  const resolvedTitle =
    title ||
    (allComms ? 'Comunicaciones por aprobar' : 'Tareas e iniciativas por aprobar')
  const resolvedSubtitle =
    subtitle ||
    (readOnly
      ? 'Borradores preparados en la entrevista. Inicia sesion como el dueno para editar, aprobar y enviar.'
      : 'Enviardian prepara; tu revisas y apruebas.')

  return (
    <section className="space-y-3" aria-label={resolvedTitle}>
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="text-sm font-semibold tracking-tight text-slate-800">{resolvedTitle}</h4>
          {showPendingChip && pendingCount > 0 ? (
            <span className="rounded-full border border-[#D97706]/35 bg-[#D97706]/10 px-2.5 py-0.5 text-[11px] font-medium text-[#B45309]">
              {pendingCount} pendiente{pendingCount === 1 ? '' : 's'}
            </span>
          ) : null}
        </div>
        <p className="text-sm text-muted-foreground">{resolvedSubtitle}</p>
        {showLoginCta && readOnly ? (
          <p className="text-xs text-slate-600">
            <Link className="font-medium underline underline-offset-4" to={ROUTES.LOGIN} state={guideVoiceLoginState}>
              Iniciar sesion
            </Link>{' '}
            como el dueno para editar, aprobar o descartar.
          </p>
        ) : null}
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
                : view.kind === 'event'
                  ? 'text-[#0D9488]'
                  : 'text-muted-foreground'
          return (
            <li key={item.id}>
              <p className={cn('mb-1 text-[11px] font-medium uppercase tracking-wide', channelTone)}>
                {view.kind === 'whatsapp'
                  ? 'WhatsApp'
                  : view.kind === 'email'
                    ? 'Correo'
                    : view.kind === 'event'
                      ? 'Calendario'
                      : 'Tablero'}
                {' · '}
                <span className="text-muted-foreground normal-case tracking-normal">{label}</span>
              </p>
              <AssistantProposalCard
                proposal={item}
                status={cardStatus}
                readOnly={readOnly}
                confirmOp={readOnly ? undefined : confirmOp}
                cancelOp={readOnly ? undefined : cancelOp}
                disableEdit={readOnly || disableEdit}
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

export { isPendingReview }
