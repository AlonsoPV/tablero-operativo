import { describe, expect, it } from 'vitest'
import { mergeActionQueryArgs, buildActiveQueryEntry } from './mergeArgs'

describe('mergeActionQueryArgs stale / follow-up', () => {
  it('maps ayer / sin seguimiento to stale', () => {
    const a = mergeActionQueryArgs({}, null, 'Que paso con las acciones pendientes de ayer?')
    expect(a.status_group).toBe('stale')
    expect(a.visual).toBe('none')

    const b = mergeActionQueryArgs({}, null, 'Cuales estan sin seguimiento?')
    expect(b.status_group).toBe('stale')
  })

  it('keeps team scope when stale follow-up after team query', () => {
    const prev = buildActiveQueryEntry({
      scope: 'team_authorized',
      status_group: 'open',
      visual: 'none',
    })
    const next = mergeActionQueryArgs({}, prev, 'Que paso con los pendientes de ayer?')
    expect(next.scope).toBe('team_authorized')
    expect(next.status_group).toBe('stale')
  })
})
