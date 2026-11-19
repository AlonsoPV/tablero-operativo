/**
 * Catálogo de fuentes del agente (FV-01): qué tabla/RPC respalda cada entidad,
 * qué campos se exponen y qué módulo es dueño del dato. Sin acceso a datos.
 */
import type { QueryEntity, QuerySourceRef } from './contracts.js'

export type SourceDefinition = QuerySourceRef & {
  entity: Exclude<QueryEntity, 'combined' | 'aggregate'> | 'people' | 'audit'
  ownerModule: string
  fields: string[]
  /** Herramientas existentes que leen la fuente; la capa de consulta delega en ellas. */
  readVia: string[]
  /** Política que limita la lectura del actor. */
  authorization: string
}

export const AGENT_SOURCES: readonly SourceDefinition[] = [
  {
    id: 'acciones_diarias',
    kind: 'table',
    name: 'acciones_diarias',
    entity: 'actions',
    ownerModule: 'kanban',
    fields: [
      'id', 'titulo_accion', 'descripcion_accion', 'estado', 'fecha', 'hora_limite',
      'prioridad', 'prioridad_id', 'responsable', 'created_by', 'area', 'updated_at',
      'verificador_dato', 'verificador_gobierno',
    ],
    readVia: ['get_my_actions', 'get_team_actions', 'get_pending_verifications', 'get_action_details'],
    authorization:
      'RLS de acciones + canUseWideActionScope (Analista solo propias salvo lectura transversal: Super Admin, Dirección, área OKRS)',
  },
  {
    id: 'priorities',
    kind: 'table',
    name: 'priorities',
    entity: 'actions',
    ownerModule: 'kanban',
    fields: ['id', 'nombre', 'color', 'activo'],
    readVia: ['get_my_actions'],
    authorization: 'Catálogo de lectura autenticada',
  },
  {
    id: 'okr_dashboard',
    kind: 'rpc',
    name: 'okr_dashboard',
    entity: 'okrs',
    ownerModule: 'okrs',
    fields: ['objectives', 'keyResults', 'initiatives'],
    readVia: ['get_okr_progress'],
    authorization: 'okr_can_view (lectura total: Super Admin, Dirección, área OKRS) + módulo okrs para el resto',
  },
  {
    id: 'okr_key_results',
    kind: 'table',
    name: 'okr_key_results',
    entity: 'okrs',
    ownerModule: 'okrs',
    fields: ['id', 'okr_id', 'title', 'current_value', 'target_value', 'baseline_value', 'unit'],
    readVia: ['get_okr_progress'],
    authorization: 'okr_can_view (respaldo si el RPC falla)',
  },
  {
    id: 'usuarios',
    kind: 'table',
    name: 'usuarios',
    entity: 'people',
    ownerModule: 'usuarios',
    fields: ['id', 'nombre', 'rol', 'area', 'activo'],
    readVia: ['search_people'],
    authorization: 'Solo activos; correo vía RPC assistant_person_email',
  },
  {
    id: 'assistant_op_log',
    kind: 'table',
    name: 'assistant_op_log',
    entity: 'audit',
    ownerModule: 'asistente',
    fields: ['usuario_id', 'tool', 'result', 'preview_summary', 'created_at'],
    readVia: [],
    authorization: 'RLS dueño (insert/select propios)',
  },
] as const

/** Datos que el agente NO tiene: se declaran como limitación, nunca se estiman. */
export const UNAVAILABLE_DOMAINS = [
  { id: 'finance', label: 'datos financieros (costos, ingresos o pérdidas)' },
  { id: 'payroll', label: 'nómina o compensación' },
] as const

export function sourcesFor(entity: QueryEntity): QuerySourceRef[] {
  const wanted = entity === 'combined' ? ['actions', 'okrs'] : entity === 'aggregate' ? ['actions'] : [entity]
  return AGENT_SOURCES.filter((s) => wanted.includes(s.entity)).map(({ id, kind, name }) => ({ id, kind, name }))
}
