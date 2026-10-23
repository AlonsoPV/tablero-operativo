import { describe, expect, it } from 'vitest'
import {
  actionMatchesObjectiveArea,
  isTaggedOkrAction,
  type ActionOption,
  type Objective,
} from './model'

const objective = {
  area_id: 'area-ops',
} as Pick<Objective, 'area_id'>

function action(
  patch: Partial<Pick<ActionOption, 'kind' | 'area_id' | 'es_okr'>>
): Pick<ActionOption, 'kind' | 'area_id' | 'es_okr'> {
  return { kind: 'company', area_id: null, es_okr: true, ...patch }
}

describe('OKR initiative linking filters', () => {
  it('only keeps actions tagged as OKR', () => {
    expect(isTaggedOkrAction({ es_okr: true })).toBe(true)
    expect(isTaggedOkrAction({ es_okr: false })).toBe(false)
    expect(isTaggedOkrAction({})).toBe(false)
  })

  it('lists tagged company actions even without area', () => {
    expect(actionMatchesObjectiveArea(action({ kind: 'company' }), objective)).toBe(
      true
    )
    expect(
      actionMatchesObjectiveArea(
        action({ kind: 'company', area_id: 'other-area' }),
        objective
      )
    ).toBe(true)
  })

  it('keeps team actions in the same area', () => {
    expect(
      actionMatchesObjectiveArea(
        action({ kind: 'team', area_id: 'area-ops' }),
        objective
      )
    ).toBe(true)
    expect(
      actionMatchesObjectiveArea(
        action({ kind: 'team', area_id: 'other-area' }),
        objective
      )
    ).toBe(false)
  })
})
