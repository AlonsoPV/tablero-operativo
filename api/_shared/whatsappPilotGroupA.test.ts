import { describe, expect, it } from 'vitest'
import { classifyAgentIntent } from './orchestrator/intent.js'
import { formatForChannel } from './orchestrator/channelAdapters.js'
import type { AgentTurnResult } from './orchestrator/runAgentTurn.js'
import {
  parseWhatsAppPilotAllowlist,
  resolveWhatsAppConversationalAccess,
  WHATSAPP_GROUP_A_READ_ONLY_MESSAGE,
} from './whatsappPilotGate.js'

describe('WhatsApp Production Upgrade — Group A (Read-Only, Per-User Pilot Gate)', () => {
  it('stays 100% legacy by default when R1=0 and pilot flag is OFF', () => {
    const access = resolveWhatsAppConversationalAccess({
      usuarioId: 'usr-owner-1',
      waId: '5215512345678',
      env: { AGENT_ORCHESTRATOR_R1: '0' },
    })
    expect(access).toEqual({ enabled: false, mode: 'legacy', readOnlyEnforced: true })
  })

  it('activates ONLY the explicitly allowlisted pilot user while keeping all other users legacy', () => {
    const env = {
      AGENT_ORCHESTRATOR_R1: '0',
      WHATSAPP_CONVERSATIONAL_PILOT_ENABLED: '1',
      WHATSAPP_CONVERSATIONAL_PILOT_USERS: 'usr-owner-1, 5215599990000',
    }

    const pilotByUuid = resolveWhatsAppConversationalAccess({
      usuarioId: 'usr-owner-1',
      waId: '5215500001111',
      env,
    })
    expect(pilotByUuid).toEqual({
      enabled: true,
      mode: 'pilot_user_allowlist',
      readOnlyEnforced: true,
    })

    const pilotByWaId = resolveWhatsAppConversationalAccess({
      usuarioId: 'usr-other',
      waId: '+52 1 55 9999 0000',
      env,
    })
    expect(pilotByWaId.enabled).toBe(true)
    expect(pilotByWaId.mode).toBe('pilot_user_allowlist')

    const nonPilot = resolveWhatsAppConversationalAccess({
      usuarioId: 'usr-regular-2',
      waId: '5215511112222',
      env,
    })
    expect(nonPilot).toEqual({ enabled: false, mode: 'legacy', readOnlyEnforced: true })
  })

  it('rejects wildcard allowlist entries (fail-closed)', () => {
    const allow = parseWhatsAppPilotAllowlist('*, all, todos')
    expect(allow.size).toBe(0)
    const access = resolveWhatsAppConversationalAccess({
      usuarioId: 'usr-owner-1',
      waId: '5215512345678',
      env: {
        AGENT_ORCHESTRATOR_R1: '0',
        WHATSAPP_CONVERSATIONAL_PILOT_ENABLED: '1',
        WHATSAPP_CONVERSATIONAL_PILOT_USERS: '*',
      },
    })
    expect(access.enabled).toBe(false)
    expect(access.mode).toBe('legacy')
  })

  it('enables global_r1 cleanly once AGENT_ORCHESTRATOR_R1=1', () => {
    const access = resolveWhatsAppConversationalAccess({
      usuarioId: 'usr-any',
      waId: '5215511112222',
      env: { AGENT_ORCHESTRATOR_R1: '1' },
    })
    expect(access).toEqual({ enabled: true, mode: 'global_r1', readOnlyEnforced: true })
    expect(WHATSAPP_GROUP_A_READ_ONLY_MESSAGE).toMatch(/solo lectura/i)
  })

  it('routes all 8 natural WhatsApp read-only questions cleanly without fallback', () => {
    const utterances: Array<[string, string]> = [
      ['¿Qué tengo pendiente hoy?', 'query_actions'],
      ['¿Qué está bloqueando a mi equipo?', 'query_actions'],
      ['¿Quién tiene acciones vencidas?', 'aggregate_execution'],
      ['¿Qué objetivos están en riesgo?', 'analyze_risk'],
      ['¿Qué necesita mi atención?', 'executive_brief'],
      ['¿Qué acordamos en la última reunión?', 'executive_commitments'],
      ['¿Cómo vamos con el proveedor?', 'query_actions'],
      ['¿Qué debería priorizar esta semana?', 'executive_brief'],
    ]
    for (const [q, expected] of utterances) {
      expect(classifyAgentIntent(q).kind).toBe(expected)
    }
  })

  it('formats WhatsApp executive answers <=900 chars, max 3 priorities, no raw markdown, with SCRUMBAN links', () => {
    const turn: AgentTurnResult = {
      handled: true,
      intent: 'executive_brief',
      format: 'direct',
      offerDetail: false,
      response: {
        status: 'ok',
        blocks: { data: ['Resumen'], recommendation: ['Revisar bloqueo'], limitations: [] },
        facts: {
          primary: { text: 'Tienes 2 bloqueos activos y 3 acciones vencidas.' },
          metrics: [
            { label: 'Vencidas', value: '3' },
            { label: 'Bloqueadas', value: '2' },
          ],
          items: [
            { kind: 'action', id: 'a1', title: 'Resolver proveedor empaque', status: 'Bloqueada', owner: 'Operaciones', date: '2026-11-27', href: '/kanban?accion=a1' },
            { kind: 'action', id: 'a2', title: 'Cerrar entregas Monterrey', status: 'Atrasada', owner: 'Logística', date: '2026-11-24', href: '/kanban?accion=a2' },
            { kind: 'action', id: 'a3', title: 'Auditar KPI entregas', status: 'En curso', owner: 'Dirección', date: '2026-11-28', href: '/kanban?accion=a3' },
            { kind: 'action', id: 'a4', title: 'Cuarta prioridad oculta', status: 'Pendiente', owner: 'Operaciones', date: '2026-11-30', href: '/kanban?accion=a4' },
          ],
          findings: [],
          recommendations: ['Atiende primero el bloqueo del proveedor de empaque.'],
          warnings: [],
          limitations: [],
        },
      },
    }

    const formatted = formatForChannel(turn, 'whatsapp')
    expect(formatted.length).toBeLessThanOrEqual(900)
    expect(formatted).not.toMatch(/[#*_`]/)
    expect(formatted).toContain('Resolver proveedor empaque')
    expect(formatted).not.toContain('Cuarta prioridad oculta')
    expect(formatted).toContain('/kanban?accion=a1')
  })
})
