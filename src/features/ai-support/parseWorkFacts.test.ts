import { describe, expect, it } from 'vitest'
import { formatDueHint, mergeWorkFacts, parseWorkFacts } from './parseWorkFacts'
import { groundActionDrafts } from './groundActionDrafts'
import type { AssistantAudioResult } from '@/lib/assistantAudioClient'

const TODAY = '2026-11-03' // martes

describe('parseWorkFacts', () => {
  it('resuelve viernes al proximo viernes, no a otro dia', () => {
    expect(parseWorkFacts('Crea una accion para el viernes', TODAY).dateYmd).toBe('2026-11-06')
  })

  it('respeta una fecha explicita sobre el dia de la semana', () => {
    expect(parseWorkFacts('para el viernes 7 de noviembre', TODAY).dateYmd).toBe('2026-11-07')
    expect(parseWorkFacts('el 7 de noviembre', TODAY).dateYmd).toBe('2026-11-07')
    expect(parseWorkFacts('para el 7', TODAY).dateYmd).toBe('2026-11-07')
    expect(parseWorkFacts('05/11', TODAY).dateYmd).toBe('2026-11-05')
  })

  it('no inventa fecha si solo hablaron de la semana', () => {
    expect(parseWorkFacts('Crea una accion para cerrar evidencias de OTIF de la semana', TODAY)).toEqual({
      dateYmd: null,
      timeHm: null,
    })
  })

  it('toma hora cuando la dijeron', () => {
    expect(parseWorkFacts('para el 7 a las 10', TODAY)).toEqual({
      dateYmd: '2026-11-07',
      timeHm: '10:00',
    })
    expect(parseWorkFacts('manana a las 17:30', TODAY)).toEqual({
      dateYmd: '2026-11-04',
      timeHm: '17:30',
    })
  })

  it('la correccion mas reciente gana', () => {
    const facts = mergeWorkFacts('no, es el 7 de noviembre', 'crea accion para el viernes', TODAY)
    expect(formatDueHint(facts)).toBe('2026-11-07')
  })
})

describe('groundActionDrafts', () => {
  it('corrige la fecha del borrador y deja de pedirla', () => {
    const result: AssistantAudioResult = {
      transcript: 'Crea una accion para el viernes',
      validation: {
        status: 'needs_more_context',
        summary: '',
        missingPoints: ['fecha', 'responsable'],
        clarificationQuestions: [],
      },
      interpretation: { executiveSummary: '', signals: [], risks: [], opportunities: [] },
      nextSteps: [],
      actionDrafts: [
        {
          title: 'Cerrar evidencias',
          description: 'Cerrar evidencias de OTIF',
          objective: '',
          evidenceExpected: '',
          priority: 'P2_Media',
          leanWaste: '',
          eosComponent: '',
          ownerHint: null,
          dueDateHint: '2026-11-06',
          activities: [],
        },
      ],
    }

    const grounded = groundActionDrafts(
      result,
      'Crea una accion para el viernes',
      'no, es el 7 de noviembre',
      TODAY
    )
    expect(grounded.actionDrafts[0].dueDateHint).toBe('2026-11-07')
    expect(grounded.validation.missingPoints).toEqual(['responsable'])
  })
})
