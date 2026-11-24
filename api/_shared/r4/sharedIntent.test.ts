import { describe, expect, it } from 'vitest'
import { classifySharedAcrossChannels, interpretSharedIntent } from './sharedIntent.js'

const FOLLOWUP = 'Prepara un seguimiento por WhatsApp para el responsable'
const CREATE = 'Crea una accion para cerrar el POD manana'
const AMBIGUOUS = 'Crea una accion al objetivo'
const AIOP_OK = 'aiop:11111111-1111-4111-8111-111111111111:ok'

describe('shared intent layer closes CHANNEL_GAP (SIMULATED)', () => {
  it('followup y create producen la misma familia y propuesta en web, WhatsApp simulado y voz', () => {
    for (const text of [FOLLOWUP, CREATE]) {
      const result = classifySharedAcrossChannels({ text })
      expect(result.whatsappSim.family).toBe(result.web.family)
      expect(result.voiceSim.family).toBe(result.web.family)
      expect(result.whatsappSim.proposal).toEqual(result.web.proposal)
      expect(result.voiceSim.proposal).toEqual(result.web.proposal)
    }
    const followup = classifySharedAcrossChannels({ text: FOLLOWUP })
    expect(followup.web.family).toBe('prepare_followup')
    expect(followup.web.proposal).toEqual({
      kind: 'prepare_comms',
      toolHint: 'queue_workspace_draft',
    })
    const create = classifySharedAcrossChannels({ text: CREATE })
    expect(create.web.family).toBe('propose_action')
    expect(create.web.proposal).toMatchObject({
      kind: 'propose_create',
      entity: 'kanban_action',
    })
  })

  it('el router productivo de WhatsApp sigue sin mapear followup/create (no se modifico)', () => {
    const followup = classifySharedAcrossChannels({ text: FOLLOWUP })
    const create = classifySharedAcrossChannels({ text: CREATE })
    expect(followup.whatsappProductionRouter.intent).not.toBe('QUERY')
    expect(create.whatsappProductionRouter.intent).not.toBe('QUERY')
  })

  it('casos ambiguos piden aclaracion en los tres canales simulados', () => {
    const result = classifySharedAcrossChannels({ text: AMBIGUOUS })
    expect(result.web.family).toBe('clarify')
    expect(result.whatsappSim.family).toBe('clarify')
    expect(result.voiceSim.family).toBe('clarify')
    expect(result.web.proposal.kind).toBe('clarify')
  })

  it('deniega confirmacion sin autenticacion, sin ser dueno o por liga publica', () => {
    expect(
      interpretSharedIntent({
        text: 'ok',
        channel: 'whatsapp_sim',
        authenticated: false,
        isOwner: true,
        whatsappButtonId: AIOP_OK,
      }).family
    ).toBe('deny')
    expect(
      interpretSharedIntent({
        text: 'ok',
        channel: 'web',
        authenticated: true,
        isOwner: false,
        whatsappButtonId: AIOP_OK,
      }).proposal
    ).toMatchObject({ kind: 'deny', code: 'foreign_session' })
    expect(
      interpretSharedIntent({
        text: 'ok',
        channel: 'voice_sim',
        authenticated: true,
        isOwner: true,
        publicConfirmAttempt: true,
      }).proposal
    ).toMatchObject({ kind: 'deny', code: 'public_confirm_denied' })
  })

  it('permite approve autenticado del dueno via boton WhatsApp simulado', () => {
    const result = interpretSharedIntent({
      text: 'Confirma la accion acordada',
      channel: 'whatsapp_sim',
      authenticated: true,
      isOwner: true,
      whatsappButtonId: AIOP_OK,
    })
    expect(result.family).toBe('approve')
    expect(result.permission.canApprove).toBe(true)
  })
})
