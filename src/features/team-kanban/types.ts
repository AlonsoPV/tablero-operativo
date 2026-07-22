export type TeamArea = { id: string; nombre: string; is_leader: boolean; member_count: number; open_count: number }
export type TeamState = { id: string; area_id: string; nombre: string; orden: number; color: string; es_final: boolean }
export type TeamMember = { id: string; nombre: string }
export type TeamAction = {
  id: string; area_id: string; estado_id: string; titulo: string; descripcion: string | null
  prioridad: 'Baja' | 'Media' | 'Alta' | 'Critica'; asignado_a: string; lider_id: string; asignado_nombre: string
  fecha_limite: string | null; evidencia_requerida: boolean; checklist: Array<{ text: string; done?: boolean }>
  bloqueada: boolean; escalada: boolean; completed_at: string | null; created_at: string
}
export type TeamBoard = {
  isLeader: boolean
  canManage?: boolean
  states: TeamState[]
  members: TeamMember[]
  actions: TeamAction[]
}
export type TeamFilters = { search:string; priority:string; stateId:string; dateFrom:string; dateTo:string }
export const EMPTY_TEAM_FILTERS:TeamFilters={search:'',priority:'all',stateId:'all',dateFrom:'',dateTo:''}
