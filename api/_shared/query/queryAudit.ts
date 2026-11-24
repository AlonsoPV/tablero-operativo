/**
 * Auditoría de consultas del agente (ID-05): una entrada por turno con actor,
 * canal, intención, alcance y estado. No guarda texto del usuario, títulos ni PII.
 */
import type { AgentActor } from './resolveActor.js'
import type { QueryStatus } from './contracts.js'

export type QueryAuditEntry = {
  usuarioId: string
  channel: AgentActor['channel']
  intent: string
  entity: string
  scope: string
  status: QueryStatus | 'denied_precheck' | 'clarification' | 'proposal_blocked'
  total: number | null
  durationMs: number
}

export type QueryAuditSink = (entry: QueryAuditEntry) => Promise<void>

export function buildQueryAuditSummary(entry: QueryAuditEntry): string {
  return JSON.stringify({
    v: 1,
    ch: entry.channel,
    intent: entry.intent,
    entity: entry.entity,
    scope: entry.scope,
    status: entry.status,
    total: entry.total,
    ms: entry.durationMs,
  }).slice(0, 280)
}

/**
 * Sink por defecto: assistant_op_log con result='read'.
 * Requiere la migración 20261119120000_assistant_op_log_read_audit.sql (no aplicada fuera de local).
 */
export function supabaseQueryAuditSink(actor: AgentActor): QueryAuditSink {
  return async (entry) => {
    const { error } = await actor.copilot.supabase.from('assistant_op_log').insert({
      usuario_id: entry.usuarioId,
      tool: 'agent_query',
      result: 'read',
      preview_summary: buildQueryAuditSummary(entry),
    })
    if (error) console.warn('agent query audit skipped', { code: error.code })
  }
}

export function memoryQueryAuditSink(target: QueryAuditEntry[]): QueryAuditSink {
  return async (entry) => {
    target.push(entry)
  }
}
