import { describe, expect, it } from 'vitest'
import { classifyAgentIntent as classifyIntent } from './intent.js'

describe('WhatsApp voice-note transcript -> create_action classification', () => {
  it.each([
    'Crea una acción para revisar entregas el viernes',
    'Crea una acción para revisar entregas el viernes.',
    'Prepara una acción para revisar entregas el viernes',
    'Prepara una acción para revisar entregas el viernes.',
    'Creo una acción para revisar entregas el viernes.',
    'Hola, prepara una acción para revisar entregas el viernes.',
    'Genera un pendiente para revisar entregas el viernes',
  ])('classifies voice transcript "%s" as create_action', (transcript) => {
    const intent = classifyIntent(transcript)
    expect(intent.kind).toBe('write_request')
    if (intent.kind === 'write_request') {
      expect(intent.operation).toBe('create_action')
    }
  })

  it('does not misclassify communication preparation as create_action', () => {
    const wa = classifyIntent('Prepara un WhatsApp para Gerardo con sus pendientes')
    expect(wa.kind === 'write_request' ? wa.operation : wa.kind).not.toBe('create_action')

    const mail = classifyIntent('Prepara un correo para Alonso con sus acciones')
    expect(mail.kind === 'write_request' ? mail.operation : mail.kind).not.toBe('create_action')
  })
})
