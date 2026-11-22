import { describe, expect, it } from 'vitest'
import { friendlyAssistantError } from './assistantErrors'

describe('friendlyAssistantError', () => {
  it('hides SQL, internal codes and raw JSON', () => {
    const generic = friendlyAssistantError(new Error('x'))
    expect(generic).toBe('x')
    for (const raw of [
      'relation "acciones" does not exist',
      'new row violates row-level security policy',
      '{"code":"PGRST301","message":"JWT expired"}',
      'TypeError: Cannot read properties of undefined',
    ]) {
      const text = friendlyAssistantError(new Error(raw))
      expect(text).not.toContain('PGRST')
      expect(text).not.toContain('{')
      expect(text).not.toMatch(/relation|violates|TypeError/)
    }
  })

  it('maps network, auth and rate limit errors to plain language', () => {
    expect(friendlyAssistantError(new TypeError('Failed to fetch'))).toContain('conexion')
    expect(friendlyAssistantError(new Error('No autorizado para usar el Asistente IA.'))).toContain(
      'iniciar sesion'
    )
    expect(friendlyAssistantError(new Error('Demasiadas consultas.'))).toContain('Espera')
    expect(friendlyAssistantError(null)).toContain('Intenta de nuevo')
  })
})
