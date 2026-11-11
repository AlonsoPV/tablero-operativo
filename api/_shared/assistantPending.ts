import type { SupabaseClient } from '@supabase/supabase-js'
import type { CopilotProposal, CopilotWriteTool } from '../../src/features/ai-support/copilot/types.js'

export type CopilotActor = {
  supabase: SupabaseClient
  usuarioId: string
  authUserId: string
  rol: string | null
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
  if (input.sessionId) row.session_id = input.sessionId
  if (input.channel) row.channel = input.channel

  const { data, error } = await actor.supabase
    .from('assistant_pending_ops')
    .insert(row)
    .select('id,expires_at')
    .single()
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
