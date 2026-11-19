import type { SupabaseClient } from '@supabase/supabase-js'
import type { CopilotProposal, CopilotWriteTool } from '../../src/features/ai-support/copilot/types.js'
import type { AccessCapabilities } from '../../src/features/auth/lib/permissions.js'

export type CopilotBoardScope = 'role' | 'organization'

export type CopilotActor = {
  supabase: SupabaseClient
  usuarioId: string
  authUserId: string
  rol: string | null
  /** JWT del usuario; necesario para invocar edge functions autenticadas (p. ej. send-notification-email). */
  accessToken?: string
  requestId?: string
  /** organization = lectura piloto de toda la org (voz por URL). Default: role. */
  boardScope?: CopilotBoardScope
  /** Canal voz Retell: lecturas más cortas y payloads compactos. */
  voiceChannel?: boolean
  /**
   * Modo de acceso de la sesión Guía (propose / read / interview_full_read).
   * Usado para gates de envío (canSendCommunication) en confirm_pending_op.
   */
  guideAccessMode?: 'propose' | 'read' | 'interview_full_read'
  /** Capacidades derivadas en servidor; ausentes = sólo reglas por rol. */
  capabilities?: AccessCapabilities
  /** Sesión Guía Retell: se estampa en assistant_pending_ops para aprobar desde la liga. */
  guideSessionId?: string | null
}

export const BOARD_PENDING_TTL_MS = 10 * 60 * 1000

export async function insertAssistantOpLog(
  actor: CopilotActor,
  input: {
    tool: string
    result: string
    pendingOpId?: string | null
    resourceId?: string | null
    summary?: string
  }
) {
  await actor.supabase.from('assistant_op_log').insert({
    usuario_id: actor.usuarioId,
    pending_op_id: input.pendingOpId ?? null,
    tool: input.tool,
    resource_id: input.resourceId ?? null,
    result: input.result,
    preview_summary: input.summary?.slice(0, 280) ?? null,
  })
}

export async function createPendingOp(
  actor: CopilotActor,
  input: {
    tool: CopilotWriteTool
    resourceId?: string | null
    expectedUpdatedAt?: string | null
    payload: Record<string, unknown>
    proposal: Omit<CopilotProposal, 'id' | 'expiresAt' | 'tool'> & { tool?: CopilotWriteTool }
    ttlMs?: number
    requestKey?: string
    sessionId?: string | null
    channel?: string | null
  }
): Promise<CopilotProposal> {
  const expiresAt = new Date(Date.now() + (input.ttlMs ?? BOARD_PENDING_TTL_MS)).toISOString()
  const preview = {
    title: input.proposal.title,
    summary: input.proposal.summary,
    fields: input.proposal.fields,
    record: input.proposal.record ?? null,
    workspace: input.proposal.workspace ?? null,
  }
  const row: Record<string, unknown> = {
    usuario_id: actor.usuarioId,
    tool: input.tool,
    resource_id: input.resourceId ?? null,
    expected_updated_at: input.expectedUpdatedAt ?? null,
    payload: input.payload,
    preview,
    status: 'pending',
    expires_at: expiresAt,
  }
  const sessionId = input.sessionId || actor.guideSessionId || null
  if (sessionId) row.session_id = sessionId
  if (input.channel) row.channel = input.channel
  if (input.requestKey) row.request_key = input.requestKey

  const { data, error } = await actor.supabase
    .from('assistant_pending_ops')
    .insert(row)
    .select('id,expires_at')
    .single()
  if (error?.code === '23505' && input.requestKey) {
    const { data: duplicate, error: lookupError } = await actor.supabase
      .from('assistant_pending_ops')
      .select('id,expires_at,preview,status')
      .eq('usuario_id', actor.usuarioId)
      .eq('tool', input.tool)
      .eq('request_key', input.requestKey)
      .maybeSingle()
    if (lookupError) throw new Error('DATABASE_ERROR: No se pudo recuperar la solicitud anterior.')
    if (!duplicate || duplicate.status !== 'pending' || Date.parse(duplicate.expires_at) <= Date.now()) {
      throw new Error('La solicitud ya se procesó. Consulta su estado o inicia una solicitud nueva.')
    }
    return { ...duplicate.preview, id: duplicate.id, expiresAt: duplicate.expires_at, tool: input.tool }
  }
  if (error || !data) {
    throw new Error(
      error?.message?.includes('assistant_pending_ops')
        ? 'Falta aplicar la migracion de operaciones del asistente.'
        : error?.message || 'No se pudo guardar la propuesta.'
    )
  }
  await insertAssistantOpLog(actor, {
    tool: input.tool,
    result: 'proposed',
    pendingOpId: data.id as string,
    resourceId: input.resourceId,
    summary: input.proposal.title,
  })
  return {
    id: data.id as string,
    tool: input.tool,
    title: input.proposal.title,
    summary: input.proposal.summary,
    fields: input.proposal.fields,
    record: input.proposal.record,
    expiresAt: (data.expires_at as string) || expiresAt,
    workspace: input.proposal.workspace,
  }
}
