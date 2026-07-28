export const FECHA_COMPROMISO_CHANGE_REASONS = [
  {
    key: 'planeacion_trabajo',
    label: 'Planeacion del trabajo',
    description: 'La estimacion o la fecha acordada no fueron realistas.',
  },
  {
    key: 'dependencias',
    label: 'Dependencias',
    description: 'Se esperaba a otra persona, area, cliente o proveedor.',
  },
  {
    key: 'recursos_capacidad',
    label: 'Recursos o capacidad',
    description: 'Faltaban herramientas, accesos, personal o existio una sobrecarga de trabajo.',
  },
  {
    key: 'cambios_compromiso',
    label: 'Cambios en el compromiso',
    description: 'El alcance o la prioridad cambiaron despues de iniciado.',
  },
] as const

export type FechaCompromisoChangeReasonKey =
  (typeof FECHA_COMPROMISO_CHANGE_REASONS)[number]['key']

export function getFechaCompromisoChangeReason(key: string | null | undefined) {
  return FECHA_COMPROMISO_CHANGE_REASONS.find((reason) => reason.key === key) ?? null
}

export function isFechaCompromisoChangeReasonKey(
  value: string | null | undefined
): value is FechaCompromisoChangeReasonKey {
  return FECHA_COMPROMISO_CHANGE_REASONS.some((reason) => reason.key === value)
}
