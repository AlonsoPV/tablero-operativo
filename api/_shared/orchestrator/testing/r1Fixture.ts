/**
 * Fixture sintético R1: actores de distinto rol, acciones con estados y fechas
 * conocidas y OKRs con cifras fijas. Sin datos reales.
 */
import type { SessionContextStore } from '../sessionContext.js'
import { createMemorySessionContextStore } from '../sessionContext.js'
import { resolveActor, type AgentActor, type AgentChannel } from '../../query/resolveActor.js'
import { loadAgentCapabilities } from '../../query/actorCapabilities.js'
import { createFakeSupabase, type FakeDb } from './fakeSupabase.js'

export const R1_TODAY = '2026-11-19'
/** 10:00 CDMX. */
export const R1_NOW_ISO = '2026-11-19T16:00:00.000Z'

const okrModules = { activo: true, catalog_role_modules: [{ module_key: 'okrs' }, { module_key: 'dashboard' }] }

export const R1_USERS = {
  lead: { id: 'u-lead', user_id: 'a-lead', nombre: 'Laura Lider', rol: 'Lider', area: 'OKRS', activo: true },
  direction: { id: 'u-dir', user_id: 'a-dir', nombre: 'Diego Direccion', rol: 'Direccion', area: 'Comercial', activo: true },
  directionNoOkr: { id: 'u-dir2', user_id: 'a-dir2', nombre: 'Dora Direccion', rol: 'Direccion', area: 'Comercial', activo: true },
  analyst: { id: 'u-an', user_id: 'a-an', nombre: 'Ana Analista', rol: 'Analista', area: 'Calidad', activo: true },
  okrsAnalyst: { id: 'u-okr', user_id: 'a-okr', nombre: 'Olga Okrs', rol: 'Analista', area: 'OKRS', activo: true },
  manager: { id: 'u-ger', user_id: 'a-ger', nombre: 'Gerardo Gerente', rol: 'Gerente', area: 'Ventas', activo: true },
  superAdmin: { id: 'u-sa', user_id: 'a-sa', nombre: 'Sara Super', rol: 'super_admin', area: null, activo: true },
  peer: { id: 'u-peer', user_id: 'a-peer', nombre: 'Pablo Par', rol: 'Analista', area: 'Ventas', activo: true },
  jorge1: { id: 'u-j1', user_id: 'a-j1', nombre: 'Jorge Ruiz', rol: 'Operativo', area: 'Operaciones', activo: true },
  jorge2: { id: 'u-j2', user_id: 'a-j2', nombre: 'Jorge Perez', rol: 'Operativo', area: 'Ventas', activo: true },
  maria: { id: 'u-maria', user_id: 'a-maria', nombre: 'Maria Lopez', rol: 'Operativo', area: 'Operaciones', activo: true },
  carlos: { id: 'u-carlos', user_id: 'a-carlos', nombre: 'Carlos Reyes', rol: 'Operativo', area: 'Logistica', activo: true },
  inactive: { id: 'u-off', user_id: 'a-off', nombre: 'Ines Inactiva', rol: 'Lider', area: 'OKRS', activo: false },
} as const

type Action = {
  id: string
  titulo_accion: string
  estado: string
  fecha: string
  responsable: string
  created_by: string
  prioridad: string
  area: string
  hora_limite?: string | null
  updated_at: string
}

