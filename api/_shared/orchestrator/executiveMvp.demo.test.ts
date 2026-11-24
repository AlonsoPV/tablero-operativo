import { afterEach, describe, expect, it } from 'vitest'
import type { CopilotToolResult } from '../../../src/features/ai-support/copilot/types.js'
import { createMemoryStore } from '../memory/store.js'
import { resolveActor } from '../query/resolveActor.js'
import type { ToolDispatcher } from '../query/index.js'
import { formatForChannel, uiForTurn } from './channelAdapters.js'
import { runAgentTurn } from './runAgentTurn.js'
import { createMemorySessionContextStore } from './sessionContext.js'

const TODAY = '2026-11-24'
const AS_OF = '2026-11-24T12:00:00.000Z'

const OWNER_ACTOR = resolveActor(
  {
    supabase: {} as never,
    authUserId: 'auth-owner-1',
    usuarioId: 'owner-1',
    rol: 'Super Admin',
    active: true,
    boardScope: 'role',
  },
  {
    channel: 'web',
    sessionId: 'demo-owner',
  }
)

const OPERATIVO_ACTOR = resolveActor(
  {
    supabase: {} as never,
    authUserId: 'auth-op-1',
    usuarioId: 'op-1',
    rol: 'Operativo',
    active: true,
    boardScope: 'role',
  },
  {
    channel: 'web',
    sessionId: 'demo-op',
  }
)

const DEMO_OPEN_ACTIONS = [
  {
    id: 'act-1',
    title: 'Desbloquear auditoría de rutas OKR OTIF',
    estado: 'Bloqueado',
    fecha: '2026-11-18',
    prioridad: 'P1_Alta',
    area: 'Logística',
    responsable: 'u-carlos',
    responsable_nombre: 'Carlos Mendoza',
  },
  {
    id: 'act-2',
    title: 'Corregir quiebre de stock almacén norte',
    estado: 'Retraso',
    fecha: '2026-11-19',
    prioridad: 'P1_Alta',
    area: 'Logística',
    responsable: 'u-carlos',
    responsable_nombre: 'Carlos Mendoza',
  },
  {
    id: 'act-3',
    title: 'Cerrar conciliación de entregas pendientes',
    estado: 'Retraso',
    fecha: '2026-11-21',
    prioridad: 'P2_Media',
    area: 'Operaciones',
    responsable: 'u-ana',
    responsable_nombre: 'Ana López',
  },
  {
    id: 'act-4',
    title: 'Actualizar matriz de KPIs semanales',
    estado: 'En_Ejecucion',
    fecha: '2026-11-26',
    prioridad: 'P2_Media',
    area: 'Finanzas',
    responsable: 'u-luis',
    responsable_nombre: 'Luis Torres',
  },
  {
    id: 'act-5',
    title: 'Documentar procedimiento de recepción',
    estado: 'Pendiente',
    fecha: null,
    prioridad: 'P3_Baja',
    area: 'Operaciones',
    responsable: 'u-ana',
    responsable_nombre: 'Ana López',
  },
]

const DEMO_PENDING_VERIFICATION = [
  {
    id: 'act-v1',
    title: 'Validar checklist de embarque zona sur',
    estado: 'Hecho',
    fecha: '2026-11-22',
    prioridad: 'P2_Media',
    area: 'Logística',
    responsable: 'u-carlos',
    responsable_nombre: 'Carlos Mendoza',
  },
  {
    id: 'act-v2',
    title: 'Cierre de inventario cíclico octubre',
    estado: 'Hecho',
    fecha: '2026-11-20',
    prioridad: 'P2_Media',
    area: 'Operaciones',
    responsable: 'u-ana',
    responsable_nombre: 'Ana López',
  },
]

const DEMO_OKRS = [
  {
    id: 'okr-1',
    nombre: 'Elevar OTIF de entregas a 96%',
    progress: 32,
    krCount: 3,
    initiativesCount: 2,
    scope: 'company',
    start_date: '2026-10-01',
    end_date: '2026-12-31',
    pace: 'bajo_ritmo',
  },
  {
    id: 'okr-2',
    nombre: 'Reducir merma de almacén en 20%',
    progress: 68,
    krCount: 2,
    initiativesCount: 2,
    scope: 'company',
    start_date: '2026-10-01',
    end_date: '2026-12-31',
    pace: 'en_ritmo',
  },
  {
    id: 'okr-3',
    nombre: 'Estandarizar onboarding operativo',
    progress: null,
    krCount: 2,
    initiativesCount: 0,
    scope: 'team',
    start_date: null,
    end_date: null,
    pace: 'sin_datos',
  },
]

function okResult(tool: string, data: Record<string, unknown>): CopilotToolResult {
  return { ok: true, kind: 'ok', tool, data } as unknown as CopilotToolResult
}

