/**
 * Actor canónico del agente (ID-01). Se construye sólo desde la identidad
 * verificada por el servidor (JWT o vínculo de canal validado); nunca desde
 * argumentos del cliente o del modelo.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { CopilotActor, CopilotBoardScope } from '../assistantPending.js'
import {
  isAnalystByRole,
  isDirectionByRole,
  isLeaderByRole,
  isSuperAdminByRole,
  resolveAccessCapabilities,
  type AccessCapabilities,
} from '../../../src/features/auth/lib/permissions.js'

export type AgentChannel = 'web' | 'whatsapp' | 'voice'

export type AgentRoleClass = 'super_admin' | 'direction' | 'leader' | 'analyst' | 'operative' | 'inactive'

export type AgentActor = {
  authUserId: string
  usuarioId: string
  rol: string | null
  roleClass: AgentRoleClass
  channel: AgentChannel
  sessionId: string
  /** Límite de aislamiento vigente: proyecto Supabase (no hay tenant_id en el esquema). */
  project: string
  boardScope: CopilotBoardScope
  /** Derivadas en servidor (actorCapabilities.ts); se recalculan en cada turno. */
  capabilities: AccessCapabilities
  copilot: CopilotActor
}

export type VerifiedIdentity = {
  supabase: SupabaseClient
  authUserId: string
  usuarioId: string
  rol: string | null
  active: boolean
  whatsappId?: string
  accessToken?: string
  boardScope?: CopilotBoardScope
}

export function classifyRole(rol: string | null | undefined, active = true): AgentRoleClass {
  if (!active) return 'inactive'
  if (isSuperAdminByRole(rol)) return 'super_admin'
  if (isDirectionByRole(rol)) return 'direction'
  if (isLeaderByRole(rol)) return 'leader'
  if (isAnalystByRole(rol)) return 'analyst'
  return 'operative'
}

function projectRef(): string {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
  return url.match(/^https:\/\/([a-z0-9]+)\./i)?.[1] ?? 'local'
}

export function resolveActor(
  identity: VerifiedIdentity,
  input: { channel: AgentChannel; sessionId: string; capabilities?: AccessCapabilities }
): AgentActor {
  const boardScope = identity.boardScope ?? 'role'
  const capabilities = input.capabilities ?? resolveAccessCapabilities({ rol: identity.rol, active: identity.active })
  return {
    authUserId: identity.authUserId,
    usuarioId: identity.usuarioId,
    rol: identity.rol,
    roleClass: classifyRole(identity.rol, identity.active),
    channel: input.channel,
    sessionId: input.sessionId,
    project: projectRef(),
    boardScope,
    capabilities,
    copilot: {
      supabase: identity.supabase,
      usuarioId: identity.usuarioId,
      authUserId: identity.authUserId,
      rol: identity.rol,
      accessToken: identity.accessToken,
      whatsappId: identity.whatsappId,
      boardScope,
      voiceChannel: input.channel === 'voice',
      capabilities,
    },
  }
}

/** Campos de autoridad que un cliente o el modelo podrían inyectar; se descartan siempre. */
const AUTHORITY_FIELDS = [
  'rol', 'role', 'app_role', 'usuario_id', 'usuarioId', 'user_id', 'authUserId', 'auth_user_id',
  'boardScope', 'board_scope', 'is_admin', 'permissions', 'roleClass', 'area', 'areas', 'project',
  'whatsappId', 'whatsappApproval', 'capabilities', 'module_keys', 'moduleKeys', 'super_admin', 'okrs_area',
]

export function stripAuthorityFields(args: Record<string, unknown>): Record<string, unknown> {
  const clean: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(args)) {
    if (!AUTHORITY_FIELDS.includes(key)) clean[key] = value
  }
  return clean
}
