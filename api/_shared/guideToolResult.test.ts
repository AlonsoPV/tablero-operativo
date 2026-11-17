import { describe, expect, it } from 'vitest'
import {
  classifyDenialReason,
  classifyDeniedMessage,
  ensureSpokenText,
  guideToolFailure,
  guideToolSuccess,
  maskEmailForLog,
  maskPhoneForLog,
  statusToErrorCode,
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

  it('never returns empty spoken text', () => {
    expect(ensureSpokenText('')).toMatch(/continuar/i)
    expect(guideToolSuccess({ message: '   ', status: 'ok' }).result).toMatch(/propuesta|continuar/i)
    expect(
      guideToolFailure({ code: 'TIMEOUT', user_message: '' }).result
    ).toMatch(/continuar|completar/i)
  })

  it('masks phone and email for logs', () => {
    expect(maskPhoneForLog('+52 55 1234 5678')).toBe('***5678')
    expect(maskEmailForLog('alonso@empresa.com')).toBe('a***@empresa.com')
  })

  it('classifies denied messages', () => {
    expect(classifyDeniedMessage('Firma de Retell invalida')).toBe('AUTHENTICATION_FAILED')
    expect(classifyDeniedMessage('falta la sesion')).toBe('SESSION_NOT_FOUND')
    expect(classifyDeniedMessage('solo lectura')).toBe('PERMISSION_DENIED')
    expect(classifyDeniedMessage('No tienes permiso de escritura en este modo.')).toBe('PERMISSION_DENIED')
    expect(classifyDeniedMessage('No encontré un usuario activo llamado "Gerardo Puga".')).toBe(
      'VALIDATION_FAILED'
    )
    expect(classifyDeniedMessage('Indica un nombre.')).toBe('VALIDATION_FAILED')
    expect(classifyDeniedMessage('Indica un título de al menos 3 caracteres.')).toBe('VALIDATION_FAILED')
    expect(classifyDenialReason('No encontré un usuario activo llamado "Gerardo Puga".')).toBe('not_found')
    expect(classifyDenialReason('Indica una fecha de compromiso')).toBe('validation')
    expect(classifyDenialReason('solo lectura')).toBe('permission')
  })

  it('maps Retell status to typed codes without collapsing validation into PERMISSION_DENIED', () => {
    expect(statusToErrorCode('denied')).toBe('PERMISSION_DENIED')
    expect(statusToErrorCode('denied', 'No encontré un usuario activo llamado "Gerardo Puga".')).toBe(
      'VALIDATION_FAILED'
    )
    expect(statusToErrorCode('denied', 'No tienes permiso de escritura en este modo.')).toBe(
      'PERMISSION_DENIED'
    )
    expect(statusToErrorCode('timeout')).toBe('TIMEOUT')
    expect(statusToErrorCode('error', 'Indica un nombre.')).toBe('VALIDATION_FAILED')
  })
})