function createDemoDispatcher(options?: { empty?: boolean }): ToolDispatcher {
  return async (_actor, name, args) => {
    if (options?.empty) {
      if (name === 'get_okr_progress') {
        return okResult('get_okr_progress', { items: [], objectives: 0 })
      }
      return okResult('get_my_actions', { items: [], total: 0, truncated: false, as_of: AS_OF })
    }

    if (name === 'get_okr_progress') {
      return okResult('get_okr_progress', { items: DEMO_OKRS, objectives: DEMO_OKRS.length })
    }

    if (name === 'get_my_actions') {
      const a = args as Record<string, unknown>
      const statusGroup = a.status_group as string | undefined
      const scope = a.scope as string | undefined

      if (statusGroup === 'verification') {
        const items =
          scope === 'assigned_to_me'
            ? DEMO_PENDING_VERIFICATION.slice(0, 1)
            : DEMO_PENDING_VERIFICATION
        return okResult('get_my_actions', { items, total: items.length, truncated: false, as_of: AS_OF })
      }

      if (a.group_by === 'area') {
        return okResult('get_my_actions', {
          groups: {
            Logística: 2,
            Operaciones: 1,
          },
          total: 3,
          as_of: AS_OF,
        })
      }
      if (statusGroup === 'overdue') {
        const items = DEMO_OPEN_ACTIONS.filter(
          (i) => i.estado === 'Retraso' || (i.fecha != null && i.fecha < TODAY)
        )
        return okResult('get_my_actions', { items, total: items.length, truncated: false, as_of: AS_OF })
      }

      const items =
        scope === 'assigned_to_me' ? [DEMO_OPEN_ACTIONS[2]!] : DEMO_OPEN_ACTIONS
      return okResult('get_my_actions', { items, total: items.length, truncated: false, as_of: AS_OF })
    }

    return { ok: false, kind: 'error', tool: name, error: `unsupported_tool:${name}` } as unknown as CopilotToolResult
  }
}

async function runWebDemoTurn(
  actor: typeof OWNER_ACTOR,
  utterance: string,
  deps: Parameters<typeof runAgentTurn>[1]
) {
  const turn = await runAgentTurn({ actor, utterance }, deps)
  return {
    turn,
    text: formatForChannel(turn, 'web'),
    ui: uiForTurn(turn, 'web'),
  }
}

