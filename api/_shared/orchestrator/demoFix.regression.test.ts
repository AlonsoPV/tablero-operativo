/**
 * Regresión DEMO FIX: Q9 continuidad, Q10 documental, sesión 6 etapas, permisos Operativo.
 * Local / Vitest. No sustituye validación autenticada pendiente.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { CopilotToolResult } from '../../../src/features/ai-support/copilot/types.js'
import { resolveActor } from '../query/resolveActor.js'
import type { ToolDispatcher } from '../query/index.js'
import { formatForChannel } from './channelAdapters.js'
import { classifyAgentIntent } from './intent.js'
import { runAgentTurn } from './runAgentTurn.js'
import { createMemorySessionContextStore } from './sessionContext.js'
import { createMemoryStore } from '../memory/store.js'
import { R1_USERS } from './testing/r1Fixture.js'

const TODAY = '2026-11-24'
const AS_OF = '2026-11-24T14:00:00.000Z'

const OWNER = resolveActor(
  {
    supabase: {} as never,
    authUserId: 'auth-owner-fix',
    usuarioId: 'owner-fix',
    rol: 'Super Admin',
    active: true,
    boardScope: 'role',
  },
  { channel: 'web', sessionId: 'demo-fix-owner' }
)

const OPERATIVO = resolveActor(
  {
    supabase: {} as never,
    authUserId: 'auth-op-fix',
    usuarioId: R1_USERS.maria.id,
    rol: 'Operativo',
    active: true,
    boardScope: 'role',
  },
  { channel: 'web', sessionId: 'demo-fix-op' }
)

const OPEN_A = {
  id: 'fix-1',
  title: 'Desbloquear permiso aduanal',
  estado: 'Bloqueado',
  fecha: '2026-11-18',
  prioridad: 'P1_Alta',
  area: 'Logística',
  responsable: 'u-carlos',
  responsable_nombre: 'Carlos Mendoza',
  href: '/kanban?accion=fix-1',
}
const OPEN_B = {
  id: 'fix-2',
  title: 'Cerrar conciliación de mermas',
  estado: 'Retraso',
  fecha: '2026-11-20',
  prioridad: 'P1_Alta',
  area: 'Logística',
  responsable: 'u-carlos',
  responsable_nombre: 'Carlos Mendoza',
  href: '/kanban?accion=fix-2',
}

function ok(tool: string, data: Record<string, unknown>): CopilotToolResult {
  return { ok: true, kind: 'ok', tool, data } as unknown as CopilotToolResult
}

function dispatcher(options?: { extraOpen?: boolean; onlyAssigned?: boolean }): ToolDispatcher {
  return async (_actor, name, args) => {
    if (name === 'get_okr_progress') {
      return ok(name, {
        items: [{ id: 'okr-x', nombre: 'OTIF 95%', progress: 40, krCount: 1 }],
        objectives: 1,
      })
    }
    if (name !== 'get_my_actions') {
      return { ok: false, kind: 'error', tool: name, error: `unsupported:${name}` } as unknown as CopilotToolResult
    }
    const a = args as Record<string, unknown>
    const assignedOnly = options?.onlyAssigned || a.scope === 'assigned_to_me'
    const items = assignedOnly
      ? []
      : options?.extraOpen
        ? [OPEN_A, OPEN_B, { ...OPEN_A, id: 'fix-3', title: 'Tercera', href: '/kanban?accion=fix-3' }]
        : [OPEN_A, OPEN_B]
    return ok(name, { items, total: items.length, truncated: false, as_of: AS_OF })
  }
}

async function turn(
  actor: typeof OWNER,
  utterance: string,
  store: ReturnType<typeof createMemorySessionContextStore>,
  extra?: { dispatch?: ToolDispatcher; memoryStore?: ReturnType<typeof createMemoryStore> }
) {
  const result = await runAgentTurn(
    { actor, utterance },
    {
      dispatch: extra?.dispatch ?? dispatcher(),
      store,
      today: () => TODAY,
      memoryStore: extra?.memoryStore,
    }
  )
  return { result, text: formatForChannel(result, 'web') }
}

beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(AS_OF))
})
afterAll(() => {
  vi.useRealTimers()
})
afterEach(() => {
  vi.unstubAllEnvs()
})

describe('DEMO FIX · Q9 continuidad conversacional', () => {
  it('conserva IDs y no relista el tablero completo ante “esa acción” / primera prioridad', async () => {
    const store = createMemorySessionContextStore()
    const first = await turn(OWNER, '¿Qué requiere mi atención hoy?', store)
    expect(first.result.handled).toBe(true)
    expect(first.result.intent).toBe('executive_brief')
    const ids = first.result.response.references.map((row) => row.id)
    expect(ids.length).toBeGreaterThan(0)

    const follow = await turn(OWNER, 'Profundiza en esa acción, la primera prioridad', store)
    expect(follow.result.intent).toBe('executive_evidence')
    expect(follow.result.response.references[0]?.id).toBe(ids[0])
    expect(follow.text).toContain('/kanban?accion=')
    expect(follow.text).toMatch(/Abrir en Kanban/)
  })

  it('distingue consulta nueva y explica el cambio real de cifras', async () => {
    const store = createMemorySessionContextStore()
    const first = await turn(OWNER, '¿Qué requiere mi atención hoy?', store, {
      dispatch: dispatcher(),
    })
    expect(first.text).toMatch(/2 abiertas|2 /)

    const second = await turn(OWNER, '¿Cómo está mi empresa hoy?', store, {
      dispatch: dispatcher({ extraOpen: true }),
    })
    expect(second.result.intent).toBe('executive_brief')
    expect(second.text).toMatch(/ahora muestra|se consultó de nuevo|antes /i)
    expect(second.text).toContain('3')
  })

  it('clasifica seguimiento vs consulta nueva', () => {
    const session = { hasExecutiveSession: true, lastActionCount: 12, lastEntityKind: 'action' as const }
    expect(classifyAgentIntent('Profundiza en la primera prioridad', null, session)).toMatchObject({
      kind: 'executive_review',
      action: 'focus_priority',
      priorityIndex: 0,
    })
    expect(classifyAgentIntent('esa acción', null, session).kind).toBe('executive_evidence')
    expect(classifyAgentIntent('Marca esa acción como hecha', null, session).kind).toBe('write_request')
    expect(classifyAgentIntent('¿Cómo está mi empresa hoy?', null, session).kind).toBe('executive_brief')
  })
})

describe('DEMO FIX · Q10 intención documental R3', () => {
  it('prioriza documentos y no responde OKRs', async () => {
    vi.stubEnv('AGENT_MEMORY_R3', '1')
    const store = createMemorySessionContextStore()
    const memoryStore = createMemoryStore({
      documents: [
        {
          id: 'doc-pol',
          logical_id: 'pol-verif',
          title: 'Política de verificación',
          body: 'La verificación exige evidencia humana firmada. No se infiere del avance de un OKR.',
          version: 1,
          status: 'published',
          access_level: 'project_read',
          area_id: null,
          content_hash: 'h1',
          source_label: 'politica-verificacion',
          published_at: AS_OF,
          withdrawn_at: null,
        },
      ],
    })
    expect(classifyAgentIntent('Busca documentos de la política de verificación').kind).toBe(
      'query_knowledge'
    )
    const asked = await turn(OWNER, 'Busca documentos de la política de verificación', store, {
      memoryStore,
    })
    expect(asked.result.intent).toBe('query_knowledge')
    expect(asked.text).toMatch(/Documentación R3|Política de verificación/)
    expect(asked.text).not.toMatch(/OTIF 95%/)
    expect(asked.result.response.blocks.limitations.join(' ')).toMatch(/Fuente: memoria\/documentos R3/)
  })

  it('fail-closed cuando no hay documentos y no inventa', async () => {
    vi.stubEnv('AGENT_MEMORY_R3', '1')
    const store = createMemorySessionContextStore()
    const asked = await turn(OWNER, 'Busca documentos de onboarding de proveedores', store, {
      memoryStore: createMemoryStore(),
    })
    expect(asked.result.intent).toBe('query_knowledge')
    expect(asked.result.response.status).toBe('empty')
    expect(asked.text).toMatch(/No encontré documentos|no sustituyo|No uso OKRs/i)
  })

  it('R3 apagado no inventa ni consulta OKRs', async () => {
    const store = createMemorySessionContextStore()
    const asked = await turn(OWNER, 'Busca documentos de la política de verificación', store, {
      memoryStore: createMemoryStore(),
    })
    expect(asked.result.intent).toBe('query_knowledge')
    expect(asked.result.response.status).toBe('empty')
    expect(asked.text).not.toMatch(/OTIF/)
    expect(asked.text).toMatch(/No hay información documental suficiente|no disponible/i)
  })
})

describe('DEMO FIX · sesión ejecutiva 6 etapas y R2 OFF', () => {
  it('avanza, regresa, omite, profundiza y conserva decisiones en el resumen', async () => {
    const store = createMemorySessionContextStore()
    const start = await turn(OWNER, 'Hagamos una revisión ejecutiva de 15 minutos.', store)
    expect(start.text).toContain('1/6')

    const next = await turn(OWNER, 'Siguiente etapa', store)
    expect(next.text).toContain('2/6')

    const back = await turn(OWNER, 'Etapa anterior', store)
    expect(back.text).toContain('1/6')

    await turn(OWNER, 'Siguiente etapa', store)
    const skip = await turn(OWNER, 'Omitir etapa', store)
    expect(skip.text).toContain('3/6')

    const focus = await turn(OWNER, 'Profundiza en la prioridad 1', store)
    expect(focus.result.intent).toMatch(/executive_/)
    expect(focus.text).toMatch(/fix-1|Desbloquear permiso/)

    await turn(OWNER, 'Siguiente etapa', store)
    const decision = await turn(
      OWNER,
      'Decisión: Escalar hoy el permiso aduanal con Dirección de Logística.',
      store
    )
    expect(decision.text).toContain('Escalar hoy el permiso aduanal')

    const commits = await turn(OWNER, 'Siguiente etapa', store)
    expect(commits.text).toMatch(/5\/6|borrador R2 OFF/)

    const summary = await turn(OWNER, 'Resume nuestras decisiones y prepara los compromisos.', store)
    expect(summary.text).toContain('6/6')
    expect(summary.text).toContain('Escalar hoy el permiso aduanal')
    expect(summary.text).toMatch(/borrador R2 OFF/)
    expect(summary.text).toMatch(/R2 desactivado/)
    expect(summary.result.proposal).toBeUndefined()
  })
})

describe('DEMO FIX · permisos Operativo (local, no sustituye JWT)', () => {
  it('no revela acciones ajenas ni documentos de proyecto', async () => {
    vi.stubEnv('AGENT_MEMORY_R3', '1')
    const store = createMemorySessionContextStore()
    const memoryStore = createMemoryStore({
      documents: [
        {
          id: 'doc-secret',
          logical_id: 'pol-dir',
          title: 'Política de Dirección',
          body: 'Solo Dirección lee este procedimiento oficial.',
          version: 1,
          status: 'published',
          access_level: 'project_read',
          area_id: null,
          content_hash: 'h2',
          source_label: 'politica-dir',
          published_at: AS_OF,
          withdrawn_at: null,
        },
      ],
    })
    const op = await turn(OPERATIVO, '¿Qué requiere mi atención hoy?', store, {
      dispatch: dispatcher(),
      memoryStore,
    })
    expect(op.text).not.toContain('Carlos Mendoza')
    expect(op.text).toMatch(/Alcance limitado|asignadas|0 /)

    const docs = await turn(OPERATIVO, 'Busca documentos de la política de Dirección', store, {
      dispatch: dispatcher(),
      memoryStore,
    })
    expect(docs.result.intent).toBe('query_knowledge')
    expect(docs.text).not.toContain('Solo Dirección')
  })
})
