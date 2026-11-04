/** Default estable si no hay GEMINI_MODEL. */
export const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash-lite'

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