describe('Executive MVP — 5 End-to-End Demo Scenarios', () => {
  const prevR3 = process.env.AGENT_MEMORY_R3
  const prevR2 = process.env.COPILOT_R2_MODE

  afterEach(() => {
    if (prevR3 === undefined) delete process.env.AGENT_MEMORY_R3
    else process.env.AGENT_MEMORY_R3 = prevR3
    if (prevR2 === undefined) delete process.env.COPILOT_R2_MODE
    else process.env.COPILOT_R2_MODE = prevR2
  })

  it('Escenario 1: El dueño consulta el estado general de la operación', async () => {
    const store = createMemorySessionContextStore()
    const res = await runWebDemoTurn(OWNER_ACTOR, '¿Cómo está mi empresa hoy?', {
      dispatch: createDemoDispatcher(),
      store,
      today: () => TODAY,
    })

    expect(res.turn.handled).toBe(true)
    expect(res.turn.intent).toBe('executive_brief')
    expect(res.turn.format).toBe('report')
    expect(res.text).toContain('5 abiertas')
    expect(res.text).toContain('3 vencidas')
    expect(res.text).toContain('1 bloqueadas')
    expect(res.text).toContain('2 en Hecho pendientes de Verificado')
    expect(res.text).toContain('Logística')
    expect(res.ui?.views.some((v) => v.type === 'operational_summary')).toBe(true)
  })

  it('Escenario 2: El dueño identifica los 3 principales problemas y patrones repetidos', async () => {
    const store = createMemorySessionContextStore()
    const res = await runWebDemoTurn(OWNER_ACTOR, '¿Qué requiere mi atención hoy?', {
      dispatch: createDemoDispatcher(),
      store,
      today: () => TODAY,
    })

    expect(res.turn.handled).toBe(true)
    expect(res.turn.intent).toBe('executive_brief')
    const priorityActions =
      res.turn.response.facts?.items.filter((i) => i.kind === 'action') ?? []
    expect(priorityActions.length).toBeLessThanOrEqual(3)
    expect(priorityActions.length).toBe(3)
    expect(priorityActions[0]?.title).toContain('Desbloquear auditoría de rutas OKR OTIF')
    expect(res.text).toContain('Evidencia:')
    expect(res.text).toContain('Por qué importa')
    expect(res.text).toContain('Qué recomiendo primero')
    expect(res.text).toContain('Siguiente paso')

    const byDept = await runWebDemoTurn(
      OWNER_ACTOR,
      '¿Qué departamentos presentan mayores retrasos?',
      { dispatch: createDemoDispatcher(), store, today: () => TODAY }
    )
    expect(byDept.turn.handled).toBe(true)
    expect(byDept.turn.intent).toBe('aggregate_execution')
    expect(byDept.text).toContain('Logística')
  })

  it('Escenario 3: El dueño revisa compromisos pendientes, responsables y contexto R3 diferenciado', async () => {
    process.env.AGENT_MEMORY_R3 = '1'
    const store = createMemorySessionContextStore()
    const memoryStore = createMemoryStore()
    memoryStore.insertMemory({
      id: 'mem-1',
      usuario_id: 'owner-1',
      area_id: null,
      access_level: 'project_read',
      memory_type: 'agreement',
      source_kind: 'session',
      source_ref: 'comite-2026-11-23',
      body: 'Carlos Mendoza debe cerrar auditoría de rutas y compromisos pendientes antes del viernes.',
      version: 1,
      validation_status: 'confirmed',
      supersedes_id: null,
      expires_at: null,
      confirmed_by: 'owner-1',
      confirmed_at: AS_OF,
    })

    const res = await runWebDemoTurn(OWNER_ACTOR, 'Revisar compromisos pendientes', {
      dispatch: createDemoDispatcher(),
      store,
      memoryStore,
      today: () => TODAY,
    })

    expect(res.turn.handled).toBe(true)
    expect(res.turn.intent).toBe('executive_commitments')
    expect(res.turn.format).toBe('report')
    expect(res.text).toContain('Carlos Mendoza')
    expect(res.text).toContain('Ana López')
    expect(res.text).toContain('2 pendientes de Verificado')
    expect(res.text).toContain('[Memoria R3]')
    expect(res.text).toContain('no sustituyen el estado vivo')
  })

  it('Escenario 4: El dueño consulta el avance estratégico y sus riesgos', async () => {
    const store = createMemorySessionContextStore()
    const okrTurn = await runWebDemoTurn(OWNER_ACTOR, 'Revisar avances estratégicos', {
      dispatch: createDemoDispatcher(),
      store,
      today: () => TODAY,
    })
    expect(okrTurn.turn.handled).toBe(true)
    expect(okrTurn.turn.intent).toBe('query_okrs')
    expect(okrTurn.text).toContain('Elevar OTIF de entregas a 96%')
    expect(okrTurn.text).toContain('sin datos suficientes')
    expect(okrTurn.text).toContain('bajo el ritmo esperado del periodo')

    const attention = await runWebDemoTurn(
      OWNER_ACTOR,
      '¿Qué objetivos estratégicos requieren atención?',
      { dispatch: createDemoDispatcher(), store, today: () => TODAY }
    )
    expect(attention.turn.handled).toBe(true)
    expect(attention.turn.intent).toBe('query_okrs')
    expect(attention.text).toContain('Elevar OTIF de entregas a 96%')

    const riskTurn = await runWebDemoTurn(
      OWNER_ACTOR,
      '¿Qué riesgos hay en el avance estratégico?',
      { dispatch: createDemoDispatcher(), store, today: () => TODAY }
    )
    expect(riskTurn.turn.handled).toBe(true)
    expect(riskTurn.turn.intent).toBe('analyze_risk')
    expect(riskTurn.text).toContain('32%')
    expect(riskTurn.text).toContain('bajo ritmo del periodo')
  })

  it('Escenario 5: El dueño recibe recomendación y prepara un borrador de acción sin ejecutar R2', async () => {
    delete process.env.COPILOT_R2_MODE
    const store = createMemorySessionContextStore()

    const brief = await runWebDemoTurn(OWNER_ACTOR, '¿Qué requiere mi atención hoy?', {
      dispatch: createDemoDispatcher(),
      store,
      today: () => TODAY,
    })
    expect(brief.turn.handled).toBe(true)

    const draft = await runWebDemoTurn(
      OWNER_ACTOR,
      'Prepara un borrador de acción para desbloquear la auditoría de rutas con proveedor para mañana',
      { dispatch: createDemoDispatcher(), store, today: () => TODAY }
    )

    expect(draft.turn.handled).toBe(true)
    expect(draft.turn.intent).toBe('write_request')
    expect(draft.turn.proposal).toBeDefined()
    expect(draft.text).toContain('Propuesta identificada')
    expect(draft.text).toContain('no está habilitada')
  })

  it('Guardrails: respeta permisos de Operativo y entrega estado vacío útil sin inventar datos', async () => {
    const store = createMemorySessionContextStore()
    const opRes = await runWebDemoTurn(OPERATIVO_ACTOR, '¿Cómo está mi empresa hoy?', {
      dispatch: createDemoDispatcher(),
      store,
      today: () => TODAY,
    })
    expect(opRes.turn.handled).toBe(true)
    expect(opRes.text).toContain('Alcance limitado por permiso')
    expect(opRes.text).not.toContain('Carlos Mendoza')

    const emptyRes = await runWebDemoTurn(OWNER_ACTOR, '¿Cómo está mi empresa hoy?', {
      dispatch: createDemoDispatcher({ empty: true }),
      store,
      today: () => TODAY,
    })
    expect(emptyRes.turn.handled).toBe(true)
    expect(emptyRes.turn.response.status).toBe('empty')
    expect(emptyRes.text).toContain('No se inventan indicadores')
  })
})
