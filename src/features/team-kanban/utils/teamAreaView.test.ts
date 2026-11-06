import { describe, expect, it } from 'vitest'
import type { AccionDiaria } from '@/types'
import type { TeamAction, TeamArea, TeamBoard, TeamMember, TeamState } from '../types'
import {
  boardForTeamAction,
  filterAssignedTeamAreas,
  isOkrsAreaName,
  mapCompanyEstadoToTeamStateId,
  mergeCompanyOkrActionsIntoBoard,
  mergeTeamBoards,
  pickDefaultTeamAreaId,
  resolveTeamAssigneeName,
} from './teamAreaView'

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
    const actionTwo = { ...action('action-2', 'area-2'), asignado_a: 'member-2', asignado_nombre: 'Beto' }
    const merged = mergeTeamBoards([
      board([member('member-1', 'Ana')], [actionOne]),
      board([member('member-2', 'Beto')], [actionTwo]),
    ], ['area-1', 'area-2'])

    expect(merged.actions.map((item) => item.id)).toEqual(['action-1', 'action-2'])
    expect(boardForTeamAction(merged, actionOne).members.map((item) => item.id)).toEqual(['member-1'])
    expect(boardForTeamAction(merged, actionTwo).members.map((item) => item.id)).toEqual(['member-2'])
  })

  it('prioriza OKRS como area por defecto cuando esta asignada', () => {
    const withOkrs: TeamArea[] = [
      { id: 'ops', nombre: 'Operaciones', is_leader: false, member_count: 1, open_count: 0 },
      { id: 'okrs', nombre: 'OKRS', is_leader: true, member_count: 2, open_count: 1 },
    ]
    expect(isOkrsAreaName('OKRS')).toBe(true)
    expect(isOkrsAreaName('okrs')).toBe(true)
    expect(pickDefaultTeamAreaId(withOkrs)).toBe('okrs')
    expect(pickDefaultTeamAreaId(areas)).toBe('area-1')
  })

  it('mezcla acciones corporativas es_okr en el tablero OKRS', () => {
    const states: TeamState[] = [
      {
        id: 'st-pendiente',
        area_id: 'okrs',
        nombre: 'Pendiente',
        orden: 1,
        color: '#ccc',
        es_final: false,
      },
      {
        id: 'st-hoy',
        area_id: 'okrs',
        nombre: 'Hoy',
        orden: 2,
        color: '#0af',
        es_final: false,
      },
    ]
    expect(mapCompanyEstadoToTeamStateId('Hoy', states)).toBe('st-hoy')
    const company = {
      id: 'corp-1',
      fecha: '2026-11-06',
      titulo_accion: 'Iniciativa OKR',
      descripcion_accion: 'Desc',
      responsable: 'user-1',
      hora_limite: '17:00',
      evidencia_esperada: 'PDF',
      estado: 'Hoy',
      prioridad: 'P1_Critica',
      escalado: false,
      completed_at: null,
      created_at: '2026-11-06T10:00:00Z',
      updated_at: '2026-11-06T10:00:00Z',
      es_okr: true,
    } as AccionDiaria
    const merged = mergeCompanyOkrActionsIntoBoard(
      { ...board([member('user-1', 'Ana')], []), states },
      'okrs',
      [company],
      { 'user-1': 'Ana' }
    )
    expect(merged.actions).toHaveLength(1)
    expect(merged.actions[0].source).toBe('company')
    expect(merged.actions[0].es_okr).toBe(true)
    expect(merged.actions[0].estado_id).toBe('st-hoy')
    expect(merged.actions[0].asignado_nombre).toBe('Ana')
  })

  it('incluye al responsable actual aunque no este en el listado del area', () => {
    const actionOne = {
      ...action('action-1', 'area-1'),
      asignado_a: 'member-2',
      asignado_nombre: 'Beto Externo',
    }
    const merged = mergeTeamBoards([
      board([member('member-1', 'Ana')], [actionOne]),
      board([member('member-2', 'Beto')], []),
    ], ['area-1', 'area-2'])

    const scoped = boardForTeamAction(merged, actionOne)
    expect(scoped.members.map((item) => item.id)).toEqual(['member-1', 'member-2'])
    expect(resolveTeamAssigneeName(actionOne, merged)).toBe('Beto Externo')
    expect(resolveTeamAssigneeName({ ...actionOne, asignado_nombre: '' }, merged)).toBe('Beto')
  })
})
