/**
 * Ciclo de vida unificado de acciones Enviardian (pending ops + workspace drafts).
 */
import type { CopilotProposal } from '@/features/ai-support/copilot/types'
import { sanitizeRecipientFacingText } from '@/features/ai-support/copilot/pendingOpTaxonomy'
import { toneRailClass, type AssistantTone } from '@/features/ai-support/components/ui/tones'

export type ActionLifecycleStatus =
  | 'preparing'
  | 'needs_info'
  | 'pending_confirmation'
  | 'executing'
  | 'completed'
  | 'error'
  | 'cancelled'
  | 'expired'
  | 'conflict'

export type ProposalUiStatus =
  | 'pending'
  | 'confirmed'
  | 'cancelled'
  | 'error'
  | 'executing'
  | 'preparing'
  | 'needs_info'
  | 'expired'
  | 'conflict'

export type ActionCardView = {
  id: string
  tool: string
  title: string
  summary: string
  status: ActionLifecycleStatus
  statusLabel: string
  fields: Array<{ label: string; from?: string; to?: string }>
  resultHref?: string
  errorMessage?: string | null
  kind: 'board' | 'email' | 'event' | 'whatsapp'
  emailPreview?: {
    from?: string
    to: string[]
    cc?: string[]
    subject?: string
    body?: string
  }
  eventPreview?: {
    title?: string
    start?: string
    end?: string
    attendees?: string[]
  }
  whatsappPreview?: {
    recipientName?: string
    phone?: string
    body?: string
    needsInfo?: boolean
    needsInfoReason?: string
  }
}

export function actionStatusLabel(status: ActionLifecycleStatus): string {
  if (status === 'preparing') return 'Borrador preparado'
  if (status === 'needs_info') return 'Requiere informacion'
  if (status === 'pending_confirmation') return 'Listo para revisar'
  if (status === 'executing') return 'Ejecutando'
  if (status === 'completed') return 'Ejecutado'
  if (status === 'error') return 'Fallido'
  if (status === 'expired') return 'Vencido'
  if (status === 'conflict') return 'Conflicto'
  return 'Descartado'
}

/** Etiqueta de comunicacion: no confundir aceptado con entregado. */
export function communicationStatusLabel(input: {
  lifecycle: ActionLifecycleStatus
  deliveryStatus?: string | null
  incomplete?: boolean
  errorMessage?: string | null
}): string {
  if (input.lifecycle === 'cancelled') return 'Descartado'
  if (input.lifecycle === 'expired') return 'Vencido'
  if (input.lifecycle === 'conflict') return 'Conflicto'
  if (input.lifecycle === 'error' || input.errorMessage) return 'Fallido'
  if (input.lifecycle === 'executing') return 'Enviando'
  if (input.lifecycle === 'needs_info' || input.incomplete) {
    return input.incomplete && input.lifecycle !== 'needs_info'
      ? 'Borrador preparado'
      : 'Requiere informacion'
  }
  if (input.lifecycle === 'preparing') return 'Borrador preparado'
  if (input.lifecycle === 'completed') {
    const delivery = (input.deliveryStatus || '').toLowerCase()
    if (delivery === 'delivered' || delivery === 'read') return 'Entregado'
    if (delivery === 'failed') return 'Fallido'
    return 'Aceptado por el proveedor'
  }
  return 'Pendiente de aprobacion'
}

/** Mapear estado de UI/ops al ciclo de vida. */
export function mapProposalStatusToLifecycle(
  status: ProposalUiStatus | undefined,
  busy?: 'confirm' | 'cancel' | 'edit' | null
): ActionLifecycleStatus {
  if (busy === 'confirm' || busy === 'cancel' || busy === 'edit' || status === 'executing') return 'executing'
  if (status === 'confirmed') return 'completed'
  if (status === 'cancelled') return 'cancelled'
  if (status === 'error') return 'error'
  if (status === 'expired') return 'expired'
  if (status === 'conflict') return 'conflict'
  if (status === 'needs_info') return 'needs_info'
  if (status === 'preparing') return 'preparing'
  return 'pending_confirmation'
}

