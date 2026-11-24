/** Preferido cuando GEMINI_MODEL no está definido. */
export const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash-lite'

/** Fallbacks si el modelo preferido responde 429/500/503 (capacidad / saturación). */
export const GEMINI_FALLBACK_MODELS = [
  'gemini-3.5-flash-lite',
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
] as const

/**
 * Acepta IDs de API (`gemini-3.1-flash-lite`) y nombres de UI
 * (`Gemini 3.1 Flash Lite`). El generateContent exige el ID con guiones.
 */
export function normalizeGeminiModel(
  model: string | undefined | null,
  fallback: string = DEFAULT_GEMINI_MODEL,
): string {
  const raw = String(model ?? '')
    .trim()
    .replace(/^models\//i, '')
  if (!raw) return fallback
  if (/^gemini-[\w.-]+$/i.test(raw)) return raw.toLowerCase()
  const slug = raw
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, '-')
    .replace(/\.(?!\d)/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || fallback
}

export function geminiModelCandidates(preferred?: string | null): string[] {
  const primary = normalizeGeminiModel(preferred)
  const seen = new Set<string>([primary])
  const list = [primary]
  for (const model of GEMINI_FALLBACK_MODELS) {
    if (seen.has(model)) continue
    seen.add(model)
    list.push(model)
  }
  return list
}

export function isGeminiCapacityStatus(status: number): boolean {
  return status === 429 || status === 500 || status === 503
}

/** Un reintento corto en el mismo modelo antes de pasar al fallback. */
export const GEMINI_CAPACITY_RETRY_MS = 280

export function geminiErrorStatus(error: unknown): number {
  if (error && typeof error === 'object' && typeof (error as { status?: unknown }).status === 'number') {
    return (error as { status: number }).status
  }
  return 0
}

export async function sleepMs(ms: number): Promise<void> {
  if (ms <= 0) return
  await new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Reintenta una lectura Gemini saturada (429/500/503) una vez, con backoff.
 * No usar alrededor de escrituras: el callback debe ser idempotente o de sólo lectura.
 */
export async function withGeminiCapacityRetry<T>(
  run: () => Promise<T>,
  options?: { retryMs?: number; sleep?: (ms: number) => Promise<void> }
): Promise<T> {
  try {
    return await run()
  } catch (error) {
    const status = geminiErrorStatus(error)
    if (!isGeminiCapacityStatus(status)) throw error
    await (options?.sleep ?? sleepMs)(options?.retryMs ?? GEMINI_CAPACITY_RETRY_MS)
    return await run()
  }
}
