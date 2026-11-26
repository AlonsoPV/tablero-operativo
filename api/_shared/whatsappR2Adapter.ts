/**
 * Adaptador R2 definitivo para WhatsApp (compatible con feature/r2-executive-action @ 345c2b6).
 *
 * Responsabilidades:
 * - Vincular cada propuesta y aprobación con identidad autenticada, propuesta exacta,
 *   versión SHA-256, alcance, lote (`batchId`) y expiración.
 * - Soportar propuestas individuales y múltiples, aprobación explícita, edición,
 *   cancelación, revalidación de permisos, control de concurrencia, confirmación de
 *   resultados y bloqueo estricto en R2 OFF.
 * - NO duplica el motor de ejecución: delega en los ejecutores/RPCs compartidos de R2
 *   (`confirmPendingOp`, `cancelPendingOp`, `editR2PendingOp`).
 */
import { createHash } from 'node:crypto'
import type { CopilotProposal } from '../../src/features/ai-support/copilot/types.js'
import {
  ACTION_PROPOSAL_TTL_MS,
  type ActionOperation,
} from './actions/contracts.js'
import {
  R2_EXECUTION_DISABLED_MESSAGE,
  resolveR2ExecutionMode,
  type R2ExecutionMode,
} from './actions/executionMode.js'

/** Herramientas R2 definitivas en `feature/r2-executive-action @ 345c2b6`. */
export const DEFINITIVE_R2_AGENT_TOOLS = {
  agent_create_action: 'create_action',
  agent_set_action_status: 'update_status',
  agent_register_blocker: 'register_blocker',
  agent_notify_responsable: 'notify_responsable',
  agent_update_fields: 'update_fields',
  agent_add_comment: 'add_comment',
  agent_verify_action: 'verify_action',
} as const

export type DefinitiveR2AgentTool = keyof typeof DEFINITIVE_R2_AGENT_TOOLS
export type DefinitiveR2Operation = (typeof DEFINITIVE_R2_AGENT_TOOLS)[DefinitiveR2AgentTool]

/** Operaciones aún no soportadas por R2 definitivo (nunca se ejecutan). */
export const DEFINITIVE_R2_UNSUPPORTED_OPERATIONS = ['tag_okr_action', 'update_checkpoint'] as const

/** Herramientas R2 definitivas que admiten edición antes de confirmar (`editR2PendingOp`). */
export const DEFINITIVE_R2_EDITABLE_TOOLS: ReadonlySet<string> = new Set<DefinitiveR2AgentTool>([
  'agent_create_action',
  'agent_update_fields',
  'agent_add_comment',
])

/** Herramientas heredadas de escritura en tablero que tampoco pueden evadir compuertas R2 en WhatsApp. */
export const LEGACY_BOARD_WRITE_TOOLS: ReadonlySet<string> = new Set([
  'create_action',
  'mark_action_done',
  'update_action',
  'update_daily_summary',
  'create_checkpoint',
  'update_checkpoint',
  ...Object.keys(DEFINITIVE_R2_AGENT_TOOLS),
])

export function isDefinitiveR2Tool(tool: string): tool is DefinitiveR2AgentTool {
  return Object.prototype.hasOwnProperty.call(DEFINITIVE_R2_AGENT_TOOLS, tool)
}

export function isBoardWriteToolGatedByR2(tool: string): boolean {
  return LEGACY_BOARD_WRITE_TOOLS.has(tool)
}

function isCommunicationProposal(tool: string): boolean {
  return ['whatsapp_prepare_send','notify_user_email'].includes(tool)
}

export function isDefinitiveR2EditableTool(tool: string): boolean {
  return DEFINITIVE_R2_EDITABLE_TOOLS.has(tool)
}

export type R2EditPatch = {
  fecha?: string
  responsableId?: string
  responsableHint?: string
  prioridad?: 'P1_Alta' | 'P2_Media' | 'P3_Baja'
  titulo?: string
  contenido?: string
}

export type WhatsAppProposalBinding = {
  proposalId: string
  usuarioId: string
  operation: ActionOperation | DefinitiveR2AgentTool | string
  scope: string
  version: string
  expiresAt: string
  summary: string
  batchId?: string | null
  expectedUpdatedAt?: string | null
  editable?: boolean
}

function canonicalizeValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalizeValue)
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>
    return Object.keys(obj)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        if (obj[key] !== undefined) acc[key] = canonicalizeValue(obj[key])
        return acc
      }, {})
  }
  return value
}

export function computeProposalVersion(input: {
  proposalId: string
  usuarioId: string
  operation: string
  scope: string
  payload?: Record<string, unknown> | null
  expectedUpdatedAt?: string | null
}): string {
  const canonicalPayload = input.payload ? JSON.stringify(canonicalizeValue(input.payload)) : '{}'
  const expected = input.expectedUpdatedAt ?? ''
  return createHash('sha256')
    .update(
      `${input.proposalId}|${input.usuarioId}|${input.operation}|${input.scope}|${expected}|${canonicalPayload}`
    )
    .digest('hex')
    .slice(0, 8)
    .toUpperCase()
}

export function buildProposalBinding(input: {
  proposalId: string
  usuarioId: string
  operation: ActionOperation | DefinitiveR2AgentTool | string
  scope: string
  summary: string
  payload?: Record<string, unknown> | null
  expiresAt?: string | null
  batchId?: string | null
  expectedUpdatedAt?: string | null
  nowMs?: number
}): WhatsAppProposalBinding {
  const nowMs = input.nowMs ?? Date.now()
  const expiresAt = input.expiresAt || new Date(nowMs + ACTION_PROPOSAL_TTL_MS).toISOString()
  const expectedUpdatedAt =
    input.expectedUpdatedAt ??
    (typeof input.payload?.expectedUpdatedAt === 'string' ? input.payload.expectedUpdatedAt : null)
  const version = computeProposalVersion({
    proposalId: input.proposalId,
    usuarioId: input.usuarioId,
    operation: input.operation,
    scope: input.scope,
    payload: input.payload,
    expectedUpdatedAt,
  })
  return {
    proposalId: input.proposalId,
    usuarioId: input.usuarioId,
    operation: input.operation,
    scope: input.scope,
    version,
    expiresAt,
    summary: input.summary,
    batchId: input.batchId ?? (typeof input.payload?.batchId === 'string' ? input.payload.batchId : null),
    expectedUpdatedAt,
    editable: isDefinitiveR2EditableTool(input.operation) || isCommunicationProposal(input.operation),
  }
}

export function buildProposalConfirmButtonId(binding: Pick<WhatsAppProposalBinding, 'proposalId' | 'version'>): string {
  return `r2_confirm:${binding.proposalId}:${binding.version}`
}

export function buildProposalEditButtonId(binding: Pick<WhatsAppProposalBinding, 'proposalId' | 'version'>): string {
  return `r2_edit:${binding.proposalId}:${binding.version}`
}

export function buildProposalCancelButtonId(binding: Pick<WhatsAppProposalBinding, 'proposalId'>): string {
  return `r2_cancel:${binding.proposalId}`
}

export type WhatsAppInteractiveReplyButton = {
  type: 'reply'
  reply: {
    /** Meta Cloud API: máximo 256 caracteres; vincula propuesta y versión. */
    id: string
    /** Meta Cloud API: máximo 20 caracteres. */
    title: string
  }
}

/**
 * Construye hasta 3 botones interactivos compatibles con Meta WhatsApp Cloud API
 * (Confirmar / Editar / Cancelar) vinculados a propuesta y versión exacta.
 * Si R2 está apagado (`disabled`), no emite botones de confirmación engañosos.
 */
export function buildWhatsAppInteractiveProposalButtons(
  binding: WhatsAppProposalBinding,
  executionMode: R2ExecutionMode = resolveR2ExecutionMode()
): WhatsAppInteractiveReplyButton[] {
  if (executionMode === 'disabled') return []

  const buttons: WhatsAppInteractiveReplyButton[] = [
    {
      type: 'reply',
      reply: {
        id: buildProposalConfirmButtonId(binding).slice(0, 256),
        title: 'Confirmar',
      },
    },
  ]

  if (binding.editable || isDefinitiveR2EditableTool(binding.operation)) {
    buttons.push({
      type: 'reply',
      reply: {
        id: buildProposalEditButtonId(binding).slice(0, 256),
        title: 'Editar',
      },
    })
  }

  buttons.push({
    type: 'reply',
    reply: {
      id: buildProposalCancelButtonId(binding).slice(0, 256),
      title: 'Cancelar',
    },
  })

  return buttons.slice(0, 3)
}

