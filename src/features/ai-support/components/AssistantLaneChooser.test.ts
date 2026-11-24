import { describe, expect, it } from 'vitest'
import { ASSISTANT_LANE_GRID_CLASS, ASSISTANT_LANE_LABELS } from './AssistantLaneChooser'

describe('AssistantLaneChooser · entrada MVP', () => {
  it('usa Consultar / Sesión guiada sin énfasis primario y grid 320→380', () => {
    expect(ASSISTANT_LANE_LABELS.write).toBe('Consultar')
    expect(ASSISTANT_LANE_LABELS.talk).toBe('Sesión guiada')
    expect(ASSISTANT_LANE_GRID_CLASS).toContain('grid-cols-1')
    expect(ASSISTANT_LANE_GRID_CLASS).toContain('min-[380px]:grid-cols-2')
  })
})
