import { describe, expect, it } from 'vitest'
import {
  buildGuideReportPdfFromSource,
  buildReportPdf,
  paginateReportLines,
  presentationToPdfLines,
  presentationToPreviewHtml,
  reportToPdfLines,
  type PdfLine,
} from './guideReportPdf'
import {
  buildGuideReportFilename,
  buildGuideReportPresentation,
  formatReportDateTimeCDMX,
  reportDateKeyCDMX,
  validateGuideReportForPdf,
} from './guideReportPresentation'

const SAMPLE_REPORT = `REPORTE EJECUTIVO — GUIA

SITUACION
El equipo no cierra bloqueos a tiempo.

DIAGNOSTICO
Los bloqueos se enteran tarde.

PRIORIDADES
1. Revisar el viernes.
2. Definir dueño por iniciativa.

PROXIMOS PASOS
Agendar revision semanal.

PARA APROBAR
No debe aparecer en el PDF.`

describe('guide report presentation', () => {
  it('formats interview dates in CDMX without inventing values', () => {
    expect(reportDateKeyCDMX('2026-11-10T18:39:00.000Z')).toBe('2026-11-10')
    expect(formatReportDateTimeCDMX('2026-11-10T18:39:00.000Z')).toMatch(/noviembre de 2026/i)
    expect(formatReportDateTimeCDMX(null)).toBeNull()
    expect(formatReportDateTimeCDMX('no-es-fecha')).toBeNull()
  })

  it('builds a safe filename from real interview data', () => {
    const name = buildGuideReportFilename({
      interviewAt: '2026-11-10T18:39:00.000Z',
      entryId: '187ac948-a935-4ccd-91a4-48919f076b9e',
      topic: 'Seguimiento de Acciones y OKRs',
    })
    expect(name).toBe('Enviardian_Informe_2026-11-10_Seguimiento_de_Acciones_187ac948.pdf')
  })

  it('uses the stored report and omits approval drafts', () => {
    const presentation = buildGuideReportPresentation(
      {
        id: 'entry-1',
        session_id: 'session-abcdef12',
        topic: 'Seguimiento',
        created_at: '2026-11-10T18:39:00.000Z',
        executive_report: SAMPLE_REPORT,
        learning: 'La visibilidad temprana evita retrasos.',
        intention: 'Cerrar bloqueos en 48 horas.',
      },
      '2026-11-10T20:00:00.000Z'
    )
    const titles = presentation.sections.map((section) => section.title)
    expect(titles).toContain('Situacion')
    expect(titles).toContain('Diagnostico')
    expect(titles).toContain('Prioridades')
    expect(titles).toContain('Proximos pasos')
    expect(titles).toContain('Aprendizaje')
    expect(titles).toContain('Intencion')
    expect(titles.join(' ')).not.toMatch(/para aprobar/i)
    expect(presentation.sections.some((section) => /No debe aparecer/i.test(section.body))).toBe(
      false
    )
  })

  it('rejects empty reports without inventing content', () => {
    const validation = validateGuideReportForPdf(
      { topic: 'Vacio', executive_report: '', summary: '' },
      '2026-11-10T20:00:00.000Z'
    )
    expect(validation.ok).toBe(false)
    expect(validation.presentation).toBeNull()
    expect(validation.errors[0]).toMatch(/informe almacenado/i)
  })
})

