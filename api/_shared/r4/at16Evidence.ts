/**
 * Harness sintético AT-16. Reutiliza decideReportAction y el PDF de Guía
 * sin invocar finalizeGuideInterview productivo.
 */
import { decideReportAction, type GuideReportStatus } from '../guideInterviewReport.js'
import { evidenceLabel, type EvidenceKind } from '../../../src/features/guide/enviardianReportDocument.js'
import { presentationToPdfLines } from '../../../src/features/guide/guideReportPdf.js'
import { validateGuideReportForPdf } from '../../../src/features/guide/guideReportPresentation.js'
import { createOnceReportFinalizer } from './reportFinalize.js'

export type SyntheticEvidenceInput = {
  ownerUsuarioId: string
  readerUsuarioId: string
  sessionId: string
  reportStatus: GuideReportStatus | null
  hasJournal: boolean
  executiveReport: string
  findings: Array<{ title: string; detail: string; evidence: EvidenceKind }>
}

export function canReadSyntheticReport(input: {
  ownerUsuarioId: string
  readerUsuarioId: string
}): boolean {
  return input.ownerUsuarioId === input.readerUsuarioId
}

export function syntheticAt16Source(input: SyntheticEvidenceInput) {
  return {
    id: `entry-${input.sessionId}`,
    session_id: input.sessionId,
    topic: 'Seguimiento operativo',
    created_at: '2026-11-22T18:00:00.000Z',
    executive_report: input.executiveReport,
    summary: input.executiveReport.slice(0, 180),
  }
}

export function evaluateAt16Evidence(input: SyntheticEvidenceInput) {
  const readable = canReadSyntheticReport(input)
  const decision = decideReportAction({
    event: 'call_analyzed',
    current: input.reportStatus,
    depth: 'ready',
    hasJournal: input.hasJournal,
  })
  const finalizer = createOnceReportFinalizer(() => '2026-11-22T18:05:00.000Z')
  const first = finalizer.finalize({ sessionId: input.sessionId, source: 'voice' })
  const second = finalizer.finalize({ sessionId: input.sessionId, source: 'voice' })
  const pdf = readable
    ? validateGuideReportForPdf(syntheticAt16Source(input), '2026-11-22T18:06:00.000Z')
    : { ok: false, errors: ['Sin permiso de lectura'], warnings: [], presentation: null }
  const lines = pdf.presentation ? presentationToPdfLines(pdf.presentation) : []
  const provenance = input.findings.map((item) => ({
    title: item.title,
    label: evidenceLabel(item.evidence),
  }))

  return {
    readable,
    decision,
    reportDuplicate: second.duplicate,
    firstReportId: first.report.sessionId,
    pdfOk: pdf.ok,
    pdfErrors: pdf.errors,
    pdfLineCount: lines.length,
    provenance,
  }
}
