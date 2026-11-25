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