export type ParsedWhatsAppApproval =
  | { kind: 'confirm_bound'; proposalId: string; version: string }
  | { kind: 'edit_bound'; proposalId: string; version: string }
  | { kind: 'cancel_bound'; proposalId: string }
  | { kind: 'confirm_code'; version: string }
  | { kind: 'cancel_code'; version?: string }
  | { kind: 'edit_code'; version: string; patch: R2EditPatch }
  | { kind: 'ambiguous_confirm' }
  | { kind: 'none' }

const BARE_YES_RE = /^(si|sí|ok|okay|va|dale|confirmo|aceptar|acepto|aprobar|apruebo|adelante)[.!?\s]*$/i

function parseEditPatch(rawPatch: string): R2EditPatch | null {
  const patch: R2EditPatch = {}
  const trimmed = rawPatch.trim()
  if (!trimmed) return null

  const fechaMatch = trimmed.match(/\bfecha\s*[:=]\s*(\d{4}-\d{2}-\d{2})\b/i)
  if (fechaMatch) patch.fecha = fechaMatch[1]

  const prioMatch = trimmed.match(/\bprioridad\s*[:=]\s*(P1_Alta|P2_Media|P3_Baja)\b/i)
  if (prioMatch) {
    const raw = prioMatch[1]!.toLowerCase()
    patch.prioridad = raw === 'p1_alta' ? 'P1_Alta' : raw === 'p2_media' ? 'P2_Media' : 'P3_Baja'
  }

  const respMatch = trimmed.match(/\bresponsable\s*[:=]\s*([^|;]+)/i)
  if (respMatch && respMatch[1]?.trim()) patch.responsableHint = respMatch[1].trim()

  const tituloMatch = trimmed.match(/\bt[ií]tulo\s*[:=]\s*([^|;]+)/i)
  if (tituloMatch && tituloMatch[1]?.trim()) patch.titulo = tituloMatch[1].trim()

  const comentarioMatch = trimmed.match(/\bcomentario\s*[:=]\s*([\s\S]+)$/i)
  if (comentarioMatch && comentarioMatch[1]?.trim()) patch.contenido = comentarioMatch[1].trim()

  return Object.keys(patch).length > 0 ? patch : null
}

export function parseWhatsAppApprovalIntent(input: {
  text?: string | null
  buttonId?: string | null
}): ParsedWhatsAppApproval {
  const button = (input.buttonId ?? '').trim()
  const confirmButtonMatch = button.match(/^r2_confirm:([^:]+):([A-Za-z0-9]{6,16})$/)
  if (confirmButtonMatch) {
    return {
      kind: 'confirm_bound',
      proposalId: confirmButtonMatch[1]!,
      version: confirmButtonMatch[2]!.toUpperCase(),
    }
  }
  const editButtonMatch = button.match(/^r2_edit:([^:]+):([A-Za-z0-9]{6,16})$/)
  if (editButtonMatch) {
    return {
      kind: 'edit_bound',
      proposalId: editButtonMatch[1]!,
      version: editButtonMatch[2]!.toUpperCase(),
    }
  }
  const cancelButtonMatch = button.match(/^r2_cancel:([^:]+)$/)
  if (cancelButtonMatch) {
    return {
      kind: 'cancel_bound',
      proposalId: cancelButtonMatch[1]!,
    }
  }

  const rawText = (input.text ?? '').trim()
  if (!rawText) return { kind: 'none' }

  const explicitConfirm = rawText.match(/^(?:confirmar|aprobar)\s+([A-Za-z0-9]{6,16})\s*$/i)
  if (explicitConfirm) {
    return { kind: 'confirm_code', version: explicitConfirm[1]!.toUpperCase() }
  }

  const explicitEdit = rawText.match(/^editar\s+([A-Za-z0-9]{6,16})\s+([\s\S]+)$/i)
  if (explicitEdit) {
    const patch = parseEditPatch(explicitEdit[2]!)
    if (patch) {
      return {
        kind: 'edit_code',
        version: explicitEdit[1]!.toUpperCase(),
        patch,
      }
    }
  }

  const explicitCancel = rawText.match(/^cancelar(?:\s+([A-Za-z0-9]{6,16}))?\s*$/i)
  if (explicitCancel) {
    return {
      kind: 'cancel_code',
      version: explicitCancel[1] ? explicitCancel[1].toUpperCase() : undefined,
    }
  }

  if (BARE_YES_RE.test(rawText)) {
    return { kind: 'ambiguous_confirm' }
  }

  return { kind: 'none' }
}

