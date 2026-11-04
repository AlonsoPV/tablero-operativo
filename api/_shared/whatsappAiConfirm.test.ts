import { describe, expect, it } from 'vitest'
import { inferAiConfirmText, parseAiOpButton } from './whatsappAiConfirm'

describe('parseAiOpButton', () => {
  it('parses confirm and cancel ids', () => {
    expect(parseAiOpButton('aiop:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee:ok')).toEqual({
      opId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      action: 'confirm',
    })
    expect(parseAiOpButton('aiop:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee:no')).toEqual({
      opId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      action: 'cancel',
    })
  })

  it('rejects checkpoint buttons', () => {
    expect(parseAiOpButton('chk:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee:done')).toBeNull()
  })
})

describe('inferAiConfirmText', () => {
  it('maps short yes/no', () => {
    expect(inferAiConfirmText('Sí')).toBe('confirm')
    expect(inferAiConfirmText('ok')).toBe('confirm')
    expect(inferAiConfirmText('no')).toBe('cancel')
    expect(inferAiConfirmText('cancelar')).toBe('cancel')
  })

  it('ignores longer questions', () => {
    expect(inferAiConfirmText('si, que acciones tengo retrasadas')).toBeNull()
    expect(inferAiConfirmText('ayuda')).toBeNull()
  })
})
