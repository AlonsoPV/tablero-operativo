/**
 * Clasificación canónica de assistant_pending_ops para UI e informe.
 * Fuente de verdad: tool + status de la fila persistida (no narrativa IA).
 */

export type PendingOpPresentationKind = 'communication' | 'board' | 'other'

export type PendingOpChannel = 'whatsapp' | 'email' | 'event' | 'board' | 'other'

/** Estados persistidos en assistant_pending_ops. */
export type PendingOpDbStatus =
  | 'pending'
  | 'executing'
  | 'confirmed'
  | 'cancelled'
  | 'expired'
  | 'conflict'

export function classifyPendingOpTool(tool: string | null | undefined): {
  presentation: PendingOpPresentationKind
  channel: PendingOpChannel
} {
  const name = String(tool || '')
  if (name === 'whatsapp_prepare_send') {
    return { presentation: 'communication', channel: 'whatsapp' }
  }
  if (name === 'notify_action_email' || name.startsWith('gmail_')) {
    return { presentation: 'communication', channel: 'email' }
  }
  if (name.startsWith('calendar_')) {
    return { presentation: 'communication', channel: 'event' }
  }
  if (
    name === 'create_action' ||
    name === 'update_action' ||
    name === 'add_action_comment' ||
    name === 'update_checklist_item' ||
    name === 'mark_action_done' ||
    name === 'verify_action'
  ) {
    return { presentation: 'board', channel: 'board' }
  }
  return { presentation: 'other', channel: 'other' }
}

export function isCommunicationPendingTool(tool: string | null | undefined) {
  return classifyPendingOpTool(tool).presentation === 'communication'
}

export function isBoardPendingTool(tool: string | null | undefined) {
  return classifyPendingOpTool(tool).presentation === 'board'
}

/** Operación aún accionable (revisar / completar / aprobar / descartar). */
export function isActionablePendingStatus(
  status: string | null | undefined,
  flags?: { needsInfo?: boolean; incomplete?: boolean; errorMessage?: string | null }
) {
  const raw = (status || 'pending').toLowerCase()
  if (raw === 'confirmed' || raw === 'cancelled' || raw === 'expired') return false
  if (raw === 'conflict') return false
  if (raw === 'executing' || raw === 'pending') return true
  // Error recuperable: vuelve a pending en backend; si llega errorMessage con pending, sigue accionable.
  if (flags?.errorMessage && raw === 'pending') return true
  return false
}

export function countActionablePendingOps<
  T extends {
    id: string
    status?: string | null
    workspace?: { needsInfo?: boolean; incomplete?: boolean } | null
    errorMessage?: string | null
  },
>(ops: T[]): number {
  const seen = new Set<string>()
  let count = 0
  for (const op of ops) {
    if (!op.id || seen.has(op.id)) continue
    seen.add(op.id)
    if (
      isActionablePendingStatus(op.status, {
        needsInfo: op.workspace?.needsInfo,
        incomplete: op.workspace?.incomplete,
        errorMessage: op.errorMessage,
      })
    ) {
      count += 1
    }
  }
  return count
}

export function splitPendingOpsByPresentation<T extends { tool?: string | null }>(ops: T[]) {
  const communications: T[] = []
  const board: T[] = []
  const other: T[] = []
  const history: T[] = []
  for (const op of ops) {
    const { presentation } = classifyPendingOpTool(op.tool)
    const status = String((op as { status?: string }).status || 'pending')
    if (status === 'confirmed' || status === 'cancelled' || status === 'expired' || status === 'conflict') {
      history.push(op)
      continue
    }
    if (presentation === 'communication') communications.push(op)
    else if (presentation === 'board') board.push(op)
    else other.push(op)
  }
  return { communications, board, other, history }
}

/** Quita JSON / nombres de tool / IDs de un cuerpo destinado al receptor. */
export function sanitizeRecipientFacingText(raw: string | null | undefined, max = 1400): string {
  if (!raw?.trim()) return ''
  let text = raw.trim()
  if (text.startsWith('{') || text.startsWith('[')) {
    try {
      const parsed = JSON.parse(text) as unknown
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const row = parsed as Record<string, unknown>
        const body = row.body ?? row.message ?? row.text
        if (typeof body === 'string' && body.trim()) text = body.trim()
        else return ''
      } else {
        return ''
      }
    } catch {
      // no es JSON válido; seguir limpia heurística
    }
  }
  text = text
    .replace(/\b(get_okr_progress|get_my_actions|queue_workspace_draft|confirm_pending_op|whatsapp_prepare_send|gmail_prepare_send|notify_action_email)\b/gi, '')
    .replace(/\b(PERMISSION_DENIED|AUTHENTICATION_FAILED|TOOL_ERROR|pending_op_id|operation_id)\b/gi, '')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi, '')
    .replace(/[^\S\r\n]{2,}/g, ' ')
    .trim()
  return text.slice(0, max)
}