describe('guide report pdf', () => {
  it('keeps a heading with the following paragraph', () => {
    const lines: PdfLine[] = []
    for (let index = 0; index < 44; index += 1) lines.push({ kind: 'body', text: `linea ${index}` })
    lines.push({ kind: 'heading', text: 'DIAGNOSTICO' })
    lines.push({ kind: 'body', text: 'Solo lo dicho en la entrevista.' })
    const pages = paginateReportLines(lines)
    const withHeading = pages.find((page) => page.some((line) => line.text === 'DIAGNOSTICO'))
    const headingAt = withHeading?.findIndex((line) => line.text === 'DIAGNOSTICO') ?? -1
    expect(pages[0]?.some((line) => line.text === 'DIAGNOSTICO')).toBe(false)
    expect(headingAt).toBeGreaterThanOrEqual(0)
    expect(withHeading?.[headingAt + 1]?.text).toContain('entrevista')
  })

  it('builds a paged letter PDF from the saved report without extra claims', () => {
    const built = buildGuideReportPdfFromSource(
      {
        id: '187ac948-a935-4ccd-91a4-48919f076b9e',
        topic: 'Seguimiento',
        created_at: '2026-11-10T18:39:00.000Z',
        executive_report: SAMPLE_REPORT,
      },
      '2026-11-10T20:00:00.000Z'
    )
    expect(built.ok).toBe(true)
    expect(built.pdf?.startsWith('%PDF-1.4')).toBe(true)
    expect(built.pdf).toContain('MediaBox [0 0 612 792]')
    expect(built.pdf).toContain('Seguimiento')
    expect(built.pdf).toContain('Revisar el viernes')
    expect(built.pdf).not.toContain('No debe aparecer')
    expect(built.filename).toMatch(/^Enviardian_Informe_2026-11-10_/)
  })

  it('prints the same sections the historial presentation parsed', () => {
    const source = {
      id: '187ac948-a935-4ccd-91a4-48919f076b9e',
      topic: 'Inventarios',
      created_at: '2026-11-12T18:00:00.000Z',
      executive_report: [
        'REPORTE EJECUTIVO — ENVIARDIAN',
        'Generador: enviardian-informe-v1',
        'Modalidad: entrevista por voz',
        '',
        'LO DICHO',
        '- El conteo se atrasa.',
        '',
        'LO VERIFICADO',
        'Este informe se basa solo en la entrevista. No hubo una consulta exitosa al tablero.',
        '',
        'LO ACORDADO',
        'No hubo acuerdos en la entrevista.',
        '',
        'RECOMENDACIONES',
        '1. Revisar el corte.',
        '',
        'PLAN DE ACCION',
        '- Sin acciones en esta entrevista | Por definir | Por definir | Sin propuesta',
      ].join('\n'),
    }
    const presentation = buildGuideReportPresentation(source, '2026-11-12T18:20:00.000Z')
    const pdfText = presentationToPdfLines(presentation)
      .map((line) => line.text)
      .join('\n')
    expect(presentation.brand).toBe('Scrumban · Enviardian')
    expect(presentation.sections.map((section) => section.title)).toEqual(
      expect.arrayContaining(['Lo dicho', 'Lo verificado', 'Lo acordado', 'Recomendaciones', 'Plan de accion'])
    )
    for (const section of presentation.sections) {
      expect(pdfText).toContain(section.title.toUpperCase())
      expect(pdfText).toContain(section.body.split('\n')[0] ?? '')
    }
    expect(pdfText).toContain('se basa solo en la entrevista')
    expect(pdfText).not.toContain('responsable inventado')
  })

  it('legacy reportToPdfLines stays deterministic and content-bound', () => {
    const lines = reportToPdfLines({
      topic: 'Seguimiento',
      dateLabel: '10 nov 2026',
      createdAt: '2026-11-10T18:39:00.000Z',
      executiveReport: SAMPLE_REPORT,
    })
    const pdf = buildReportPdf(lines)
    expect(pdf.startsWith('%PDF-1.4')).toBe(true)
    expect(lines.some((line) => /responsable/i.test(line.text))).toBe(false)
  })

  it('preview html mirrors the same validated sections for visual QA', () => {
    const presentation = buildGuideReportPresentation(
      {
        topic: 'QA visual',
        created_at: '2026-11-10T18:39:00.000Z',
        executive_report: SAMPLE_REPORT,
      },
      '2026-11-10T20:00:00.000Z'
    )
    const html = presentationToPreviewHtml(presentation)
    const lines = presentationToPdfLines(presentation)
    expect(html).toContain('QA visual')
    expect(html).toContain('Situacion')
    expect(html).not.toContain('No debe aparecer')
    expect(lines.some((line) => line.kind === 'heading' && line.text === 'SITUACION')).toBe(true)
  })
})
