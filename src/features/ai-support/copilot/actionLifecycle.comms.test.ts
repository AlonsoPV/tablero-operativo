import { describe, expect, it } from 'vitest'
import { communicationStatusLabel } from './actionLifecycle'

describe('communicationStatusLabel', () => {
  it('distinguishes accepted vs delivered', () => {
    expect(
      communicationStatusLabel({ lifecycle: 'completed', deliveryStatus: 'accepted' })
    ).toBe('Aceptado por el proveedor')
    expect(
      communicationStatusLabel({ lifecycle: 'completed', deliveryStatus: 'delivered' })
    ).toBe('Entregado')
    expect(
      communicationStatusLabel({ lifecycle: 'completed', deliveryStatus: null })
    ).toBe('Aceptado por el proveedor')
  })

  it('maps pending needs_info and discarded', () => {
    expect(
      communicationStatusLabel({ lifecycle: 'needs_info', incomplete: false })
    ).toBe('Requiere informacion')
    expect(communicationStatusLabel({ lifecycle: 'cancelled' })).toBe('Descartado')
    expect(
      communicationStatusLabel({ lifecycle: 'pending_confirmation' })
    ).toBe('Pendiente de aprobacion')
    expect(communicationStatusLabel({ lifecycle: 'executing' })).toBe('Enviando')
    expect(
      communicationStatusLabel({ lifecycle: 'error', errorMessage: 'fail' })
    ).toBe('Fallido')
  })
})
