export interface OrgChartUser {
  id: string
  user_id: string
  nombre: string
  rol: string
  area: string | null
  activo: boolean
  manager_user_id: string | null
  created_at: string
  updated_at: string
}

export interface OrgChartNode extends OrgChartUser {
  children: OrgChartNode[]
}

export interface OrgChartFilters {
  search?: string
  area?: string | null
  rol?: string | null
  userId?: string | null
  soloActivos?: boolean
}

export interface OrgChartCommandChainRow {
  nivel: number
  id: string
  nombre: string
  rol: string
  area: string | null
  activo: boolean
  manager_user_id: string | null
}

export interface OrgChartUserActionStats {
  asignadas: number
  vencidas: number
  bloqueadas: number
}
