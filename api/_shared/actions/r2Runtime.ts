/**
 * R2 (local): operaciones accionables del agente sobre assistant_pending_ops y confirmPendingOp.
 * Consulta → Propuesta → Confirmación → Revalidación → Ejecución → Evidencia.
 * Sólo ejecuta con R2_EXECUTION_MODE=simulated (ejecutor en memoria) o qa (proyecto QA autorizado,
 * ejecutor qa); en producción el modo es siempre disabled y la confirmación responde "ejecución no habilitada".
 */
import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { CopilotProposal } from '../../../src/features/ai-support/copilot/types.js'
import { evidenceOrPlaceholder } from '../../../src/features/ai-support/creationDraft.js'
import { todayWallClockCDMX } from '../../../src/lib/dateUtils.js'
import { createPendingOp, insertAssistantOpLog, type CopilotActor } from '../assistantPending.js'
import { loadAgentCapabilities } from '../query/actorCapabilities.js'
import { resolveActor, type AgentActor, type AgentChannel } from '../query/resolveActor.js'
import {
  ACTION_CONTRACTS,
  ACTION_PROPOSAL_TTL_MS,
  authorizeActionPhase,
  buildIdempotencyKey,
  COPILOT_GATED_TOOLS,
  isCopilotGatedTool,
  type ActionContract,
  type CopilotGatedTool,
  type ActionPayloadMap,
  type NotifyResponsablePayload,
} from './contracts.js'
import { R2_EXECUTION_DISABLED_MESSAGE, type R2ExecutionMode } from './executionMode.js'

export const R2_AGENT_TOOLS = {
  agent_create_action: 'create_action',
  agent_set_action_status: 'update_status',
  agent_register_blocker: 'register_blocker',
  agent_notify_responsable: 'notify_responsable',
  agent_update_fields: 'update_fields',
  agent_add_comment: 'add_comment',
  agent_verify_action: 'verify_action',
} as const

export type R2AgentTool = keyof typeof R2_AGENT_TOOLS
export type R2Operation = (typeof R2_AGENT_TOOLS)[R2AgentTool]

export const R2_TOOL_FOR: Record<R2Operation, R2AgentTool> = {
  create_action: 'agent_create_action',
  update_status: 'agent_set_action_status',
  register_blocker: 'agent_register_blocker',
  notify_responsable: 'agent_notify_responsable',
  update_fields: 'agent_update_fields',
  add_comment: 'agent_add_comment',
  verify_action: 'agent_verify_action',
}

export const R2_UNSUPPORTED_OPERATIONS = ['tag_okr_action', 'update_checkpoint'] as const

const ALLOWED_FIELD_PATCH = ['fecha', 'responsable', 'prioridad', 'titulo_accion'] as const
const PRIORIDADES = ['P1_Alta', 'P2_Media', 'P3_Baja'] as const

export { COPILOT_GATED_TOOLS, isCopilotGatedTool, type CopilotGatedTool }

export function isR2AgentTool(tool: string): tool is R2AgentTool {
  return Object.prototype.hasOwnProperty.call(R2_AGENT_TOOLS, tool)
}

type ActionRow = {
  id: string
  titulo_accion: string | null
  estado: string | null
  fecha: string | null
  responsable: string | null
  prioridad: string | null
  created_by: string | null
  updated_at: string | null
}

const ACTION_FIELDS = 'id,titulo_accion,estado,fecha,responsable,prioridad,created_by,updated_at'

async function loadActionRow(client: SupabaseClient, id: string): Promise<ActionRow | null> {
  const { data, error } = await client.from('acciones_diarias').select(ACTION_FIELDS).eq('id', id).maybeSingle()
  if (error) throw new Error('DATABASE_ERROR: No se pudo leer la acción.')
  return (data as ActionRow | null) ?? null
}

async function loadActiveUser(client: SupabaseClient, id: string) {
  const { data } = await client.from('usuarios').select('id,nombre,activo').eq('id', id).maybeSingle()
  const row = data as { id: string; nombre?: string | null; activo?: boolean | null } | null
  return row && row.activo !== false ? row : null
}

/** Responsable o edición general (misma regla que la RPC agent_apply_action_status). */
async function canActOnAction(actor: CopilotActor, action: ActionRow): Promise<boolean> {
  if (action.responsable === actor.usuarioId) return true
  const { data, error } = await actor.supabase.rpc('can_edit_accion_general_as', {
    p_accion_id: action.id,
    p_usuario_id: actor.usuarioId,
  })
  return !error && data === true
}

/** Rol, activación y capacidades leídos de nuevo al confirmar: un cambio de rol posterior a la propuesta cuenta. */
export async function reloadAgentActor(copilot: CopilotActor, channel: AgentChannel = 'web'): Promise<AgentActor> {
  const { data } = await copilot.supabase.from('usuarios').select('id,rol,activo').eq('id', copilot.usuarioId).maybeSingle()
  const row = data as { rol?: string | null; activo?: boolean | null } | null
  const identity = {
    supabase: copilot.supabase,
    authUserId: copilot.authUserId,
    usuarioId: copilot.usuarioId,
    rol: row?.rol ?? null,
    active: Boolean(row) && row?.activo !== false,
    accessToken: copilot.accessToken,
    boardScope: copilot.boardScope,
  }
  const capabilities = await loadAgentCapabilities(identity)
  return resolveActor(identity, { channel, sessionId: copilot.guideSessionId ?? 'confirm', capabilities })
}

