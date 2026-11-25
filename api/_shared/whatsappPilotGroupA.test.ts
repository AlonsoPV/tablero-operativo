import { describe, expect, it } from 'vitest'
import { classifyAgentIntent } from './orchestrator/intent.js'
import { formatForChannel } from './orchestrator/channelAdapters.js'
import type { AgentTurnResult } from './orchestrator/runAgentTurn.js'
import { resolveWhatsAppFlowAccess } from './whatsappPilotGate.js'

const OWNER_UUID = '11111111-1111-4111-8111-111111111111'
const OTHER_UUID = '22222222-2222-4222-8222-222222222222'

describe('WhatsApp Production Upgrade — Group A (Read-Only + Fail-Closed Pilot)', () => {
  it('isolates pilot strictly to allowlisted UUID even when AGENT_ORCHESTRATOR_R1=1 (web)', () => {
    const env = {
      AGENT_ORCHESTRATOR_R1: '1',
      WHATSAPP_PILOT_ENABLED: '1',
      WHATSAPP_ORCHESTRATOR_PILOT_USERS: OWNER_UUID,
    }
    expect(
      resolveWhatsAppFlowAccess(
        { usuarioId: OWNER_UUID, waId: '5215512345678', active: true, aiAuthorized: true },
        env
      )
    ).toMatchObject({ allowed: true, mode: 'pilot' })

    expect(
      resolveWhatsAppFlowAccess(
        { usuarioId: OTHER_UUID, waId: '5215599990000', active: true, aiAuthorized: true },
        env
      )
    ).toMatchObject({ allowed: false, mode: 'legacy' })
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