export const R1_ACTIONS: Action[] = [
  { id: 'a1', titulo_accion: 'Cerrar inventario', estado: 'Retraso', fecha: '2026-11-17', responsable: 'u-lead', created_by: 'u-lead', prioridad: 'P1_Alta', area: 'OKRS', updated_at: '2026-11-17T10:00:00Z' },
  { id: 'a2', titulo_accion: 'Revisar presupuesto', estado: 'Pendiente', fecha: '2026-11-19', hora_limite: '18:00', responsable: 'u-lead', created_by: 'u-lead', prioridad: 'P2_Media', area: 'OKRS', updated_at: '2026-11-18T10:00:00Z' },
  { id: 'a3', titulo_accion: 'Preparar comite', estado: 'Pendiente', fecha: '2026-11-25', responsable: 'u-lead', created_by: 'u-lead', prioridad: 'P3_Baja', area: 'OKRS', updated_at: '2026-11-18T10:00:00Z' },
  { id: 'a4', titulo_accion: 'Proveedor de empaque', estado: 'Bloqueado', fecha: '2026-11-21', responsable: 'u-maria', created_by: 'u-lead', prioridad: 'P2_Media', area: 'Operaciones', updated_at: '2026-11-18T10:00:00Z' },
  { id: 'a5', titulo_accion: 'Actualizar SOP', estado: 'Pendiente', fecha: '2026-11-18', responsable: 'u-an', created_by: 'u-lead', prioridad: 'P2_Media', area: 'Calidad', updated_at: '2026-11-15T10:00:00Z' },
  { id: 'a6', titulo_accion: 'Plan privado de ventas', estado: 'Pendiente', fecha: '2026-11-26', responsable: 'u-peer', created_by: 'u-peer', prioridad: 'P2_Media', area: 'Ventas', updated_at: '2026-11-18T10:00:00Z' },
  { id: 'a7', titulo_accion: 'Entrega cerrada', estado: 'Hecho', fecha: '2026-11-10', responsable: 'u-lead', created_by: 'u-lead', prioridad: 'P2_Media', area: 'OKRS', updated_at: '2026-11-10T10:00:00Z' },
  { id: 'a8', titulo_accion: 'Auditoria de Jorge', estado: 'Pendiente', fecha: '2026-11-27', responsable: 'u-j1', created_by: 'u-lead', prioridad: 'P2_Media', area: 'Operaciones', updated_at: '2026-11-18T10:00:00Z' },
  { id: 'a9', titulo_accion: 'Ruta retrasada de Carlos', estado: 'Retraso', fecha: '2026-11-17', responsable: 'u-carlos', created_by: 'u-lead', prioridad: 'P1_Alta', area: 'Logistica', updated_at: '2026-11-17T10:00:00Z' },
  { id: 'a10', titulo_accion: 'Checklist de Carlos', estado: 'Pendiente', fecha: '2026-11-25', responsable: 'u-carlos', created_by: 'u-lead', prioridad: 'P2_Media', area: 'Logistica', updated_at: '2026-11-18T10:00:00Z' },
]

export const R1_OKR_DASHBOARD = {
  objectives: [
    { id: 'o1', nombre_okr: 'Crecer ventas', scope: 'empresa', activo: true, start_date: '2026-10-01', end_date: '2026-12-31' },
    { id: 'o2', nombre_okr: 'Eficiencia operativa', scope: 'empresa', activo: true, start_date: '2026-10-01', end_date: '2026-12-31' },
  ],
  keyResults: [
    { id: 'kr1', okr_id: 'o1', title: 'Ingresos nuevos', current_value: 20, target_value: 100, baseline_value: 0, unit: '%' },
    { id: 'kr2', okr_id: 'o2', title: 'Tiempo de ciclo', current_value: 70, target_value: 100, baseline_value: 0, unit: '%' },
    { id: 'kr3', okr_id: 'o2', title: 'Retrabajos', current_value: null, target_value: null, baseline_value: null, unit: null },
  ],
  initiatives: [{ id: 'i1', key_result_id: 'kr2' }],
}

export function createR1Db(): FakeDb {
  const users = Object.values(R1_USERS)
  return {
    tables: {
      usuarios: users.map((u) => ({ ...u })),
      acciones_diarias: R1_ACTIONS.map((a) => ({ hora_limite: null, ...a })),
      priorities: [],
      user_roles: [],
      usuario_areas: [],
      usuario_catalog_roles: [
        { user_id: 'u-lead', catalog_roles: okrModules },
        { user_id: 'u-dir', catalog_roles: okrModules },
        { user_id: 'u-an', catalog_roles: { activo: true, catalog_role_modules: [] } },
      ],
    },
    rpcs: {
      okr_dashboard: () => R1_OKR_DASHBOARD,
      assistant_person_email: () => null,
    },
    inserts: [],
    queries: [],
  }
}

export function r1Actor(
  db: FakeDb,
  user: (typeof R1_USERS)[keyof typeof R1_USERS],
  channel: AgentChannel = 'web',
  sessionId = 's1'
): AgentActor {
  return resolveActor(
    {
      supabase: createFakeSupabase(db),
      authUserId: user.user_id,
      usuarioId: user.id,
      rol: user.rol,
      active: user.activo,
    },
    { channel, sessionId }
  )
}

/** Actor con capacidades leídas del Supabase en memoria (área, módulos, app_role), como en producción. */
export async function r1ActorWithCapabilities(
  db: FakeDb,
  user: (typeof R1_USERS)[keyof typeof R1_USERS],
  channel: AgentChannel = 'web',
  sessionId = 's1'
): Promise<AgentActor> {
  const identity = {
    supabase: createFakeSupabase(db),
    authUserId: user.user_id,
    usuarioId: user.id,
    rol: user.rol,
    active: user.activo,
  }
  return resolveActor(identity, { channel, sessionId, capabilities: await loadAgentCapabilities(identity) })
}

export function r1Store(): SessionContextStore {
  return createMemorySessionContextStore()
}