/** Payload del contrato a partir del payload almacenado (el que se autoriza y firma la idempotencia). */
export function contractPayloadOf(tool: R2AgentTool, payload: Record<string, unknown>) {
  const s = (key: string) => (typeof payload[key] === 'string' ? (payload[key] as string) : null)
  switch (tool) {
    case 'agent_create_action':
      return { titulo: s('titulo_accion') ?? '', responsableId: s('responsable'), fecha: s('fecha') }
    case 'agent_set_action_status':
      return { accionId: s('accionId') ?? '', estado: s('estado') as ActionPayloadMap['update_status']['estado'] }
    case 'agent_register_blocker':
      return { accionId: s('accionId') ?? '', motivo: s('motivo') ?? '' }
    case 'agent_notify_responsable':
      return { accionId: s('accionId') ?? '', canal: s('canal') as NotifyResponsablePayload['canal'] }
    case 'agent_update_fields': {
      const campos = Array.isArray(payload.campos)
        ? payload.campos.filter((c): c is string => typeof c === 'string')
        : []
      return { accionId: s('accionId') ?? '', campos }
    }
    case 'agent_add_comment':
      return { accionId: s('accionId') ?? '', contenido: s('contenido') ?? '' }
    case 'agent_verify_action':
      return { accionId: s('accionId') ?? '' }
  }
}

export type R2ProposeResult =
  | { ok: true; proposal: CopilotProposal; idempotencyKey: string; executionEnabled: false }
  | { ok: false; reason: string; missing?: string[] }

type ProposeInput = {
  create_action: ActionPayloadMap['create_action'] & { responsableHint?: string | null }
  update_status: ActionPayloadMap['update_status']
  register_blocker: ActionPayloadMap['register_blocker']
  notify_responsable: ActionPayloadMap['notify_responsable']
  update_fields: ActionPayloadMap['update_fields'] & {
    fecha?: string | null
    responsableId?: string | null
    responsableHint?: string | null
    prioridad?: string | null
    titulo?: string | null
  }
  add_comment: ActionPayloadMap['add_comment']
  verify_action: ActionPayloadMap['verify_action']
}

const deny = (reason: string, missing?: string[]): R2ProposeResult => ({ ok: false, reason, ...(missing ? { missing } : {}) })

async function resolveResponsable(actor: AgentActor, hint: string) {
  const { data } = await actor.copilot.supabase
    .from('usuarios')
    .select('id,nombre,activo')
    .ilike('nombre', `%${hint.replace(/[%_\\]/g, '\\$&')}%`)
    .eq('activo', true)
    .limit(5)
  return (data ?? []) as Array<{ id: string; nombre: string }>
}

/**
 * Propuesta R2: autoriza la fase propose con las capacidades del turno, valida el contrato,
 * resuelve datos del servidor (responsable, acción, updated_at) y guarda la operación pendiente.
 * No ejecuta nada.
 */
