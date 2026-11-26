import { describe, expect, it } from 'vitest'
import { classifyAgentIntent as classifyIntent } from './intent.js'

describe('WhatsApp voice-note & natural delegation -> shared classifier', () => {
  it.each([
    'Necesito que Gerardo revise el inventario.',
    'Que Gerardo se encargue de revisar las entregas.',
    'Ponle a Gerardo una tarea para mañana.',
    'Hay que revisar la conciliación el viernes.',
    'Agenda una revisión de inventario.',
    'Prepara una acción para revisar los indicadores.',
    'Prepara una acción para Gerardo Puga para revisar la conciliación de entregas el próximo lunes, con prioridad alta',
    'Crea una acción para revisar entregas el viernes.',
    'Creo una acción para revisar entregas el viernes.',
  ])('classifies natural delegation "%s" as create_action', (transcript) => {
    const intent = classifyIntent(transcript)
    expect(intent.kind).toBe('write_request')
    if (intent.kind === 'write_request') {
      expect(intent.operation).toBe('create_action')
    }
  })

  it('classifies "Asígnamela para el lunes." as update_action when an active action is in context', () => {
    const intent = classifyIntent('Asígnamela para el lunes.', {
      lastEntityKind: 'action',
      lastActionCount: 1,
    })
    expect(intent.kind).toBe('write_request')
    if (intent.kind === 'write_request') {
      expect(intent.operation).toBe('update_action')
    }
  })

  it.each([
    '¿Quién creó esta acción?',
    '¿Qué tareas tiene programadas Gerardo?',
  ])('does NOT misclassify interrogative query "%s" as write_request', (question) => {
    const intent = classifyIntent(question)
    expect(intent.kind).not.toBe('write_request')
  })

  it.each([
    'Prepara un correo sobre las acciones pendientes.',
    'Genera un WhatsApp con mis pendientes.',
    'Prepara un WhatsApp para Gerardo con sus pendientes',
    'Prepara un correo para Alonso con sus acciones',
  ])('does NOT misclassify communication request "%s" as create_action', (comm) => {
    const intent = classifyIntent(comm)
    expect(intent.kind === 'write_request' ? intent.operation : intent.kind).not.toBe('create_action')
  })
})
