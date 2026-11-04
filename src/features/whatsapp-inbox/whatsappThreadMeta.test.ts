import { describe, expect, it } from 'vitest'
import type { WhatsAppThreadMessage } from './services/whatsappInbox.service'
import { resolveThreadMeta, summarizeThread } from './whatsappThreadMeta'

function msg(partial: Partial<WhatsAppThreadMessage>): WhatsAppThreadMessage {
  return {
    id: '1',
    wa_id: '521',
    usuario_id: null,
    direction: 'outbound',
    source: 'automation',
    message_kind: 'initial',
    body_text: '',
    meta_message_id: null,
    delivery_status: 'sent',
    operator_usuario_id: null,
    error_message: null,
    payload: {},
    created_at: new Date().toISOString(),
    sent_at: null,
    delivered_at: null,
    read_at: null,
    failed_at: null,
    ...partial,
  }
}

describe('whatsappThreadMeta', () => {
  it('marca envios de accion y extrae titulo', () => {
    const meta = resolveThreadMeta(
      msg({
        body_text: 'Hola Ana. Nueva actividad: Cerrar OTIF. Compromiso: viernes.',
        message_kind: 'initial',
        source: 'automation',
      })
    )
    expect(meta.isActionOutbound).toBe(true)
    expect(meta.label).toBe('Acción enviada')
    expect(meta.actionTitle).toContain('Cerrar OTIF')
  })

  it('trata plantillas de nueva actividad como envio de accion', () => {
    const meta = resolveThreadMeta(
      msg({
        source: 'operator',
        message_kind: 'template',
        body_text: '[Plantilla nueva_actividad_what2do] Ana · OTIF · viernes',
      })
    )
    expect(meta.isActionOutbound).toBe(true)
    expect(meta.label).toBe('Acción enviada')
  })

  it('marca respuestas de boton del usuario', () => {
    const meta = resolveThreadMeta(
      msg({
        direction: 'inbound',
        source: 'contact',
        message_kind: 'interactive',
        body_text: 'Realizada',
      })
    )
    expect(meta.isUserReply).toBe(true)
    expect(meta.kind).toBe('user_button')
  })

  it('resume envios y respuestas', () => {
    const summary = summarizeThread([
      msg({ message_kind: 'initial', body_text: 'Nueva actividad: A.' }),
      msg({
        direction: 'inbound',
        source: 'contact',
        message_kind: 'text',
        body_text: 'Voy',
      }),
    ])
    expect(summary.actionSends).toBe(1)
    expect(summary.userReplies).toBe(1)
  })
})