export async function proposeR2Operation<O extends R2Operation>(
  actor: AgentActor,
  operation: O,
  input: ProposeInput[O],
  opts: { today?: string; batchId?: string } = {}
): Promise<R2ProposeResult> {
  const contract = ACTION_CONTRACTS[operation] as unknown as ActionContract<O>
  const client = actor.copilot.supabase
  const today = opts.today ?? todayWallClockCDMX()

  let contractPayload = input as ActionPayloadMap[O]
  let stored: Record<string, unknown>
  let resourceId: string | null = null
  let expectedUpdatedAt: string | null = null
  let fields: CopilotProposal['fields']
  let title: string
  let summary: string

  const precheck = authorizeActionPhase(actor, 'propose', operation, input as ActionPayloadMap[O])
  if (!precheck.allowed) return deny(precheck.reason)

  if (operation === 'create_action') {
    const create = input as ProposeInput['create_action']
    let responsableId = create.responsableId
    let responsableNombre: string | null = null
    if (!responsableId && create.responsableHint?.trim()) {
      const matches = await resolveResponsable(actor, create.responsableHint.trim())
      if (matches.length > 1) {
        return deny(`Hay varias personas que coinciden: ${matches.map((m) => m.nombre).join(', ')}. Indica cuál.`)
      }
      responsableId = matches[0]?.id ?? null
      responsableNombre = matches[0]?.nombre ?? null
    }
    contractPayload = { titulo: create.titulo?.trim() ?? '', responsableId, fecha: create.fecha } as ActionPayloadMap[O]
    const missing = contract.validate(contractPayload)
    if (missing.length) return deny(`Faltan datos para la propuesta: ${missing.join(', ')}.`, missing)
    const person = await loadActiveUser(client, responsableId!)
    if (!person) return deny('El responsable no existe o está inactivo.')
    if (!create.fecha || create.fecha < today) return deny('La fecha de compromiso debe ser hoy o posterior (CDMX).')
    const titulo = create.titulo.trim().slice(0, 70)
    stored = {
      titulo_accion: titulo,
      descripcion_accion: titulo,
      evidencia_esperada: evidenceOrPlaceholder(undefined),
      fecha: create.fecha,
      hora_limite: '17:00',
      estado: 'Pendiente',
      responsable: person.id,
      prioridad: 'P2_Media',
      created_by: actor.usuarioId,
      tipo_accion: 'operativa',
      checkpoints: [],
    }
    title = 'Crear acción'
    summary = `Propuesta, todavía no creada: «${titulo}» para ${responsableNombre ?? person.nombre ?? 'el responsable'}.`
    fields = [
      { label: 'Título', to: titulo },
      { label: 'Responsable', to: responsableNombre ?? person.nombre ?? person.id },
      { label: 'Fecha', to: `${create.fecha} 17:00` },
      ...(create.origenAccionId ? [{ label: 'Origen', to: `Acción bloqueada ${create.origenAccionId}` }] : []),
    ]
  } else {
    const accionId = (input as { accionId?: string }).accionId ?? ''
    if (operation === 'update_status' && (input as ProposeInput['update_status']).estado === ('Verificado' as never)) {
      return deny('Verificado requiere la validación de una persona; el agente no lo asigna.')
    }
    if (operation !== 'update_fields') {
      const missing = contract.validate(input as ActionPayloadMap[O])
      if (missing.length) return deny(`Faltan datos para la propuesta: ${missing.join(', ')}.`, missing)
    }
    const action = await loadActionRow(client, accionId)
    if (!action) return deny('No encontré esa acción o no tienes acceso a ella.')
    if (action.estado === 'Verificado') return deny('La acción ya está verificada; no se modifica desde el agente.')
    resourceId = action.id
    const label = action.titulo_accion ?? 'Acción'

    if (operation === 'notify_responsable') {
      const notify = input as ProposeInput['notify_responsable']
      if (!action.responsable) return deny('La acción no tiene responsable.')
      if (action.responsable === actor.usuarioId) return deny('Eres el responsable de esa acción; no hace falta notificarte.')
      if (action.created_by !== actor.usuarioId && !(await canActOnAction(actor.copilot, action))) {
        return deny('No tienes permiso para notificar sobre esa acción.')
      }
      const recipient = await loadActiveUser(client, action.responsable)
      if (!recipient) return deny('El responsable de la acción está inactivo.')
      const mensaje = `Tienes la acción «${label}» con fecha ${action.fecha ?? 'sin fecha'} (estado: ${action.estado ?? 'sin estado'}). Revísala en Scrumban.`
      stored = { accionId: action.id, canal: notify.canal, destinatarioId: recipient.id, mensaje, dia: today }
      title = notify.canal === 'whatsapp' ? 'Avisar por WhatsApp' : 'Avisar por correo'
      summary = `Propuesta, todavía no enviada: aviso a ${recipient.nombre ?? 'el responsable'} sobre «${label}».`
      fields = [
        { label: 'Acción', to: label },
        { label: 'Destinatario', to: `${recipient.nombre ?? recipient.id} (responsable)` },
        { label: 'Canal', to: notify.canal === 'whatsapp' ? 'WhatsApp' : 'Correo' },
        { label: 'Mensaje', to: mensaje },
      ]
    } else if (operation === 'add_comment') {
      const contenido = (input as ProposeInput['add_comment']).contenido.trim().slice(0, 2000)
      stored = { accionId: action.id, contenido }
      contractPayload = stored as ActionPayloadMap[O]
      title = 'Agregar comentario'
      summary = `Propuesta, todavía no aplicada: comentario en «${label}».`
      fields = [
        { label: 'Acción', to: label },
        { label: 'Comentario', to: contenido },
      ]
    } else if (operation === 'verify_action') {
      if (action.estado !== 'Hecho') return deny('Sólo se verifica una acción que ya está en Hecho.')
      const { data: canManage, error: manageError } = await actor.copilot.supabase.rpc('can_manage_accion_full_as', {
        p_accion_id: action.id,
        p_usuario_id: actor.usuarioId,
      })
      if (manageError) return deny('No se pudo validar el permiso de verificación.')
      if (canManage !== true) {
        return deny('La verificación corresponde a quien creó la acción o a Super Admin.')
      }
      expectedUpdatedAt = action.updated_at
      stored = { accionId: action.id, expectedUpdatedAt }
      contractPayload = { accionId: action.id } as ActionPayloadMap[O]
      title = 'Verificar acción'
      summary = `Propuesta, todavía no aplicada: «${label}» pasa de Hecho a Verificado. Requiere tu aprobación.`
      fields = [
        { label: 'Acción', to: label },
        { label: 'Estado', from: action.estado ?? '', to: 'Verificado' },
      ]
    } else if (operation === 'update_fields') {
      if (!(await canActOnAction(actor.copilot, action))) return deny('No tienes permiso sobre esa acción.')
      expectedUpdatedAt = action.updated_at
      const patchIn = input as ProposeInput['update_fields']
      let responsableId = patchIn.responsableId ?? null
      let responsableNombre: string | null = null
      if (!responsableId && patchIn.responsableHint?.trim()) {
        const matches = await resolveResponsable(actor, patchIn.responsableHint.trim())
        if (matches.length > 1) {
          return deny(`Hay varias personas que coinciden: ${matches.map((m) => m.nombre).join(', ')}. Indica cuál.`)
        }
        responsableId = matches[0]?.id ?? null
        responsableNombre = matches[0]?.nombre ?? null
      }
      if (responsableId) {
        const person = await loadActiveUser(client, responsableId)
        if (!person) return deny('El responsable no existe o está inactivo.')
        responsableNombre = responsableNombre ?? person.nombre ?? person.id
      }
      if (patchIn.fecha && patchIn.fecha < today) return deny('La fecha de compromiso debe ser hoy o posterior (CDMX).')
      if (patchIn.prioridad && !PRIORIDADES.includes(patchIn.prioridad as (typeof PRIORIDADES)[number])) {
        return deny('La prioridad debe ser P1_Alta, P2_Media o P3_Baja.')
      }
      const campos: string[] = []
      const storedPatch: Record<string, unknown> = { accionId: action.id, expectedUpdatedAt }
      if (patchIn.fecha) {
        campos.push('fecha')
        storedPatch.fecha = patchIn.fecha
      }
      if (responsableId) {
        campos.push('responsable')
        storedPatch.responsable = responsableId
      }
      if (patchIn.prioridad) {
        campos.push('prioridad')
        storedPatch.prioridad = patchIn.prioridad
      }
      if (patchIn.titulo?.trim()) {
        campos.push('titulo_accion')
        storedPatch.titulo_accion = patchIn.titulo.trim().slice(0, 70)
      }
      storedPatch.campos = campos
      contractPayload = { accionId: action.id, campos } as ActionPayloadMap[O]
      const missing = contract.validate(contractPayload)
      if (missing.length) return deny(`Faltan datos para la propuesta: ${missing.join(', ')}.`, missing)
      stored = storedPatch
      title = 'Actualizar campos'
      summary = `Propuesta, todavía no aplicada: actualizar ${campos.join(', ')} en «${label}».`
      fields = [
        { label: 'Acción', to: label },
        ...(patchIn.fecha ? [{ label: 'Fecha', from: action.fecha ?? '', to: patchIn.fecha }] : []),
        ...(responsableId ? [{ label: 'Responsable', from: action.responsable ?? '', to: responsableNombre ?? responsableId }] : []),
        ...(patchIn.prioridad ? [{ label: 'Prioridad', from: action.prioridad ?? '', to: patchIn.prioridad }] : []),
        ...(patchIn.titulo?.trim()
          ? [{ label: 'Título', from: action.titulo_accion ?? '', to: patchIn.titulo.trim().slice(0, 70) }]
          : []),
      ]
    } else {
      if (!(await canActOnAction(actor.copilot, action))) return deny('No tienes permiso sobre esa acción.')
      expectedUpdatedAt = action.updated_at
      if (operation === 'update_status') {
        const estado = (input as ProposeInput['update_status']).estado
        if (estado === 'Bloqueado') return deny('Para bloquear una acción indica el motivo (registrar bloqueo).')
        if (action.estado === estado) return deny(`La acción ya está en ${estado}.`)
        stored = { accionId: action.id, estado, expectedUpdatedAt }
        contractPayload = stored as ActionPayloadMap[O]
        title = 'Cambiar estado'
        summary = `Propuesta, todavía no aplicada: «${label}» pasa de ${action.estado} a ${estado}.`
        fields = [{ label: 'Acción', to: label }, { label: 'Estado', from: action.estado ?? '', to: estado }]
      } else {
        const motivo = (input as ProposeInput['register_blocker']).motivo.trim().slice(0, 2000)
        if (action.estado === 'Bloqueado') return deny('La acción ya está bloqueada.')
        stored = { accionId: action.id, motivo, expectedUpdatedAt }
        contractPayload = stored as ActionPayloadMap[O]
        title = 'Registrar bloqueo'
        summary = `Propuesta, todavía no aplicada: «${label}» queda Bloqueada.`
        fields = [
          { label: 'Acción', to: label },
          { label: 'Estado', from: action.estado ?? '', to: 'Bloqueado' },
          { label: 'Motivo', to: motivo },
        ]
      }
    }
  }

  const idempotencyKey = buildIdempotencyKey(actor.usuarioId, operation, operation === 'notify_responsable'
    ? { ...(contractPayload as NotifyResponsablePayload), dia: today } as unknown as ActionPayloadMap[O]
    : contractPayload)
  if (opts.batchId) stored.batchId = opts.batchId
  const href = resourceId ? `/kanban?accion=${encodeURIComponent(resourceId)}` : undefined
  const proposal = await createPendingOp(actor.copilot, {
    tool: R2_TOOL_FOR[operation],
    resourceId,
    expectedUpdatedAt,
    payload: stored,
    proposal: {
      title,
      summary,
      fields,
      ...(href && resourceId ? { record: { id: resourceId, title: title, href } } : {}),
      ...(opts.batchId ? { batchId: opts.batchId } : {}),
    },
    ttlMs: ACTION_PROPOSAL_TTL_MS,
    requestKey: idempotencyKey,
    releaseStaleRequestKey: true,
    channel: actor.channel,
  })
  return { ok: true, proposal, idempotencyKey, executionEnabled: false }
}

