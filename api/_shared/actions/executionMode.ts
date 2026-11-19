/**
 * Modo de ejecución de operaciones R2.
 * disabled: valor por defecto y único posible en Vercel/producción.
 * simulated: sólo pruebas y desarrollo local, con adaptadores en memoria (sin BD real ni proveedores).
 */
export const R2_EXECUTION_MODES = ['disabled', 'simulated'] as const
export type R2ExecutionMode = (typeof R2_EXECUTION_MODES)[number]

export const R2_EXECUTION_DISABLED_MESSAGE =
  'EXECUTION_DISABLED: La ejecución de operaciones no está habilitada en este canal. La propuesta no se aplicó.'

export function resolveR2ExecutionMode(env: Record<string, string | undefined> = process.env): R2ExecutionMode {
  if (env.VERCEL || env.VERCEL_ENV || env.NODE_ENV === 'production') return 'disabled'
  return env.R2_EXECUTION_MODE === 'simulated' ? 'simulated' : 'disabled'
}
