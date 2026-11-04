import { describe, expect, it } from 'vitest'
import { resolveDraftSchedule } from './createActionFromDraft'
import type { AssistantActionDraft } from '@/lib/assistantAudioClient'

const draft: AssistantActionDraft = {
  title: 'Cerrar evidencias',
  description: 'Cerrar evidencias de OTIF',
  objective: '',
  evidenceExpected: '',
  priority: 'P2_Media',
  leanWaste: '',
  eosComponent: '',
  ownerHint: null,
  dueDateHint: null,
  activities: [],
}

describe('resolveDraftSchedule', () => {
  it('usa la fecha del usuario, no manana por defecto', () => {
    expect(
      resolveDraftSchedule({ ...draft, dueDateHint: '2026-11-07 10:00' }, '2026-11-03')
    ).toEqual({ fecha: '2026-11-07', hora_limite: '10:00' })
  })

  it('si no hay fecha, usa manana a las 17:00', () => {
    expect(resolveDraftSchedule(draft, '2026-11-03')).toEqual({
      fecha: '2026-11-04',
      hora_limite: '17:00',
    })
  })
})