export type R2ConfirmOptions = {
  fromTool?: boolean
  mode: R2ExecutionMode
  executor?: ActionExecutor
  channel?: AgentChannel
}

/**
 * Puerta de confirmación R2: nunca desde una herramienta del modelo, nunca con la ejecución
 * deshabilitada y siempre con rol/capacidades recargados para confirm y execute.
 */
export async function gateR2Confirmation(
  actor: CopilotActor,
  row: { tool: R2AgentTool; usuario_id: string; payload: Record<string, unknown> | null },
  options: R2ConfirmOptions
): Promise<ActionExecutor> {
  if (options.fromTool) {
    throw new Error('PERMISSION_DENIED: Sólo tú puedes confirmar esta operación; el asistente no confirma por ti.')
  }
  const executor = executorForMode(options)
  const agent = await reloadAgentActor(actor, options.channel)
  const operation = R2_AGENT_TOOLS[row.tool]
  const payload = contractPayloadOf(row.tool, row.payload ?? {}) as ActionPayloadMap[typeof operation]
  for (const phase of ['confirm', 'execute'] as const) {
    const auth = authorizeActionPhase(agent, phase, operation, payload, row.usuario_id, options.mode)
    if (!auth.allowed) throw new Error(`PERMISSION_DENIED: ${auth.reason}`)
  }
  await executor.prepare?.(actor)
  return executor
}

/** El ejecutor debe corresponder al modo: simulated↔simulated, qa↔qa. Cualquier otro caso queda deshabilitado. */
function executorForMode(options: R2ConfirmOptions): ActionExecutor {
  const executor = options.executor
  const matches = executor && (options.mode === 'simulated' || options.mode === 'qa') && executor.kind === options.mode
  if (!matches) throw new Error(R2_EXECUTION_DISABLED_MESSAGE)
  return executor
}

/** Herramientas cuya transición pending→executing sólo puede hacer agent_claim_pending_op. */
export function isRpcClaimedTool(tool: string): boolean {
  return isR2AgentTool(tool) || tool === 'mark_action_done'
}

function copilotContractPayload(tool: CopilotGatedTool, p: Record<string, unknown>) {
  const accionId = String(p.action_id ?? '')
  switch (tool) {
    case 'create_action':
      return { titulo: String(p.titulo_accion ?? ''), responsableId: String(p.responsable ?? ''), fecha: String(p.fecha ?? '') }
    case 'update_action':
      return { accionId, campos: Object.keys((p.patch ?? {}) as Record<string, unknown>) }
    case 'add_action_comment':
      return { accionId, contenido: String(p.contenido ?? '') }
    case 'update_checklist_item':
      return { accionId, checkpointId: String(p.checkpoint_id ?? ''), completado: p.completado === true }
    case 'mark_action_done':
      return { accionId, estado: 'Hecho' }
    case 'verify_action':
      return { accionId }
  }
}

