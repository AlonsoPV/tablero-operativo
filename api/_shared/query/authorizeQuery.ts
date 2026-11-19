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
  | 'read_aggregate'
  | 'propose_write'
  | 'execute_write'

/** allow · deny · module_gated (lo decide el gate de módulo en backend) · disabled_r1 (no habilitado en este release). */
export type MatrixDecision = 'allow' | 'deny' | 'module_gated' | 'disabled_r1'

export const AGENT_PERMISSION_MATRIX: Record<AgentRoleClass, Record<AgentOperation, MatrixDecision>> = {
  super_admin: {
    read_actions_personal: 'allow',
    read_actions_wide: 'allow',
    read_okrs: 'allow',
    read_aggregate: 'allow',
    propose_write: 'allow',
    execute_write: 'disabled_r1',
  },
  direction: {
    read_actions_personal: 'allow',
    read_actions_wide: 'allow',
    // Lectura ejecutiva de OKRs sin módulo de catálogo (capacidad read_all_okrs).
    read_okrs: 'allow',
    read_aggregate: 'allow',
    propose_write: 'deny',
    execute_write: 'deny',
  },
  leader: {
    read_actions_personal: 'allow',
    read_actions_wide: 'allow',
    read_okrs: 'module_gated',
    read_aggregate: 'allow',
    propose_write: 'allow',
    execute_write: 'disabled_r1',
  },
  operative: {
    read_actions_personal: 'allow',
    read_actions_wide: 'allow',
    read_okrs: 'module_gated',
    read_aggregate: 'allow',
    propose_write: 'allow',
    execute_write: 'disabled_r1',
  },
  analyst: {
    read_actions_personal: 'allow',
    read_actions_wide: 'deny',
    read_okrs: 'module_gated',
    read_aggregate: 'deny',
    propose_write: 'deny',
    execute_write: 'deny',
  },
  inactive: {
    read_actions_personal: 'deny',
    read_actions_wide: 'deny',
    read_okrs: 'deny',
    read_aggregate: 'deny',
    propose_write: 'deny',
    execute_write: 'deny',
  },
}

/**
 * Perfil efectivo para auditoría y pruebas. El área OKRS es una capa de lectura sobre el rol:
 * sólo eleva operaciones read_* y nunca propose/execute.
 */
export type AgentProfile = AgentRoleClass | 'okrs_area'

export function agentProfile(actor: Pick<AgentActor, 'roleClass' | 'capabilities'>): AgentProfile {
  if (actor.roleClass === 'inactive' || actor.roleClass === 'super_admin' || actor.roleClass === 'direction') {
    return actor.roleClass
  }
  return actor.capabilities.okrsArea ? 'okrs_area' : actor.roleClass
}

/** Decisión de la matriz más las capacidades de lectura transversal derivadas en servidor. */
export function effectiveDecision(actor: AgentActor, operation: AgentOperation): MatrixDecision {
  const base = AGENT_PERMISSION_MATRIX[actor.roleClass][operation]
  if (actor.roleClass === 'inactive' || !actor.capabilities.active) return 'deny'
  const caps = actor.capabilities
  if (operation === 'read_okrs' && caps.readAllOkrs) return 'allow'
  if ((operation === 'read_actions_wide' || operation === 'read_aggregate') && caps.readCrossAreaExecution) {
    return 'allow'
  }
  return base
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
  const decision = effectiveDecision(actor, operation)
  if (actor.roleClass === 'inactive' || !actor.capabilities.active) {
    return { allowed: false, operation, decision: 'deny', reason: 'Tu usuario está inactivo.' }
  }
  if ((operation === 'read_actions_wide' || operation === 'read_aggregate') && scope) {
    // Misma regla que get_my_actions: el piloto organizacional, el rol o la capacidad transversal deciden.
    const runtimeAllows = canUseWideActionScope(scope, {
      rol: actor.rol,
      boardScope: actor.boardScope,
      readCrossAreaExecution: actor.capabilities.readCrossAreaExecution,
    })
    if (!runtimeAllows || (decision === 'deny' && actor.boardScope !== 'organization')) {
      return {
        allowed: false,
        operation,
        decision: 'deny',
        reason: operation === 'read_aggregate'
          ? 'Tu rol no permite totales de otras áreas; puedo resumir tus propias acciones.'
          : 'Tu rol sólo permite consultar acciones propias o creadas por ti.',
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
  if (request.entity === 'aggregate') {
    return isPersonalActionScope(request.scope)
      ? check(actor, 'read_actions_personal')
      : check(actor, 'read_aggregate', request.scope)
  }
  const actions = check(actor, operationForScope(request.actions.scope), request.actions.scope)
  if (!actions.allowed) return actions
  return check(actor, 'read_okrs')
}

export function authorizeOperation(actor: AgentActor, operation: 'propose_write' | 'execute_write') {
  return check(actor, operation)
}
