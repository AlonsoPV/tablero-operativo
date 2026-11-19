/**
 * Fixture R2: el mismo universo sintético de R1, con tablas mutables y la RPC
 * agent_apply_action_status simulada con las reglas de la migración 20261120120000
 * (la versión SQL se prueba en scripts/test-r2-action-status-database.mjs).
 * No sustituye la validación de RLS con JWT reales.
 */
import { executeBoardWrite } from '../../assistantOpsRuntime.js'
import { createSimulatedActionExecutor, type SimulatedOutboxEntry } from '../../actions/r2Runtime.js'
import { loadAgentCapabilities } from '../../query/actorCapabilities.js'
import { resolveActor, type AgentActor, type AgentChannel } from '../../query/resolveActor.js'
import { createFakeSupabase, type FakeDb, type FakeSession } from './fakeSupabase.js'
import { createR1Db, R1_USERS } from './r1Fixture.js'

type Row = Record<string, unknown>

const norm = (v: unknown) => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

let clock = Date.parse('2026-11-19T16:00:00.000Z')
const tick = () => new Date((clock += 1000)).toISOString()

function userOf(db: FakeDb, usuarioId: string | undefined) {
  return db.tables.usuarios!.find((u) => u.id === usuarioId) ?? null
}

/** Edición general: creador, último editor o Super Admin explícito (sin Dirección tras R0). */
function canEditGeneral(db: FakeDb, accionId: unknown, usuarioId: unknown) {
  const action = db.tables.acciones_diarias!.find((a) => a.id === accionId)
  const user = userOf(db, String(usuarioId))
  if (!action || !user || user.activo === false) return false
  return action.created_by === usuarioId || action.updated_by === usuarioId || norm(user.rol) === 'super_admin'
}

function fail(code: string, message: string): never {
  throw new Error(`${code}: ${message}`)
}

export function simulatedApplyActionStatus(db: FakeDb, args: Row, session: FakeSession) {
  const me = session.usuarioId
  const user = userOf(db, me)
  if (!me || !user || user.activo === false) fail('not_authorized', 'usuario inactivo o sin sesion')
  const receipts = (db.tables.agent_action_receipts ??= [])
  const prior = receipts.find((r) => r.pending_op_id === args.p_pending_op_id && r.usuario_id === me)
  if (prior) return { ...(prior.result as Row), replayed: true }

  const op = db.tables.assistant_pending_ops!.find((o) => o.id === args.p_pending_op_id)
  if (!op || op.usuario_id !== me) fail('not_authorized', 'la operacion no pertenece al usuario')
  if (op.status !== 'executing') fail('not_confirmed', 'la operacion no esta confirmada')
  if (op.tool !== 'agent_set_action_status' && op.tool !== 'agent_register_blocker') fail('invalid_operation', 'herramienta')
  const payload = op.payload as Row
  const expectedEstado = op.tool === 'agent_register_blocker' ? 'Bloqueado' : payload.estado
  const motivo = String(args.p_motivo ?? '').trim() || null
  if (payload.accionId !== args.p_accion_id || expectedEstado !== args.p_estado ||
    (String(payload.motivo ?? '').trim() || null) !== motivo || op.expected_updated_at !== args.p_expected_updated_at) {
    fail('payload_mismatch', 'los parametros no coinciden con la confirmacion')
  }
  const estado = String(args.p_estado)
  if (estado === 'Verificado') fail('verified_requires_human', 'Verificado no se asigna desde el agente')
  if (!['Pendiente', 'En_Ejecucion', 'Bloqueado', 'Hecho'].includes(estado)) fail('invalid_status', estado)
  if (!args.p_expected_updated_at) fail('expected_updated_at_required', 'falta updated_at')
  const rol = norm(user.rol)
  if (rol === 'analista' || (rol.startsWith('direccion') && rol !== 'super_admin')) {
    fail('not_authorized', 'el rol solo tiene acceso de consulta')
  }
  const action = db.tables.acciones_diarias!.find((a) => a.id === args.p_accion_id)
  if (!action) fail('not_found', 'accion no encontrada')
  if (action.estado === 'Verificado') fail('already_verified', 'la accion ya esta verificada')
  if (action.updated_at !== args.p_expected_updated_at) fail('conflict', 'la accion cambio despues de la confirmacion')
  if (action.responsable !== me && !canEditGeneral(db, action.id, me)) fail('not_authorized', 'sin permiso sobre la accion')
  if (action.estado === estado) fail('no_change', 'la accion ya tiene ese estado')

  const before = String(action.estado)
  let cause = false
  if (estado === 'Hecho') {
    const pending = (db.tables.accion_checkpoints ?? []).filter((c) => c.accion_id === action.id && c.activo !== false && !c.completado)
    if (pending.length) fail('checkpoints', 'No puedes marcar esta accion como Hecha porque aun existen puntos de validacion pendientes.')
    Object.assign(action, { estado: 'Hecho', completed_by: me, updated_at: tick() })
  } else if (estado === 'Bloqueado') {
    if (!motivo || motivo.length < 5) fail('block_reason_required', 'el motivo debe tener al menos 5 caracteres')
    cause = canEditGeneral(db, action.id, me)
    Object.assign(action, { estado: 'Bloqueado', ...(cause ? { causa_raiz: motivo } : {}), updated_at: tick() })
    ;(db.tables.accion_comentarios ??= []).push({
      accion_id: action.id, contenido: `Bloqueo registrado con Enviardian: ${motivo}`, created_by: me, tipo_comentario: 'comentario',
    })
  } else {
    Object.assign(action, { estado, updated_at: tick() })
  }
  const result = {
    ok: true, accionId: action.id, estadoAnterior: before, estado: action.estado, causaRaiz: cause,
    comentario: estado === 'Bloqueado', updatedAt: action.updated_at,
  }
  receipts.push({ pending_op_id: op.id, usuario_id: me, accion_id: action.id, tool: op.tool, estado_anterior: before, estado_nuevo: action.estado, result })
  return result
}

