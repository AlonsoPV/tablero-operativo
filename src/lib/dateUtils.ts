/** Zona horaria de Ciudad de México */
const CDMX_TZ = 'America/Mexico_City'

/**
 * Fecha de hoy en CDMX (YYYY-MM-DD).
 */
export function todayCDMX(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: CDMX_TZ })
}

/** Formatea fecha/hora ISO para visualización en CDMX */
export function formatDateTimeCDMX(iso: string): string {
  return new Date(iso).toLocaleString('es-MX', {
    timeZone: CDMX_TZ,
    dateStyle: 'short',
    timeStyle: 'short',
  })
}
