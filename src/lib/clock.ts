/**
 * Instante "ahora" para la app (cliente).
 *
 * Si existe `VITE_DEV_FIXED_NOW` (ISO 8601, ej. `2026-04-10T16:58:00-06:00`), se usa esa fecha/hora
 * en lugar del reloj del sistema. Sirve para demos y pruebas reproducibles.
 * En producción no definas esta variable.
 */
export function getAppNow(): Date {
  const raw = import.meta.env.VITE_DEV_FIXED_NOW as string | undefined
  if (raw?.trim()) {
    const d = new Date(raw.trim())
    if (!Number.isNaN(d.getTime())) return d
  }
  return new Date()
}

/** Epoch ms alineado con `getAppNow()` (sustituto de `Date.now()` donde importe coherencia con la fecha fija). */
export function getAppTimeMs(): number {
  return getAppNow().getTime()
}
