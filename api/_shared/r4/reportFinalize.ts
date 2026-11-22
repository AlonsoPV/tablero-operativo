/**
 * Finalización única de reporte de sesión (preparación AT-14 / AT-16).
 * Puro y local: no escribe DB ni llama a finalizeGuideInterview.
 */

export type SimulatedReportFinalize = {
  sessionId: string
  finalizedAt: string
  source: 'voice' | 'link'
}

export function createOnceReportFinalizer(now: () => string = () => new Date().toISOString()) {
  const done = new Map<string, SimulatedReportFinalize>()
  return {
    finalize(input: { sessionId: string; source: 'voice' | 'link' }) {
      const existing = done.get(input.sessionId)
      if (existing) {
        return { ok: true as const, duplicate: true as const, report: existing }
      }
      const report: SimulatedReportFinalize = {
        sessionId: input.sessionId,
        finalizedAt: now(),
        source: input.source,
      }
      done.set(input.sessionId, report)
      return { ok: true as const, duplicate: false as const, report }
    },
    get(sessionId: string) {
      return done.get(sessionId) ?? null
    },
  }
}