/**
 * Puerta del copiloto web (COPILOT_R2_GATE): misma puerta que R2 sobre el mismo confirmPendingOp.
 * verify_action conserva su regla propia: sólo creador o gestión completa, confirmación humana.
 */
export async function gateCopilotConfirmation(
  actor: CopilotActor,
  row: { tool: CopilotGatedTool; usuario_id: string; payload: Record<string, unknown> | null },
  options: R2ConfirmOptions
): Promise<ActionExecutor> {
  if (options.fromTool) {
    throw new Error('PERMISSION_DENIED: Sólo tú puedes confirmar esta operación; el asistente no confirma por ti.')
  }
  const executor = executorForMode(options)
  const agent = await reloadAgentActor(actor, options.channel ?? 'web')
  const operation = COPILOT_GATED_TOOLS[row.tool]
  const payload = copilotContractPayload(row.tool, row.payload ?? {}) as ActionPayloadMap[typeof operation]
  const missing = (ACTION_CONTRACTS[operation] as ActionContract<typeof operation>).validate(payload)
  if (missing.length) throw new Error(`VALIDATION_FAILED: Faltan datos: ${missing.join(', ')}.`)
  for (const phase of ['confirm', 'execute'] as const) {
    const auth = authorizeActionPhase(agent, phase, operation, payload, row.usuario_id, options.mode)
    if (!auth.allowed) throw new Error(`PERMISSION_DENIED: ${auth.reason}`)
  }
  if (row.tool === 'verify_action') {
    const { data, error } = await actor.supabase.rpc('can_manage_accion_full_as', {
      p_accion_id: (payload as { accionId: string }).accionId,
      p_usuario_id: actor.usuarioId,
    })
    if (error) throw new Error('DATABASE_ERROR: No se pudo validar el permiso de verificación.')
    if (data !== true) {
      throw new Error('PERMISSION_DENIED: La verificación corresponde a quien creó la acción o a Super Admin.')
    }
  }
  await executor.prepare?.(actor)
  return executor
}

export type NotifyInput = {
  canal: 'email' | 'whatsapp'
  toUserId: string
  accionId: string
  titulo: string
  body: string
  idempotencyKey: string
}

export type NotifyAdapter = (actor: CopilotActor, input: NotifyInput) => Promise<{ id: string }>

export type ExecutionContext = { opId: string; expectedUpdatedAt: string | null }

export type ExecutorTool = R2AgentTool | 'mark_action_done'

/** Puerto de ejecución: simulated (pruebas/local) o qa (JWT reales en el proyecto QA, avisos en qa_outbox). */
export type ActionExecutor = {
  kind: 'simulated' | 'qa'
  /** Verificación previa del entorno (qa: la BD debe declarar el mismo proyecto QA). */
  prepare?(actor: CopilotActor): Promise<void>
  /** pending→executing vía agent_claim_pending_op; false si la operación ya no está vigente o cambió. */
  claim(actor: CopilotActor, row: { id: string; payload: Record<string, unknown> | null }): Promise<boolean>
  execute(actor: CopilotActor, tool: ExecutorTool, payload: Record<string, unknown>, ctx: ExecutionContext): Promise<Record<string, unknown>>
  /** Relee el efecto después de ejecutar; false deja la operación pendiente con error. */
  verify(actor: CopilotActor, tool: ExecutorTool, payload: Record<string, unknown>, result: Record<string, unknown>, ctx: ExecutionContext): Promise<boolean>
}

export type BoardWrite = (
  actor: CopilotActor,
  tool: string,
  payload: Record<string, unknown>,
  opts?: { actionId?: string }
) => Promise<Record<string, unknown>>

