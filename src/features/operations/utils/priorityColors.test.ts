import { describe, expect, it } from 'vitest'
import {
  inferPriorityColor,
  normalizePriorityColor,
  priorityColorFor,
  priorityColorForForm,
  priorityColorClasses,
  priorityDotClasses,
} from './priorityColors'

describe('normalizePriorityColor', () => {
  it('accepts only verde, amarillo and rojo', () => {
    expect(normalizePriorityColor('rojo')).toBe('rojo')
    expect(normalizePriorityColor('amarillo')).toBe('amarillo')
    expect(normalizePriorityColor('verde')).toBe('verde')
    expect(normalizePriorityColor('red')).toBeNull()
    expect(normalizePriorityColor(null)).toBeNull()
  })
})

describe('inferPriorityColor', () => {
  it('maps seeded catalog names to rojo, amarillo and verde', () => {
    expect(inferPriorityColor('P1_Critica')).toBe('rojo')
    expect(inferPriorityColor('P2_Media')).toBe('amarillo')
    expect(inferPriorityColor('P3_Baja')).toBe('verde')
  })
})

describe('priorityColorFor', () => {
  it('prefers explicit catalog color over name inference', () => {
    expect(priorityColorFor('P3_Baja', 'rojo')).toBe('rojo')
    expect(priorityColorFor('P1_Critica', 'verde')).toBe('verde')
  })

  it('falls back to inference when catalog color is missing', () => {
    expect(priorityColorFor('P1_Critica', null)).toBe('rojo')
    expect(priorityColorFor('P2_Media', undefined)).toBe('amarillo')
    expect(priorityColorFor('P3_Baja', '')).toBe('verde')
  })
})

describe('priorityColorForForm', () => {
  it('uses stored color when present', () => {
    expect(priorityColorForForm('Custom', 'amarillo')).toBe('amarillo')
  })

  it('infers from name when stored color is null', () => {
    expect(priorityColorForForm('P1_Critica', null)).toBe('rojo')
    expect(priorityColorForForm('P2_Media', null)).toBe('amarillo')
    expect(priorityColorForForm('P3_Baja', null)).toBe('verde')
  })

  it('defaults to amarillo for new empty names', () => {
    expect(priorityColorForForm('', null)).toBe('amarillo')
  })
})

describe('priority visual classes', () => {
  it('maps rojo, amarillo and verde to distinct tailwind palettes', () => {
    expect(priorityDotClasses('rojo')).toContain('red')
    expect(priorityDotClasses('amarillo')).toContain('amber')
    expect(priorityDotClasses('verde')).toContain('emerald')

    expect(priorityColorClasses('rojo')).toContain('red')
    expect(priorityColorClasses('amarillo')).toContain('amber')
    expect(priorityColorClasses('verde')).toContain('emerald')
  })
})
