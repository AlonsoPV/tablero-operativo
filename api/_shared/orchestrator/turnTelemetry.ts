/**
 * Telemetría real por turno del orquestador (sin latencias simuladas).
 * Instrumenta tiempos reales de interpretación, resolución de entidades,
 * generación de propuesta, ejecución y latencia total, además de p50/p95 reales.
 */

export type TurnTelemetry = {
  channel: string
  transcriptionMs?: number | null
  interpretationMs: number
  entityResolutionMs: number
  proposalMs: number
  executionMs: number
  totalMs: number
  clarificationCount: number
  usedLlm: boolean
  multiIntentCount: number
}

export type LatencyPercentileStats = {
  count: number
  p50Ms: number
  p95Ms: number
  maxMs: number
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1))
  return sorted[idx] ?? 0
}

/** Calcula p50, p95 y máximo sobre muestras reales medidas en ejecución. */
export function computeLatencyPercentiles(samples: number[]): LatencyPercentileStats {
  const clean = samples.filter((n) => Number.isFinite(n) && n >= 0).sort((a, b) => a - b)
  if (clean.length === 0) {
    return { count: 0, p50Ms: 0, p95Ms: 0, maxMs: 0 }
  }
  return {
    count: clean.length,
    p50Ms: percentile(clean, 0.5),
    p95Ms: percentile(clean, 0.95),
    maxMs: clean[clean.length - 1] ?? 0,
  }
}

export class TurnTimer {
  private readonly now: () => number
  private readonly started: number
  private interpretationMs = 0
  private entityResolutionMs = 0
  private proposalMs = 0
  private executionMs = 0

  constructor(now: () => number = () => Date.now()) {
    this.now = now
    this.started = now()
  }

  recordInterpretation(ms: number) {
    this.interpretationMs += Math.max(0, ms)
  }

  recordEntityResolution(ms: number) {
    this.entityResolutionMs += Math.max(0, ms)
  }

  recordProposal(ms: number) {
    this.proposalMs += Math.max(0, ms)
  }

  recordExecution(ms: number) {
    this.executionMs += Math.max(0, ms)
  }

  finish(meta: {
    channel: string
    transcriptionMs?: number | null
    clarificationCount: number
    usedLlm: boolean
    multiIntentCount?: number
  }): TurnTelemetry {
    const totalMs = Math.max(0, this.now() - this.started)
    return {
      channel: meta.channel,
      ...(meta.transcriptionMs !== undefined ? { transcriptionMs: meta.transcriptionMs } : {}),
      interpretationMs: this.interpretationMs,
      entityResolutionMs: this.entityResolutionMs,
      proposalMs: this.proposalMs,
      executionMs: this.executionMs,
      totalMs,
      clarificationCount: meta.clarificationCount,
      usedLlm: meta.usedLlm,
      multiIntentCount: meta.multiIntentCount ?? 1,
    }
  }
}
