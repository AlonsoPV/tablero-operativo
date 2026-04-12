import { getAppNow } from './clock'

/**
 * Mes vigente del programa O2C (1–18), según fecha de inicio configurada.
 *
 * Definir `VITE_O2C_PROGRAM_START` en `.env` como ISO **YYYY-MM-DD** (primer día del **primer mes del
 * programa** O2C, no necesariamente enero). Si no está definido o es inválido, las funciones que dependen
 * del mes devuelven `null` y la vista MD usa solo meta M18 (fallback).
 */
const MAX_MONTH = 18

function parseProgramStart(): Date | null {
  const raw = import.meta.env.VITE_O2C_PROGRAM_START as string | undefined
  if (!raw?.trim()) return null
  const d = new Date(raw.trim())
  if (Number.isNaN(d.getTime())) return null
  return d
}

/**
 * Índice de mes de programa 1–18 o `null` si no hay calendario configurado.
 */
export function getO2cProgramMonthIndex(now: Date = getAppNow()): number | null {
  const start = parseProgramStart()
  if (!start) return null
  const months =
    (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth())
  const idx = months + 1
  if (idx < 1) return 1
  if (idx > MAX_MONTH) return MAX_MONTH
  return idx
}

export function isO2cProgramStartConfigured(): boolean {
  return parseProgramStart() != null
}
