/**
 * Fase 1 local: aislamiento de ejecución y refs bloqueadas.
 * No habla con red. No es H-01…H-10 remoto ni GO QA.
 */
import { describe, expect, it } from 'vitest'
import {
  BLOCKED_PROJECT_REFS,
  qaProjectRef,
  resolveR2ExecutionMode,
} from './executionMode.js'

describe('QA isolation · local (Fase 1)', () => {
  it('R2 queda disabled sin flags y nunca habilita qa contra DEV/PROD', () => {
    expect(resolveR2ExecutionMode({})).toBe('disabled')
    expect(resolveR2ExecutionMode({ R2_EXECUTION_MODE: 'simulated', VERCEL: '1' })).toBe('disabled')
    expect(resolveR2ExecutionMode({ R2_EXECUTION_MODE: 'simulated', NODE_ENV: 'production' })).toBe(
      'disabled'
    )
    for (const blocked of BLOCKED_PROJECT_REFS) {
      expect(
        resolveR2ExecutionMode({
          R2_EXECUTION_MODE: 'qa',
          SUPABASE_URL: `https://${blocked}.supabase.co`,
          R2_QA_PROJECT_REFS: blocked,
        })
      ).toBe('disabled')
      expect(
        qaProjectRef({
          SUPABASE_URL: `https://${blocked}.supabase.co`,
          R2_QA_PROJECT_REFS: blocked,
        })
      ).toBeNull()
    }
  })

  it('Vitest de este proceso no carga SUPABASE_URL de DEV/PROD', () => {
    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
    for (const blocked of BLOCKED_PROJECT_REFS) {
      expect(url).not.toContain(blocked)
    }
    expect(resolveR2ExecutionMode(process.env)).not.toBe('qa')
  })
})
