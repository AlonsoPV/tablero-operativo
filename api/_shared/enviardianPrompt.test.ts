import { describe, expect, it } from 'vitest'
import {
  ENVIARDIAN_PROMPT_VERSION,
  enviardianVoiceWorkInstruction,
} from './enviardianPrompt'
import { guideOpening, guideWorkInstructions } from './guideWork'

describe('voice create intent', () => {
  it('exposes distinct create vs consult instructions', () => {
    expect(enviardianVoiceWorkInstruction('create')).toMatch(/work_intent=create/i)
    expect(enviardianVoiceWorkInstruction('create')).toMatch(/create_action/i)
    expect(enviardianVoiceWorkInstruction('consult')).not.toMatch(/work_intent=create/i)
    expect(ENVIARDIAN_PROMPT_VERSION).toMatch(/create/)
  })

  it('biases openings and work instructions when create is selected', () => {
    expect(guideOpening('create')).toMatch(/aprobar|accion/i)
    expect(guideWorkInstructions('create')).toMatch(/Modo Crear activo/i)
    expect(guideWorkInstructions('consult')).toMatch(/No pidas que elijan/i)
  })
})
