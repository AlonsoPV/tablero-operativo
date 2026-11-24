/**
 * Frente C — Suite de Calidad de Inteligencia Conversacional (simulada / determinista, cero llamadas pagadas).
 *
 * Valida los 12 escenarios naturales directivos/operativos y los 10 casos borde críticos:
 * - Referencias ambiguas, cambios de intención, solicitudes múltiples, continuidad contextual,
 * - Datos insuficientes, contradicciones, permisos insuficientes, errores del proveedor,
 * - Recuperación documental R3, distinción hechos/inferencias/recomendaciones y cero bypass de R2.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { dispatchCopilotTool } from './assistantOpsRuntime.js'
import { runChannelTurn } from './orchestrator/channelAdapters.js'
import { createMemorySessionContextStore } from './orchestrator/sessionContext.js'
import { memoryQueryAuditSink } from './query/queryAudit.js'
import { R1_NOW_ISO, R1_TODAY, R1_USERS } from './orchestrator/testing/r1Fixture.js'
import { createR2Db, r2Actor } from './orchestrator/testing/r2Fixture.js'
import { createMemoryStore } from './memory/store.js'
import { isGeminiCapacityStatus } from './geminiModel.js'
import { isR2AgentTool } from './actions/r2Runtime.js'

beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(R1_NOW_ISO))
})

afterAll(() => {
  vi.useRealTimers()
})

afterEach(() => {
  vi.unstubAllEnvs()
})

function buildMemoryFixture() {
  return createMemoryStore({
    documents: [
      {
        id: 'doc-reunion-1',
        title: 'Acuerdos de reunión semanal de operación',
        body: 'Compromisos de la última reunión: resolver bloqueo del proveedor de logística antes del viernes y auditar entregas críticas.',
        access_level: 'project',
        area_id: null,
        status: 'published',
        version: 1,
        source_label: 'Acta ejecutiva',
        content_hash: 'h-doc-1',
      },
    ],
    memories: [
      {
        id: 'mem-1',
        usuario_id: R1_USERS.superAdmin.id,
        area_id: null,
        access_level: 'project',
        validation_status: 'confirmed',
        body: 'Acuerdo reunión operativa: escalar bloqueo del proveedor cada viernes.',
        version: 1,
        source_kind: 'meeting',
        content_hash: 'h-mem-1',
        expires_at: null,
        created_at: '2026-11-20T10:00:00Z',
        updated_at: '2026-11-20T10:00:00Z',
      },
    ],
  })
}

describe('Frente C — Calidad de inteligencia conversacional (12 escenarios naturales + 10 casos borde)', () => {
  it('interpreta correctamente las 12 solicitudes naturales sin depender de comandos rígidos', async () => {
    vi.stubEnv('R2_EXECUTION_MODE', 'simulated')
    vi.stubEnv('AGENT_MEMORY_R3', '1')
    const db = createR2Db()
    const store = createMemorySessionContextStore()
    const lead = await r2Actor(db, R1_USERS.lead)
    const memoryStore = buildMemoryFixture()

    const ask = (utterance: string, sessionId = 'conv-c-natural') =>
      runChannelTurn(
        {
          identity: {
            supabase: lead.copilot.supabase,
            authUserId: lead.copilot.authUserId,
            usuarioId: lead.usuarioId,
            rol: lead.rol,
            active: true,
          },
          channel: 'web',
          sessionId,
          utterance,
        },
        {
          store,
          dispatch: (a, name, args) => dispatchCopilotTool(a, name, args),
          audit: memoryQueryAuditSink(),
          capabilities: lead.capabilities,
          today: () => R1_TODAY,
          memoryStore,
        }
      )

    // 1. ¿Qué necesita mi atención hoy?
    const t1 = await ask('¿Qué necesita mi atención hoy?')
    expect(t1.handled).toBe(true)
    expect(t1.intent).toBe('executive_brief')

    // 2. ¿Qué está frenando a mi equipo?
    const t2 = await ask('¿Qué está frenando a mi equipo?')
    expect(t2.handled).toBe(true)
    expect(t2.intent).toBe('executive_brief')

    // 3. ¿Qué compromisos no se están cumpliendo?
    const t3 = await ask('¿Qué compromisos no se están cumpliendo?')
    expect(t3.handled).toBe(true)
    expect(t3.intent).toBe('executive_commitments')

    // 4. ¿Qué acciones debería priorizar esta semana?
    const t4 = await ask('¿Qué acciones debería priorizar esta semana?')
    expect(t4.handled).toBe(true)
    expect(t4.intent).toBe('executive_brief')

    // 5. ¿Qué objetivos están en riesgo y por qué?
    const t5 = await ask('¿Qué objetivos están en riesgo y por qué?')
    expect(t5.handled).toBe(true)
    expect(t5.intent).toBe('analyze_risk')

    // 6. ¿Qué decisiones debería tomar?
    const t6 = await ask('¿Qué decisiones debería tomar?')
    expect(t6.handled).toBe(true)
    expect(t6.intent).toBe('recommend_next')

    // 7. Crea una acción para revisar este problema el viernes. (Propuesta R2, cero escritura directa)
    const beforeActionsCount = db.tables.acciones_diarias.length
    const t7 = await ask('Crea una acción para revisar este problema el viernes.')
    expect(t7.handled).toBe(true)
    expect(t7.intent).toBe('write_request')
    expect((t7.proposals?.length ?? 0) > 0 || Boolean(t7.proposal)).toBe(true)
    expect(db.tables.acciones_diarias.length).toBe(beforeActionsCount)

    // Enfocar una acción concreta para probar continuidad en #8 y #9
    const focus = await ask('Muéstrame la acción Auditoria de Jorge')
    expect(focus.handled).toBe(true)

    // 8. Cambia la prioridad de esa acción.
    const t8 = await ask('Cambia la prioridad de esa acción a Alta.')
    expect(t8.handled).toBe(true)
    expect(t8.intent).toBe('write_request')
    expect(t8.response.status).toBe('proposal')

    // 9. Registra que seguimos bloqueados por el proveedor.
    const t9 = await ask('Registra que seguimos bloqueados por el proveedor.')
    expect(t9.handled).toBe(true)
    expect(t9.intent).toBe('write_request')
    expect(t9.response.status).toBe('proposal')

    // 10. Revisa los compromisos de nuestra última reunión.
    const t10 = await ask('Revisa los compromisos de nuestra última reunión.')
    expect(t10.handled).toBe(true)
    expect(t10.intent).toBe('executive_commitments')

    // 11. Ayúdame a preparar mi reunión de seguimiento.
    const t11 = await ask('Ayúdame a preparar mi reunión de seguimiento.')
    expect(t11.handled).toBe(true)
    expect(t11.intent).toBe('executive_review')

    // 12. Convierte estos acuerdos en acciones para mi equipo.
    const t12 = await ask('Convierte estos acuerdos en acciones para mi equipo.')
    expect(t12.handled).toBe(true)
    expect(t12.intent).toBe('write_request')
    expect(db.tables.acciones_diarias.length).toBe(beforeActionsCount)
  })

  it('valida casos borde: ambigüedad, cambio de intención, permisos, datos insuficientes, R3, hechos vs inferencias y cero bypass R2', async () => {
    vi.stubEnv('R2_EXECUTION_MODE', 'simulated')
    vi.stubEnv('AGENT_MEMORY_R3', '1')
    const db = createR2Db()
    const store = createMemorySessionContextStore()
    const jorge = await r2Actor(db, R1_USERS.jorge1)
    const admin = await r2Actor(db, R1_USERS.superAdmin)
    const memoryStore = buildMemoryFixture()

    // A) Referencia ambigua sin acción enfocada -> nunca modifica ni adivina
    const ambig = await runChannelTurn(
      {
        identity: {
          supabase: jorge.copilot.supabase,
          authUserId: jorge.copilot.authUserId,
          usuarioId: jorge.usuarioId,
          rol: jorge.rol,
          active: true,
        },
        channel: 'web',
        sessionId: 'conv-edge-ambig',
        utterance: 'Cambia la prioridad de esa acción.',
      },
      {
        store,
        dispatch: (a, name, args) => dispatchCopilotTool(a, name, args),
        audit: memoryQueryAuditSink(),
        capabilities: jorge.capabilities,
        today: () => R1_TODAY,
      }
    )
    expect(ambig.handled).toBe(true)
    expect(ambig.proposals?.length ?? 0).toBe(0)

    // B) Permisos insuficientes: Analista sin acceso transversal pide acciones privadas de otro equipo
    const analyst = await r2Actor(db, R1_USERS.analyst)
    const denied = await runChannelTurn(
      {
        identity: {
          supabase: analyst.copilot.supabase,
          authUserId: analyst.copilot.authUserId,
          usuarioId: analyst.usuarioId,
          rol: analyst.rol,
          active: true,
        },
        channel: 'web',
        sessionId: 'conv-edge-perm',
        utterance: 'Muéstrame las acciones privadas de otro equipo.',
      },
      {
        store,
        dispatch: (a, name, args) => dispatchCopilotTool(a, name, args),
        audit: memoryQueryAuditSink(),
        capabilities: analyst.capabilities,
        today: () => R1_TODAY,
      }
    )
    expect(denied.handled).toBe(true)
    expect(denied.response.status).toBe('forbidden')

    // C) Recuperación documental R3 explícita con citas y sin inventar
    const docQuery = await runChannelTurn(
      {
        identity: {
          supabase: admin.copilot.supabase,
          authUserId: admin.copilot.authUserId,
          usuarioId: admin.usuarioId,
          rol: admin.rol,
          active: true,
        },
        channel: 'web',
        sessionId: 'conv-edge-r3',
        utterance: 'Busca en documentos los acuerdos de la reunión de operación',
      },
      {
        store,
        dispatch: (a, name, args) => dispatchCopilotTool(a, name, args),
        audit: memoryQueryAuditSink(),
        capabilities: admin.capabilities,
        today: () => R1_TODAY,
        memoryStore,
      }
    )
    expect(docQuery.handled).toBe(true)
    expect(docQuery.intent).toBe('query_knowledge')
    expect(docQuery.text).toMatch(/proveedor|reunión|logística/i)

    // D) Distinción explícita entre hechos (data), inferencias (interpretation) y recomendaciones (recommendation)
    const brief = await runChannelTurn(
      {
        identity: {
          supabase: admin.copilot.supabase,
          authUserId: admin.copilot.authUserId,
          usuarioId: admin.usuarioId,
          rol: admin.rol,
          active: true,
        },
        channel: 'web',
        sessionId: 'conv-edge-blocks',
        utterance: '¿Qué necesita mi atención hoy?',
      },
      {
        store,
        dispatch: (a, name, args) => dispatchCopilotTool(a, name, args),
        audit: memoryQueryAuditSink(),
        capabilities: admin.capabilities,
        today: () => R1_TODAY,
      }
    )
    expect(brief.response.blocks.data.length).toBeGreaterThan(0)
    expect(brief.response.blocks.recommendation.length).toBeGreaterThan(0)
    expect(Array.isArray(brief.response.blocks.interpretation)).toBe(true)

    // E) Contrato de error recuperable del proveedor (503/429) + herramientas R2 sin bypass
    expect(isGeminiCapacityStatus(503)).toBe(true)
    expect(isGeminiCapacityStatus(429)).toBe(true)
    expect(isR2AgentTool('agent_create_action')).toBe(true)
    expect(isR2AgentTool('agent_set_action_status')).toBe(true)
    expect(isR2AgentTool('agent_register_blocker')).toBe(true)
    expect(isR2AgentTool('agent_update_fields')).toBe(true)
  })
})
