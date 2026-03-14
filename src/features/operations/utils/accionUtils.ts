import type { AccionDiaria } from '@/types'

/** Indica si la acción está en retraso: fecha límite pasada y no completada. */
export function isEnRetraso(a: AccionDiaria): boolean {
  if (a.estado === 'Hecho' || a.estado === 'Verificado') return false
  const hora = a.hora_limite?.slice(0, 5) ?? '23:59'
  const limite = new Date(`${a.fecha}T${hora}:00`)
  return limite.getTime() < Date.now()
}
