import { describe, expect, it } from 'vitest'
import type { ActionOption, OkrData } from '@/features/okrs/model'
import { buildOkrAssistantContext } from './buildOkrAssistantContext'

const data: Pick<OkrData, 'objectives' | 'keyResults' | 'initiatives' | 'checkIns' | 'users' | 'areas'> = {
  users: [{ id: 'u1', nombre: 'Ana Ops' }],
  areas: [{ id: 'area-ops', nombre: 'Operaciones', can_manage: true }],
  objectives: [
    {
      id: 'okr-1',
      nombre_okr: 'Mejorar contratacion de transporte',
      descripcion: 'Bajar costo sin perder servicio',
      scope: 'team',
      area_id: 'area-ops',
      owner_user_id: 'u1',
      parent_okr_id: 'okr-parent',
      start_date: '2026-01-01',
      end_date: '2026-12-31',
      activo: true,
      can_manage: true,
    },
    {
      id: 'okr-parent',
      nombre_okr: 'Rentabilidad de flota',
      descripcion: null,
      scope: 'company',
      area_id: null,
      owner_user_id: 'u1',
      start_date: '2026-01-01',
      end_date: '2026-12-31',
      activo: true,
      can_manage: true,
    },
  ],
  keyResults: [
    {
      id: 'kr-activity',
      okr_id: 'okr-1',
      title: 'Realizar un benchmark de tarifas de 10 proveedores',
      baseline_value: null,
      target_value: 10,
      current_value: null,
      owner_user_id: 'u1',
      unit: 'proveedores',
      metric_type: 'manual:benchmark',
      can_update: true,
    },
    {
      id: 'kr-unrelated',
      okr_id: 'okr-1',
      title: 'Publicar 4 newsletters internas',
      baseline_value: 0,
      target_value: 4,
      current_value: 4,
      owner_user_id: 'u1',
      unit: 'newsletters',
      metric_type: 'manual:news',
      can_update: true,
    },
    {
      id: 'kr-fleet',
      okr_id: 'okr-1',
      title: 'Disponibilidad de unidades',
      baseline_value: 80,
      target_value: 95,
      current_value: 80,
      owner_user_id: 'u1',
      unit: '%',
      metric_type: 'manual:fleet',
      direction: 'increase',
      can_update: true,
    },
  ],
  initiatives: [
    {
      id: 'init-1',
      key_result_id: 'kr-fleet',
      action_id: 'act-sop',
      team_action_id: null,
    },
  ],
  checkIns: [],
}

const actions: ActionOption[] = [
  {
    id: 'act-sop',
    title: 'Publicar SOP de mantenimiento',
    kind: 'company',
    area_id: 'area-ops',
    closed: true,
    es_okr: true,
  },
]

describe('buildOkrAssistantContext', () => {
  it('does not invent a baseline when the KR has none', () => {
    const payload = buildOkrAssistantContext(data, actions, {
      objectiveId: 'okr-1',
      keyResultId: 'kr-activity',
      today: '2026-07-01',
    })
    expect(payload?.focus).toBe('key_result')
    expect(payload?.keyResults.find((item) => item.id === 'kr-activity')?.completeness.hasBaseline).toBe(
      false
    )
    expect(payload?.keyResults.find((item) => item.id === 'kr-activity')?.baseline).toBeNull()
    expect(payload?.keyResults.find((item) => item.id === 'kr-activity')?.progress).toBeNull()
  })

  it('keeps a closed initiative while the KR has no progress', () => {
    const payload = buildOkrAssistantContext(data, actions, {
      objectiveId: 'okr-1',
      initiativeId: 'init-1',
      today: '2026-07-01',
    })
    expect(payload?.focus).toBe('initiative')
    expect(payload?.initiatives[0]).toMatchObject({
      title: 'Publicar SOP de mantenimiento',
      closed: true,
      focused: true,
    })
    expect(payload?.keyResults.find((item) => item.id === 'kr-fleet')?.progress).toBe(0)
  })

  it('includes sibling KRs so the model can detect lack of strategic coherence', () => {
    const payload = buildOkrAssistantContext(data, actions, {
      objectiveId: 'okr-1',
      today: '2026-07-01',
    })
    expect(payload?.objective.parentNombre).toBe('Rentabilidad de flota')
    expect(payload?.keyResults.map((item) => item.title)).toEqual([
      'Realizar un benchmark de tarifas de 10 proveedores',
      'Publicar 4 newsletters internas',
      'Disponibilidad de unidades',
    ])
  })
})
