/**
 * Instante "ahora" para la app (cliente).
 *
 * Si existe `VITE_DEV_FIXED_NOW` (ISO 8601, ej. `2026-04-10T16:58:00-06:00`), se usa esa fecha/hora
 * en lugar del reloj del sistema. Sirve para demos y pruebas reproducibles.
 * En producción no definas esta variable.
 */
type ViteImportMeta = ImportMeta & { env?: { VITE_DEV_FIXED_NOW?: string } }

function readNodeEnv(name: string): string | undefined {
  const runtime = globalThis as typeof globalThis & {
    process?: { env?: Record<string, string | undefined> }
  }
  const value = runtime.process?.env?.[name]
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function readFixedNow(): string | undefined {
  const fromProcess = readNodeEnv('VITE_DEV_FIXED_NOW')
  if (fromProcess) return fromProcess
  try {
    return (import.meta as ViteImportMeta).env?.VITE_DEV_FIXED_NOW?.trim() || undefined
  } catch {
    return undefined
  }
}

export function getAppNow(): Date {
  const raw = readFixedNow()
  if (raw) {
    const d = new Date(raw)
    if (!Number.isNaN(d.getTime())) return d
  }
  return new Date()
}

/** Epoch ms alineado con `getAppNow()` (sustituto de `Date.now()` donde importe coherencia con la fecha fija). */
export function getAppTimeMs(): number {
  return getAppNow().getTime()
}
