/**
 * Simulador en memoria del flujo propose → confirm → execute (R2).
 * Sin Supabase ni proveedores: valida dueño, expiración, revalidación de permisos,
 * idempotencia, confirmación concurrente y auditoría.
 */
import {
  ACTION_CONTRACTS,
  proposeAction,
  type ActionOperation,
  type ActionPayloadMap,
  type ActionProposal,
} from './contracts.js'
import { AGENT_PERMISSION_MATRIX } from '../query/authorizeQuery.js'
import type { AgentActor } from '../query/resolveActor.js'

export type SimAuditEntry = {
  at: string
  usuarioId: string
  operation: ActionOperation
  proposalId: string
  result: 'proposed' | 'executed' | 'denied' | 'duplicate' | 'expired' | 'in_progress' | 'invalid'
}

export type SimConfirmResult =
  | { status: 'executed'; effectId: string }
  | { status: 'duplicate'; effectId: string }
  | { status: 'in_progress' }
  | { status: 'denied'; reason: string }
  | { status: 'expired' }
  | { status: 'invalid'; missing: string[] }
  | { status: 'not_found' }

type ProposalState = { proposal: ActionProposal; state: 'proposed' | 'executing' | 'done' }

export function createActionSimulator(options: { now?: () => number; effectDelayMs?: number } = {}) {
  const now = options.now ?? (() => Date.now())
  const proposals = new Map<string, ProposalState>()
  const effectsByKey = new Map<string, string>()
  const effects: Array<{ id: string; operation: ActionOperation; payload: unknown }> = []
  const audit: SimAuditEntry[] = []

  function log(usuarioId: string, proposal: ActionProposal, result: SimAuditEntry['result']) {
    audit.push({
      at: new Date(now()).toISOString(),
      usuarioId,
      operation: proposal.operation,
      proposalId: proposal.id,
      result,
    })
  }

  return {
    effects,
    audit,
    propose<O extends ActionOperation>(actor: AgentActor, operation: O, payload: ActionPayloadMap[O]) {
      const result = proposeAction(actor, operation, payload, now())
      if (result.ok) {
        proposals.set(result.proposal.id, { proposal: result.proposal as ActionProposal, state: 'proposed' })
        log(actor.usuarioId, result.proposal as ActionProposal, 'proposed')
      }
      return result
    },
    async confirm(proposalId: string, confirmer: AgentActor): Promise<SimConfirmResult> {
      const entry = proposals.get(proposalId)
      if (!entry) return { status: 'not_found' }
      const { proposal } = entry
      if (confirmer.usuarioId !== proposal.actorUsuarioId) {
        log(confirmer.usuarioId, proposal, 'denied')
        return { status: 'denied', reason: 'La propuesta pertenece a otro usuario.' }
      }
      // Revalidación al confirmar: el rol pudo cambiar entre propuesta y confirmación.
      if (AGENT_PERMISSION_MATRIX[confirmer.roleClass].propose_write !== 'allow') {
        log(confirmer.usuarioId, proposal, 'denied')
        return { status: 'denied', reason: 'Tu rol ya no permite esta operación.' }
      }
      const done = effectsByKey.get(proposal.idempotencyKey)
      if (done) {
        log(confirmer.usuarioId, proposal, 'duplicate')
        return { status: 'duplicate', effectId: done }
      }
      if (entry.state === 'executing') {
        log(confirmer.usuarioId, proposal, 'in_progress')
        return { status: 'in_progress' }
      }
      if (Date.parse(proposal.expiresAt) < now()) {
        log(confirmer.usuarioId, proposal, 'expired')
        return { status: 'expired' }
      }
      const contract = ACTION_CONTRACTS[proposal.operation] as { validate(p: unknown): string[] }
      const missing = contract.validate(proposal.payload)
      if (missing.length) {
        log(confirmer.usuarioId, proposal, 'invalid')
        return { status: 'invalid', missing }
      }
      entry.state = 'executing'
      if (options.effectDelayMs) await new Promise((r) => setTimeout(r, options.effectDelayMs))
      const effectId = `sim_${effects.length + 1}`
      effects.push({ id: effectId, operation: proposal.operation, payload: proposal.payload })
      effectsByKey.set(proposal.idempotencyKey, effectId)
      entry.state = 'done'
      log(confirmer.usuarioId, proposal, 'executed')
      return { status: 'executed', effectId }
    },
  }
}