/** Id determinista por operación: reintentar la creación no duplica la acción. */
export function actionIdForOp(opId: string): string {
  const h = createHash('sha256').update(`agent_create_action:${opId}`).digest('hex')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`
}

function errorMessage(error: unknown, fallback: string) {
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') return error.message
  return fallback
}

function buildExecutor(
  kind: ActionExecutor['kind'],
  deps: {
    client: (actor: CopilotActor) => SupabaseClient
    boardWrite: BoardWrite
    notify: { email: NotifyAdapter; whatsapp: NotifyAdapter }
    delivered?: (actor: CopilotActor, key: string) => Promise<boolean>
    prepare?: (actor: CopilotActor) => Promise<void>
  }
): ActionExecutor {
  const scoped = (actor: CopilotActor): CopilotActor => ({ ...actor, supabase: deps.client(actor) })
  return {
    kind,
    prepare: deps.prepare,
    async claim(actor, row) {
      const { data, error } = await deps.client(actor).rpc('agent_claim_pending_op', {
        p_op_id: row.id,
        p_payload: row.payload ?? {},
      })
      if (error) throw new Error(errorMessage(error, 'No se pudo reservar la operación.'))
      return data === true
    },
    async execute(actor, tool, payload, ctx) {
      const target = scoped(actor)
      if (tool === 'agent_create_action') {
        const actionId = actionIdForOp(ctx.opId)
        try {
          return await deps.boardWrite(target, 'create_action', payload, { actionId })
        } catch (error) {
          const existing = await loadActionRow(target.supabase, actionId)
          if (existing) return { id: actionId, created: true, replayed: true }
          throw error
        }
      }
      if (tool === 'agent_set_action_status' || tool === 'agent_register_blocker' || tool === 'mark_action_done') {
        const { data, error } = await target.supabase.rpc('agent_apply_action_status', {
          p_pending_op_id: ctx.opId,
          p_accion_id: payload.accionId ?? payload.action_id,
          p_estado: tool === 'agent_register_blocker' ? 'Bloqueado' : tool === 'mark_action_done' ? 'Hecho' : payload.estado,
          p_motivo: payload.motivo ?? null,
          p_expected_updated_at: ctx.expectedUpdatedAt,
        })
        if (error) throw new Error(errorMessage(error, 'No se pudo aplicar el cambio de estado.'))
        return data as Record<string, unknown>
      }
      if (tool === 'agent_update_fields') {
        const patch: Record<string, unknown> = {}
        for (const key of ALLOWED_FIELD_PATCH) {
          if (payload[key] != null && payload[key] !== '') patch[key] = payload[key]
        }
        if (Object.keys(patch).length === 0) throw new Error('VALIDATION_FAILED: No hay campos permitidos para actualizar.')
        return deps.boardWrite(target, 'update_action', { action_id: payload.accionId ?? payload.action_id, patch })
      }
      if (tool === 'agent_add_comment') {
        return deps.boardWrite(target, 'add_action_comment', {
          action_id: payload.accionId ?? payload.action_id,
          contenido: payload.contenido,
        })
      }
      if (tool === 'agent_verify_action') {
        const current = await loadActionRow(target.supabase, String(payload.accionId ?? payload.action_id ?? ''))
        if (!current) throw new Error('PERMISSION_DENIED: La acción ya no está disponible.')
        if (current.estado !== 'Hecho') {
          throw new Error('VALIDATION_FAILED: Sólo se verifica una acción que ya está en Hecho.')
        }
        return deps.boardWrite(target, 'verify_action', { action_id: current.id })
      }
      const action = await loadActionRow(target.supabase, String(payload.accionId))
      if (!action) throw new Error('PERMISSION_DENIED: La acción ya no está disponible.')
      if (action.responsable !== payload.destinatarioId) {
        throw new Error('VALIDATION_FAILED: El responsable cambió después de la propuesta. Prepara un aviso nuevo.')
      }
      const canal = payload.canal === 'whatsapp' ? 'whatsapp' : 'email'
      const sent = await deps.notify[canal](target, {
        canal,
        toUserId: String(payload.destinatarioId),
        accionId: action.id,
        titulo: action.titulo_accion ?? 'Acción',
        body: String(payload.mensaje ?? ''),
        idempotencyKey: `agent-notify:${ctx.opId}`,
      })
      return { id: sent.id, accionId: action.id, canal, notified_usuario_id: payload.destinatarioId, delivery_status: 'accepted' }
    },
    async verify(actor, tool, payload, result, ctx) {
      const client = deps.client(actor)
      if (tool === 'agent_notify_responsable') {
        return Boolean(result.id) && (deps.delivered ? await deps.delivered(actor, `agent-notify:${ctx.opId}`) : true)
      }
      if (tool === 'agent_add_comment') {
        const accionId = String(payload.accionId ?? payload.action_id ?? '')
        const { data } = await client
          .from('accion_comentarios')
          .select('id')
          .eq('accion_id', accionId)
          .eq('contenido', String(payload.contenido ?? ''))
          .limit(1)
        return Array.isArray(data) ? data.length > 0 : Boolean(data)
      }
      const id = tool === 'agent_create_action' ? String(result.id ?? '') : String(payload.accionId ?? payload.action_id ?? '')
      const row = id ? await loadActionRow(client, id) : null
      if (!row) return false
      if (tool === 'agent_create_action') return row.titulo_accion === payload.titulo_accion && row.responsable === payload.responsable
      if (tool === 'agent_register_blocker') return row.estado === 'Bloqueado'
      if (tool === 'mark_action_done') return row.estado === 'Hecho'
      if (tool === 'agent_verify_action') return row.estado === 'Verificado'
      if (tool === 'agent_update_fields') {
        if (payload.fecha && row.fecha !== payload.fecha) return false
        if (payload.responsable && row.responsable !== payload.responsable) return false
        if (payload.prioridad && row.prioridad !== payload.prioridad) return false
        if (payload.titulo_accion && row.titulo_accion !== payload.titulo_accion) return false
        return true
      }
      return row.estado === payload.estado
    },
  }
}

export type SimulatedOutboxEntry = NotifyInput & { phone?: string }

/**
 * Ejecutor simulado: todos los efectos van al cliente en memoria `store` (nunca al de la sesión real)
 * y los avisos a buzones simulados de correo y Graph. El WhatsApp resuelve el número desde el
 * vínculo activo del responsable en el mismo store.
 */
export function createSimulatedActionExecutor(deps: {
  store: SupabaseClient
  boardWrite: BoardWrite
  outbox: SimulatedOutboxEntry[]
}): ActionExecutor {
  const record = (entry: SimulatedOutboxEntry) => {
    const prior = deps.outbox.find((e) => e.idempotencyKey === entry.idempotencyKey)
    if (prior) return { id: `sim-${prior.canal}-${prior.idempotencyKey}` }
    deps.outbox.push(entry)
    return { id: `sim-${entry.canal}-${entry.idempotencyKey}` }
  }
  return buildExecutor('simulated', {
    client: () => deps.store,
    boardWrite: deps.boardWrite,
    delivered: async (_actor, key) => deps.outbox.some((e) => e.idempotencyKey === key),
    notify: {
      email: async (_actor, input) => record(input),
      whatsapp: async (_actor, input) => {
        const { data } = await deps.store
          .from('user_channel_identities')
          .select('external_user_id')
          .eq('channel', 'whatsapp')
          .eq('usuario_id', input.toUserId)
          .eq('status', 'active')
          .maybeSingle()
        const phone = String((data as { external_user_id?: string } | null)?.external_user_id ?? '').replace(/\D/g, '')
        if (!/^\d{10,15}$/.test(phone)) {
          throw new Error('MISSING_CONTACT: El responsable no tiene WhatsApp vinculado.')
        }
        return record({ ...input, phone })
      },
    },
  })
}

/**
 * Ejecutor QA: RPC y escrituras con el JWT del usuario (RLS real) en el proyecto QA autorizado.
 * Los avisos nunca llegan a proveedores: quedan en qa_outbox (tabla que sólo crea el seed QA).
 * Antes de ejecutar comprueba que la BD declare el mismo proyecto QA que el servidor.
 */
export function createQaActionExecutor(deps: { boardWrite: BoardWrite; projectRef: string }): ActionExecutor {
  const record: NotifyAdapter = async (actor, input) => {
    if (input.canal === 'whatsapp') {
      const { data, error } = await actor.supabase.rpc('qa_whatsapp_linked', { p_usuario_id: input.toUserId })
      if (error) throw new Error('CONFIGURATION_ERROR: El entorno QA no tiene el buzón simulado.')
      if (data !== true) throw new Error('MISSING_CONTACT: El responsable no tiene WhatsApp vinculado.')
    }
    const row = {
      idempotency_key: input.idempotencyKey,
      canal: input.canal,
      sender_usuario_id: actor.usuarioId,
      to_usuario_id: input.toUserId,
      accion_id: input.accionId,
      titulo: input.titulo,
      body: input.body,
    }
    const { data, error } = await actor.supabase.from('qa_outbox').insert(row).select('id').maybeSingle()
    if (!error) return { id: String((data as { id?: string } | null)?.id ?? '') }
    if ((error as { code?: string }).code !== '23505') throw new Error('DATABASE_ERROR: No se pudo registrar el aviso QA.')
    const { data: prior } = await actor.supabase.from('qa_outbox').select('id').eq('idempotency_key', input.idempotencyKey).maybeSingle()
    return { id: String((prior as { id?: string } | null)?.id ?? '') }
  }
  return buildExecutor('qa', {
    client: (actor) => actor.supabase,
    boardWrite: deps.boardWrite,
    notify: { email: record, whatsapp: record },
    delivered: async (actor, key) => {
      const { data } = await actor.supabase.from('qa_outbox').select('id').eq('idempotency_key', key).maybeSingle()
      return Boolean(data)
    },
    prepare: async (actor) => {
      const { data, error } = await actor.supabase.rpc('agent_execution_environment')
      if (error || data !== deps.projectRef) {
        throw new Error('CONFIGURATION_ERROR: La base de datos no corresponde al proyecto QA autorizado.')
      }
    },
  })
}

/** Evidencia (AT-16): estado de la operación, resultado, recibo SQL y bitácora. Sólo del propio usuario. */
export async function readR2Evidence(actor: AgentActor, opId: string) {
  const auth = authorizeActionPhase(actor, 'verify')
  if (!auth.allowed) return { ok: false as const, reason: auth.reason }
  const client = actor.copilot.supabase
  const { data: op } = await client
    .from('assistant_pending_ops')
    .select('id,usuario_id,tool,status,result,error_message,resource_id,expires_at')
    .eq('id', opId)
    .maybeSingle()
  const row = op as { usuario_id?: string; tool?: string } | null
  if (!row || row.usuario_id !== actor.usuarioId || !isR2AgentTool(String(row.tool))) {
    return { ok: false as const, reason: 'No encontré esa operación.' }
  }
  const { data: log } = await client.from('assistant_op_log').select('result,tool,resource_id').eq('pending_op_id', opId)
  const { data: receipt } = await client
    .from('agent_action_receipts')
    .select('estado_anterior,estado_nuevo,result')
    .eq('pending_op_id', opId)
    .maybeSingle()
  return { ok: true as const, op, log: log ?? [], receipt: receipt ?? null }
}

/**
 * Historial de bloqueos reportados (comentarios bloqueo_reportado y recibos del agente).
 * La RPC decide quién lo ve: responsable, creador, edición general o Super Admin.
 */
export async function readBlockHistory(actor: AgentActor, accionId: string) {
  const auth = authorizeActionPhase(actor, 'query')
  if (!auth.allowed) return { ok: false as const, reason: auth.reason }
  const { data, error } = await actor.copilot.supabase.rpc('agent_action_block_history', { p_accion_id: accionId })
  if (error) {
    const denied = /not_authorized|not_found/.test(errorMessage(error, ''))
    return {
      ok: false as const,
      reason: denied ? 'No tienes permiso para ver los bloqueos de esa acción.' : 'No se pudo consultar el historial de bloqueos.',
    }
  }
  return { ok: true as const, history: data as Record<string, unknown> }
}

export async function logR2Denied(actor: CopilotActor, tool: string, opId: string, resourceId: string | null) {
  await insertAssistantOpLog(actor, { tool, result: 'denied', pendingOpId: opId, resourceId })
}

export type R2EditPatch = {
  fecha?: string
  responsableId?: string
  responsableHint?: string
  prioridad?: string
  titulo?: string
  contenido?: string
}

/**
 * Editar una propuesta R2 pendiente invalida la firma previa (nuevo request_key y CAS).
 * No ejecuta; el usuario debe volver a aprobar.
 */
export async function editR2PendingOp(actor: CopilotActor, opId: string, patch: R2EditPatch): Promise<CopilotProposal> {
  const { data, error } = await actor.supabase
    .from('assistant_pending_ops')
    .select('id,usuario_id,tool,resource_id,expected_updated_at,payload,preview,status,expires_at,request_key,channel')
    .eq('id', opId)
    .maybeSingle()
  if (error || !data) throw new Error('No encontré esa operación pendiente.')
  if (data.usuario_id !== actor.usuarioId) throw new Error('Esa operación no te pertenece.')
  if (data.status !== 'pending') throw new Error('Esta operación ya no se puede editar.')
  if (Date.parse(String(data.expires_at)) <= Date.now()) throw new Error('La autorización expiró. Solicita una nueva propuesta.')
  const tool = String(data.tool)
  if (!isR2AgentTool(tool)) throw new Error('VALIDATION_FAILED: Este tipo de operación no admite edición.')
  if (tool !== 'agent_update_fields' && tool !== 'agent_create_action' && tool !== 'agent_add_comment') {
    throw new Error('VALIDATION_FAILED: Cancela y prepara una propuesta nueva para este cambio.')
  }
  const payload = { ...((data.payload ?? {}) as Record<string, unknown>) }
  const preview = { ...((data.preview ?? {}) as Record<string, unknown>) }
  const fields = Array.isArray(preview.fields) ? [...(preview.fields as CopilotProposal['fields'])] : []
  const today = todayWallClockCDMX()

  const setField = (label: string, to: string, from?: string) => {
    const idx = fields.findIndex((f) => f.label === label)
    const next = from ? { label, from, to } : { label, to }
    if (idx >= 0) fields[idx] = next
    else fields.push(next)
  }

  if (tool === 'agent_add_comment') {
    const contenido = patch.contenido?.trim().slice(0, 2000)
    if (!contenido) throw new Error('VALIDATION_FAILED: El comentario no puede quedar vacío.')
    payload.contenido = contenido
    setField('Comentario', contenido)
  } else {
    if (patch.fecha) {
      if (patch.fecha < today) throw new Error('La fecha de compromiso debe ser hoy o posterior (CDMX).')
      payload.fecha = patch.fecha
      if (tool === 'agent_update_fields') {
        const campos = Array.isArray(payload.campos) ? [...(payload.campos as string[])] : []
        if (!campos.includes('fecha')) campos.push('fecha')
        payload.campos = campos
      }
      setField('Fecha', patch.fecha)
    }
    if (patch.prioridad) {
      if (!PRIORIDADES.includes(patch.prioridad as (typeof PRIORIDADES)[number])) {
        throw new Error('La prioridad debe ser P1_Alta, P2_Media o P3_Baja.')
      }
      payload.prioridad = patch.prioridad
      if (tool === 'agent_update_fields') {
        const campos = Array.isArray(payload.campos) ? [...(payload.campos as string[])] : []
        if (!campos.includes('prioridad')) campos.push('prioridad')
        payload.campos = campos
      }
      setField('Prioridad', patch.prioridad)
    }
    if (patch.titulo?.trim()) {
      const titulo = patch.titulo.trim().slice(0, 70)
      if (tool === 'agent_create_action') payload.titulo_accion = titulo
      else payload.titulo_accion = titulo
      if (tool === 'agent_update_fields') {
        const campos = Array.isArray(payload.campos) ? [...(payload.campos as string[])] : []
        if (!campos.includes('titulo_accion')) campos.push('titulo_accion')
        payload.campos = campos
      }
      setField('Título', titulo)
    }
    const hint = patch.responsableId || patch.responsableHint
    if (hint) {
      let responsableId = patch.responsableId ?? null
      let nombre: string | null = null
      if (!responsableId && patch.responsableHint) {
        const actorLike = await reloadAgentActor(actor)
        const matches = await resolveResponsable(actorLike, patch.responsableHint.trim())
        if (matches.length !== 1) {
          throw new Error(
            matches.length === 0
              ? 'No encontré a esa persona.'
              : `Hay varias personas que coinciden: ${matches.map((m) => m.nombre).join(', ')}.`
          )
        }
        responsableId = matches[0]!.id
        nombre = matches[0]!.nombre
      }
      if (responsableId) {
        const person = await loadActiveUser(actor.supabase, responsableId)
        if (!person) throw new Error('El responsable no existe o está inactivo.')
        payload.responsable = person.id
        if (tool === 'agent_update_fields') {
          const campos = Array.isArray(payload.campos) ? [...(payload.campos as string[])] : []
          if (!campos.includes('responsable')) campos.push('responsable')
          payload.campos = campos
        }
        setField('Responsable', nombre ?? person.nombre ?? person.id)
      }
    }
  }

  let expectedUpdatedAt = data.expected_updated_at as string | null
  if (tool === 'agent_update_fields' && data.resource_id) {
    const action = await loadActionRow(actor.supabase, String(data.resource_id))
    if (!action) throw new Error('No encontré esa acción o no tienes acceso a ella.')
    expectedUpdatedAt = action.updated_at
    payload.expectedUpdatedAt = expectedUpdatedAt
  }

  const operation = R2_AGENT_TOOLS[tool]
  const contractPayload = contractPayloadOf(tool, payload)
  const requestKey = buildIdempotencyKey(actor.usuarioId, operation, contractPayload as ActionPayloadMap[typeof operation])
  const nextPreview: Record<string, unknown> = {
    ...preview,
    fields,
    summary: `Propuesta editada. Confirma de nuevo para aplicar: ${String(preview.summary ?? '')}`.slice(0, 400),
  }
  const { data: updatedExpiresAt, error: updateError } = await actor.supabase.rpc('agent_edit_pending_op', {
    p_op_id: opId,
    p_payload: payload,
    p_preview: nextPreview,
    p_expected_updated_at: expectedUpdatedAt,
    p_request_key: requestKey,
  })
  if (updateError) {
    throw new Error(errorMessage(updateError, 'DATABASE_ERROR: No se pudo guardar la edición.'))
  }
  await insertAssistantOpLog(actor, {
    tool,
    result: 'proposed',
    pendingOpId: opId,
    resourceId: data.resource_id as string | null,
    summary: `edited: ${String(nextPreview.title ?? tool)}`,
  })
  return {
    id: opId,
    tool: tool as CopilotProposal['tool'],
    title: String(nextPreview.title ?? tool),
    summary: String(nextPreview.summary ?? ''),
    fields,
    record: (nextPreview.record as CopilotProposal['record']) ?? undefined,
    expiresAt: String(updatedExpiresAt ?? data.expires_at),
    batchId: typeof payload.batchId === 'string' ? payload.batchId : undefined,
  }
}
