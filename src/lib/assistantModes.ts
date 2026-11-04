/** Un solo asistente operativo. Los IDs legacy se aceptan por compatibilidad de API. */
export type AssistantModeId =
  | 'operativo'
  | 'agile_eos_scalingup'
  | 'logistics'
  | 'okr_strategy'

export const UNIFIED_ASSISTANT_MODE: AssistantModeId = 'operativo'

export function isAssistantMode(mode: unknown): mode is AssistantModeId {
  return (
    mode === 'operativo' ||
    mode === 'agile_eos_scalingup' ||
    mode === 'logistics' ||
    mode === 'okr_strategy'
  )
}

export const assistantProfile = {
  id: UNIFIED_ASSISTANT_MODE,
  shortTitle: 'Operativo',
  title: 'Asesor operativo',
  description:
    'Ejecucion, logistica y OKRs en una sola atencion: prioriza el tablero, cierra acciones y corrige resultados.',
  welcome:
    'Hola, soy tu asesor operativo. Puedo priorizar el tablero, validar o desbloquear acciones, diagnosticar OKRs y revisar logistica u operacion. Que quieres atacar?',
} as const
