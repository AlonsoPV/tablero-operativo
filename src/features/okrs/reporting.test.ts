import { describe, expect, it } from 'vitest'
import {
  comparableChange,
  csvCell,
  emptyReportFilters,
  filterReport,
  historicalProgress,
  measurementsFor,
  reportCsv,
  reportingSummary,
} from './reporting'
import type { CheckIn, Objective, OkrData } from './model'

const measurement = (overrides: Partial<CheckIn> = {}): CheckIn => ({
  id: 'm1',
  key_result_id: 'k1',
  value: 16,
  created_by: 'u1',
  created_at: '2026-09-28T14:00:00Z',
  note: 'Seguimiento',
  baseline_snapshot: 24,
  target_snapshot: 8,
  unit_snapshot: 'horas',
  ...overrides,
})
const objective = (overrides: Partial<Objective> = {}): Objective => ({
  id: 'o1',
  nombre_okr: 'Mejorar atención',
  descripcion: null,
  scope: 'company',
  area_id: null,
  owner_user_id: 'u1',
  start_date: '2026-07-01',
  end_date: '2026-09-30',
  activo: true,
  can_manage: true,
  ...overrides,
})
const data: OkrData = {
  objectives: [objective()],
  keyResults: [
    {
      id: 'k1',
      okr_id: 'o1',
      title: 'Reducir tiempo',
      baseline_value: 24,
      target_value: 8,
      current_value: 16,
      unit: 'horas',
      metric_type: 'manual:k1',
      owner_user_id: 'u1',
      can_update: true,
    },
  ],
  initiatives: [],
  checkIns: [measurement()],
  users: [{ id: 'u1', nombre: 'Ana' }],
  areas: [],
  can_manage_company: true,
}

describe('Historical OKR reporting', () => {
  it('calculates historical progress from the recorded target, including decreasing metrics', () => {
    expect(historicalProgress(measurement())).toBe(50)
    expect(historicalProgress(measurement({ target_snapshot: 16 }))).toBe(100)
  })
  it('does not invent historical percentages for legacy measurements', () => {
    expect(
      historicalProgress(
        measurement({ baseline_snapshot: null, target_snapshot: null })
      )
    ).toBeNull()
  })
  it('compares only measurements made against the same reference', () => {
    expect(comparableChange([measurement({ value: 12 }), measurement()])).toBe(
      25
    )
    expect(
      comparableChange([measurement({ target_snapshot: 4 }), measurement()])
    ).toBeNull()
    expect(
      comparableChange([measurement({ unit_snapshot: 'días' }), measurement()])
    ).toBeNull()
    expect(comparableChange([measurement()])).toBeNull()
  })
  it('orders history without mutating query data', () => {
    const rows = [
      measurement({ id: 'older', created_at: '2026-09-01T00:00:00Z' }),
      measurement({ id: 'newer' }),
      measurement({ id: 'other', key_result_id: 'k2' }),
    ]
    expect(measurementsFor(rows, 'k1').map((m) => m.id)).toEqual([
      'newer',
      'older',
    ])
    expect(rows[0].id).toBe('older')
  })
  it('filters periods, archives, scopes and owners without excluding archives by default', () => {
    const rows = [
      objective(),
      objective({ id: 'archive', activo: false }),
      objective({
        id: 'team',
        scope: 'team',
        area_id: 'a1',
        owner_user_id: 'u2',
      }),
    ]
    expect(filterReport(rows, emptyReportFilters, '2026-09-28')).toHaveLength(3)
    expect(
      filterReport(
        rows,
        { ...emptyReportFilters, search: 'atencion', period: 'Archivado' },
        '2026-09-28'
      ).map((o) => o.id)
    ).toEqual(['archive'])
    expect(
      filterReport(
        rows,
        {
          ...emptyReportFilters,
          scope: 'team',
          owner: 'u2',
          dates: '2026-07-01|2026-09-30',
        },
        '2026-09-28'
      ).map((o) => o.id)
    ).toEqual(['team'])
    expect(
      filterReport(
        rows,
        { ...emptyReportFilters, period: 'Finalizado' },
        '2026-10-01'
      )
    ).toHaveLength(2)
  })
  it('does not count objectives without KRs as achieved or dilute their average', () => {
    expect(
      reportingSummary([objective(), objective({ id: 'empty' })], data)
    ).toEqual({ average: 50, achieved: 0, missingKrs: 1, withoutCheckIn: 0 })
    expect(reportingSummary([], data).average).toBeNull()
    expect(
      reportingSummary(data.objectives, {
        ...data,
        checkIns: [measurement({ note: 'Línea base inicial' })],
      }).withoutCheckIn
    ).toBe(1)
  })
  it('exports the selected scope with safe spreadsheet cells', () => {
    expect(csvCell('=HYPERLINK("url")')).toBe('"\'=HYPERLINK(""url"")"')
    expect(csvCell(' \t+SUM(1,2)')).toBe('"\' \t+SUM(1,2)"')
    expect(csvCell(-10)).toBe('"-10"')
    expect(csvCell('A\nB,"C"')).toBe('"A\nB,""C"""')
    const csv = reportCsv(data.objectives, data)
    expect(csv).toContain('Mejorar atención')
    expect(csv).toContain('Reducir tiempo')
    expect(csv).toContain('"50"')
    expect(reportCsv([], data)).not.toContain('Reducir tiempo')
  })
})