export type WhatsAppApprovalResolution =
  | { status: 'ready_to_execute'; binding: WhatsAppProposalBinding }
  | { status: 'ready_to_cancel'; binding: WhatsAppProposalBinding }
  | { status: 'ready_to_edit'; binding: WhatsAppProposalBinding; patch: R2EditPatch }
  | { status: 'edit_prompt'; binding: WhatsAppProposalBinding; message: string }
  | { status: 'draft_only_r2_off'; binding: WhatsAppProposalBinding; message: string }
  | { status: 'ambiguous'; message: string; candidates: WhatsAppProposalBinding[] }
  | { status: 'expired'; message: string }
  | { status: 'version_mismatch'; message: string }
  | { status: 'not_editable'; binding: WhatsAppProposalBinding; message: string }
  | { status: 'unsupported_operation'; message: string }
  | { status: 'forbidden'; message: string }
  | { status: 'not_found'; message: string }

/**
 * Evalúa una aprobación, edición o cancelación recibida por WhatsApp exigiendo:
 * - Identidad autenticada y activa, propietaria de la propuesta.
 * - Propuesta exacta + versión vigente (sin ambigüedad ante "sí" suelto).
 * - Ventana de expiración vigente y alcance autorizado.
 * - Modo R2 habilitado (`simulated` o `qa`); en `disabled` (R2 OFF) jamás ejecuta.
 */
