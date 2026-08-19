import type { TeamAction, TeamArea, TeamBoard, TeamMember } from '../types'

function normalizeAreaName(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
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
