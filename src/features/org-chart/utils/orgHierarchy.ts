import type { AccionDiaria } from '@/types'
import { isEnRetraso } from '@/features/operations/utils/accionUtils'
import type {
  OrgChartCommandChainRow,
  OrgChartFilters,
  OrgChartNode,
  OrgChartUser,
  OrgChartUserActionStats,
} from '../types/orgChart.types'

const CLOSED_STATES = new Set(['Hecho', 'Verificado'])

export function initialsFromName(nombre: string): string {
  const parts = nombre.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase()
}

export function wouldCreateHierarchyCycle(
  userId: string,
  managerUserId: string | null,
  users: Pick<OrgChartUser, 'id' | 'manager_user_id'>[]
): boolean {
  if (!managerUserId || managerUserId === userId) return managerUserId === userId

  const byId = new Map(users.map((user) => [user.id, user.manager_user_id]))
  let current: string | null = managerUserId
  const visited = new Set<string>()

  while (current) {
    if (current === userId) return true
    if (visited.has(current)) return true
    visited.add(current)
    current = byId.get(current) ?? null
  }

  return false
}

export function getDirectReports(
  userId: string,
  users: OrgChartUser[]
): OrgChartUser[] {
  return users
    .filter((user) => user.manager_user_id === userId)
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
}

export function getManager(
  user: Pick<OrgChartUser, 'manager_user_id'>,
  users: OrgChartUser[]
): OrgChartUser | null {
  if (!user.manager_user_id) return null
  return users.find((row) => row.id === user.manager_user_id) ?? null
}

export function buildCommandChainRows(
  userId: string,
  users: OrgChartUser[]
): OrgChartCommandChainRow[] {
  const rows: OrgChartCommandChainRow[] = []
  let current = users.find((user) => user.id === userId) ?? null
  let nivel = 0

  while (current) {
    rows.push({
      nivel,
      id: current.id,
      nombre: current.nombre,
      rol: current.rol,
      area: current.area,
      activo: current.activo,
      manager_user_id: current.manager_user_id,
    })
    if (!current.manager_user_id) break
    current = users.find((user) => user.id === current?.manager_user_id) ?? null
    nivel += 1
    if (nivel > 32) break
  }

  return rows
}

/** Cadena ascendente para escalamientos futuros: responsable → jefe → jefe del jefe... */
export function buildEscalationChain(
  userId: string,
  users: OrgChartUser[]
): OrgChartUser[] {
  const chain: OrgChartUser[] = []
  let current = users.find((user) => user.id === userId) ?? null
  const visited = new Set<string>()

  while (current) {
    if (visited.has(current.id)) break
    visited.add(current.id)
    chain.push(current)
    if (!current.manager_user_id) break
    current = users.find((user) => user.id === current?.manager_user_id) ?? null
  }

  return chain
}

export function filterOrgChartUsers(
  users: OrgChartUser[],
  filters: OrgChartFilters
): OrgChartUser[] {
  let next = [...users]

  if (filters.soloActivos !== false) {
    next = next.filter((user) => user.activo)
  }

  if (filters.area != null && filters.area !== '') {
    next = next.filter((user) => user.area === filters.area)
  }

  if (filters.rol != null && filters.rol !== '') {
    next = next.filter((user) => user.rol === filters.rol)
  }

  if (filters.userId) {
    const selected = users.find((user) => user.id === filters.userId)
    if (!selected) return []

    const chainIds = new Set(buildCommandChainRows(selected.id, users).map((row) => row.id))
    const descendantIds = new Set<string>()
    const queue = getDirectReports(selected.id, users).map((user) => user.id)

    while (queue.length > 0) {
      const id = queue.shift()!
      if (descendantIds.has(id)) continue
      descendantIds.add(id)
      getDirectReports(id, users).forEach((child) => queue.push(child.id))
    }

    const allowed = new Set([...chainIds, ...descendantIds])
    next = next.filter((user) => allowed.has(user.id))
  }

  if (filters.search?.trim()) {
    const term = filters.search.trim().toLowerCase()
    next = next.filter(
      (user) =>
        user.nombre.toLowerCase().includes(term) ||
        user.rol.toLowerCase().includes(term) ||
        (user.area?.toLowerCase().includes(term) ?? false)
    )
  }

  return next.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
}

export function buildOrgChartForest(
  users: OrgChartUser[],
  filters: OrgChartFilters = {}
): OrgChartNode[] {
  const filtered = filterOrgChartUsers(users, filters)
  const visibleIds = new Set(filtered.map((user) => user.id))
  const nodes = new Map<string, OrgChartNode>()

  filtered.forEach((user) => {
    nodes.set(user.id, { ...user, children: [] })
  })

  const roots: OrgChartNode[] = []

  filtered.forEach((user) => {
    const node = nodes.get(user.id)!
    const parentId = user.manager_user_id
    if (parentId && visibleIds.has(parentId)) {
      nodes.get(parentId)?.children.push(node)
    } else {
      roots.push(node)
    }
  })

  const sortTree = (list: OrgChartNode[]): OrgChartNode[] =>
    list
      .map((node) => ({ ...node, children: sortTree(node.children) }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))

  return sortTree(roots)
}

export function summarizeUserActions(
  userId: string,
  acciones: AccionDiaria[]
): OrgChartUserActionStats {
  const open = acciones.filter(
    (accion) => accion.responsable === userId && !CLOSED_STATES.has(accion.estado)
  )

  return {
    asignadas: open.length,
    vencidas: open.filter((accion) => accion.estado === 'Retraso' || isEnRetraso(accion)).length,
    bloqueadas: open.filter((accion) => accion.estado === 'Bloqueado').length,
  }
}

export function mapManagerUpdateError(message: string): string {
  const low = message.toLowerCase()
  if (low.includes('ciclo')) return 'No se puede asignar ese jefe: generaría un ciclo jerárquico.'
  if (low.includes('sí mismo') || low.includes('si mismo')) {
    return 'Un usuario no puede reportarse a sí mismo.'
  }
  if (low.includes('activo')) return 'El jefe directo debe ser un usuario activo.'
  if (low.includes('no existe')) return 'El jefe directo seleccionado no existe.'
  return message
}
