/**
 * Ciclo de vida unificado de acciones Enviardian (pending ops + workspace drafts).
 */
import type { CopilotProposal } from '@/features/ai-support/copilot/types'

export type ActionLifecycleStatus =
  | 'preparing'
  | 'needs_info'
  | 'pending_confirmation'
  | 'executing'
  | 'completed'
  | 'error'
  | 'cancelled'

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
  kind: 'board' | 'email' | 'event'
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
}

export function actionStatusLabel(status: ActionLifecycleStatus): string {
  if (status === 'preparing') return 'Preparando'
  if (status === 'needs_info') return 'Requiere informacion'
  if (status === 'pending_confirmation') return 'Pendiente de confirmacion'
  if (status === 'executing') return 'Ejecutando'
  if (status === 'completed') return 'Completado'
  if (status === 'error') return 'Error'
  return 'Cancelado'
}

/** Mapear estado de UI/ops al ciclo de vida. */
export function mapProposalStatusToLifecycle(
  status: 'pending' | 'confirmed' | 'cancelled' | 'error' | 'executing' | 'preparing' | 'needs_info' | undefined,
  busy?: 'confirm' | 'cancel' | 'edit' | null
): ActionLifecycleStatus {
  if (busy === 'confirm' || busy === 'cancel' || busy === 'edit' || status === 'executing') return 'executing'
  if (status === 'confirmed') return 'completed'
  if (status === 'cancelled') return 'cancelled'
  if (status === 'error') return 'error'
  if (status === 'needs_info') return 'needs_info'
  if (status === 'preparing') return 'preparing'
  return 'pending_confirmation'
}

export function toActionCardView(
  proposal: CopilotProposal,
  opts?: {
    status?: 'pending' | 'confirmed' | 'cancelled' | 'error' | 'executing' | 'preparing' | 'needs_info'
    busy?: 'confirm' | 'cancel' | 'edit' | null
    errorMessage?: string | null
    resultHref?: string
  }
): ActionCardView {
  const lifecycle = mapProposalStatusToLifecycle(opts?.status, opts?.busy)
  const workspace = proposal.workspace
  const kind: ActionCardView['kind'] =
    workspace?.kind === 'email' || proposal.tool.startsWith('gmail_')
      ? 'email'
      : workspace?.kind === 'event' || proposal.tool.startsWith('calendar_')
        ? 'event'
        : 'board'

  return {
    id: proposal.id,
    tool: proposal.tool,
    title: proposal.title,
    summary: proposal.summary,
    status: lifecycle,
    statusLabel: actionStatusLabel(lifecycle),
    fields: proposal.fields ?? [],
    resultHref: opts?.resultHref || proposal.record?.href,
    errorMessage: opts?.errorMessage ?? null,
    kind,
    emailPreview:
      kind === 'email'
        ? {
            from: workspace?.from,
            to: workspace?.to ?? [],
            cc: workspace?.cc,
            subject: workspace?.subject,
            body: workspace?.body,
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
  }
}

/** Clases Tailwind semánticas por estado (alineadas al informe). */
export function actionLifecycleTone(status: ActionLifecycleStatus): {
  rail: string
  badge: string
  card: string
  border: string
} {
  if (status === 'preparing') {
    return {
      rail: 'bg-[#2563EB]',
      badge: 'border-[#2563EB]/30 bg-[#2563EB]/10 text-[#1D4ED8]',
      card: 'bg-[#2563EB]/[0.06]',
      border: 'border-[#2563EB]/25',
    }
  }
  if (status === 'pending_confirmation' || status === 'needs_info') {
    return {
      rail: 'bg-[#D97706]',
      badge: 'border-[#D97706]/30 bg-[#D97706]/10 text-[#B45309]',
      card: 'bg-[#D97706]/[0.08]',
      border: 'border-[#D97706]/28',
    }
  }
  if (status === 'executing') {
    return {
      rail: 'bg-[#7C3AED]',
      badge: 'border-[#7C3AED]/30 bg-[#7C3AED]/10 text-[#6D28D9]',
      card: 'bg-[#7C3AED]/[0.08]',
      border: 'border-[#7C3AED]/28',
    }
  }
  if (status === 'completed') {
    return {
      rail: 'bg-[#16A34A]',
      badge: 'border-[#16A34A]/30 bg-[#16A34A]/10 text-[#15803D]',
      card: 'bg-[#16A34A]/[0.08]',
      border: 'border-[#16A34A]/25',
    }
  }
  if (status === 'error') {
    return {
      rail: 'bg-[#DC2626]',
      badge: 'border-[#DC2626]/30 bg-[#DC2626]/10 text-[#B91C1C]',
      card: 'bg-[#DC2626]/[0.08]',
      border: 'border-[#DC2626]/28',
    }
  }
  return {
    rail: 'bg-slate-400',
    badge: 'border-slate-300 bg-slate-100 text-slate-600',
    card: 'bg-slate-500/[0.06]',
    border: 'border-slate-300/70',
  }
}

export function actionTypeLabel(tool: string, kind: ActionCardView['kind']): string {
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