export function resolveWhatsAppProposalApproval(input: {
  actorUsuarioId: string
  actorActive: boolean
  pending: readonly WhatsAppProposalBinding[]
  decision: ParsedWhatsAppApproval
  executionMode?: R2ExecutionMode
  nowMs?: number
}): WhatsAppApprovalResolution {
  const nowMs = input.nowMs ?? Date.now()
  const mode = input.executionMode ?? resolveR2ExecutionMode()
  const decision = input.decision

  if (!input.actorUsuarioId || !input.actorActive) {
    return {
      status: 'forbidden',
      message: 'Tu cuenta no está activa o autorizada para aprobar propuestas.',
    }
  }

  const owned = input.pending.filter((p) => p.usuarioId === input.actorUsuarioId)
  if (
    decision.kind === 'confirm_bound' ||
    decision.kind === 'edit_bound' ||
    decision.kind === 'cancel_bound'
  ) {
    const targetProposalId = decision.proposalId
    const foreignMatch = input.pending.find(
      (p) => p.proposalId === targetProposalId && p.usuarioId !== input.actorUsuarioId
    )
    if (foreignMatch) {
      return {
        status: 'forbidden',
        message: 'Esta propuesta pertenece a otro usuario. No se aplicó ningún cambio.',
      }
    }
  }

  const activePending = owned.filter((p) => Date.parse(p.expiresAt) > nowMs)

  if (decision.kind === 'edit_bound') {
    const byId = owned.find((p) => p.proposalId === decision.proposalId)
    if (!byId) return { status: 'not_found', message: 'No encontré esa propuesta pendiente.' }
    if (Date.parse(byId.expiresAt) <= nowMs) {
      return { status: 'expired', message: 'La propuesta expiró antes de editarse. Solicítala de nuevo.' }
    }
    if (byId.version !== decision.version) {
      return {
        status: 'version_mismatch',
        message: 'La propuesta cambió de versión. Revisa el código vigente antes de editar.',
      }
    }
    if (!isDefinitiveR2EditableTool(byId.operation) && !isCommunicationProposal(byId.operation)) {
      return {
        status: 'not_editable',
        binding: byId,
        message: 'Este tipo de propuesta no admite edición directa. Cancélala y solicita una nueva.',
      }
    }
    return {
      status: 'edit_prompt',
      binding: byId,
      message: isCommunicationProposal(byId.operation)
        ? 'Indica el ajuste con: "Cambia el mensaje a: nuevo contenido". Se invalidará el código anterior; tendrás que revisar y confirmar la nueva propuesta.'
        : `Indica el ajuste con: "editar ${byId.version} fecha=YYYY-MM-DD prioridad=P1_Alta responsable=Nombre" (sin aplicar cambios aún).`,
    }
  }

  if (decision.kind === 'cancel_bound') {
    const targetProposalId = decision.proposalId
    const target = activePending.find((p) => p.proposalId === targetProposalId)
    if (!target) {
      const expired = owned.find((p) => p.proposalId === targetProposalId)
      if (expired) return { status: 'expired', message: 'La propuesta ya expiró.' }
      return { status: 'not_found', message: 'No encontré esa propuesta pendiente.' }
    }
    return { status: 'ready_to_cancel', binding: target }
  }

  if (decision.kind === 'cancel_code') {
    const targetVersion = decision.version
    if (targetVersion) {
      const target = activePending.find((p) => p.version === targetVersion)
      if (!target) return { status: 'not_found', message: 'No encontré una propuesta activa con ese código.' }
      return { status: 'ready_to_cancel', binding: target }
    }
    if (activePending.length === 1) {
      return { status: 'ready_to_cancel', binding: activePending[0]! }
    }
    if (activePending.length > 1) {
      const list = activePending.map((p) => `- ${p.version}: ${p.summary}`).join('\n')
      return {
        status: 'ambiguous',
        candidates: activePending,
        message: `Tienes ${activePending.length} propuestas activas. Indica cuál cancelar con "cancelar <código>":\n${list}`,
      }
    }
    return { status: 'not_found', message: 'No tienes propuestas pendientes.' }
  }

  if (decision.kind === 'edit_code') {
    const byCode = owned.find((p) => p.version === decision.version)
    if (!byCode) {
      return {
        status: 'version_mismatch',
        message: 'El código no coincide con ninguna propuesta vigente para editar.',
      }
    }
    if (Date.parse(byCode.expiresAt) <= nowMs) {
      return { status: 'expired', message: 'La propuesta expiró antes de editarse. Solicítala de nuevo.' }
    }
    if (!isDefinitiveR2EditableTool(byCode.operation)) {
      return {
        status: 'not_editable',
        binding: byCode,
        message: 'Este tipo de propuesta no admite edición directa. Cancélala y solicita una nueva.',
      }
    }
    return { status: 'ready_to_edit', binding: byCode, patch: decision.patch }
  }

  if (decision.kind === 'ambiguous_confirm') {
    if (activePending.length === 0) {
      return { status: 'not_found', message: 'No hay ninguna propuesta vigente por aprobar.' }
    }
    const list = activePending
      .slice(0, 3)
      .map((p) => `- ${p.version}: ${p.summary}`)
      .join('\n')
    return {
      status: 'ambiguous',
      candidates: activePending,
      message:
        activePending.length > 1
          ? `Un "sí" no aprueba cambios cuando hay varias propuestas activas. Responde "confirmar <código>" o usa el botón de la propuesta:\n${list}`
          : `Un "sí" suelto no aprueba esta propuesta. Responde "confirmar ${activePending[0]!.version}" o pulsa Confirmar.`,
    }
  }

  let matched: WhatsAppProposalBinding | undefined
  if (decision.kind === 'confirm_bound') {
    const targetProposalId = decision.proposalId
    const targetVersion = decision.version
    const byId = owned.find((p) => p.proposalId === targetProposalId)
    if (!byId) {
      return { status: 'not_found', message: 'No encontré esa propuesta pendiente.' }
    }
    if (Date.parse(byId.expiresAt) <= nowMs) {
      return { status: 'expired', message: 'La propuesta expiró antes de confirmarse. Solicítala de nuevo.' }
    }
    if (byId.version !== targetVersion) {
      return {
        status: 'version_mismatch',
        message: 'La propuesta cambió de versión. Revisa el nuevo borrador antes de confirmar.',
      }
    }
    matched = byId
  } else if (decision.kind === 'confirm_code') {
    const targetVersion = decision.version
    const byCode = owned.find((p) => p.version === targetVersion)
    if (!byCode) {
      return {
        status: 'version_mismatch',
        message: 'El código no coincide con ninguna propuesta vigente. Revisa el código e intenta de nuevo.',
      }
    }
    if (Date.parse(byCode.expiresAt) <= nowMs) {
      return { status: 'expired', message: 'La propuesta expiró antes de confirmarse. Solicítala de nuevo.' }
    }
    matched = byCode
  } else {
    return { status: 'not_found', message: 'No se recibió una confirmación válida.' }
  }

  if (
    DEFINITIVE_R2_UNSUPPORTED_OPERATIONS.includes(
      matched.operation as (typeof DEFINITIVE_R2_UNSUPPORTED_OPERATIONS)[number]
    )
  ) {
    return {
      status: 'unsupported_operation',
      message: 'Esta operación todavía no está habilitada para ejecución desde el agente.',
    }
  }

  if (mode === 'disabled') {
    return {
      status: 'draft_only_r2_off',
      binding: matched,
      message: R2_EXECUTION_DISABLED_MESSAGE,
    }
  }

  return { status: 'ready_to_execute', binding: matched }
}

