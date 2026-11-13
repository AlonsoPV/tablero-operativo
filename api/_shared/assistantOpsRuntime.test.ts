import { describe, expect, it } from 'vitest'
import { analystCanSeeAction } from './assistantOpsRuntime.js'

describe('analyst action scope', () => {
  it('hides an action whose owner is someone else', () => {
    expect(analystCanSeeAction('Analista', 'me', { responsable: 'otra-persona' })).toBe(false)
    expect(analystCanSeeAction('Analista', 'me', { responsable: 'me' })).toBe(true)
    expect(analystCanSeeAction('Analista', '', { responsable: 'me' })).toBe(false)
  })

  it('keeps the board view for every other role', () => {
    expect(analystCanSeeAction('Director', 'me', { responsable: 'otra-persona' })).toBe(true)
    expect(analystCanSeeAction(null, 'me', { responsable: 'otra-persona' })).toBe(true)
  })
})
