import { describe, expect, it } from 'vitest'
import { filterTeamMembers } from '../utils/teamMemberSearch'

const members = [
  { id: '1', nombre: 'Ana Lopez', area: 'Operaciones', rol: 'Analista' },
  { id: '2', nombre: 'Carlos Perez', area: 'Logistica', rol: 'Lider' },
]

describe('filterTeamMembers', () => {
  it('busca sin depender de acentos o mayusculas', () => {
    expect(filterTeamMembers(members, 'ana').map((member) => member.id)).toEqual(['1'])
    expect(filterTeamMembers(members, 'logística').map((member) => member.id)).toEqual(['2'])
  })

  it('permite buscar por rol', () => {
    expect(filterTeamMembers(members, 'lider').map((member) => member.id)).toEqual(['2'])
  })
})
