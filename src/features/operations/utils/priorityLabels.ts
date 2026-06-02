/** Etiquetas cortas para prioridades conocidas del catálogo O2C. */
const KNOWN_PRIORITY_LABELS: Record<string, string> = {
  P1_Critica: 'Crítica',
  P2_Media: 'Media',
  P3_Baja: 'Baja',
}

export const DEFAULT_PRIORITY_NOMBRE = 'P2_Media'

export function priorityDisplayLabel(nombre: string, descripcion?: string | null): string {
  const key = nombre.trim()
  if (KNOWN_PRIORITY_LABELS[key]) return KNOWN_PRIORITY_LABELS[key]
  if (descripcion?.trim()) {
    const first = descripcion.split(/[.:]/)[0]?.trim()
    if (first && first.length <= 48) return first
  }
  return key.replace(/_/g, ' ')
}
