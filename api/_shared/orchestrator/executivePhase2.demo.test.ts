import { describe, expect, it } from 'vitest'
import type { CopilotToolResult } from '../../../src/features/ai-support/copilot/types.js'
import { resolveActor } from '../query/resolveActor.js'
import type { ToolDispatcher } from '../query/index.js'
import { formatForChannel, uiForTurn } from './channelAdapters.js'
import { runAgentTurn } from './runAgentTurn.js'
import { createMemorySessionContextStore } from './sessionContext.js'

const TODAY = '2026-11-24'
const AS_OF = '2026-11-24T14:00:00.000Z'

const OWNER_ACTOR = resolveActor(
  {
    supabase: {} as never,
    authUserId: 'auth-owner-2',
    usuarioId: 'owner-2',
    rol: 'Super Admin',
    active: true,
    boardScope: 'role',
  },
  { channel: 'web', sessionId: 'phase2-owner' }
)

const OPERATIVO_ACTOR = resolveActor(
  {
    supabase: {} as never,
    authUserId: 'auth-op-2',
    usuarioId: 'op-2',
    rol: 'Operativo',
    active: true,
    boardScope: 'role',
  },
  { channel: 'web', sessionId: 'phase2-op' }
)

const PHASE2_OPEN_ACTIONS = [
  {
    id: 'p2-1',
    title: 'Desbloquear permiso de transporte aduanal',
    estado: 'Bloqueado',
    fecha: '2026-11-18',
    prioridad: 'P1_Alta',
    area: 'Logística',
    responsable: 'u-carlos',
    responsable_nombre: 'Carlos Mendoza',
    updated_at: '2026-11-17T10:00:00.000Z',
    evidencia_cargada: false,
  },
  {
    id: 'p2-2',
    title: 'Cerrar conciliación de mermas almacén norte',
    estado: 'Retraso',
    fecha: '2026-11-20',
    prioridad: 'P1_Alta',
    area: 'Logística',
    responsable: 'u-carlos',
    responsable_nombre: 'Carlos Mendoza',
    updated_at: '2026-11-19T12:00:00.000Z',
    evidencia_cargada: false,
  },
  {
    id: 'p2-3',
    title: 'Confirmar cobertura de turnos fin de mes',
    estado: 'En_Ejecucion',
    fecha: '2026-11-26',
    prioridad: 'P2_Media',
    area: 'Operaciones',
    responsable: 'u-carlos',
    responsable_nombre: 'Carlos Mendoza',
    updated_at: '2026-11-18T09:00:00.000Z',
    evidencia_cargada: true,
  },
  {
    id: 'p2-4',
    title: 'Validar contrato con proveedor de empaque',
    estado: 'Pendiente',
    fecha: '2026-11-27',
    prioridad: 'P2_Media',
    area: 'Compras',
    responsable: 'u-ana',
    responsable_nombre: 'Ana López',
    updated_at: '2026-11-23T16:00:00.000Z',
    evidencia_cargada: false,
  },
  {
    id: 'p2-5',
    title: 'Estandarizar checklist de carga nocturna',
    estado: 'Pendiente',
    fecha: null,
    prioridad: 'P3_Baja',
    area: 'Logística',
    responsable: 'u-ana',
    responsable_nombre: 'Ana López',
    updated_at: '2026-11-23T11:00:00.000Z',
    evidencia_cargada: false,
  },
]

const PHASE2_VERIFICATION = [
  {
    id: 'p2-v1',
    title: 'Auditar embarques zona centro',
    estado: 'Hecho',
    fecha: '2026-11-21',
    prioridad: 'P2_Media',
    area: 'Logística',
    responsable: 'u-carlos',
    responsable_nombre: 'Carlos Mendoza',
    updated_at: '2026-11-22T15:00:00.000Z',
    evidencia_cargada: true,
  },
]

const PHASE2_OKRS = [
  {
    id: 'okr-p2-1',
    nombre: 'Mantener OTIF arriba de 95%',
    progress: 34,
    krCount: 2,
    without_initiatives: false,
    insufficient_krs: 0,
    start_date: '2026-10-01',
    end_date: '2026-12-31',
    pace: 'bajo_ritmo',
    krs: [{ id: 'kr-1', title: 'OTIF nacional', actual: 88, meta: 95, unidad: '%', progress: 34 }],
  },
  {
    id: 'okr-p2-2',
    nombre: 'Reducir incidentes de almacén',
    progress: null,
    krCount: 1,
    without_initiatives: true,
    insufficient_krs: 1,
    start_date: '2026-10-01',
    end_date: '2026-12-31',
    pace: 'sin_datos',
    krs: [{ id: 'kr-2', title: 'Incidentes', actual: null, meta: 2, unidad: '#', progress: null }],
  },
]