export type WhatsAppR2ExecutionOutcome =
  | { status: 'executed'; binding: WhatsAppProposalBinding; message: string; result: Record<string, unknown> }
  | { status: 'edited'; previousVersion: string; binding: WhatsAppProposalBinding; message: string }
  | { status: 'canceled'; binding: WhatsAppProposalBinding; message: string }
  | { status: 'concurrency_conflict'; binding: WhatsAppProposalBinding; message: string }
  | { status: 'permission_revoked'; binding: WhatsAppProposalBinding; message: string }
  | { status: 'rejected'; resolution: WhatsAppApprovalResolution; message: string }

/**
 * Formatea la confirmación de resultado devuelta por el motor R2 definitivo (`345c2b6`).
 */
export function formatWhatsAppR2ExecutionResult(
  binding: WhatsAppProposalBinding,
  result: Record<string, unknown> | null | undefined
): string {
  const data = result ?? {}
  const replayed = data.replayed === true
  const prefix = replayed ? 'Esta operación ya estaba aplicada (sin duplicar).' : 'Cambio aplicado en Scrumban.'
  const href = typeof data.href === 'string' && data.href.trim() ? `Ver en Scrumban: ${data.href.trim()}` : ''

  switch (binding.operation) {
    case 'agent_create_action':
    case 'create_action': {
      const title = typeof data.title === 'string' ? data.title : binding.summary
      const fecha = typeof data.fecha === 'string' ? `Compromiso: ${data.fecha}` : ''
      return [replayed ? prefix : 'Acción creada en Scrumban. Estado: Pendiente.', title, fecha, href]
        .filter(Boolean)
        .join('\n')
    }
    case 'agent_set_action_status':
    case 'update_status':
    case 'mark_action_done': {
      const estado = typeof data.estado === 'string' ? data.estado : 'actualizado'
      return [prefix, `Estado actual: ${estado}.`, href].filter(Boolean).join('\n')
    }
    case 'agent_register_blocker':
    case 'register_blocker':
      return [
        prefix,
        'Bloqueo registrado como causa reportada (sin modificar causa raíz validada).',
        href,
      ]
        .filter(Boolean)
        .join('\n')
    case 'agent_update_fields':
    case 'update_fields': {
      const campos = Array.isArray(data.campos) ? data.campos.join(', ') : ''
      return [prefix, campos ? `Campos actualizados: ${campos}.` : 'Campos actualizados.', href]
        .filter(Boolean)
        .join('\n')
    }
    case 'agent_add_comment':
    case 'add_comment':
      return [prefix, 'Comentario registrado en la acción.', href].filter(Boolean).join('\n')
    case 'agent_verify_action':
    case 'verify_action':
      return [prefix, 'Acción marcada como Verificado por autorización explícita.', href]
        .filter(Boolean)
        .join('\n')
    case 'agent_notify_responsable':
    case 'notify_responsable':
      return [prefix, 'Notificación registrada para el responsable.', href].filter(Boolean).join('\n')
    default:
      return [prefix, binding.summary, href].filter(Boolean).join('\n')
  }
}

export type WhatsAppR2ExecutorAdapter = {
  revalidatePermission: (binding: WhatsAppProposalBinding) => Promise<{ allowed: boolean; reason?: string }>
  claimAndExecute: (
    binding: WhatsAppProposalBinding
  ) => Promise<
    | { ok: true; result: Record<string, unknown> }
    | { ok: false; code: 'concurrency_conflict' | 'permission_revoked' | 'execution_disabled' | 'failed'; message: string }
  >
  cancelOp: (binding: WhatsAppProposalBinding) => Promise<void>
  editOp?: (
    binding: WhatsAppProposalBinding,
    patch: R2EditPatch
  ) => Promise<{
    proposalId: string
    summary: string
    payload?: Record<string, unknown> | null
    expiresAt?: string | null
    expectedUpdatedAt?: string | null
  }>
}

