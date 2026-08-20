import { describe, expect, it } from 'vitest'
import type { TeamAction, TeamBoard } from '../types'
import { buildTeamDashboardMetrics } from './teamDashboardMetrics'

const baseBoard: TeamBoard = {
  isLeader: true,
  canManage: true,
  states: [
    { id: 'pending', area_id: 'a1', nombre: 'Asignado', orden: 1, color: '#64748b', es_final: false },
    { id: 'blocked', area_id: 'a1', nombre: 'Bloqueado', orden: 2, color: '#ef4444', es_final: false },
    { id: 'done', area_id: 'a1', nombre: 'Verificado', orden: 3, color: '#22c55e', es_final: true },
  ],
  members: [
    { id: 'u1', nombre: 'Ana' },
    { id: 'u2', nombre: 'Carlos' },
  ],
  actions: [],
}

function action(partial: Partial<TeamAction> & Pick<TeamAction, 'id' | 'titulo' | 'asignado_a'>): TeamAction {
  return {
    area_id: 'a1',
    estado_id: 'pending',
    descripcion: null,
    prioridad: 'verde',
    lider_id: 'u1',
    asignado_nombre: partial.asignado_a === 'u2' ? 'Carlos' : 'Ana',
    fecha_limite: null,
    evidencia_requerida: false,
    checklist: [],
    bloqueada: false,
    escalada: false,
    completed_at: null,
    created_at: '2026-07-01T12:00:00.000Z',
    ...partial,
  }
}

describe('buildTeamDashboardMetrics', () => {
  it('calcula stock, cumplimiento y carga por integrante en una sola pasada de tablero', () => {
    const now = new Date('2026-07-17T18:00:00.000Z')
    const metrics = buildTeamDashboardMetrics(
      {
        ...baseBoard,
        actions: [
          action({ id: 'late', titulo: 'Vencida', asignado_a: 'u1', fecha_limite: '2026-07-16T12:00:00.000Z' }),
          action({ id: 'blocked', titulo: 'Bloqueada', asignado_a: 'u1', estado_id: 'blocked', bloqueada: true }),
          action({ id: 'red-today', titulo: 'Roja hoy', asignado_a: 'u2', prioridad: 'rojo', fecha_limite: '2026-07-17T20:00:00.000Z' }),
          action({ id: 'done-on-time', titulo: 'Cerrada a tiempo', asignado_a: 'u2', estado_id: 'done', completed_at: '2026-07-10T12:00:00.000Z', fecha_limite: '2026-07-10T13:00:00.000Z' }),
          action({ id: 'done-late', titulo: 'Cerrada tarde', asignado_a: 'u2', estado_id: 'done', completed_at: '2026-07-11T12:00:00.000Z', fecha_limite: '2026-07-10T13:00:00.000Z' }),
        ],
      },
      '30d',
      now
    )

    expect(metrics.activeActions).toBe(3)
    expect(metrics.overdueActions).toBe(1)
    expect(metrics.blockedActions).toBe(1)
    expect(metrics.onTimeCompliancePercent).toBe(50)
    expect(metrics.loadByMember).toEqual([
      { userId: 'u1', name: 'Ana', activeCount: 2 },
      { userId: 'u2', name: 'Carlos', activeCount: 1 },
    ])
    expect(metrics.attentionItems.map((item) => item.alertType)).toEqual(['vencida', 'bloqueada', 'roja_hoy'])
    expect(metrics.attentionScopeActions.map((item) => item.id)).toEqual(['late', 'red-today'])
    expect(metrics.overdueActionList).toHaveLength(1)
    expect(metrics.overdueByMember).toEqual([
      expect.objectContaining({ label: 'Ana', value: 1 }),
    ])
    expect(metrics.avgCloseAgeRedDays).toBeNull()
    expect(metrics.avgCloseAgeOthersDays).toBe(10)
  })
})
