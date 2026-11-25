import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  CHANNEL_SELECTOR_DEBOUNCE_MS,
  VOICE_LINK_RESEND_COOLDOWN_MS,
  channelSelectorFallbackText,
  classifyWhatsAppIntent,
  extractVoiceLinkFromPayload,
  flowForRoute,
  inferOpsTextAction,
  intentForRoute,
  isConsultaAlBotText,
  isMasInfoButton,
  isOpsStructuredButton,
  isWithinCooldown,
  looksLikeQueryText,
  parseAiOpButtonId,
  pickUniqueOpsTarget,
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
    expect(isMasInfoButton(null, '/actividades')).toBe(true)
    expect(isConsultaAlBotText('Consulta al Bot')).toBe(true)
    expect(isConsultaAlBotText('/consulta')).toBe(true)
  })

  it('cooldown selector/voz y extracción de liga', () => {
    const now = Date.parse('2026-11-10T18:00:00.000Z')
    expect(isWithinCooldown('2026-11-10T17:59:30.000Z', CHANNEL_SELECTOR_DEBOUNCE_MS, now)).toBe(
      true
    )
    expect(isWithinCooldown('2026-11-10T17:58:00.000Z', CHANNEL_SELECTOR_DEBOUNCE_MS, now)).toBe(
      false
    )
    expect(isWithinCooldown('2026-11-10T17:58:30.000Z', VOICE_LINK_RESEND_COOLDOWN_MS, now)).toBe(
      true
    )
    expect(
      extractVoiceLinkFromPayload({
        event: 'voice_link_sent',
        link: 'https://scrumbanemx.vercel.app/guia/invitacion/abc',
      })
    ).toBe('https://scrumbanemx.vercel.app/guia/invitacion/abc')
    expect(extractVoiceLinkFromPayload({ event: 'voice_link_sent' })).toBeNull()
    expect(channelSelectorFallbackText()).toContain('Por mensaje')
    expect(channelSelectorFallbackText()).toContain('Por voz')
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

  it('OKRS: reportar/apoyo ops; QUERY va a agent aunque no haya sesión', () => {
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
    expect(withoutSession.kind).toBe('agent_free_text')

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
        name: 'OKRS free text sin sesión → agent (QUERY)',
        input: { canUseAi: true, textBody: 'resumen de rojos', messageType: 'text' },
        kind: 'agent_free_text',
        flow: 'agent',
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
        name: 'Iniciar bot → agent_consult',
        input: { canUseAi: true, textBody: 'Iniciar bot', messageType: 'text' },
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
        name: 'aich text button',
        input: { canUseAi: true, buttonId: 'aich:text', messageType: 'interactive' },
        kind: 'agent_channel',
        flow: 'agent',
      },
      {
        name: 'aich voice button',
        input: { canUseAi: true, buttonId: 'aich:voice', messageType: 'interactive' },
        kind: 'agent_channel',
        flow: 'agent',
      },
      {
        name: 'keyword quiero hablar por voz',
        input: { canUseAi: true, textBody: 'Quiero hablar por voz', messageType: 'text' },
        kind: 'agent_channel',
        flow: 'agent',
      },
      {
        name: 'keyword prefiero escribir',
        input: { canUseAi: true, textBody: 'Prefiero escribir', messageType: 'text' },
        kind: 'agent_channel',
        flow: 'agent',
      },
      {
        name: 'interactive free text título con tablero → QUERY agent',
        input: {
          canUseAi: true,
          buttonTitle: 'Consulta tablero',
          messageType: 'interactive',
        },
        kind: 'agent_free_text',
        flow: 'agent',
      },
      {
        name: 'texto ambiguo largo → ask_flow',
        input: {
          canUseAi: true,
          textBody: 'necesito revisar eso mañana temprano',
          messageType: 'text',
        },
        kind: 'ask_flow',
        flow: null,
      },
    ]

    for (const row of cases) {
      const route = resolveWhatsAppInboundRoute(row.input)
      expect(route.kind, row.name).toBe(row.kind)
      expect(flowForRoute(route), row.name).toBe(row.flow)
    }
  })

  describe('escenarios A–J (separación QUERY vs OPS)', () => {
    it('A QUERY vencidas → agent/QUERY', () => {
      const { intent, route } = classifyWhatsAppIntent({
        canUseAi: true,
        textBody: '¿Qué tareas tengo vencidas?',
        messageType: 'text',
        correlatedTargetCount: 2,
      })
      expect(route.kind).toBe('agent_free_text')
      expect(intent).toBe('QUERY')
    })

    it('B update explícito → TASK_UPDATE', () => {
      const { intent, route } = classifyWhatsAppIntent({
        canUseAi: true,
        textBody: 'Marca la tarea #12 como hecha',
        messageType: 'text',
        correlatedTargetCount: 1,
      })
      expect(route.kind).toBe('ops_keyword')
      expect(intent).toBe('TASK_UPDATE')
    })

    it('C cambio de flujo OKR keyword → update', () => {
      const { route } = classifyWhatsAppIntent({
        canUseAi: true,
        textBody: 'Realizada',
        messageType: 'text',
        correlatedTargetCount: 1,
      })
      expect(route.kind).toBe('ops_keyword')
      expect(flowForRoute(route)).toBe('ops')
    })

    it('D followup pendiente + consulta bloqueadas → QUERY sin mutar', () => {
      const { intent, route } = classifyWhatsAppIntent({
        canUseAi: true,
        textBody: '¿Cuáles están bloqueadas?',
        messageType: 'text',
        correlatedTargetCount: 1,
      })
      expect(route.kind).toBe('agent_free_text')
      expect(intent).toBe('QUERY')
      expect(looksLikeQueryText('¿Cuáles están bloqueadas?')).toBe(true)
    })

    it('E Ya terminé con 1 correlación → TASK_REPLY', () => {
      const { intent, route } = classifyWhatsAppIntent({
        canUseAi: true,
        textBody: 'Ya terminé',
        messageType: 'text',
        correlatedTargetCount: 1,
      })
      expect(route.kind).toBe('ops_keyword')
      expect(intent).toBe('TASK_REPLY')
    })

    it('F Ya terminé con 2 → CLARIFICATION', () => {
      const { intent, route } = classifyWhatsAppIntent({
        canUseAi: true,
        textBody: 'Ya terminé',
        messageType: 'text',
        correlatedTargetCount: 2,
      })
      expect(route.kind).toBe('ops_clarify')
      expect(intent).toBe('CLARIFICATION')
      if (route.kind === 'ops_clarify') expect(route.reason).toBe('many')
    })

    it('G dedup conceptual: mismo meta id no re-clasifica distinto', () => {
      const input = {
        canUseAi: true,
        textBody: '¿Qué OKRs van mal?',
        messageType: 'text' as const,
      }
      const a = classifyWhatsAppIntent(input)
      const b = classifyWhatsAppIntent(input)
      expect(a.rule).toBe(b.rule)
      expect(a.intent).toBe(b.intent)
    })

    it('H mensajes rápidos: orden + aislamiento sesión (clarificationPending)', () => {
      const first = classifyWhatsAppIntent({
        canUseAi: true,
        textBody: 'Ya terminé',
        messageType: 'text',
        correlatedTargetCount: 2,
      })
      expect(first.route.kind).toBe('ops_clarify')

      const second = classifyWhatsAppIntent({
        canUseAi: true,
        textBody: 'la del informe semanal',
        messageType: 'text',
        clarificationPending: true,
        correlatedTargetCount: 2,
      })
      // Aclaración pendiente no fuerza OPS write ciego; va a texto libre/agent para desambiguar.
      expect(second.route.kind).toBe('agent_free_text')
    })

    it('I reply expirado (0 correlación) → pedir contexto', () => {
      const { intent, route } = classifyWhatsAppIntent({
        canUseAi: false,
        textBody: 'hecho',
        messageType: 'text',
        correlatedTargetCount: 0,
      })
      expect(route.kind).toBe('ops_clarify')
      expect(intent).toBe('CLARIFICATION')
      if (route.kind === 'ops_clarify') expect(route.reason).toBe('none')
    })

    it('J alternancia consulta/update conserva intents distintos', () => {
      const query = classifyWhatsAppIntent({
        canUseAi: true,
        textBody: '¿Cómo van mis OKRs?',
        messageType: 'text',
        correlatedTargetCount: 1,
      })
      const update = classifyWhatsAppIntent({
        canUseAi: true,
        textBody: 'listo',
        messageType: 'text',
        correlatedTargetCount: 1,
      })
      expect(query.intent).toBe('QUERY')
      expect(update.intent).toBe('TASK_REPLY')
      expect(flowForRoute(query.route)).toBe('agent')
      expect(flowForRoute(update.route)).toBe('ops')
    })

    it('pickUniqueOpsTarget one/none/many', () => {
      expect(pickUniqueOpsTarget([])).toEqual({ status: 'none' })
      expect(pickUniqueOpsTarget([{ id: 'a' }])).toEqual({
        status: 'one',
        target: { id: 'a' },
      })
      const many = pickUniqueOpsTarget([{ id: 'a' }, { id: 'b' }])
      expect(many.status).toBe('many')
    })

    it('cancel intent', () => {
      const { intent, route } = classifyWhatsAppIntent({
        canUseAi: true,
        textBody: 'cancelar',
        messageType: 'text',
      })
      expect(route.kind).toBe('cancel')
      expect(intent).toBe('CANCEL')
      expect(intentForRoute(route)).toBe('CANCEL')
    })

    it('Group B audio routing separates assistant voice note, ambiguous audio, and disabled/evidence-only', () => {
      // 1. Nota de voz al asistente sin evidencia pendiente y flag ON
      expect(
        resolveWhatsAppInboundRoute({
          canUseAi: true,
          voiceNotesEnabled: true,
          hasWaitingEvidence: false,
          messageType: 'audio',
        })
      ).toEqual({ kind: 'agent_voice_note' })

      // 2. Audio ambiguo: evidencia pendiente + sesión activa con asistente
      expect(
        resolveWhatsAppInboundRoute({
          canUseAi: true,
          voiceNotesEnabled: true,
          hasWaitingEvidence: true,
          agentSessionActive: true,
          messageType: 'audio',
        })
      ).toEqual({ kind: 'audio_ambiguous' })

      // 3. Evidencia pendiente sin sesión activa (conserva flujo handleEvidence, no va a IA)
      expect(
        resolveWhatsAppInboundRoute({
          canUseAi: true,
          voiceNotesEnabled: true,
          hasWaitingEvidence: true,
          agentSessionActive: false,
          messageType: 'audio',
        })
      ).toEqual({ kind: 'ignore' })

      // 4. Flag OFF o usuario sin permiso: no enruta audio al asistente
      expect(
        resolveWhatsAppInboundRoute({
          canUseAi: true,
          voiceNotesEnabled: false,
          messageType: 'audio',
        })
      ).toEqual({ kind: 'ignore' })
    })
  })

  it('anti-drift: Edge _shared espeja src/lib/whatsappFlowRouting.ts', () => {
    const root = join(dirname(fileURLToPath(import.meta.url)), '../..')
    const src = readFileSync(join(root, 'src/lib/whatsappFlowRouting.ts'), 'utf8')
    const edge = readFileSync(
      join(root, 'supabase/functions/_shared/whatsappFlowRouting.ts'),
      'utf8'
    )
    const withoutBanner = edge.replace(
      /^\/\*\* AUTO-GENERATED from src\/lib\/whatsappFlowRouting\.ts[^\n]*\n/,
      ''
    )
    expect(withoutBanner).toBe(src)
  })
})
