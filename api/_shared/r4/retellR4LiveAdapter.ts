/**
 * Adaptador Retell R4 (independiente de Guía).
 * Fail-closed: nunca llama a la red en este incremento.
 */
import type { RetellSessionPort } from './contracts.js'
import { resolveRetellR4LiveGate } from './retellR4LiveGate.js'

export function createRetellR4LiveAdapter(
  env: Record<string, string | undefined> = {},
  fetchImpl?: typeof fetch
): RetellSessionPort & { lastGate: () => ReturnType<typeof resolveRetellR4LiveGate> } {
  let last = resolveRetellR4LiveGate(env)
  const fail = async (): Promise<
    Extract<Awaited<ReturnType<RetellSessionPort['start']>>, { ok: false }>
  > => {
    last = resolveRetellR4LiveGate(env)
    if (typeof fetchImpl === 'function') {
      /* no invocar: fail-closed aunque el caller inyecte fetch */
    }
    return { ok: false, error: last.error, code: 'unauthorized' }
  }
  return {
    lastGate: () => last,
    start: fail,
    speakTurn: fail,
    end: fail,
  }
}
