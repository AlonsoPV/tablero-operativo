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
    expect(buildGuideReportFilename({ interviewAt: '2026-11-10T12:00:00.000Z', entryId: 'abc', topic: 'Operacion' })).toContain(
      '2026-11-10'
    )
  })
})
