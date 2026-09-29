import { describe, expect, it } from 'vitest'
import {
  formatMetric,
  krProgress,
  measurementStory,
  objectivePeriod,
  objectiveProgress,
  suggestedPeriodEnd,
  type KeyResult,
} from './model'

describe('OKR progress', () => {
  it('uses the baseline instead of treating current / target as progress', () => {
    expect(
      krProgress({ baseline_value: 20, current_value: 50, target_value: 80 })
    ).toBe(50)
  })
  it('supports decreasing and negative targets', () => {
    expect(
      krProgress({ baseline_value: 24, current_value: 16, target_value: 8 })
    ).toBe(50)
    expect(
      krProgress({ baseline_value: -10, current_value: 0, target_value: 10 })
    ).toBe(50)
  })
  it('clamps regressions and overachievement without dividing by zero', () => {
    expect(
      krProgress({ baseline_value: 20, current_value: 10, target_value: 80 })
    ).toBe(0)
    expect(
      krProgress({ baseline_value: 20, current_value: 100, target_value: 80 })
    ).toBe(100)
    expect(
      krProgress({ baseline_value: 10, current_value: 10, target_value: 10 })
    ).toBe(0)
    expect(
      krProgress({
        baseline_value: null,
        current_value: null,
        target_value: 10,
      })
    ).toBe(0)
  })
  it('preserves automatic legacy calculations and equally weights KRs', () => {
    const results = [
      { baseline_value: 0, current_value: 100, target_value: 100 },
      { baseline_value: 0, current_value: 0, target_value: 100 },
      {
        baseline_value: null,
        current_value: 70,
        target_value: 80,
        computed_progress: 50,
      },
    ] as KeyResult[]
    expect(objectiveProgress(results)).toBe(50)
    expect(objectiveProgress([])).toBe(0)
  })
})

describe('OKR activation period', () => {
  const objective = {
    activo: true,
    start_date: '2026-09-01',
    end_date: '2026-09-30',
  }
  it('includes both boundary dates', () => {
    expect(objectivePeriod(objective, '2026-09-01')).toBe('Activo')
    expect(objectivePeriod(objective, '2026-09-30')).toBe('Activo')
  })
  it('distinguishes future, elapsed, archived and legacy undated periods', () => {
    expect(objectivePeriod(objective, '2026-08-31')).toBe('Programado')
    expect(objectivePeriod(objective, '2026-10-01')).toBe('Finalizado')
    expect(objectivePeriod({ ...objective, activo: false }, '2026-09-10')).toBe(
      'Archivado'
    )
    expect(
      objectivePeriod({ ...objective, start_date: null }, '2026-09-10')
    ).toBe('Sin periodo')
  })
})

describe('KR measurement story', () => {
  it('describes increasing and decreasing targets with their unit', () => {
    expect(measurementStory(10, 80, '%')).toEqual({
      direction: 'up',
      label: `Subir de ${formatMetric(10)} a ${formatMetric(80)} %`,
    })
    expect(measurementStory(12, 4, 'días')).toEqual({
      direction: 'down',
      label: `Bajar de ${formatMetric(12)} a ${formatMetric(4)} días`,
    })
  })
  it('rejects an unchanged target and incomplete numbers', () => {
    expect(measurementStory(5, 5, '%')?.direction).toBe('same')
    expect(measurementStory(Number.NaN, 10, '%')).toBeNull()
  })
})

describe('suggested OKR period end', () => {
  it('closes on the quarter or year that contains the start date', () => {
    expect(suggestedPeriodEnd('2026-09-25', 'quarter')).toBe('2026-09-30')
    expect(suggestedPeriodEnd('2026-02-01', 'quarter')).toBe('2026-03-31')
    expect(suggestedPeriodEnd('2026-11-30', 'quarter')).toBe('2026-12-31')
    expect(suggestedPeriodEnd('2026-09-25', 'year')).toBe('2026-12-31')
  })
  it('rejects dates that do not exist', () => {
    expect(suggestedPeriodEnd('2023-02-29', 'quarter')).toBeNull()
    expect(suggestedPeriodEnd('2026-13-01', 'year')).toBeNull()
  })
})
