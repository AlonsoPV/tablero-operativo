export type TeamArea = { id: string; nombre: string; is_leader: boolean; member_count: number; open_count: number }
export type TeamState = {
  /** UUID de `statuses.id` (catálogo corporativo). `area_id` se conserva por compatibilidad JSON. */
  id: string
  area_id: string
  nombre: string
  orden: number
  color: string
  es_final: boolean
}
export type TeamMember = {
  id: string
  nombre: string
  rol?: string | null
  area?: string | null
  manager_user_id?: string | null
}
export type TeamChecklistItem = {
  text: string
  done?: boolean
  responsable_id?: string | null
  checked_at?: string | null
  checked_by?: string | null
}
export type TeamFrequency = 'diaria' | 'semanal' | 'quincenal' | 'mensual'
export type TeamAction = {
  id: string; area_id: string; estado_id: string; titulo: string; descripcion: string | null
  prioridad: string; asignado_a: string; lider_id: string; asignado_nombre: string
  creado_por?: string
  fecha_limite: string | null; evidencia_requerida: boolean; checklist: TeamChecklistItem[]
  es_frecuente?: boolean; frecuencia_tipo?: TeamFrequency | null
  frecuencia_dia_semana?: number | null; frecuencia_dia_mes?: number | null; frecuencia_inicio?: string | null
  serie_id?: string | null; ocurrencia_fecha?: string | null
  bloqueada: boolean; escalada: boolean; completed_at: string | null; created_at: string
}
/** Plantilla de una accion frecuente: no vive en el tablero, genera ocurrencias. */
export type TeamSeries = {
  id: string; area_id: string; titulo: string; descripcion: string | null
  prioridad: string; asignado_a: string; asignado_nombre: string
  fecha_limite: string | null
  frecuencia_tipo: TeamFrequency | null; frecuencia_dia_semana: number | null; frecuencia_dia_mes: number | null
  frecuencia_inicio: string | null
  serie_activa: boolean; serie_cerrada_at: string | null; serie_cierre_motivo: string | null
  ocurrencias_total: number; ocurrencias_abiertas: number; ultima_ocurrencia: string | null
  created_at: string
}
export type TeamBoard = {
  isLeader: boolean
  canManage?: boolean
  states: TeamState[]
  members: TeamMember[]
  membersByArea?: Record<string, TeamMember[]>
  actions: TeamAction[]
  series?: TeamSeries[]
}
export type TeamFilters = { search:string; priority:string; stateId:string; dateFrom:string; dateTo:string; mine:boolean }
export const EMPTY_TEAM_FILTERS:TeamFilters={search:'',priority:'all',stateId:'all',dateFrom:'',dateTo:'',mine:false}
