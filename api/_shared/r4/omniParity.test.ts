import { describe, expect, it } from 'vitest'
import { AT20_CORPUS, classifyOmniCase, runAt20ParityCase } from './omniParity.js'

describe('AT-20 omnichannel parity (SIMULATED)', () => {
  it('consulta pendiente y vencida coinciden en web, WhatsApp QUERY y voz simulada', async () => {
    const pending = await runAt20ParityCase(AT20_CORPUS[0])
    const overdue = await runAt20ParityCase(AT20_CORPUS[1])

    expect(pending.web.family).toBe('query_pending')
    expect(pending.web.operational).toBe('query')
    expect(pending.web.assistant).toBe('pending')
    expect(pending.whatsapp.intent).toBe('QUERY')
    expect(pending.voice.phase).toBe('listening')

    expect(overdue.web.family).toBe('query_overdue')
    expect(overdue.web.operational).toBe('query')
    expect(overdue.web.assistant).toBe('pending')
    expect(overdue.whatsapp.intent).toBe('QUERY')
    expect(overdue.voice.phase).toBe('listening')
  })

  it('propuesta y seguimiento coinciden en web, WhatsApp simulado y voz', async () => {
    const followup = classifyOmniCase(AT20_CORPUS[2])
    const create = classifyOmniCase(AT20_CORPUS[3])
    expect(followup.web.family).toBe('prepare_followup')
    expect(followup.whatsappSim.family).toBe('prepare_followup')
    expect(followup.voiceSim.family).toBe('prepare_followup')
    expect(followup.web.operational).toBe('prepare_comms')
    expect(create.web.family).toBe('propose_action')
    expect(create.whatsappSim.family).toBe('propose_action')
    expect(create.voiceSim.family).toBe('propose_action')
    expect(create.web.operational).toBe('propose_create_kanban')

    const spokenFollowup = await runAt20ParityCase(AT20_CORPUS[2])
    const spokenCreate = await runAt20ParityCase(AT20_CORPUS[3])
    expect(spokenFollowup.voice.phase).toBe('listening')
    expect(spokenCreate.voice.phase).toBe('listening')
  })

  it('el router productivo de WhatsApp permanece sin ese mapeo (no se modifico)', () => {
    const followup = classifyOmniCase(AT20_CORPUS[2])
    const create = classifyOmniCase(AT20_CORPUS[3])
    expect(followup.whatsapp.intent).not.toBe('QUERY')
    expect(create.whatsapp.intent).not.toBe('QUERY')
    expect(['UNKNOWN', 'TASK_REPLY', 'TASK_UPDATE']).toContain(followup.whatsapp.intent)
    expect(['UNKNOWN', 'TASK_REPLY', 'TASK_UPDATE']).toContain(create.whatsapp.intent)
  })

  it('aprobacion: boton WhatsApp TASK_UPDATE y voz publica deniega confirmAction', async () => {
    const result = await runAt20ParityCase(AT20_CORPUS[4])
    expect(result.family).toBe('approve')
    expect(result.whatsapp.intent).toBe('TASK_UPDATE')
    expect(result.whatsapp.route).toBe('agent_aiop')
    expect(result.voice.protectedConfirmOk).toBe(false)
  })
})
