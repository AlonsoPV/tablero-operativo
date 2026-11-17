import { describe, expect, it } from 'vitest'
import {
  buildGuideReportFilename,
  buildGuideReportPresentation,
  formatReportDateTimeCDMX,
  reportDateKeyCDMX,
  validateGuideReportForPdf,
} from './guideReportPresentation'

describe('guideReportPresentation dates', () => {
  it('keeps calendar day stable around CDMX midnight boundaries', () => {
    // 2026-11-11 05:30 UTC = 2026-11-10 23:30 CDMX
    expect(reportDateKeyCDMX('2026-11-11T05:30:00.000Z')).toBe('2026-11-10')
    // 2026-11-11 06:30 UTC = 2026-11-11 00:30 CDMX
    expect(reportDateKeyCDMX('2026-11-11T06:30:00.000Z')).toBe('2026-11-11')
  })

  it('never substitutes missing interview dates with export time', () => {
    const presentation = buildGuideReportPresentation(
      {
        topic: 'Sin fecha',
        summary: 'Solo hay un resumen almacenado.',
        created_at: null,
      },
      '2026-12-01T15:00:00.000Z'
    )
    expect(presentation.interviewAtLabel).toBe('Fecha de entrevista no disponible')
    expect(presentation.generatedAtLabel).toMatch(/diciembre de 2026/i)
    expect(formatReportDateTimeCDMX(undefined)).toBeNull()
  })

  it('does not invent owners or commitments in filename or sections', () => {
    const validation = validateGuideReportForPdf(
      {
        id: 'abc',
        topic: 'Operacion',
        created_at: '2026-11-10T12:00:00.000Z',
        executive_report: 'SITUACION\nHay retrasos.\n',
      },
      '2026-11-10T13:00:00.000Z'
    )
    expect(validation.ok).toBe(true)
    const blob = JSON.stringify(validation.presentation)
    expect(blob).not.toMatch(/responsable inventado|compromiso inventado/i)
    expect(validation.presentation?.document?.version).toBe('enviardian-informe-v3')
    expect(buildGuideReportFilename({ interviewAt: '2026-11-10T12:00:00.000Z', entryId: 'abc', topic: 'Operacion' })).toContain(
      '2026-11-10'
    )
  })

  it('builds overview sections from a v3 JSON document', () => {
    const presentation = buildGuideReportPresentation(
      {
        topic: 'OTIF',
        created_at: '2026-11-12T18:00:00.000Z',
        executive_report: JSON.stringify({
          version: 'enviardian-informe-v3',
          metadata: { topic: 'OTIF', generationStatus: 'ready' },
          executive_summary: {
            text: 'Hay retraso de evidencias y falta dueno del corte.',
            headlineFinding: 'Evidencias incompletas',
            nextStep: 'Revisar el corte el lunes',
          },
          key_findings: [
            {
              title: 'Evidencias incompletas',
              detail: 'Faltan evidencias de entrega.',
              evidence: 'said',
            },
          ],
          verified_metrics: [],
          risks: [],
          confirmed_decisions: [],
          pending_decisions: ['Definir responsable'],
          recommendations: ['Priorizar OTIF'],
          confirmed_commitments: [
            { action: 'Revisar el corte el lunes', status: 'proposal' },
          ],
          evidence_sources: [],
        }),
      },
      '2026-11-12T19:00:00.000Z'
    )
    expect(presentation.sections[0]?.title).toMatch(/resumen/i)
    expect(presentation.sections.some((s) => /01 · Resultados/i.test(s.title))).toBe(true)
    expect(presentation.sections.some((s) => /02 · Analisis/i.test(s.title))).toBe(true)
    expect(presentation.sections.some((s) => /03 · Pendientes/i.test(s.title))).toBe(true)
    expect(presentation.sections.some((s) => s.kind === 'ai')).toBe(true)
    expect(presentation.document?.executive_summary.nextStep).toMatch(/corte/i)
    const blob = presentation.sections.map((s) => s.body).join('\n')
    expect(blob).toMatch(/Hallazgos:/i)
    expect(blob).toMatch(/Recomendaciones de Enviardian/i)
    expect(blob).not.toMatch(/Hallazgos prioritarios/i)
  })
})
