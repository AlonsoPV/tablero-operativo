/** Estimacion grosera: ~4 caracteres por token en espanol tecnico. */
export function estimateTokensFromChars(chars: number): number {
  return Math.ceil(Math.max(0, chars) / 4)
}

export function estimateContextChars(payload: unknown): number {
  try {
    return JSON.stringify(payload ?? null).length
  } catch {
    return 0
  }
}
