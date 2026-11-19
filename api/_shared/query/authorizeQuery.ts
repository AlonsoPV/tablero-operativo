/**
 * Matriz de autorización del agente por operación y rol (ID-02).
 * Es una guarda previa: la RLS y los predicados SQL siguen decidiendo en la fuente.
 * Nunca amplía lo que el actor ya puede ver en Kanban/OKRs.
 */
import { canUseWideActionScope, isPersonalActionScope } from '../actionQueryContract.js'
import type { ActionQueryScope } from '../../../src/features/ai-support/actionQuery/types.js'
import type { AgentActor, AgentRoleClass } from './resolveActor.js'
import type { QueryRequest } from './contracts.js'

export type AgentOperation =
  | 'read_actions_personal'
  | 'read_actions_wide'
  | 'read_okrs'
  | 'propose_write'
  | 'execute_write'

/** allow · deny · module_gated (lo decide el gate de módulo en backend) · disabled_r1 (no habilitado en este release). */
export type MatrixDecision = 'allow' | 'deny' | 'module_gated' | 'disabled_r1'

export const AGENT_PERMISSION_MATRIX: Record<AgentRoleClass, Record<AgentOperation, MatrixDecision>> = {
  super_admin: {
    read_actions_personal: 'allow',
    read_actions_wide: 'allow',
    read_okrs: 'allow',
    propose_write: 'allow',
    execute_write: 'disabled_r1',
  },
  direction: {
    read_actions_personal: 'allow',
    read_actions_wide: 'allow',
    // El gate de módulo del runtime exige el módulo okrs en el rol de catálogo (discrepancia abierta con la decisión R0).
    read_okrs: 'module_gated',
    propose_write: 'deny',
    execute_write: 'deny',
  },
  leader: {
    read_actions_personal: 'allow',
    read_actions_wide: 'allow',
    read_okrs: 'module_gated',
    propose_write: 'allow',
    execute_write: 'disabled_r1',
  },
  operative: {
    read_actions_personal: 'allow',
    read_actions_wide: 'allow',
    read_okrs: 'module_gated',
    propose_write: 'allow',
    execute_write: 'disabled_r1',
  },
  analyst: {
    read_actions_personal: 'allow',
    read_actions_wide: 'deny',
    read_okrs: 'module_gated',
    propose_write: 'deny',
    execute_write: 'deny',
  },
  inactive: {
    read_actions_personal: 'deny',
    read_actions_wide: 'deny',
    read_okrs: 'deny',
    propose_write: 'deny',
    execute_write: 'deny',
  },
}

export type AuthorizationDecision =
  | { allowed: true; operation: AgentOperation; decision: MatrixDecision }
  | {
      allowed: false
      operation: AgentOperation
      decision: MatrixDecision
      reason: string
      /** Alcance alternativo que el actor sí puede consultar. */
      fallbackScope?: ActionQueryScope
    }

function operationForScope(scope: ActionQueryScope): AgentOperation {
  return isPersonalActionScope(scope) ? 'read_actions_personal' : 'read_actions_wide'
}

function check(actor: AgentActor, operation: AgentOperation, scope?: ActionQueryScope): AuthorizationDecision {
  const decision = AGENT_PERMISSION_MATRIX[actor.roleClass][operation]
  if (actor.roleClass === 'inactive') {
    return { allowed: false, operation, decision, reason: 'Tu usuario está inactivo.' }
  }
  if (operation === 'read_actions_wide' && scope) {
    // Misma regla que get_my_actions: el piloto organizacional o el rol deciden; la matriz no la amplía.
    const runtimeAllows = canUseWideActionScope(scope, { rol: actor.rol, boardScope: actor.boardScope })
    if (!runtimeAllows || (decision === 'deny' && actor.boardScope !== 'organization')) {
      return {
        allowed: false,
        operation,
        decision: 'deny',
        reason: 'Tu rol sólo permite consultar acciones propias o creadas por ti.',
        fallbackScope: 'assigned_to_me',
      }
    }
    return { allowed: true, operation, decision: 'allow' }
  }
  if (decision === 'allow' || decision === 'module_gated') return { allowed: true, operation, decision }
  if (decision === 'disabled_r1') {
    return { allowed: false, operation, decision, reason: 'La ejecución de operaciones aún no está habilitada en R1.' }
  }
  return {
    allowed: false,
    operation,
    decision,
    reason:
      operation === 'propose_write'
        ? 'Tu rol tiene acceso de consulta; no puede preparar cambios en el tablero.'
        : 'No tienes permiso para esta operación.',
  }
}

export function authorizeQuery(actor: AgentActor, request: QueryRequest): AuthorizationDecision {
  if (request.entity === 'actions') return check(actor, operationForScope(request.scope), request.scope)
  if (request.entity === 'okrs') return check(actor, 'read_okrs')
  const actions = check(actor, operationForScope(request.actions.scope), request.actions.scope)
  if (!actions.allowed) return actions
  return check(actor, 'read_okrs')
}

export function authorizeOperation(actor: AgentActor, operation: 'propose_write' | 'execute_write') {
  return check(actor, operation)
}
