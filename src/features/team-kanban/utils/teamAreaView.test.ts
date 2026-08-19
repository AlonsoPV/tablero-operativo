import { describe, expect, it } from 'vitest'
import type { TeamAction, TeamArea, TeamBoard, TeamMember } from '../types'
import { boardForTeamAction, filterAssignedTeamAreas, mergeTeamBoards } from './teamAreaView'

const areas: TeamArea[] = [
  { id: 'area-1', nombre: 'Operaciones', is_leader: true, member_count: 2, open_count: 3 },
  { id: 'area-2', nombre: 'Calidad', is_leader: true, member_count: 2, open_count: 4 },
  { id: 'area-3', nombre: 'Comercial', is_leader: false, member_count: 1, open_count: 1 },
]

function member(id: string, nombre: string): TeamMember {
  return { id, nombre }
}

function action(id: string, areaId: string): TeamAction {
  return {
    id,
    area_id: areaId,
    estado_id: 'state-1',
    titulo: id,
    descripcion: null,
    prioridad: 'Media',
    asignado_a: 'member-1',
    lider_id: 'member-1',
    asignado_nombre: 'Usuario',
    fecha_limite: null,
    evidencia_requerida: false,
    checklist: [],
    bloqueada: false,
    escalada: false,
    completed_at: null,
    created_at: '2026-08-19T00:00:00Z',
  }
}

function board(members: TeamMember[], actions: TeamAction[]): TeamBoard {
  return { isLeader: true, canManage: true, states: [], members, actions, series: [] }
}

describe('vista de areas del Kanban por Equipos', () => {
  it('muestra solo areas asignadas por id o por area principal', () => {
    expect(filterAssignedTeamAreas(areas, ['area-1'], ['calidad']).map((area) => area.id))
      .toEqual(['area-1', 'area-2'])
  })

  it('consolida Todas sin mezclar responsables entre areas', () => {
    const actionOne = action('action-1', 'area-1')
    const actionTwo = action('action-2', 'area-2')
    const merged = mergeTeamBoards([
      board([member('member-1', 'Ana')], [actionOne]),
      board([member('member-2', 'Beto')], [actionTwo]),
    ], ['area-1', 'area-2'])

    expect(merged.actions.map((item) => item.id)).toEqual(['action-1', 'action-2'])
    expect(boardForTeamAction(merged, actionOne).members.map((item) => item.id)).toEqual(['member-1'])
    expect(boardForTeamAction(merged, actionTwo).members.map((item) => item.id)).toEqual(['member-2'])
  })
})
