import type { AccionDiaria } from '@/types'
import type { TeamAction, TeamArea, TeamBoard, TeamMember, TeamState } from '../types'

function normalizeAreaName(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
}

/** Área de catálogo OKRS (nombre canónico en seed). */
export function isOkrsAreaName(value: string | null | undefined): boolean {
  return normalizeAreaName(value ?? '') === 'okrs'
}

/**
 * Preferir OKRS cuando el usuario tiene esa área asignada;
 * si no, la primera área visible.
 */
export function pickDefaultTeamAreaId(areas: TeamArea[]): string | null {
  if (!areas.length) return null
  const okrs = areas.find((area) => isOkrsAreaName(area.nombre))
  return okrs?.id ?? areas[0]?.id ?? null
}

function normalizeStateName(value: string) {
  return normalizeAreaName(value).replace(/[\s_-]+/g, '')
}

export function mapCompanyEstadoToTeamStateId(
  estado: string | null | undefined,
  states: TeamState[]
): string {
  if (!states.length) return ''
  const target = normalizeStateName(estado ?? '')
  const exact = states.find((state) => normalizeStateName(state.nombre) === target)
  if (exact) return exact.id
  // Alias frecuentes corporativo ↔ catálogo
  const aliases: Record<string, string[]> = {
    enejecucion: ['enejecucion', 'proceso', 'enproceso'],
    bloqueado: ['bloqueado', 'bloqueada'],
    hecho: ['hecho', 'cerrado', 'finalizado'],
    verificado: ['verificado'],
  }
  for (const [canonical, names] of Object.entries(aliases)) {
    if (!names.includes(target) && canonical !== target) continue
    const match = states.find((state) => names.includes(normalizeStateName(state.nombre)))
    if (match) return match.id
  }
  return states.find((state) => !state.es_final)?.id ?? states[0].id
}

/** Convierte una acción diaria marcada OKR a tarjeta del tablero de equipos (área OKRS). */
export function mapCompanyOkrActionToTeamAction(
  accion: AccionDiaria,
  areaId: string,
  states: TeamState[],
  assigneeName?: string | null
): TeamAction {
  const fecha = (accion.fecha ?? '').slice(0, 10)
  const hora = (accion.hora_limite ?? '17:00').slice(0, 5)
  const fechaLimite =
    fecha && /^\d{4}-\d{2}-\d{2}$/.test(fecha)
      ? new Date(`${fecha}T${hora || '17:00'}:00`).toISOString()
      : null

  return {
    id: accion.id,
    area_id: areaId,
    estado_id: mapCompanyEstadoToTeamStateId(accion.estado, states),
    titulo: accion.titulo_accion ?? 'Actividad OKR',
    descripcion: accion.descripcion_accion ?? null,
    prioridad: accion.prioridad ?? 'P2_Media',
    asignado_a: accion.responsable,
    lider_id: accion.created_by ?? accion.responsable,
    asignado_nombre: assigneeName?.trim() || 'Sin asignar',
    creado_por: accion.created_by ?? undefined,
    fecha_limite: fechaLimite,
    evidencia_requerida: Boolean(accion.evidencia_esperada?.trim()),
    checklist: [],
    bloqueada: accion.estado === 'Bloqueado',
    escalada: Boolean(accion.escalado),
    completed_at: accion.completed_at ?? null,
    created_at: accion.created_at,
    es_okr: true,
    source: 'company',
  }
}

export function mergeCompanyOkrActionsIntoBoard(
  board: TeamBoard,
  areaId: string,
  companyActions: AccionDiaria[],
  assigneeNames: Record<string, string> = {}
): TeamBoard {
  if (!companyActions.length) return board
  const existingIds = new Set(board.actions.map((action) => action.id))
  const mapped = companyActions
    .filter((accion) => !existingIds.has(accion.id))
    .map((accion) =>
      mapCompanyOkrActionToTeamAction(
        accion,
        areaId,
        board.states,
        assigneeNames[accion.responsable] ?? null
      )
    )
  if (!mapped.length) return board
  return {
    ...board,
    actions: [...mapped, ...board.actions],
  }
}

export function filterAssignedTeamAreas(
  areas: TeamArea[],
  assignedAreaIds: string[],
  assignedAreaNames: Array<string | null | undefined>
) {
  const assignedIds = new Set(assignedAreaIds)
  const assignedNames = new Set(
    assignedAreaNames
      .filter((name): name is string => Boolean(name?.trim()))
      .map(normalizeAreaName)
  )
  return areas.filter(
    (area) => assignedIds.has(area.id) || assignedNames.has(normalizeAreaName(area.nombre))
  )
}

export function mergeTeamBoards(boards: TeamBoard[], areaIds: string[]): TeamBoard {
  const members = new Map(boards.flatMap((board) => board.members).map((member) => [member.id, member]))
  return {
    isLeader: boards.some((board) => board.isLeader),
    canManage: boards.some((board) => board.canManage ?? board.isLeader),
    states: boards[0]?.states ?? [],
    members: [...members.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
    membersByArea: Object.fromEntries(
      areaIds.map((areaId, index) => [areaId, boards[index]?.members ?? []])
    ),
    actions: boards.flatMap((board) => board.actions),
    series: boards.flatMap((board) => board.series ?? []),
  }
}

export function resolveTeamAssigneeName(action: TeamAction, board: TeamBoard): string {
  const fromAction = action.asignado_nombre?.trim()
  if (fromAction) return fromAction
  const fromMembers = board.members.find((member) => member.id === action.asignado_a)?.nombre?.trim()
  return fromMembers || 'Sin asignar'
}

function ensureAssigneeInMembers(members: TeamMember[], action: TeamAction, board: TeamBoard): TeamMember[] {
  if (!action.asignado_a || members.some((member) => member.id === action.asignado_a)) {
    return members
  }

  const fromMerged = board.members.find((member) => member.id === action.asignado_a)
  const assignee: TeamMember = fromMerged ?? {
    id: action.asignado_a,
    nombre: action.asignado_nombre?.trim() || 'Responsable asignado',
  }

  return [...members, assignee].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
}

export function boardForTeamAction(board: TeamBoard, action: TeamAction): TeamBoard {
  const areaMembers = board.membersByArea?.[action.area_id]
  if (!areaMembers) return board
  return { ...board, members: ensureAssigneeInMembers(areaMembers, action, board) }
}
