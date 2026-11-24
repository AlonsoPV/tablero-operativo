import { describe, expect, it } from 'vitest'
import { BLOCKED_PROJECT_REFS } from '../../../api/_shared/actions/executionMode'
import { MISSING_SUPABASE_ENV, SUPABASE_ANON_KEY, SUPABASE_URL, supabase } from './client'

describe('Supabase browser client · inicialización (Fase 1 local)', () => {
  it('importar el módulo no exige URL: Vitest no apunta a DEV ni PROD', () => {
    expect(SUPABASE_URL).toBe('')
    expect(SUPABASE_ANON_KEY).toBe('')
    for (const blocked of BLOCKED_PROJECT_REFS) {
      expect(SUPABASE_URL).not.toContain(blocked)
    }
  })

  it('el primer uso sin credenciales falla cerrado, sin createClient vacío', () => {
    expect(() => supabase.from('acciones_diarias')).toThrow(MISSING_SUPABASE_ENV)
  })
})
