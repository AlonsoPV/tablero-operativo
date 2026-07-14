import { describe, expect, it } from 'vitest'
import type { OrgChartUser } from '../types/orgChart.types'
import {
  buildCommandChainRows,
  buildEscalationChain,
  buildOrgChartForest,
  flattenOrgChartForest,
  getDirectReports,
  wouldCreateHierarchyCycle,
} from './orgHierarchy'

function user(partial: Partial<OrgChartUser> & Pick<OrgChartUser, 'id' | 'nombre'>): OrgChartUser {
  return {
    user_id: partial.user_id ?? partial.id,
    rol: partial.rol ?? 'Operativo',
    area: partial.area ?? null,
    activo: partial.activo ?? true,
    manager_user_id: partial.manager_user_id ?? null,
    created_at: partial.created_at ?? '2026-01-01T00:00:00Z',
    updated_at: partial.updated_at ?? '2026-01-01T00:00:00Z',
    ...partial,
  }
}

const sampleUsers: OrgChartUser[] = [
  user({ id: 'a', nombre: 'Direccion', rol: 'Direccion', manager_user_id: null }),
  user({ id: 'b', nombre: 'Lider', rol: 'Operaciones', manager_user_id: 'a' }),
  user({ id: 'c', nombre: 'Ana', rol: 'Operativo', manager_user_id: 'b' }),
  user({ id: 'd', nombre: 'Luis', rol: 'Operativo', manager_user_id: 'b' }),
]

describe('orgHierarchy', () => {
  it('detecta ciclos jerárquicos', () => {
    expect(wouldCreateHierarchyCycle('a', 'b', sampleUsers)).toBe(true)
    expect(wouldCreateHierarchyCycle('b', 'c', sampleUsers)).toBe(true)
    expect(wouldCreateHierarchyCycle('c', 'a', sampleUsers)).toBe(false)
    expect(wouldCreateHierarchyCycle('a', 'a', sampleUsers)).toBe(true)
  })

  it('lista subordinados directos', () => {
    expect(getDirectReports('b', sampleUsers).map((row) => row.id)).toEqual(['c', 'd'])
    expect(getDirectReports('c', sampleUsers)).toEqual([])
  })

  it('construye cadena de mando ascendente', () => {
    expect(buildCommandChainRows('c', sampleUsers).map((row) => row.id)).toEqual(['c', 'b', 'a'])
  })

  it('construye cadena de escalamiento', () => {
    expect(buildEscalationChain('c', sampleUsers).map((row) => row.nombre)).toEqual([
      'Ana',
      'Lider',
      'Direccion',
    ])
  })

  it('arma bosque jerárquico con raíces sin jefe visible', () => {
    const forest = buildOrgChartForest(sampleUsers)
    expect(forest).toHaveLength(1)
    expect(forest[0].id).toBe('a')
    expect(forest[0].children.map((child) => child.id)).toEqual(['b'])
    expect(forest[0].children[0].children.map((child) => child.id)).toEqual(['c', 'd'])
  })

  it('filtra por área sin romper el árbol', () => {
    const users = [
      ...sampleUsers,
      user({ id: 'e', nombre: 'RH', rol: 'Operativo', area: 'RH', manager_user_id: 'a' }),
    ]
    const forest = buildOrgChartForest(users, { area: 'RH', soloActivos: false })
    expect(forest.map((node) => node.id)).toEqual(['e'])
  })

  it('filtra por área adicional en memberships', () => {
    const users = [
      user({
        id: 'f',
        nombre: 'Multi',
        rol: 'Operativo',
        area: 'Finanzas',
        areas: ['Finanzas', 'RH'],
        manager_user_id: null,
      }),
    ]
    const forest = buildOrgChartForest(users, { area: 'RH', soloActivos: false })
    expect(forest.map((node) => node.id)).toEqual(['f'])
  })

  it('aplana el bosque en orden jerárquico para la vista lista', () => {
    const forest = buildOrgChartForest(sampleUsers)
    const rows = flattenOrgChartForest(forest, sampleUsers)
    expect(rows.map((row) => ({ id: row.id, depth: row.depth, reports: row.reportsCount }))).toEqual([
      { id: 'a', depth: 0, reports: 1 },
      { id: 'b', depth: 1, reports: 2 },
      { id: 'c', depth: 2, reports: 0 },
      { id: 'd', depth: 2, reports: 0 },
    ])
    expect(rows.find((row) => row.id === 'c')?.managerNombre).toBe('Lider')
    expect(rows.find((row) => row.id === 'b')?.reportNombres).toEqual(['Ana', 'Luis'])
  })
})
