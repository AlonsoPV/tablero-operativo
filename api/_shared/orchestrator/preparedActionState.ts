import type { AgentActor } from '../query/resolveActor.js'
import { formatStructuredActionDraft, type StructuredActionDraft } from './structuredActionDraft.js'

export type PreparedActionState =
  | { status: 'unknown' }
  | { status: 'pending' | 'executing' | 'cancelled' | 'expired' | 'conflict' }
  | { status: 'confirmed'; actionId: string | null }

/** Only the bound, owned operation is evidence; cached drafts never prove execution. */
export async function readPreparedActionState(actor: AgentActor, proposalId?: string): Promise<PreparedActionState> {
  if (!proposalId) return { status: 'unknown' }
  try {
    const { data, error } = await actor.copilot.supabase.from('assistant_pending_ops')
      .select('id,usuario_id,tool,status,result,expires_at,channel')
      .eq('id', proposalId).eq('usuario_id', actor.usuarioId).maybeSingle()
    if (error || !data || data.id !== proposalId || data.usuario_id !== actor.usuarioId ||
      data.channel !== actor.channel || !['create_action', 'agent_create_action'].includes(data.tool)) return { status: 'unknown' }
    if (data.status === 'confirmed') {
      const id = data.result?.id ?? data.result?.accionId
      return { status: 'confirmed', actionId: typeof id === 'string' && /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(id) ? id : null }
    }
    if (data.status === 'pending') {
      const expires = Date.parse(data.expires_at)
      if (!Number.isFinite(expires)) return { status: 'unknown' }
      return { status: expires <= Date.now() ? 'expired' : 'pending' }
    }
    if (['executing', 'cancelled', 'expired', 'conflict'].includes(data.status)) return { status: data.status }
  } catch { /* An unavailable read must not claim approval or execution. */ }
  return { status: 'unknown' }
}

export function formatPreparedActionState(draft: StructuredActionDraft, state: PreparedActionState): string {
  const snapshot = formatStructuredActionDraft(draft, { mode: 'pilot' }).split('\n').slice(2, -2).join('\n')
  if (state.status === 'confirmed') return [
    'La operación de creación ya fue confirmada. No necesitas volver a confirmarla.',
    'Datos de la propuesta confirmada (el estado actual se consulta en Kanban):', snapshot,
    ...(state.actionId ? [`Ver en Scrumban: /kanban?accion=${state.actionId}`] : []),
  ].join('\n\n')
  const labels = {
    unknown: 'No pude verificar el estado de esta propuesta. Consulta Kanban antes de volver a crearla o confirmarla.',
    pending: 'La propuesta sigue pendiente de confirmación explícita.',
    executing: 'La operación está en ejecución. Consulta su resultado antes de reintentar.',
    cancelled: 'La propuesta fue cancelada. Su aprobación anterior ya no es válida.',
    expired: 'La propuesta expiró. Su aprobación anterior ya no es válida.',
    conflict: 'La propuesta tiene un conflicto y requiere una nueva revisión.',
  }
  return [labels[state.status], 'Datos del borrador:', snapshot].join('\n\n')
}
