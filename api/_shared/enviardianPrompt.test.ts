import { describe, expect, it } from 'vitest'
import {
  ENVIARDIAN_PROMPT_VERSION,
  enviardianVoiceWorkInstruction,
  normalizeEnviardianWorkIntent,
} from './enviardianPrompt'
import { guideOpening, guideWorkInstructions } from './guideWork'

describe('voice work intents', () => {
  it('normalizes legacy create to action', () => {
    expect(normalizeEnviardianWorkIntent('create')).toBe('action')
    expect(normalizeEnviardianWorkIntent('whatsapp')).toBe('whatsapp')
    expect(normalizeEnviardianWorkIntent('email')).toBe('email')
    expect(normalizeEnviardianWorkIntent('consult')).toBe('consult')
  })

  it('exposes distinct instructions per intent', () => {
    expect(enviardianVoiceWorkInstruction('create')).toMatch(/work_intent=action/i)
    expect(enviardianVoiceWorkInstruction('action')).toMatch(/create_action/i)
    expect(enviardianVoiceWorkInstruction('whatsapp')).toMatch(/channel=whatsapp/i)
    expect(enviardianVoiceWorkInstruction('email')).toMatch(/tool=notify_action_email/)
    expect(enviardianVoiceWorkInstruction('consult')).not.toMatch(/work_intent=action/i)
    expect(ENVIARDIAN_PROMPT_VERSION).toMatch(/intents/)
  })

  it('biases openings and work instructions when create-like is selected', () => {
    expect(guideOpening('action')).toMatch(/aprobar|accion/i)
    expect(guideWorkInstructions('action')).toMatch(/Modo Accion activo/i)
    expect(guideWorkInstructions('whatsapp')).toMatch(/WhatsApp/i)
    expect(guideWorkInstructions('consult')).toMatch(/No pidas que elijan/i)
  })
})
