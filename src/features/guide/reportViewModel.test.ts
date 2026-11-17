import { describe, expect, it } from 'vitest'
import { serializeReportDocument, buildEnviardianReportDocument } from './enviardianReportDocument'
import {
  buildReportViewModel,
  parseRecommendationText,
} from './reportViewModel'

describe('reportViewModel', () => {
  it('parses recommendation what/why/outcome when present', () => {
    expect(
      parseRecommendationText(
        'Revisar el corte el lunes porque faltan evidencias para cerrar OTIF'
      )
    ).toEqual({
      text: 'Revisar el corte el lunes porque faltan evidencias para cerrar OTIF',
      what: 'Revisar el corte el lunes',
      why: 'faltan evidencias',
      outcome: 'cerrar OTIF',
    })
  })

  it('dedupes recommendations out of follow-ups and counts pending review', () => {
    const doc = buildEnviardianReportDocument({
      topic: 'OTIF',
      summary: 'Hay retraso de evidencias y falta dueno del corte.',
      headlineFinding: 'Evidencias incompletas',
      said: ['Faltan evidencias de entrega.'],
      llmFindings: [
        {
          title: 'Evidencias incompletas',
          detail: 'Faltan evidencias de entrega.',
          evidence: 'said',
        },
      ],
      recommendations: ['Priorizar evidencias'],
      pending: ['Definir responsable'],
      createdWork: [
        { title: 'Corte OTIF', id: 'a1', pending: false },
        { title: 'Avisar lider', id: 'a2', pending: true },
      ],
      commitments: [{ action: 'Avisar lider', status: 'proposal' }],
    })

    const vm = buildReportViewModel({
      executiveReport: serializeReportDocument(doc),
      topic: 'OTIF',
      createdAt: '2026-11-12T18:00:00.000Z',
      createdWork: [
        { kind: 'action', id: 'a1', title: 'Corte OTIF', pending: false },
        { kind: 'action', id: 'a2', title: 'Avisar lider', pending: true },
      ],
      communications: [
        {
          id: 'op1',
          title: 'WhatsApp a Carlos',
          status: 'pending',
          tool: 'whatsapp_prepare_send',
        },
      ],
    })

    expect(vm).not.toBeNull()
    expect(vm!.block2.recommendations.map((r) => r.text)).toEqual(['Priorizar evidencias'])
    expect(vm!.block3.executed.map((i) => i.title)).toEqual(['Corte OTIF'])
    expect(vm!.block3.communicationOps.map((i) => i.id)).toEqual(['op1'])
    expect(vm!.block3.boardOps).toEqual([])
    // Contador solo desde ops persistidas (no decisiones/compromisos narrativos).
    expect(vm!.hero.pendingReviewCount).toBe(1)
    expect(vm!.block3.narrativeNotes.pendingDecisions).toEqual(['Definir responsable'])
    expect(vm!.stats.some((s) => /solicitud/i.test(s.text))).toBe(true)
    expect(vm!.document.session_actions.every((a) => a.status !== 'recommendation')).toBe(true)
  })
})