/**
 * Orquestador delgado del adaptador WhatsApp -> R2 definitivo.
 * Revalida permisos, aplica lock de concurrencia en vuelo, bloquea R2 OFF y delega al motor R2.
 */
export async function executeWhatsAppR2Decision(input: {
  actorUsuarioId: string
  actorActive: boolean
  pending: readonly WhatsAppProposalBinding[]
  decision: ParsedWhatsAppApproval
  executionMode?: R2ExecutionMode
  nowMs?: number
  inFlightLocks?: Set<string>
  executor: WhatsAppR2ExecutorAdapter
}): Promise<WhatsAppR2ExecutionOutcome> {
  const resolution = resolveWhatsAppProposalApproval({
    actorUsuarioId: input.actorUsuarioId,
    actorActive: input.actorActive,
    pending: input.pending,
    decision: input.decision,
    executionMode: input.executionMode,
    nowMs: input.nowMs,
  })

  if (resolution.status === 'ready_to_cancel') {
    await input.executor.cancelOp(resolution.binding)
    return {
      status: 'canceled',
      binding: resolution.binding,
      message: 'Listo, cancelé la propuesta. No se aplicó ningún cambio en el tablero.',
    }
  }

  if (resolution.status === 'ready_to_edit') {
    const perm = await input.executor.revalidatePermission(resolution.binding)
    if (!perm.allowed) {
      return {
        status: 'permission_revoked',
        binding: resolution.binding,
        message: perm.reason || 'Tus permisos cambiaron y ya no puedes editar esta propuesta.',
      }
    }
    if (!input.executor.editOp) {
      return {
        status: 'rejected',
        resolution: {
          status: 'not_editable',
          binding: resolution.binding,
          message: 'La edición no está disponible en este canal ahora. Cancela y solicita una nueva propuesta.',
        },
        message: 'La edición no está disponible en este canal ahora. Cancela y solicita una nueva propuesta.',
      }
    }
    const updated = await input.executor.editOp(resolution.binding, resolution.patch)
    const nextBinding = buildProposalBinding({
      proposalId: updated.proposalId,
      usuarioId: resolution.binding.usuarioId,
      operation: resolution.binding.operation,
      scope: resolution.binding.scope,
      summary: updated.summary,
      payload: updated.payload,
      expiresAt: updated.expiresAt ?? resolution.binding.expiresAt,
      batchId: resolution.binding.batchId,
      expectedUpdatedAt: updated.expectedUpdatedAt ?? resolution.binding.expectedUpdatedAt,
      nowMs: input.nowMs,
    })
    return {
      status: 'edited',
      previousVersion: resolution.binding.version,
      binding: nextBinding,
      message: [
        'Propuesta actualizada (la versión anterior quedó invalidada).',
        nextBinding.summary,
        `Nuevo código: ${nextBinding.version}. Responde "confirmar ${nextBinding.version}" para aplicar o "cancelar ${nextBinding.version}".`,
      ].join('\n'),
    }
  }

  if (resolution.status !== 'ready_to_execute') {
    return {
      status: 'rejected',
      resolution,
      message: resolution.message,
    }
  }

  const lockKey = `${resolution.binding.usuarioId}:${resolution.binding.proposalId}`
  if (input.inFlightLocks?.has(lockKey)) {
    return {
      status: 'concurrency_conflict',
      binding: resolution.binding,
      message: 'Esta propuesta ya se está procesando. Espera el resultado sin reenviar la confirmación.',
    }
  }
  input.inFlightLocks?.add(lockKey)

  try {
    const perm = await input.executor.revalidatePermission(resolution.binding)
    if (!perm.allowed) {
      return {
        status: 'permission_revoked',
        binding: resolution.binding,
        message: perm.reason || 'Tus permisos ya no permiten ejecutar esta operación. No se aplicó ningún cambio.',
      }
    }

    const exec = await input.executor.claimAndExecute(resolution.binding)
    if (!exec.ok) {
      if (exec.code === 'concurrency_conflict') {
        return {
          status: 'concurrency_conflict',
          binding: resolution.binding,
          message: exec.message || 'La acción cambió después de generar la propuesta. Solicita una nueva.',
        }
      }
      if (exec.code === 'permission_revoked') {
        return {
          status: 'permission_revoked',
          binding: resolution.binding,
          message: exec.message,
        }
      }
      return {
        status: 'rejected',
        resolution:
          exec.code === 'execution_disabled'
            ? { status: 'draft_only_r2_off', binding: resolution.binding, message: exec.message }
            : { status: 'forbidden', message: exec.message },
        message: exec.message,
      }
    }

    return {
      status: 'executed',
      binding: resolution.binding,
      result: exec.result,
      message: formatWhatsAppR2ExecutionResult(resolution.binding, exec.result),
    }
  } finally {
    input.inFlightLocks?.delete(lockKey)
  }
}

