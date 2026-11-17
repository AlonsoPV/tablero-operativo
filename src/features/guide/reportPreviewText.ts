import { resolveReportDocument } from '@/features/guide/enviardianReportDocument'
import type { GuideJournalEntry } from '@/features/guide/types'

export function reportStatusLabel(status: GuideJournalEntry['report_status']) {
  if (status === 'processing') return 'Procesando informe'
  if (status === 'pending') return 'Informe pendiente'
  if (status === 'failed') return 'Informe no generado'
  if (status === 'insufficient') return 'Entrevista breve'
  if (status === 'ready') return 'Informe listo'
  return null
}

/** Texto corto legible para listas; nunca el JSON crudo de v3. */
export function reportPreviewText(entry: {
  executive_report?: string | null
  summary?: string | null
  topic?: string | null
  agent_inferences?: string | null
  report_status?: GuideJournalEntry['report_status']
}) {
  const doc = resolveReportDocument({
    executiveReport: entry.executive_report,
    summary: entry.summary,
    topic: entry.topic,
  })
  if (doc) {
    return (
      doc.executive_summary.text ||
      doc.executive_summary.headlineFinding ||
      doc.metadata.topic ||
      entry.summary ||
      'Informe listo'
    )
  }

  if (entry.executive_report?.trim()) {
    const raw = entry.executive_report.trim()
    if (!raw.startsWith('{')) {
      return raw.split('\n').filter(Boolean).slice(0, 2).join(' ')
    }
  }

  const status = reportStatusLabel(entry.report_status)
  if (status && !entry.summary?.trim()) return status
  return entry.summary?.trim() || entry.agent_inferences?.trim() || status || 'Sesion con Guia lista para revisar.'
}