function okResult(tool: string, data: Record<string, unknown>): CopilotToolResult {
  return { ok: true, kind: 'ok', tool, data } as unknown as CopilotToolResult
}

function createPhase2Dispatcher(options?: { empty?: boolean }): ToolDispatcher {
  return async (_actor, name, args) => {
    if (options?.empty) {
      if (name === 'get_okr_progress') return okResult(name, { items: [], objectives: 0 })
      return okResult('get_my_actions', { items: [], total: 0, truncated: false, as_of: AS_OF })
    }
    if (name === 'get_okr_progress') {
      return okResult(name, { items: PHASE2_OKRS, objectives: PHASE2_OKRS.length })
    }
    if (name === 'get_my_actions') {
      const a = args as Record<string, unknown>
      const scope = a.scope as string | undefined
      if (a.status_group === 'verification') {
        const items = scope === 'assigned_to_me' ? [] : PHASE2_VERIFICATION
        return okResult(name, { items, total: items.length, truncated: false, as_of: AS_OF })
      }
      const items = scope === 'assigned_to_me' ? [PHASE2_OPEN_ACTIONS[3]!] : PHASE2_OPEN_ACTIONS
      return okResult(name, { items, total: items.length, truncated: false, as_of: AS_OF })
    }
    return { ok: false, kind: 'error', tool: name, error: `unsupported:${name}` } as unknown as CopilotToolResult
  }
}

async function runTurn(
  actor: typeof OWNER_ACTOR,
  utterance: string,
  store: ReturnType<typeof createMemorySessionContextStore>,
  options?: { empty?: boolean }
) {
  const turn = await runAgentTurn(
    { actor, utterance },
    { dispatch: createPhase2Dispatcher(options), store, today: () => TODAY }
  )
  return { turn, text: formatForChannel(turn, 'web'), ui: uiForTurn(turn, 'web') }
}

