import { describe, expect, it } from 'vitest'
import {
  adaptV2TextToReportDocument,
  buildEnviardianReportDocument,
  serializeReportDocument,
  tryParseReportDocument,
} from './enviardianReportDocument'

describe('enviardianReportDocument', () => {
  it('serializes and parses a v3 document without inventing verified facts', () => {
    const doc = buildEnviardianReportDocument({
      topic: 'Inventarios',
      summary: 'Hay retraso en el conteo y falta un dueno claro del corte.',
      interviewOnly: true,
      said: ['El conteo se atrasa cada semana.'],
      llmFindings: [
        {
          title: 'Conteo atrasado',
          detail: 'El conteo se atrasa cada semana.',
          evidence: 'said',
          businessImpact: 'Riesgo de desabasto.',
        },
      ],
      agreed: [],
      pending: ['Definir responsable del corte'],
      recommendations: ['Revisar el corte el lunes'],
      verifiedLines: [],
    })
    const raw = serializeReportDocument(doc)
    const parsed = tryParseReportDocument(raw)
    expect(parsed?.version).toBe('enviardian-informe-v3')
    expect(parsed?.key_findings[0]?.evidence).toBe('said')
    expect(parsed?.verified_metrics).toEqual([])
    expect(parsed?.counts?.pendingDecisions).toBe(1)
  })

  it('adapts legacy v2 text into a presentation document', () => {
    const adapted = adaptV2TextToReportDocument({
      topic: 'OTIF',
      executiveReport: [
        'REPORTE EJECUTIVO — ENVIARDIAN',
        'RESUMEN EJECUTIVO',
        'Se hablo de OTIF y evidencias.',
        'HALLAZGOS',
        '- Situacion: Faltan evidencias de entrega.',
        'LO VERIFICADO',
        '- Evidencia Scrumban: get_my_actions: Cerrar OTIF',
        'DECISIONES Y ACUERDOS',
        '- Revisar el corte semanal',
        'RECOMENDACIONES',
        '1. Priorizar evidencias',
      ].join('\n'),
    })
    expect(adapted.key_findings.length).toBeGreaterThan(0)
    expect(adapted.confirmed_decisions[0]).toMatch(/corte/i)
    expect(adapted.recommendations[0]).toMatch(/evidencias/i)
    expect(adapted.evidence_sources.some((line) => /OTIF/i.test(line))).toBe(true)
  })

  it('never marks LLM findings as verified', () => {
    const doc = buildEnviardianReportDocument({
      summary: 'Resumen',
      llmFindings: [{ title: 'X', detail: 'Y', evidence: 'verified' }],
      verifiedLines: ['get_okr_progress: Objetivo A'],
    })
    expect(doc.key_findings.some((f) => f.evidence === 'verified')).toBe(true)
    const verified = doc.key_findings.filter((f) => f.evidence === 'verified')
    expect(verified.every((f) => /Objetivo A/i.test(f.detail + f.title))).toBe(true)
    expect(verified.every((f) => !/^get_okr_progress:/i.test(f.title))).toBe(true)
  })

  it('moves technical narratives out of business findings and bans undefined status', () => {
    const doc = buildEnviardianReportDocument({
      summary: 'Resumen',
      llmFindings: [
        { title: 'get_okr_progress: fallo', detail: 'PERMISSION_DENIED timeout', evidence: 'said' },
        { title: 'Avance OKR', detail: 'Capacidad Flexible en 81%', evidence: 'said' },
      ],
      commitments: [{ action: 'Revisar indicadores', status: 'undefined' }],
      technicalAttention: [{ code: 'TOOL_ERROR', message: 'get_okr_progress fallo', tool: 'get_okr_progress' }],
    })
    expect(doc.key_findings.every((f) => !/get_okr_progress|PERMISSION_DENIED/i.test(f.title + f.detail))).toBe(true)
    expect(doc.key_findings.some((f) => /Capacidad Flexible/i.test(f.detail))).toBe(true)
    expect(doc.confirmed_commitments.every((c) => c.status !== ('undefined' as never))).toBe(true)
    expect(doc.technical_attention?.some((t) => t.code === 'TOOL_ERROR')).toBe(true)
    expect(doc.counts?.technicalAttention).toBeGreaterThan(0)
  })
})
