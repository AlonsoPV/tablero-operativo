/**
 * Contratos tipados de operaciones del agente (preparación R2).
 * En R1 sólo se identifican y validan propuestas; la ejecución real está deshabilitada.
 * La ejecución futura debe reutilizar assistant_pending_ops / confirmPendingOp.
 */
import { createHash } from 'node:crypto'
import { authorizeOperation } from '../query/authorizeQuery.js'
import type { AgentActor } from '../query/resolveActor.js'

export const R1_EXECUTION_ENABLED = false as const

export type CreateActionPayload = {
  titulo: string
  responsableId: string | null
  fecha: string | null
  /** Acción bloqueada que origina la propuesta (resuelta por contexto, no por el modelo). */
  origenAccionId?: string | null
}

export type UpdateStatusPayload = {
  accionId: string
  estado: 'Pendiente' | 'En_Ejecucion' | 'Bloqueado' | 'Hecho'
  expectedUpdatedAt?: string | null
}

export type RegisterBlockerPayload = {
  accionId: string
  motivo: string
}

export type NotifyResponsablePayload = {
  accionId: string
  canal: 'email' | 'whatsapp'
}

export type ActionPayloadMap = {
  create_action: CreateActionPayload
  update_status: UpdateStatusPayload
  register_blocker: RegisterBlockerPayload
  notify_responsable: NotifyResponsablePayload
}

export type ActionOperation = keyof ActionPayloadMap

export type ActionContract<O extends ActionOperation> = {
  operation: O
  /** Herramienta existente que ejecutará el efecto en R2. */
  executesVia: string
  requiredFields: Array<keyof ActionPayloadMap[O]>
  preconditions: string[]
  validate(payload: ActionPayloadMap[O]): string[]
}

const STATES = ['Pendiente', 'En_Ejecucion', 'Bloqueado', 'Hecho']

export const ACTION_CONTRACTS: { [O in ActionOperation]: ActionContract<O> } = {
  create_action: {
    operation: 'create_action',
    executesVia: 'create_action → confirmPendingOp',
    requiredFields: ['titulo', 'responsableId', 'fecha'],
    preconditions: ['Responsable activo resuelto por search_people', 'Fecha futura (CDMX)', 'Rol con propose_write'],
    validate(p) {
      const missing: string[] = []
      if (!p.titulo || p.titulo.trim().length < 3) missing.push('titulo')
      if (!p.responsableId) missing.push('responsable')
      if (!p.fecha) missing.push('fecha')
      return missing
    },
  },
  update_status: {
    operation: 'update_status',
    executesVia: 'mark_action_done / update_action → confirmPendingOp',
    requiredFields: ['accionId', 'estado'],
    preconditions: ['Predicado SQL can_edit_accion_general_as o responsable', 'Hecho ≠ Verificado', 'CAS por updated_at'],
    validate(p) {
      const missing: string[] = []
      if (!p.accionId) missing.push('accion')
      if (!STATES.includes(p.estado)) missing.push('estado')
      return missing
    },
  },
  register_blocker: {
    operation: 'register_blocker',
    executesVia: 'update_action (estado Bloqueado) + add_action_comment',
    requiredFields: ['accionId', 'motivo'],
    preconditions: ['Motivo obligatorio', 'Mismo actor que puede actualizar la acción'],
    validate(p) {
      const missing: string[] = []
      if (!p.accionId) missing.push('accion')
      if (!p.motivo || p.motivo.trim().length < 5) missing.push('motivo')
      return missing
    },
  },
  notify_responsable: {
    operation: 'notify_responsable',
    executesVia: 'notify_action_email / whatsapp_prepare_send → confirmPendingOp',
    requiredFields: ['accionId', 'canal'],
    preconditions: ['Destinatario = responsable Kanban', 'Remitente autorizado', 'Sin envío real en R1'],
    validate(p) {
      const missing: string[] = []
      if (!p.accionId) missing.push('accion')
      if (p.canal !== 'email' && p.canal !== 'whatsapp') missing.push('canal')
      return missing
    },
  },
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`
}

/** Misma intención del mismo actor → misma clave; la ejecución R2 aplica el efecto una sola vez por clave. */
export function buildIdempotencyKey<O extends ActionOperation>(
  usuarioId: string,
  operation: O,
  payload: ActionPayloadMap[O]
): string {
  return createHash('sha256').update(`${usuarioId}|${operation}|${stableStringify(payload)}`).digest('hex').slice(0, 32)
}

export const ACTION_PROPOSAL_TTL_MS = 10 * 60 * 1000

export type ActionProposal<O extends ActionOperation = ActionOperation> = {
  id: string
  operation: O
  payload: ActionPayloadMap[O]
  actorUsuarioId: string
  channel: AgentActor['channel']
  idempotencyKey: string
  status: 'proposed'
  createdAt: string
  expiresAt: string
  executionEnabled: boolean
  missing: string[]
}

export type ProposeResult<O extends ActionOperation> =
  | { ok: true; proposal: ActionProposal<O> }
  | { ok: false; reason: string }

export function proposeAction<O extends ActionOperation>(
  actor: AgentActor,
  operation: O,
  payload: ActionPayloadMap[O],
  now = Date.now()
): ProposeResult<O> {
  const auth = authorizeOperation(actor, 'propose_write')
  if (!auth.allowed) return { ok: false, reason: auth.reason }
  const contract = ACTION_CONTRACTS[operation] as ActionContract<O>
  const idempotencyKey = buildIdempotencyKey(actor.usuarioId, operation, payload)
  return {
    ok: true,
    proposal: {
      id: `prop_${idempotencyKey.slice(0, 16)}`,
      operation,
      payload,
      actorUsuarioId: actor.usuarioId,
      channel: actor.channel,
      idempotencyKey,
      status: 'proposed',
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + ACTION_PROPOSAL_TTL_MS).toISOString(),
      executionEnabled: R1_EXECUTION_ENABLED,
      missing: contract.validate(payload),
    },
  }
}

/** Confirmación real en R1: siempre bloqueada, sin tocar datos. */
export function confirmActionR1(): { status: 'not_enabled'; message: string } {
  return {
    status: 'not_enabled',
    message: 'La ejecución de operaciones todavía no está habilitada (R1). La propuesta no se aplicó.',
  }
}
