import { describe, expect, it } from 'vitest'
import {
  formatWhatsAppDeliveryError,
  parseWhatsAppDeliveryError,
  resolveWhatsAppDeliveryVerdict,
} from './whatsappDeliveryVerdict'

describe('whatsappDeliveryVerdict', () => {
  it('parsea error 131049 de Meta', () => {
    const raw = JSON.stringify({
      code: 131049,
      title: 'This message was not delivered to maintain healthy ecosystem engagement.',
      message: 'This message was not delivered to maintain healthy ecosystem engagement.',
      error_data: {
        details: 'In order to maintain a healthy ecosystem engagement, the message failed to be delivered.',
      },
    })
    const parsed = parseWhatsAppDeliveryError(raw)
    expect(parsed.code).toBe(131049)
    expect(formatWhatsAppDeliveryError(raw)).toContain('131049')
    expect(formatWhatsAppDeliveryError(raw)).toMatch(/Utility|engagement|marketing/i)
  })

  it('marca sent+wamid como aceptado pendiente', () => {
    const v = resolveWhatsAppDeliveryVerdict({
      deliveryStatus: 'sent',
      metaMessageId: 'wamid.HBgMNTI1NTQ4MTE4MTc1',
    })
    expect(v.verdict).toBe('OK_ACEPTADO')
    expect(v.ok).toBe(true)
    expect(v.uncertain).toBe(true)
  })

  it('marca failed+wamid como ERROR_META', () => {
    const v = resolveWhatsAppDeliveryVerdict({
      deliveryStatus: 'failed',
      metaMessageId: 'wamid.ABC',
      errorMessage: JSON.stringify({ code: 131049, title: 'blocked' }),
    })
    expect(v.verdict).toBe('ERROR_META')
    expect(v.ok).toBe(false)
    expect(v.errorCode).toBe(131049)
  })

  it('marca delivered como OK_ENTREGADO', () => {
    const v = resolveWhatsAppDeliveryVerdict({
      deliveryStatus: 'delivered',
      metaMessageId: 'wamid.ABC',
    })
    expect(v.verdict).toBe('OK_ENTREGADO')
    expect(v.ok).toBe(true)
    expect(v.uncertain).toBe(false)
  })
})
