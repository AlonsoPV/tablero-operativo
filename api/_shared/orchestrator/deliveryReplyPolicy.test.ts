import { describe, expect, it } from 'vitest'
import {
  formatCommunicationConfirmationReply,
  formatOnDemandDeliveryStatus,
  normalizeInternalDeliveryState,
} from './deliveryReplyPolicy.js'
import { deduplicateInboundEvents, evaluateEventOrdering } from '../whatsappReconciliation.js'

describe('deliveryReplyPolicy (silent delivery tracking & conversational UX)', () => {
  it('suppresses extra WhatsApp confirmation when user sends a WhatsApp to themselves and it is accepted', () => {
    const decision = formatCommunicationConfirmationReply({
      channel: 'whatsapp',
      state: 'accepted',
      isSelfRecipient: true,
      recipientName: 'Alonso Perez',
      surface: 'whatsapp',
    })
    expect(decision.suppressReply).toBe(true)
    expect(decision.text).toBe('')
    expect(decision.needsUserAction).toBe(false)
  })

  it('sends a single brief natural confirmation when sending WhatsApp or email to another person without claiming delivery', () => {
    const wa = formatCommunicationConfirmationReply({
      channel: 'whatsapp',
      state: 'accepted',
      isSelfRecipient: false,
      recipientName: 'Gerardo Puga',
      surface: 'whatsapp',
    })
    expect(wa.suppressReply).toBe(false)
    expect(wa.text).toBe('Listo, envié el WhatsApp a Gerardo Puga.')
    expect(wa.text).not.toMatch(/Meta aceptó|entrega todavía no está confirmada/i)

    const email = formatCommunicationConfirmationReply({
      channel: 'email',
      state: 'accepted',
      isSelfRecipient: true,
      recipientName: 'Alonso Perez',
      surface: 'whatsapp',
    })
    expect(email.suppressReply).toBe(false)
    expect(email.text).toBe('Listo, envié el correo a Alonso Perez.')
  })

  it('returns clear non-technical error and uncertain guidance without auto-retrying', () => {
    const failed = formatCommunicationConfirmationReply({
      channel: 'email',
      state: 'failed',
      isSelfRecipient: false,
      recipientName: 'Gerardo Puga',
      surface: 'web',
    })
    expect(failed.needsUserAction).toBe(true)
    expect(failed.text).toContain('No se pudo enviar el correo a Gerardo Puga')

    const uncertain = formatCommunicationConfirmationReply({
      channel: 'whatsapp',
      state: 'unknown',
      isSelfRecipient: true,
      recipientName: 'Alonso Perez',
      surface: 'whatsapp',
    })
    expect(uncertain.suppressReply).toBe(false)
    expect(uncertain.needsUserAction).toBe(true)
    expect(uncertain.text).toContain('Consulta su estado antes de reenviarlo')
  })

  it('normalizes all internal delivery states accurately', () => {
    expect(normalizeInternalDeliveryState({ operationStatus: 'pending' })).toBe('prepared')
    expect(normalizeInternalDeliveryState({ operationStatus: 'confirmed' })).toBe('confirmed')
    expect(normalizeInternalDeliveryState({ deliveryStatus: 'queued' })).toBe('queued')
    expect(normalizeInternalDeliveryState({ deliveryStatus: 'sent' })).toBe('accepted')
    expect(normalizeInternalDeliveryState({ deliveryStatus: 'delivered' })).toBe('delivered')
    expect(normalizeInternalDeliveryState({ deliveryStatus: 'read' })).toBe('read')
    expect(normalizeInternalDeliveryState({ deliveryStatus: 'failed' })).toBe('failed')
    expect(normalizeInternalDeliveryState({ deliveryStatus: 'unknown' })).toBe('unknown')
  })

  it('formats honest on-demand status distinguishing accepted vs delivered vs read', () => {
    expect(
      formatOnDemandDeliveryStatus({ channel: 'whatsapp', state: 'accepted', recipientName: 'Gerardo Puga' })
    ).toContain('la entrega aún no está confirmada')
    expect(
      formatOnDemandDeliveryStatus({ channel: 'whatsapp', state: 'delivered', recipientName: 'Gerardo Puga' })
    ).toContain('fue entregado')
    expect(
      formatOnDemandDeliveryStatus({ channel: 'whatsapp', state: 'read', recipientName: 'Gerardo Puga' })
    ).toContain('fue leído')
  })

  it('handles synthetic duplicate and out-of-order Meta webhook events without regression', () => {
    const dedup = deduplicateInboundEvents(
      [
        { eventKey: 'wamid.dup:delivered', waId: '525511981149', kind: 'status', receivedAtMs: 1 },
        { eventKey: 'wamid.dup:delivered', waId: '525511981149', kind: 'status', receivedAtMs: 2 },
      ],
      new Set()
    )
    expect(dedup.accepted).toHaveLength(1)
    expect(dedup.duplicates).toHaveLength(1)

    const outOfOrder = evaluateEventOrdering({
      kind: 'status',
      currentStatus: 'read',
      incomingStatus: 'sent',
    })
    expect(outOfOrder.action).toBe('ignore_stale')

    const advance = evaluateEventOrdering({
      kind: 'status',
      currentStatus: 'sent',
      incomingStatus: 'delivered',
    })
    expect(advance.action).toBe('apply')
  })
})
