export const DEFAULT_PRIORITY_NOMBRE = 'P2_Media'

export function priorityDisplayLabel(nombre: string): string {
  const key = nombre.trim()
  return key.length > 0 ? key : 'Sin prioridad'
}
