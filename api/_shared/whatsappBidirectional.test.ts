import { describe, expect, it } from 'vitest'
import {
  inferFollowupTextAction,
  isVerActividadesButton,
  parseFollowupButtonId,
  whatsappPhoneVariants,
} from './whatsappBidirectional'

describe('parseFollowupButtonId', () => {
  it('parses act / chk / tchk', () => {
    expect(parseFollowupButtonId('act:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee:done')).toEqual({
      kind: 'action',
      accionId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      action: 'done',
    })
    expect(parseFollowupButtonId('chk:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee:progress')).toEqual({
      kind: 'corporate',
      checkpointId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      action: 'progress',
    })
    expect(parseFollowupButtonId('tchk:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee:2:support')).toEqual({
      kind: 'team',
      teamActionId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      checklistIndex: 2,
      action: 'support',
    })
    expect(parseFollowupButtonId('digest:done')).toBeNull()
  })

  it('rejects aiop and garbage', () => {
    expect(parseFollowupButtonId('aiop:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee:ok')).toBeNull()
    expect(parseFollowupButtonId('hello')).toBeNull()
  })
})

describe('inferFollowupTextAction', () => {
  it('covers bidireccional synonyms', () => {
    expect(inferFollowupTextAction('Realizado')).toBe('done')
    expect(inferFollowupTextAction('listo')).toBe('done')
    expect(inferFollowupTextAction('avanzando')).toBe('progress')
    expect(inferFollowupTextAction('proceso')).toBe('progress')
    expect(inferFollowupTextAction('necesito ayuda')).toBe('support')
    expect(inferFollowupTextAction('Requiero apoyo')).toBe('support')
  })

  it('ignores unrelated text', () => {
    expect(inferFollowupTextAction('qué tengo pendiente')).toBeNull()
  })
})

describe('isVerActividadesButton', () => {
  it('matches title and id', () => {
    expect(isVerActividadesButton(null, 'Ver actividades')).toBe(true)
    expect(isVerActividadesButton(null, 'Más información')).toBe(true)
    expect(isVerActividadesButton('Más información', 'Más información')).toBe(true)
    expect(isVerActividadesButton('ver_actividades', null)).toBe(true)
    expect(isVerActividadesButton('chk:x:done', 'Realizada')).toBe(false)
  })
})

describe('whatsappPhoneVariants', () => {
  it('matches Meta MX wa_id with stored 52 number', () => {
    const stored = whatsappPhoneVariants('525511981149')
    const inbound = whatsappPhoneVariants('5215511981149')
    expect(stored).toEqual(expect.arrayContaining(['525511981149', '5215511981149', '5511981149']))
    expect(inbound).toEqual(expect.arrayContaining(['525511981149', '5215511981149']))
  })
})