export function createR2Db(): FakeDb {
  const db = createR1Db()
  db.mutable = true
  db.unique = { assistant_pending_ops: [['usuario_id', 'tool', 'request_key']] }
  Object.assign(db.tables, {
    assistant_pending_ops: [],
    assistant_op_log: [],
    agent_action_receipts: [],
    accion_comentarios: [],
    accion_checkpoints: [],
    user_channel_identities: [
      { channel: 'whatsapp', usuario_id: R1_USERS.maria.id, external_user_id: '5215550001111', status: 'active' },
    ],
  })
  // La líder tiene además el módulo de bandeja WhatsApp (permiso explícito requerido por notify_responsable).
  db.tables.usuario_catalog_roles = db.tables.usuario_catalog_roles!.map((row) =>
    row.user_id === R1_USERS.lead.id
      ? { user_id: row.user_id, catalog_roles: { activo: true, catalog_role_modules: [{ module_key: 'okrs' }, { module_key: 'dashboard' }, { module_key: 'whatsapp_inbox' }] } }
      : row)
  db.rpcs = {
    ...db.rpcs,
    can_edit_accion_general_as: (args) => canEditGeneral(db, args.p_accion_id, args.p_usuario_id),
    agent_apply_action_status: (args, session) => simulatedApplyActionStatus(db, args, session),
  }
  return db
}

type R1User = (typeof R1_USERS)[keyof typeof R1_USERS]

/** Actor con capacidades leídas del store, rol vigente en la tabla y sesión ligada a su usuario. */
export async function r2Actor(db: FakeDb, user: R1User, channel: AgentChannel = 'web', sessionId = 's-r2'): Promise<AgentActor> {
  const row = userOf(db, user.id)!
  const identity = {
    supabase: createFakeSupabase(db, { usuarioId: user.id }),
    authUserId: user.user_id,
    usuarioId: user.id,
    rol: String(row.rol),
    active: row.activo !== false,
  }
  return resolveActor(identity, { channel, sessionId, capabilities: await loadAgentCapabilities(identity) })
}

export function simulatedExecutorFor(actor: AgentActor, outbox: SimulatedOutboxEntry[] = []) {
  return createSimulatedActionExecutor({ store: actor.copilot.supabase, boardWrite: executeBoardWrite, outbox })
}