export function toActionCardView(
  proposal: CopilotProposal,
  opts?: {
    status?: ProposalUiStatus
    busy?: 'confirm' | 'cancel' | 'edit' | null
    errorMessage?: string | null
    resultHref?: string
  }
): ActionCardView {
  const lifecycle = mapProposalStatusToLifecycle(opts?.status, opts?.busy)
  const workspace = proposal.workspace
  const kind: ActionCardView['kind'] =
    workspace?.kind === 'whatsapp' || proposal.tool === 'whatsapp_prepare_send'
      ? 'whatsapp'
      : workspace?.kind === 'email' ||
          proposal.tool.startsWith('gmail_') ||
          proposal.tool === 'notify_action_email'
        ? 'email'
        : workspace?.kind === 'event' || proposal.tool.startsWith('calendar_')
          ? 'event'
          : 'board'

  const needsInfo = Boolean(workspace?.needsInfo || workspace?.incomplete)
  const statusForView =
    needsInfo && lifecycle === 'pending_confirmation' ? ('needs_info' as const) : opts?.status

  return {
    id: proposal.id,
    tool: proposal.tool,
    title: proposal.title,
    summary: proposal.summary,
    status: mapProposalStatusToLifecycle(statusForView, opts?.busy),
    statusLabel: actionStatusLabel(mapProposalStatusToLifecycle(statusForView, opts?.busy)),
    fields: proposal.fields ?? [],
    resultHref: opts?.resultHref || proposal.record?.href,
    errorMessage: opts?.errorMessage ?? workspace?.needsInfoReason ?? null,
    kind,
    emailPreview:
      kind === 'email'
        ? {
            from: workspace?.from,
            to: workspace?.to ?? [],
            cc: workspace?.cc,
            subject: workspace?.subject,
            body: sanitizeRecipientFacingText(workspace?.body),
          }
        : undefined,
    eventPreview:
      kind === 'event'
        ? {
            title: workspace?.title,
            start: workspace?.start,
            end: workspace?.end,
            attendees: workspace?.attendees,
          }
        : undefined,
    whatsappPreview:
      kind === 'whatsapp'
        ? {
            recipientName: workspace?.recipientName,
            phone: workspace?.phone,
            body: sanitizeRecipientFacingText(workspace?.body),
            needsInfo: workspace?.needsInfo,
            needsInfoReason: workspace?.needsInfoReason,
          }
        : undefined,
  }
}

/** Tono semántico del tema por estado (respeta modo oscuro; sin colores fijos). */
export function actionLifecycleTone(status: ActionLifecycleStatus): {
  tone: AssistantTone
  rail: string
} {
  const tone: AssistantTone =
    status === 'preparing'
      ? 'info'
      : status === 'pending_confirmation' || status === 'needs_info'
        ? 'warning'
        : status === 'executing'
          ? 'violet'
          : status === 'completed'
            ? 'success'
            : status === 'error' || status === 'conflict'
              ? 'danger'
              : 'neutral'
  return { tone, rail: toneRailClass[tone] }
}

/** Estado terminal de una confirmacion fallida; los mensajes son los que emite assistant-ops. */
export function pendingFailureStatus(error: unknown): 'expired' | 'conflict' | 'error' {
  const opStatus = (error as { opStatus?: unknown } | null)?.opStatus
  if (opStatus === 'expired' || opStatus === 'conflict') return opStatus
  const message = error instanceof Error ? error.message : ''
  if (/autorizaci[oó]n expir/i.test(message)) return 'expired'
  if (/registro cambi[oó] despu[eé]s de la vista previa/i.test(message)) return 'conflict'
  return 'error'
}

/**
 * Etapa visible en la tarjeta: Borrador → Aprobado → En proceso → Enviado/Error.
 * «Enviado» solo tras respuesta correcta del proveedor (confirmacion resuelta).
 */
export function proposalStageLabel(input: {
  lifecycle: ActionLifecycleStatus
  kind: ActionCardView['kind']
  approving?: boolean
}): string {
  const comms = input.kind === 'whatsapp' || input.kind === 'email'
  if (input.approving) return 'Aprobado'
  switch (input.lifecycle) {
    case 'preparing':
    case 'pending_confirmation':
      return 'Borrador'
    case 'needs_info':
      return 'Requiere información'
    case 'executing':
      return 'En proceso'
    case 'completed':
      return comms ? 'Enviado' : 'Ejecutado'
    case 'error':
      return 'Error'
    case 'expired':
      return 'Vencido'
    case 'conflict':
      return 'Conflicto'
    default:
      return 'Descartado'
  }
}

/** Badge de ejecución: simulado (pending) vs ejecutado (confirmado). */
export function proposalExecutionBadge(
  status: ActionLifecycleStatus,
  simulated?: boolean
): 'Simulado' | 'Ejecutado' | null {
  if (status === 'completed') return 'Ejecutado'
  if (simulated && (status === 'pending_confirmation' || status === 'executing')) return 'Simulado'
  return null
}

export function actionTypeLabel(tool: string, kind: ActionCardView['kind']): string {
  if (kind === 'whatsapp') return 'WhatsApp'
  if (tool === 'notify_action_email') return 'Correo de accion'
  if (kind === 'email') return 'Correo'
  if (kind === 'event') return 'Evento'
  if (tool === 'create_action') return 'Crear accion'
  if (tool === 'update_action') return 'Actualizar accion'
  if (tool === 'mark_action_done') return 'Marcar hecho'
  if (tool === 'verify_action') return 'Verificar'
  if (tool === 'add_action_comment') return 'Comentario'
  if (tool === 'update_checklist_item') return 'Checklist'
  if (tool === 'confirm_pending_op') return 'Confirmar'
  if (tool === 'cancel_pending_op') return 'Cancelar'
  return 'Accion'
}
