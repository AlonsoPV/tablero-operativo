import { describe, expect, it } from 'vitest'
import {
  flowForRoute,
  inferOpsTextAction,
  isConsultaAlBotText,
  isMasInfoButton,
  isOpsStructuredButton,
  parseAiOpButtonId,
  resolveWhatsAppInboundRoute,
} from './whatsappFlowRouting'

describe('whatsappFlowRouting', () => {
  it('parsea aiop y botones ops', () => {
    expect(parseAiOpButtonId('aiop:123e4567-e89b-12d3-a456-426614174000:ok')).toEqual({
      opId: '123e4567-e89b-12d3-a456-426614174000',
      action: 'confirm',
    })
    expect(isOpsStructuredButton('act:abc:done')).toBe(true)
    expect(isOpsStructuredButton('chk:abc:progress')).toBe(true)
    expect(isMasInfoButton('mas_informacion', 'Más información')).toBe(true)
    expect(isConsultaAlBotText('Consulta al Bot')).toBe(true)
    expect(isConsultaAlBotText('/consulta')).toBe(true)
  })

  it('operativo: keywords ops, nunca agent en texto libre', () => {
    const keyword = resolveWhatsAppInboundRoute({
      canUseAi: false,
      textBody: 'Realizada',
      messageType: 'text',
    })
    expect(keyword.kind).toBe('ops_keyword')
    expect(flowForRoute(keyword)).toBe('ops')

    const help = resolveWhatsAppInboundRoute({
      canUseAi: false,
      textBody: '¿qué tareas tengo?',
      messageType: 'text',
    })
    expect(help.kind).toBe('ops_help')
    expect(flowForRoute(help)).toBe('ops')
  })

  it('OKRS: reportar/apoyo siempre ops; agent solo con sesión o Consulta al Bot', () => {
    const realizada = resolveWhatsAppInboundRoute({
      canUseAi: true,
      textBody: 'Realizada',
      messageType: 'text',
    })
    expect(realizada.kind).toBe('ops_keyword')
    expect(flowForRoute(realizada)).toBe('ops')

    const apoyo = resolveWhatsAppInboundRoute({
      canUseAi: true,
      textBody: 'Necesito apoyo',
      messageType: 'text',
    })
    expect(apoyo.kind).toBe('ops_keyword')

    const avance = resolveWhatsAppInboundRoute({
      canUseAi: true,
      textBody: 'Reportar avance',
      messageType: 'text',
    })
    expect(avance.kind).toBe('ops_keyword')

    const withoutSession = resolveWhatsAppInboundRoute({
      canUseAi: true,
      textBody: 'Qué acciones rojas tengo?',
      messageType: 'text',
    })
    expect(withoutSession.kind).toBe('ops_help')

    const withSession = resolveWhatsAppInboundRoute({
      canUseAi: true,
      agentSessionActive: true,
      textBody: 'Qué acciones rojas tengo?',
      messageType: 'text',
    })
    expect(withSession.kind).toBe('agent_free_text')
    expect(flowForRoute(withSession)).toBe('agent')

    const consult = resolveWhatsAppInboundRoute({
      canUseAi: true,
      textBody: 'Consulta al Bot',
      messageType: 'text',
    })
    expect(consult.kind).toBe('agent_consult')
  })

  it('botones act siguen siendo ops aunque canUseAi', () => {
    const route = resolveWhatsAppInboundRoute({
      canUseAi: true,
      buttonId: 'act:123e4567-e89b-12d3-a456-426614174000:done',
      messageType: 'interactive',
    })
    expect(route.kind).toBe('ops_button')
    expect(flowForRoute(route)).toBe('ops')
  })

  it('botones chk/tchk van a ops; keywords con emx_ también ops', () => {
    const chk = resolveWhatsAppInboundRoute({
      canUseAi: true,
      buttonId: 'chk:123e4567-e89b-12d3-a456-426614174000:support',
      messageType: 'interactive',
    })
    expect(chk.kind).toBe('ops_button')
    expect(flowForRoute(chk)).toBe('ops')

    const digest = resolveWhatsAppInboundRoute({
      canUseAi: true,
      buttonId: 'digest:support',
      messageType: 'interactive',
    })
    expect(digest.kind).toBe('ignore')

    const byId = resolveWhatsAppInboundRoute({
      canUseAi: true,
      textBody: 'emx_123 Realizada',
      messageType: 'text',
    })
    expect(byId.kind).toBe('ops_keyword')
    expect(flowForRoute(byId)).toBe('ops')
  })

  it('aiop es agent estructurado', () => {
    const route = resolveWhatsAppInboundRoute({
      canUseAi: false,
      buttonId: 'aiop:123e4567-e89b-12d3-a456-426614174000:no',
      messageType: 'interactive',
    })
    expect(route.kind).toBe('agent_aiop')
    expect(flowForRoute(route)).toBe('agent')
  })

  it('inferOpsTextAction reconoce sinónimos', () => {
    expect(inferOpsTextAction('hecho')).toBe('done')
    expect(inferOpsTextAction('en proceso')).toBe('progress')
    expect(inferOpsTextAction('requiero apoyo')).toBe('support')
    expect(inferOpsTextAction('necesito ayuda')).toBe('support')
    expect(inferOpsTextAction('hola')).toBeNull()
  })

  /** Matriz contrato 2B (mismo WABA): documenta Ops vs Agent. */
  it('matriz completa anti-drift', () => {
    const uid = '123e4567-e89b-12d3-a456-426614174000'
    const cases: Array<{
      name: string
      input: Parameters<typeof resolveWhatsAppInboundRoute>[0]
      kind: string
      flow: ReturnType<typeof flowForRoute>
    }> = [
      {
        name: 'ops_button act',
        input: { canUseAi: false, buttonId: `act:${uid}:done`, messageType: 'interactive' },
        kind: 'ops_button',
        flow: 'ops',
      },
      {
        name: 'ops_button tchk',
        input: {
          canUseAi: true,
          buttonId: `tchk:${uid}:0:support`,
          messageType: 'interactive',
        },
        kind: 'ops_button',
        flow: 'ops',
      },
      {
        name: 'emx_ texto OKRS → ops keyword (no agent)',
        input: { canUseAi: true, textBody: 'emx_45 Requiero apoyo', messageType: 'text' },
        kind: 'ops_keyword',
        flow: 'ops',
      },
      {
        name: 'ops_button chk con canUseAi',
        input: { canUseAi: true, buttonId: `chk:${uid}:progress`, messageType: 'interactive' },
        kind: 'ops_button',
        flow: 'ops',
      },
      {
        name: 'aiop',
        input: { canUseAi: true, buttonId: `aiop:${uid}:ok`, messageType: 'interactive' },
        kind: 'agent_aiop',
        flow: 'agent',
      },
      {
        name: 'mas_info por título',
        input: {
          canUseAi: false,
          buttonId: 'btn_1',
          buttonTitle: 'Más información',
          messageType: 'button',
        },
        kind: 'mas_info',
        flow: null,
      },
      {
        name: 'mas_info por id',
        input: { canUseAi: true, buttonId: 'ver_actividades', messageType: 'button' },
        kind: 'mas_info',
        flow: null,
      },
      {
        name: 'Ver actividades texto → mas_info',
        input: { canUseAi: true, textBody: 'Ver actividades', messageType: 'text' },
        kind: 'mas_info',
        flow: null,
      },
      {
        name: 'media ignore',
        input: { canUseAi: true, messageType: 'audio' },
        kind: 'ignore',
        flow: null,
      },
      {
        name: 'OKRS free text sin sesión → ops_help',
        input: { canUseAi: true, textBody: 'resumen de rojos', messageType: 'text' },
        kind: 'ops_help',
        flow: 'ops',
      },
      {
        name: 'OKRS free text con sesión → agent',
        input: {
          canUseAi: true,
          agentSessionActive: true,
          textBody: 'resumen de rojos',
          messageType: 'text',
        },
        kind: 'agent_free_text',
        flow: 'agent',
      },
      {
        name: 'OKRS Realizada → ops',
        input: { canUseAi: true, textBody: 'Realizada', messageType: 'text' },
        kind: 'ops_keyword',
        flow: 'ops',
      },
      {
        name: 'ops keyword',
        input: { canUseAi: false, textBody: 'En progreso', messageType: 'text' },
        kind: 'ops_keyword',
        flow: 'ops',
      },
      {
        name: 'ops help',
        input: { canUseAi: false, textBody: 'hola', messageType: 'text' },
        kind: 'ops_help',
        flow: 'ops',
      },
      {
        name: 'Consulta al Bot → agent_consult (con AI)',
        input: { canUseAi: true, textBody: 'Consulta al Bot', messageType: 'text' },
        kind: 'agent_consult',
        flow: 'agent',
      },
      {
        name: 'Consulta al Bot → agent_consult (sin AI; handler niega)',
        input: { canUseAi: false, textBody: 'Consulta al Bot', messageType: 'text' },
        kind: 'agent_consult',
        flow: 'agent',
      },
      {
        name: '/consulta comando',
        input: { canUseAi: true, textBody: '/consulta', messageType: 'text' },
        kind: 'agent_consult',
        flow: 'agent',
      },
      {
        name: 'interactive free text título → ops_help sin sesión',
        input: {
          canUseAi: true,
          buttonTitle: 'Consulta tablero',
          messageType: 'interactive',
        },
        kind: 'ops_help',
        flow: 'ops',
      },
    ]

    for (const row of cases) {
      const route = resolveWhatsAppInboundRoute(row.input)
      expect(route.kind, row.name).toBe(row.kind)
      expect(flowForRoute(route), row.name).toBe(row.flow)
    }
  })
})