export function formatWhatsAppProposalPrompt(
  binding: WhatsAppProposalBinding,
  options: { executionMode?: R2ExecutionMode; proposal?: CopilotProposal | null; interactiveButtons?: boolean; interactiveMaxChars?: number } = {}
): string {
  const mode = options.executionMode ?? resolveR2ExecutionMode()
  const editHint =
    binding.editable && mode !== 'disabled'
      ? isCommunicationProposal(binding.operation) ? ' Para ajustar, pulsa Editar.' : ` Para ajustar responde "editar ${binding.version} fecha=YYYY-MM-DD".`
      : ''
  const workspace=options.proposal?.workspace
  const communication=['whatsapp_prepare_send','notify_user_email'].includes(binding.operation) && workspace
  const fieldLines = communication ? [
    `Para: ${workspace.recipientName ?? ''}${workspace.to?.length ? ` (${workspace.to.join(', ')})` : workspace.phone ? ` (${workspace.phone})` : ''}`,
    ...(workspace.subject ? [`Asunto: ${workspace.subject}`] : []),
    'Contenido:', workspace.body ?? '',
  ] : Array.isArray(options.proposal?.fields)
    ? options.proposal.fields
        .slice(0, 6)
        .map((f) => `${f.label}: ${f.from ? `${f.from} -> ${f.to}` : f.to}`)
    : []
  const lines =
    mode === 'disabled'
      ? [
          ...(fieldLines.length > 0 ? ['Nueva acción', '', ...fieldLines] : [binding.summary]),
          '',
          'Este borrador es solo para revisión; la creación automática de acciones aún no está habilitada y no se guardó en Scrumban.',
        ]
      : [
          'Propuesta pendiente de aprobación (no se aplicó ningún cambio todavía):',
          ...(fieldLines.length > 0 ? fieldLines : [binding.summary]),
          `Código: ${binding.version}`,
          `¿Confirmas la operación? Responde "confirmar ${binding.version}" o usa el botón Confirmar. Para cancelar responde "cancelar ${binding.version}".${editHint} Un "sí" suelto no ejecuta cambios.`,
        ]
  if (mode !== 'disabled' && options.interactiveButtons) {
    const compact = lines.slice(0, -1).join('\n')
    // Retain code instructions when the transport must fall back to a text-only message.
    if (compact.length <= (options.interactiveMaxChars ?? 1024)) return compact
  }
  return lines.join('\n')
}

export function formatWhatsAppBatchProposalPrompt(
  bindings: readonly WhatsAppProposalBinding[],
  options: { executionMode?: R2ExecutionMode } = {}
): string {
  if (bindings.length === 1) {
    return formatWhatsAppProposalPrompt(bindings[0]!, options)
  }
  const mode = options.executionMode ?? resolveR2ExecutionMode()
  const header =
    mode === 'disabled'
      ? `Preparé ${bindings.length} borradores (R2 deshabilitado; no se aplicó ningún cambio):`
      : `Preparé ${bindings.length} propuestas pendientes (se aprueban una por una por código):`
  const items = bindings.slice(0, 5).map((b, i) => `${i + 1}. [${b.version}] ${b.summary}`)
  const footer =
    mode === 'disabled'
      ? 'Revísalos en Scrumban. No se ejecutó ninguna escritura.'
      : 'Responde "confirmar <código>" o "cancelar <código>". Un "sí" suelto no aprueba ninguna.'
  return [header, ...items, footer].join('\n')
}
