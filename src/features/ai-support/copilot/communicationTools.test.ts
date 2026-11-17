import { describe, expect, it } from 'vitest'
import {
  isCommunicationWriteTool,
  normalizeCommunicationChannel,
} from './communicationTools'

describe('communicationTools', () => {
  it('normalizes channel aliases', () => {
    expect(normalizeCommunicationChannel('whatsapp')).toBe('whatsapp')
    expect(normalizeCommunicationChannel('ambos')).toBe('both')
    expect(normalizeCommunicationChannel('correo')).toBe('email')
    expect(normalizeCommunicationChannel('event')).toBe('event')
  })

  it('recognizes whatsapp_prepare_send as a communication write tool', () => {
    expect(isCommunicationWriteTool('whatsapp_prepare_send')).toBe(true)
    expect(isCommunicationWriteTool('gmail_prepare_send')).toBe(false)
  })
})
