import { describe, expect, it } from 'vitest'
import {
  classifyPendingOpTool,
  countActionablePendingOps,
  sanitizeRecipientFacingText,
  splitPendingOpsByPresentation,
} from './pendingOpTaxonomy'

describe('pendingOpTaxonomy', () => {
  it('classifies whatsapp as communication and create_action as board', () => {
    expect(classifyPendingOpTool('whatsapp_prepare_send')).toEqual({
      presentation: 'communication',
      channel: 'whatsapp',
    })
    expect(classifyPendingOpTool('gmail_prepare_send').channel).toBe('email')
    expect(classifyPendingOpTool('notify_action_email')).toEqual({
      presentation: 'communication',
      channel: 'email',
    })
    expect(classifyPendingOpTool('create_action')).toEqual({
      presentation: 'board',
      channel: 'board',
    })
  })

  it('counts unique actionable ops only', () => {
    const count = countActionablePendingOps([
      { id: 'a', status: 'pending' },
      { id: 'a', status: 'pending' },
      { id: 'b', status: 'confirmed' },
      { id: 'c', status: 'cancelled' },
      { id: 'd', status: 'pending', workspace: { needsInfo: true } },
    ])
    expect(count).toBe(2)
  })

  it('splits communications from board and history', () => {
    const split = splitPendingOpsByPresentation([
      { id: '1', tool: 'whatsapp_prepare_send', status: 'pending' },
      { id: '2', tool: 'create_action', status: 'pending' },
      { id: '3', tool: 'whatsapp_prepare_send', status: 'cancelled' },
    ])
    expect(split.communications).toHaveLength(1)
    expect(split.board).toHaveLength(1)
    expect(split.history).toHaveLength(1)
  })

  it('strips json and tool names from recipient-facing text', () => {
    expect(sanitizeRecipientFacingText('{"body":"Hola Carlos","pending_op_id":"x"}')).toBe('Hola Carlos')
    expect(sanitizeRecipientFacingText('get_okr_progress: avanza')).toBe(': avanza')
    expect(sanitizeRecipientFacingText('')).toBe('')
    expect(sanitizeRecipientFacingText(
      'Resumen de acciones del equipo.\n\nb190-463b-9dcb-e07e11827f0f","channel":"whatsapp","status":"pending","purpose":"Resumen"}],"counts":{"communicationDrafts":1}}\n\nEnviar resumen del equipo.'
    )).toBe('Resumen de acciones del equipo.')
  })
})
