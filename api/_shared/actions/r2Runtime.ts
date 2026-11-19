/**
 * R2 (local): operaciones accionables del agente sobre assistant_pending_ops y confirmPendingOp.
 * Consulta → Propuesta → Confirmación → Revalidación → Ejecución → Evidencia.
 * Sólo ejecuta con R2_EXECUTION_MODE=simulated y un ActionExecutor simulado inyectado;
 * en Vercel el modo es siempre disabled y la confirmación responde "ejecución no habilitada".
 */
import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { CopilotProposal } from '../../../src/features/ai-support/copilot/types.js'
import { evidenceOrPlaceholder } from '../../../src/features/ai-support/creationDraft.js'
import { todayWallClockCDMX } from '../../../src/lib/dateUtils.js'
import { createPendingOp, insertAssistantOpLog, type CopilotActor } from '../assistantPending.js'
import { withContentHash } from '../workspaceHash.js'
import { loadAgentCapabilities } from '../query/actorCapabilities.js'
import { resolveActor, type AgentActor, type AgentChannel } from '../query/resolveActor.js'
import {
  ACTION_CONTRACTS,
  ACTION_PROPOSAL_TTL_MS,
  authorizeActionPhase,
  buildIdempotencyKey,
  type ActionContract,
  type ActionPayloadMap,
  type NotifyResponsablePayload,
} from './contracts.js'
import { R2_EXECUTION_DISABLED_MESSAGE, type R2ExecutionMode } from './executionMode.js'

export const R2_AGENT_TOOLS = {
  agent_create_action: 'create_action',
  agent_set_action_status: 'update_status',
  agent_register_blocker: 'register_blocker',
  agent_notify_responsable: 'notify_responsable',
} as const

export type R2AgentTool = keyof typeof R2_AGENT_TOOLS
export type R2Operation = (typeof R2_AGENT_TOOLS)[R2AgentTool]

export const R2_TOOL_FOR: Record<R2Operation, R2AgentTool> = {
  create_action: 'agent_create_action',
  update_status: 'agent_set_action_status',
  register_blocker: 'agent_register_blocker',
  notify_responsable: 'agent_notify_responsable',
}

export function isR2AgentTool(tool: string): tool is R2AgentTool {
  return Object.prototype.hasOwnProperty.call(R2_AGENT_TOOLS, tool)
}

type ActionRow = {
  id: string
  titulo_accion: string | null
  estado: string | null
  fecha: string | null
  responsable: string | null
  created_by: string | null
  updated_at: string | null
}

const ACTION_FIELDS = 'id,titulo_accion,estado,fecha,responsable,created_by,updated_at'

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
  opts: { today?: string } = {}
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
    const missing = contract.validate(input as ActionPayloadMap[O])
    if (missing.length) return deny(`Faltan datos para la propuesta: ${missing.join(', ')}.`, missing)
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
  const proposal = await createPendingOp(actor.copilot, {
    tool: R2_TOOL_FOR[operation],
    resourceId,
    expectedUpdatedAt,
    payload: stored,
    proposal: { title, summary, fields },
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
  if (options.mode !== 'simulated' || !options.executor || options.executor.kind !== 'simulated') {
    throw new Error(R2_EXECUTION_DISABLED_MESSAGE)
  }
  const agent = await reloadAgentActor(actor, options.channel)
  const operation = R2_AGENT_TOOLS[row.tool]
  const payload = contractPayloadOf(row.tool, row.payload ?? {}) as ActionPayloadMap[typeof operation]
  for (const phase of ['confirm', 'execute'] as const) {
    const auth = authorizeActionPhase(agent, phase, operation, payload, row.usuario_id, options.mode)
    if (!auth.allowed) throw new Error(`PERMISSION_DENIED: ${auth.reason}`)
  }
  return options.executor
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

/** Puerto de ejecución: simulated (pruebas/local) o rpc (inalcanzable mientras el modo sea disabled). */
export type ActionExecutor = {
  kind: 'simulated' | 'rpc'
  execute(actor: CopilotActor, tool: R2AgentTool, payload: Record<string, unknown>, ctx: ExecutionContext): Promise<Record<string, unknown>>
  /** Relee el efecto después de ejecutar; false deja la operación pendiente con error. */
  verify(actor: CopilotActor, tool: R2AgentTool, payload: Record<string, unknown>, result: Record<string, unknown>, ctx: ExecutionContext): Promise<boolean>
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
    delivered?: (key: string) => boolean
  }
): ActionExecutor {
  const scoped = (actor: CopilotActor): CopilotActor => ({ ...actor, supabase: deps.client(actor) })
  return {
    kind,
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
      if (tool === 'agent_set_action_status' || tool === 'agent_register_blocker') {
        const { data, error } = await target.supabase.rpc('agent_apply_action_status', {
          p_pending_op_id: ctx.opId,
          p_accion_id: payload.accionId,
          p_estado: tool === 'agent_register_blocker' ? 'Bloqueado' : payload.estado,
          p_motivo: payload.motivo ?? null,
          p_expected_updated_at: ctx.expectedUpdatedAt,
        })
        if (error) throw new Error(errorMessage(error, 'No se pudo aplicar el cambio de estado.'))
        return data as Record<string, unknown>
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
        return Boolean(result.id) && (deps.delivered ? deps.delivered(`agent-notify:${ctx.opId}`) : true)
      }
      const id = tool === 'agent_create_action' ? String(result.id ?? '') : String(payload.accionId ?? '')
      const row = id ? await loadActionRow(client, id) : null
      if (!row) return false
      if (tool === 'agent_create_action') return row.titulo_accion === payload.titulo_accion && row.responsable === payload.responsable
      if (tool === 'agent_register_blocker') return row.estado === 'Bloqueado'
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
    delivered: (key) => deps.outbox.some((e) => e.idempotencyKey === key),
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
 * Ejecutor real (RPC con el JWT del usuario y proveedores reales). Ningún modo actual lo admite:
 * gateR2Confirmation exige un ejecutor simulado. Queda para QA autorizada.
 */
export function createRpcActionExecutor(deps: {
  boardWrite: BoardWrite
  whatsappWrite: (actor: CopilotActor, payload: Record<string, unknown>, opId: string) => Promise<Record<string, unknown>>
  resolveWhatsappPhone: (usuarioId: string) => Promise<string | null>
}): ActionExecutor {
  return buildExecutor('rpc', {
    client: (actor) => actor.supabase,
    boardWrite: deps.boardWrite,
    notify: {
      email: async (actor, input) => {
        const result = await deps.boardWrite(actor, 'notify_action_email', {
          usuario_id: input.toUserId,
          tipo: 'responsable',
          email_payload: { accion_id: input.accionId, titulo_accion: input.titulo, mensaje: input.body },
        })
        return { id: String(result.email_id ?? result.id ?? '') }
      },
      whatsapp: async (actor, input) => {
        const phone = await deps.resolveWhatsappPhone(input.toUserId)
        if (!phone) throw new Error('MISSING_CONTACT: El responsable no tiene WhatsApp vinculado.')
        const opId = input.idempotencyKey.replace(/^agent-notify:/, '')
        const result = await deps.whatsappWrite(actor, withContentHash({ to_user_id: input.toUserId, to_phone: phone, body: input.body }), opId)
        return { id: String(result.id ?? '') }
      },
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

export async function logR2Denied(actor: CopilotActor, tool: string, opId: string, resourceId: string | null) {
  await insertAssistantOpLog(actor, { tool, result: 'denied', pendingOpId: opId, resourceId })
}
