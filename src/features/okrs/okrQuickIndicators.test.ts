import { describe, expect, it } from 'vitest'
import {
  formatQuickIndicatorValue,
  isKrUpToDate,
  krIdsForQuickFocus,
  krPaceStatus,
  okrQuickIndicatorMetrics,
} from './okrQuickIndicators'
import type { CheckIn, KeyResult, Objective } from './model'

function objective(patch: Partial<Objective> = {}): Objective {
  return {
    id: 'obj-1',
    nombre_okr: 'Objetivo',
    descripcion: null,
    scope: 'company',
    area_id: null,
    owner_user_id: null,
    start_date: '2026-01-01',
    end_date: '2026-12-31',
    activo: true,
    can_manage: true,
    ...patch,
  }
}

function kr(patch: Partial<KeyResult> = {}): KeyResult {
  return {
    id: 'kr-1',
    okr_id: 'obj-1',
    title: 'KR',
    baseline_value: 0,
    target_value: 100,
    current_value: 50,
    owner_user_id: null,
    unit: '%',
    metric_type: 'manual:number',
    can_update: true,
    ...patch,
  }
}

function checkIn(patch: Partial<CheckIn> = {}): CheckIn {
  return {
    id: 'c-1',
    key_result_id: 'kr-1',
    value: 50,
    note: 'Seguimiento',
    created_at: '2026-06-01T12:00:00.000Z',
    created_by: 'u1',
    ...patch,
  }
}

describe('okrQuickIndicators', () => {
  it('returns Sin datos for empty averages and formats values', () => {
    const metrics = okrQuickIndicatorMetrics({
      objectives: [objective()],
      keyResults: [],
      checkIns: [],
      today: '2026-07-01',
    })
    expect(metrics.averageProgress).toBeNull()
    expect(metrics.onTrackShare).toBeNull()
    expect(metrics.atRiskCount).toBeNull()
    expect(metrics.upToDateShare).toBeNull()
    expect(formatQuickIndicatorValue(null, 'percent')).toBe('Sin datos')
    expect(formatQuickIndicatorValue(null, 'count')).toBe('Sin datos')
    expect(formatQuickIndicatorValue(null, 'days', null)).toBe('Sin datos')
    expect(formatQuickIndicatorValue(null, 'days', 3)).toBe('3 días')
  })

  it('computes avance as average of measurable KR progress', () => {
    const metrics = okrQuickIndicatorMetrics({
      objectives: [objective()],
      keyResults: [
        kr({ id: 'a', current_value: 40 }),
        kr({ id: 'b', current_value: 60 }),
        kr({ id: 'c', current_value: null }),
      ],
      checkIns: [],
      today: '2026-07-01',
    })
    expect(metrics.averageProgress).toBe(50)
    expect(metrics.ids.measurable).toEqual(['a', 'b'])
  })

  it('marks en_ruta vs en_riesgo using expected period trajectory', () => {
    // Mid-year expected ~50%. 80% is on track; 10% is at risk.
    const metrics = okrQuickIndicatorMetrics({
      objectives: [objective()],
      keyResults: [
        kr({ id: 'on', current_value: 80 }),
        kr({ id: 'risk', current_value: 10 }),
      ],
      checkIns: [],
      today: '2026-07-02',
    })
    expect(krPaceStatus(80, objective(), '2026-07-02')).toBe('en_ritmo')
    expect(krPaceStatus(10, objective(), '2026-07-02')).toBe('bajo_ritmo')
    expect(metrics.onTrackShare).toBe(50)
    expect(metrics.atRiskCount).toBe(1)
    expect(metrics.ids.onTrack).toEqual(['on'])
    expect(metrics.ids.atRisk).toEqual(['risk'])
  })

  it('treats automatic metrics as al día and manuals by period check-in', () => {
    expect(
      isKrUpToDate(kr({ metric_type: 'auto:kpi' }), objective(), [])
    ).toBe(true)
    expect(
      isKrUpToDate(kr({ metric_type: 'manual:number' }), objective({ start_date: null }), [])
    ).toBeNull()
    expect(
      isKrUpToDate(kr({ metric_type: 'manual:number' }), objective(), [])
    ).toBe(false)
    expect(
      isKrUpToDate(
        kr({ metric_type: 'manual:number' }),
        objective(),
        [checkIn({ created_at: '2026-03-10T10:00:00.000Z' })]
      )
    ).toBe(true)

    const metrics = okrQuickIndicatorMetrics({
      objectives: [objective()],
      keyResults: [
        kr({ id: 'auto', metric_type: 'kpi:linked' }),
        kr({ id: 'fresh', metric_type: 'manual:number' }),
        kr({ id: 'stale', metric_type: 'manual:number' }),
      ],
      checkIns: [checkIn({ key_result_id: 'fresh', created_at: '2026-04-01T00:00:00.000Z' })],
      today: '2026-07-01',
    })
    expect(metrics.upToDateShare).toBeCloseTo((2 / 3) * 100)
    expect(metrics.ids.stale).toEqual(['stale'])
  })

  it('maps quick focus to KR id lists', () => {
    const metrics = okrQuickIndicatorMetrics({
      objectives: [objective()],
      keyResults: [
        kr({ id: 'on', current_value: 90 }),
        kr({ id: 'risk', current_value: 5 }),
      ],
      checkIns: [],
      today: '2026-07-02',
    })
    expect(krIdsForQuickFocus('en_ruta', metrics)).toEqual(['on'])
    expect(krIdsForQuickFocus('en_riesgo', metrics)).toEqual(['risk'])
    expect(krIdsForQuickFocus('cronograma', metrics)).toBeNull()
  })
})
