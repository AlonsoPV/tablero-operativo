import { describe, expect, it } from 'vitest'
import { formatForChannel } from './orchestrator/channelAdapters.js'
import { classifyAgentIntent } from './orchestrator/intent.js'
import { runAgentTurn } from './orchestrator/runAgentTurn.js'
import { createMemorySessionContextStore, type AgentSessionContext } from './orchestrator/sessionContext.js'
import { resolveActor } from './query/resolveActor.js'

const PILOT_ACTOR = resolveActor(
  {
    supabase: {} as never,
    authUserId: 'auth-pilot-1',
    usuarioId: 'dd764c9f-8145-45d4-9111-0a8ec7f687e5',
    rol: 'Super Admin',
    active: true,
    boardScope: 'role',
  },
  {
    channel: 'whatsapp',
    sessionId: 'wa-pilot-acceptance',
  }
)

const SAMPLE_ACTIONS = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    titulo_accion: 'Control de calidad operativa previo a carga',
    estado: 'Pendiente',
    fecha: '2026-11-13',
    prioridad: 'Roja',
    responsable_nombre: 'Carlos Mendez',
    responsable: '0ecab769-46bd-4de7-94da-b2b1e8b6c98b',
    area: 'Operaciones',
    updated_at: '2026-11-12T10:00:00Z',
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    titulo_accion: 'Validar cierre de inventario semanal',
    estado: 'En_Ejecucion',
    fecha: '2026-11-20',
    prioridad: 'Amarilla',
    responsable_nombre: 'Sofia Ruiz',
    responsable: '1ecab769-46bd-4de7-94da-b2b1e8b6c98c',
    area: 'Logistica',
    updated_at: '2026-11-19T15:00:00Z',
  },
]

const SAMPLE_OKRS = {
  ok: true,
  okrs: [
    {
      id: 'okr-1',
      nombre: 'Excelencia operativa Q4',
      progreso: 68,
      estado: 'en_progreso',
      key_results: [{ id: 'kr-1', nombre: 'Cierre en tiempo >= 80%', progreso: 72 }],
      iniciativas: [{ id: 'ini-1', nombre: 'Estandarizar control previo a carga', estado: 'Activa' }],
    },
  ],
}

describe('WhatsApp 1.0 Owner Acceptance Scenarios (A, B, C)', () => {
  it('Escenario A — Continuidad conversacional determinista sin UUIDs crudos', async () => {
    expect(classifyAgentIntent('¿Qué necesita mi atención hoy?', null)).toEqual({
      kind: 'executive_brief',
      focus: 'priorities',
    })

    const sessionWithPriorities: AgentSessionContext = {
      scope: 'team_authorized',
      lastIntent: 'executive_brief',
      lastPriorities: [
        {
          rank: 1,
          title: 'Control de calidad operativa previo a carga',
          actionId: '11111111-1111-4111-8111-111111111111',
          responsable: 'Carlos Mendez',
          dueDate: '2026-11-13',
          status: 'Pendiente',
        },
        {
          rank: 2,
          title: 'Validar cierre de inventario semanal',
          actionId: '22222222-2222-4222-8222-222222222222',
          responsable: 'Sofia Ruiz',
          dueDate: '2026-11-20',
          status: 'En_Ejecucion',
        },
      ],
    }

    expect(classifyAgentIntent('Dame el detalle de la primera', sessionWithPriorities)).toEqual({
      kind: 'executive_evidence',
      priorityIndex: 0,
    })
    expect(classifyAgentIntent('Dame el detalle de la segunda', sessionWithPriorities)).toEqual({
      kind: 'executive_evidence',
      priorityIndex: 1,
    })
    expect(classifyAgentIntent('Dame el detalle de esa acción', sessionWithPriorities)).toMatchObject({
      kind: 'executive_evidence',
    })

    const store = createMemorySessionContextStore()
    const turn = await runAgentTurn(
      {
        actor: PILOT_ACTOR,
        utterance: 'Dame el detalle de la primera',
        session: sessionWithPriorities,
        channel: 'whatsapp',
        r2Mode: 'off',
      },
      {
        store,
        dispatch: async (_actor, tool) => {
          if (tool === 'get_module_data') return { ok: true, items: SAMPLE_ACTIONS, total: 2 }
          if (tool === 'get_okr_progress') return SAMPLE_OKRS
          return { ok: true }
        },
      }
    )

    expect(turn.handled).toBe(true)
    const waText = formatForChannel(turn, 'whatsapp')
    expect(waText).toBeTruthy()
    expect(waText).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)
  })

  it('Escenario B — Creación de acciones con R2 OFF responde guardrail explícito sin prometer propuesta', async () => {
    const intent = classifyAgentIntent('Crea una acción para revisar presupuesto el viernes', null)
    expect(intent).toMatchObject({
      kind: 'write_request',
      operation: 'create_action',
    })

    const store = createMemorySessionContextStore()
    const turn = await runAgentTurn(
      {
        actor: PILOT_ACTOR,
        utterance: 'Crea una acción para revisar presupuesto el viernes',
        session: null,
        channel: 'whatsapp',
        r2Mode: 'off',
      },
      {
        store,
        dispatch: async () => ({ ok: true, items: SAMPLE_ACTIONS, total: 2 }),
      }
    )

    expect(turn.handled).toBe(true)
    const waText = formatForChannel(turn, 'whatsapp')
    const reply = waText.toLowerCase()
    expect(reply).not.toContain('quien sera el responsable')
    expect(reply).not.toContain('preparare la propuesta')
    expect(waText).toMatch(/solo lectura|no est[aá] habilitada|deshabilitada|bloquead|confirmaci[oó]n|tablero/i)
  })

  it('Escenario C — Iniciativas y OKRs diferenciados de acciones y proyectos sin colisión', () => {
    const initiativeQueries = [
      'Muéstrame mis iniciativas activas',
      '¿Qué iniciativas tengo activas?',
      'Mis iniciativas',
      'Iniciativas en curso',
      '¿Cómo van las iniciativas?',
      '¿Cómo vamos con las iniciativas?',
      '¿Cómo vamos con los OKRs?',
    ]
    for (const q of initiativeQueries) {
      expect(classifyAgentIntent(q, null), q).toMatchObject({ kind: 'query_okrs' })
    }

    // Sin colisión con proyectos, acciones abiertas ni creación de iniciativas
    expect(classifyAgentIntent('¿Cómo vamos con el proyecto de logística?', null)).toMatchObject({
      kind: 'query_actions',
    })
    expect(classifyAgentIntent('¿Qué acciones tengo abiertas?', null)).toMatchObject({
      kind: 'query_actions',
    })
    expect(classifyAgentIntent('Crea una iniciativa para reducir retrasos', null)).toMatchObject({
      kind: 'write_request',
    })
  })
})
