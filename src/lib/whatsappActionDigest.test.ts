import { describe, expect, it } from 'vitest'
import {
  accionIdPublico,
  formatActionIdLine,
  matchAccionByPublicId,
  parseEmxPublicIdFromText,
} from './whatsappActionDigest'

const SAMPLE_ID = '00000000-0000-4000-8000-00000000007b'

describe('whatsappActionDigest (IDs de UI, no protocolo WhatsApp)', () => {
  it('builds emx_ public ids from UUIDs', () => {
    expect(accionIdPublico(SAMPLE_ID)).toMatch(/^emx_\d{5}$/)
    expect(accionIdPublico(SAMPLE_ID)).toBe('emx_00123')
  })

  it('parses emx ids from free text for UI matching', () => {
    expect(parseEmxPublicIdFromText('emx_123 Realizada')).toBe('emx_00123')
    expect(parseEmxPublicIdFromText('EMX-45')).toBe('emx_00045')
    expect(parseEmxPublicIdFromText('sin id')).toBeNull()
  })

  it('matches an action by public id', () => {
    const actions = [
      { id: SAMPLE_ID, titulo: 'Cerrar evidencia' },
      { id: '00000000-0000-4000-8000-000000000001', titulo: 'Otra' },
    ]
    expect(matchAccionByPublicId(actions, 'emx_123')?.titulo).toBe('Cerrar evidencia')
  })

  it('formats a kanban-style public id line', () => {
    expect(formatActionIdLine({ id: SAMPLE_ID, titulo: 'Cerrar evidencia' }, 1)).toBe(
      '1. emx_00123 Cerrar evidencia'
    )
  })
})