describe('Executive MVP Fase 2 — Disciplina, Prevención, Trazabilidad y Revisión 15 min', () => {
  it('Escenario 1: ¿Qué acciones llevan demasiado tiempo sin seguimiento?', async () => {
    const store = createMemorySessionContextStore()
    const res = await runTurn(
      OWNER_ACTOR,
      '¿Qué acciones llevan demasiado tiempo sin seguimiento?',
      store
    )

    expect(res.turn.handled).toBe(true)
    expect(res.turn.intent).toBe('executive_discipline')
    expect(res.turn.format).toBe('report')
    expect(res.text).toContain('Desbloquear permiso de transporte aduanal')
    expect(res.text).toContain('Bloqueo prolongado')
    expect(res.text).toContain('sin evidencia operativa cargada')
    expect(res.text).toContain('no constituye incumplimiento confirmado')
    expect(res.text).toContain('no existe historial verificable de reprogramaciones')
  })

  it('Escenario 2: ¿Qué problemas podemos prevenir esta semana?', async () => {
    const store = createMemorySessionContextStore()
    const res = await runTurn(
      OWNER_ACTOR,
      '¿Qué problemas podemos prevenir esta semana?',
      store
    )

    expect(res.turn.handled).toBe(true)
    expect(res.turn.intent).toBe('executive_preventive')
    expect(res.text).toContain('[Problema actual]')
    expect(res.text).toContain('[Riesgo potencial]')
    expect(res.text).toContain('[Oportunidad de mejora]')
    expect(res.text).toContain('próximos 5 días')
    expect(res.text).toContain('Concentración de carga en Carlos Mendoza')
    expect(res.ui?.views.some((v) => v.type === 'operational_summary')).toBe(true)
  })

  it('Escenario 3: ¿Dónde estamos perdiendo disciplina operativa?', async () => {
    const store = createMemorySessionContextStore()
    const res = await runTurn(
      OWNER_ACTOR,
      '¿Dónde estamos perdiendo disciplina operativa?',
      store
    )

    expect(res.turn.handled).toBe(true)
    expect(res.turn.intent).toBe('executive_discipline')
    expect(res.text).toContain('3 sin seguimiento reciente')
    expect(res.text).toContain('1 bloqueos prolongados')
    expect(res.text).toContain('1 en Hecho pendientes de Verificado')
    expect(res.text).toContain('1 sin fecha compromiso')
  })

  it('Escenario 4: Muéstrame las acciones que sustentan esta recomendación (continuidad y trazabilidad)', async () => {
    const store = createMemorySessionContextStore()

    // Turno 1: diagnóstico preventivo deja las acciones en sesión
    const prev = await runTurn(OWNER_ACTOR, '¿Qué problemas podemos prevenir esta semana?', store)
    expect(prev.turn.handled).toBe(true)

    // Turno 2: trazabilidad directa sin obligar al usuario a buscar manualmente
    const ev = await runTurn(
      OWNER_ACTOR,
      'Muéstrame las acciones que sustentan esta recomendación.',
      store
    )
    expect(ev.turn.handled).toBe(true)
    expect(ev.turn.intent).toBe('executive_evidence')
    expect(ev.text).toContain('/kanban?accion=')
    expect(ev.ui?.views.some((v) => v.type === 'operational_summary')).toBe(true)

    // Turno 3: profundizar en prioridad 1 manteniendo continuidad
    const deep = await runTurn(OWNER_ACTOR, 'Profundiza en la prioridad 1', store)
    expect(deep.turn.handled).toBe(true)
    expect(deep.turn.intent).toBe('executive_evidence')
    expect(deep.text).toContain('Evidencia de la Prioridad 1')
  })

  it('Escenarios 5 y 6: Revisión ejecutiva de 15 min flexible + resumen con decisiones y borradores R2 OFF', async () => {
    const store = createMemorySessionContextStore()

    const start = await runTurn(
      OWNER_ACTOR,
      'Hagamos una revisión ejecutiva de 15 minutos.',
      store
    )
    expect(start.turn.handled).toBe(true)
    expect(start.turn.intent).toBe('executive_review')
    expect(start.text).toContain('1/6')

    const next = await runTurn(OWNER_ACTOR, 'Siguiente etapa', store)
    expect(next.turn.intent).toBe('executive_review')
    expect(next.text).toContain('2/6')

    const skip = await runTurn(OWNER_ACTOR, 'Omitir etapa', store)
    expect(skip.turn.intent).toBe('executive_review')
    expect(skip.text).toContain('3/6')

    const dec = await runTurn(
      OWNER_ACTOR,
      'Decisión: Escalar hoy el permiso aduanal directamente con Dirección de Logística.',
      store
    )
    expect(dec.turn.intent).toBe('executive_review')
    expect(dec.text).toContain('Escalar hoy el permiso aduanal')

    const summary = await runTurn(
      OWNER_ACTOR,
      'Resume nuestras decisiones y prepara los compromisos.',
      store
    )
    expect(summary.turn.handled).toBe(true)
    expect(summary.turn.intent).toBe('executive_review')
    expect(summary.text).toContain('6/6')
    expect(summary.text).toContain('Decisión 1: Escalar hoy el permiso aduanal')
    expect(summary.text).toContain('borrador R2 OFF')
    expect(summary.text).toContain('Responsable sugerido:')
    expect(summary.text).toContain('Fecha propuesta:')
    expect(summary.text).toContain('Asunto pendiente:')
    expect(summary.text).toContain('R2 desactivado: no se creó ni modificó ninguna acción')
  })

  it('Guardrails Fase 2: respeta permisos de Operativo y entrega estado vacío útil sin inventar predicciones', async () => {
    const store = createMemorySessionContextStore()
    const op = await runTurn(
      OPERATIVO_ACTOR,
      '¿Qué problemas podemos prevenir esta semana?',
      store
    )
    expect(op.turn.handled).toBe(true)
    expect(op.text).toContain('Alcance limitado por permiso')
    expect(op.text).not.toContain('Carlos Mendoza')

    const empty = await runTurn(
      OWNER_ACTOR,
      '¿Qué problemas podemos prevenir esta semana?',
      store,
      { empty: true }
    )
    expect(empty.turn.handled).toBe(true)
    expect(empty.turn.response.status).toBe('empty')
    expect(empty.text).toContain('No se generan predicciones sin evidencia')
  })
})
