import { describe, expect, it } from 'vitest'
import type { AssistantAudioResult } from '@/lib/assistantAudioClient'
import { buildCreateApprovalMessage } from './createWorkReply'

function result(partial: Partial<AssistantAudioResult>): AssistantAudioResult {
  return {
    transcript: '',
    interpretation: {
      executiveSummary: '',
      signals: [],
      risks: [],
      opportunities: [],
    },
    nextSteps: [],
    actionDrafts: [],
    ...partial,
    validation: {
      status: 'usable',
      summary: '',
      missingPoints: [],
      clarificationQuestions: [],
      ...partial.validation,
    },
  }
}

describe('buildCreateApprovalMessage', () => {
  it('arma propuesta para aprobar y pide validar lo que falta', () => {
    const message = buildCreateApprovalMessage(
      result({
        actionDrafts: [
          {
            title: 'Cerrar evidencias de OTIF',
            description: 'Cerrar huecos de evidencia en el tablero.',
            objective: '',
            evidenceExpected: '',
            priority: 'P1_Alta',
            leanWaste: '',
            eosComponent: '',
            ownerHint: null,
            dueDateHint: null,
            activities: [],
          },
        ],
        validation: {
          status: 'needs_more_context',
          summary: '',
          missingPoints: ['responsable', 'fecha de cierre'],
          clarificationQuestions: [],
        },
      })
    )
    expect(message).toContain('Propuesta lista para aprobar: Cerrar evidencias de OTIF.')
    expect(message).toContain('Valida o completa: responsable; fecha de cierre.')
  })

  it('eco la fecha cuando ya esta en el borrador', () => {
    const message = buildCreateApprovalMessage(
      result({
        actionDrafts: [
          {
            title: 'Cerrar evidencias de OTIF',
            description: 'Cerrar huecos de evidencia.',
            objective: '',
            evidenceExpected: '',
            priority: 'P1_Alta',
            leanWaste: '',
            eosComponent: '',
            ownerHint: null,
            dueDateHint: '2026-11-07',
            activities: [],
          },
        ],
      })
    )
    expect(message).toContain('Fecha:')
    expect(message).toContain('Si esta bien, apruebala.')
  })

  it('pide lo minimo si no hay titulo suficiente', () => {
    const message = buildCreateApprovalMessage(
      result({
        validation: {
          status: 'needs_more_context',
          summary: '',
          missingPoints: [],
          clarificationQuestions: ['Que resultado quieres lograr?'],
        },
      })
    )
    expect(message).toBe('Aun no hay propuesta para aprobar. Que resultado quieres lograr?')
  })
})
