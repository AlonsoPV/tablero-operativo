/** Valor persistido cuando la acción no exige evidencia (cumple CHECK length >= 5 en BD). */
export const EVIDENCIA_NO_REQUIERE = 'No requiere evidencia'

const NO_EVIDENCIA_ALIASES = new Set([
  '',
  'opcional',
  'no aplica',
  'n/a',
  'na',
  'sin evidencia',
  'sin evidencia requerida',
  'no requiere evidencia',
])

function normalizeAlias(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
}

/** True cuando el texto indica que no se pide evidencia. */
export function isEvidenciaNoRequerida(value: string | null | undefined): boolean {
  if (value == null) return true
  return NO_EVIDENCIA_ALIASES.has(normalizeAlias(value))
}

/** Normaliza a sentinel de BD o deja el texto de evidencia elegido. */
export function normalizeEvidenciaEsperada(value: string | null | undefined): string {
  const trimmed = (value ?? '').trim()
  if (isEvidenciaNoRequerida(trimmed)) return EVIDENCIA_NO_REQUIERE
  return trimmed
}
