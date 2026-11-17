import { describe, expect, it } from 'vitest'
import {
  classifyDeniedMessage,
  guideToolFailure,
  guideToolSuccess,
  maskEmailForLog,
  maskPhoneForLog,
} from './guideToolResult'

describe('guideToolResult', () => {
  it('builds success payload with spoken result', () => {
    const payload = guideToolSuccess({
      message: 'Deje borrador de WhatsApp.',
      status: 'draft_registered',
      pending_op_id: 'op-1',
      entity_type: 'whatsapp',
      tool: 'queue_workspace_draft',
    })
    expect(payload.success).toBe(true)
    expect(payload.result).toBe(payload.message)
    expect(payload.operation_id).toBe('op-1')
    expect(payload.pending_op_ids).toEqual(['op-1'])
  })

  it('builds failure payload with typed code', () => {
    const payload = guideToolFailure({
      code: 'PERMISSION_DENIED',
      user_message: 'No puedes enviar en este modo.',
      tool: 'confirm_pending_op',
    })
    expect(payload.success).toBe(false)
    expect(payload.error.code).toBe('PERMISSION_DENIED')
    expect(payload.error.retryable).toBe(false)
    expect(payload.result).toBe(payload.error.user_message)
    expect(payload.status).toBe('denied')
  })

  it('masks phone and email for logs', () => {
    expect(maskPhoneForLog('+52 55 1234 5678')).toBe('***5678')
    expect(maskEmailForLog('alonso@empresa.com')).toBe('a***@empresa.com')
  })

  it('classifies denied messages', () => {
    expect(classifyDeniedMessage('Firma de Retell invalida')).toBe('AUTHENTICATION_FAILED')
    expect(classifyDeniedMessage('falta la sesion')).toBe('SESSION_NOT_FOUND')
    expect(classifyDeniedMessage('solo lectura')).toBe('PERMISSION_DENIED')
  })
})
