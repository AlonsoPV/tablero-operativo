/**
 * Suite de aceptación R1 (8 escenarios del prompt maestro).
 * Usa el dispatchCopilotTool real sobre un Supabase en memoria: la autorización
 * probada es la del runtime y la matriz del agente, no la RLS (pendiente de QA/JWT).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { vi } from 'vitest'
import { dispatchCopilotTool } from '../assistantOpsRuntime.js'
import { memoryQueryAuditSink, type QueryAuditEntry } from '../query/queryAudit.js'
import { stripAuthorityFields } from '../query/resolveActor.js'
import { composeText } from './respond.js'
import { formatForChannel } from './channelAdapters.js'
import { runAgentTurn, type AgentTurnResult } from './runAgentTurn.js'
import type { SessionContextStore } from './sessionContext.js'
import { createR1Db, r1Actor, r1Store, R1_NOW_ISO, R1_TODAY, R1_USERS } from './testing/r1Fixture.js'
import type { FakeDb } from './testing/fakeSupabase.js'

beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(R1_NOW_ISO))
})
afterAll(() => {
  vi.useRealTimers()
})

type Harness = { db: FakeDb; store: SessionContextStore; audit: QueryAuditEntry[] }

function harness(): Harness {
  return { db: createR1Db(), store: r1Store(), audit: [] }
}

async function turn(
  h: Harness,
  user: (typeof R1_USERS)[keyof typeof R1_USERS],
  utterance: string,
  channel: 'web' | 'whatsapp' | 'voice' = 'web'
): Promise<AgentTurnResult & { text: string }> {
  const actor = r1Actor(h.db, user, channel)
  const result = await runAgentTurn(
    { actor, utterance },
    {
      dispatch: (a, name, args) => dispatchCopilotTool(a, name, args),
      store: h.store,
      audit: memoryQueryAuditSink(h.audit),
      today: () => R1_TODAY,
    }
  )
  return { ...result, text: composeText(result.response, { headings: true }) }
}

describe('R1 · escenarios conversacionales', () => {
  const h = harness()

  it('1 · «¿Qué tengo pendiente hoy?» consulta acciones autorizadas y prioriza por fecha', async () => {
    const r = await turn(h, R1_USERS.lead, '¿Qué tengo pendiente hoy?')
    expect(r.handled).toBe(true)
    expect(r.intent).toBe('query_actions')
    expect(r.toolsUsed).toEqual(['get_my_actions'])
    expect(r.response.status).toBe('ok')
    expect(r.response.blocks.data[0]).toBe('3 abiertas en tus acciones como responsable.')
    // Orden por urgencia: vencida primero, luego la que vence hoy.
    expect(r.response.references.map((x) => x.id)).toEqual(['a1', 'a2', 'a3'])
    expect(r.response.blocks.interpretation.join(' ')).toContain('1 con fecha de hoy')
    expect(r.response.blocks.recommendation[0]).toContain('Cerrar inventario')
    expect(r.text).not.toContain('Proveedor de empaque')
    expect(r.response.asOf).toBeTruthy()
  })

  it('2 · «¿Cuáles están vencidas?» conserva el alcance anterior y sólo cambia el estado', async () => {
    const r = await turn(h, R1_USERS.lead, '¿Cuáles están vencidas?')
    expect(r.intent).toBe('query_actions')
    expect(r.response.references.map((x) => x.id)).toEqual(['a1'])
    expect(r.response.blocks.data[0]).toBe('1 vencidas en tus acciones como responsable.')
    expect((await h.store.get('u-lead:web:s1'))?.activeQuery).toMatchObject({ scope: 'assigned_to_me', status_group: 'overdue' })
    // Una vencida ajena (a5 de Ana) no se mezcla en el alcance personal.
    expect(r.text).not.toContain('Actualizar SOP')
  })

  it('3 · «¿Quién tiene la más urgente?» resuelve la referencia sobre el último resultado', async () => {
    const r = await turn(h, R1_USERS.lead, '¿Quién tiene la más urgente?')
    expect(r.intent).toBe('who_most_urgent')
    expect(r.toolsUsed).toEqual([])
    expect(r.response.blocks.data).toEqual([
      'La más urgente es «Cerrar inventario» (Retraso, 2026-11-17).',
      'Responsable: Laura Lider.',
    ])
    expect((await h.store.get('u-lead:web:s1'))?.lastEntity).toMatchObject({ kind: 'action', id: 'a1' })
  })

  it('4 · «¿Cómo vamos con los objetivos del trimestre?» usa cifras reales y declara KR sin datos', async () => {
    const r = await turn(h, R1_USERS.lead, '¿Cómo vamos con los objetivos del trimestre?')
    expect(r.intent).toBe('query_okrs')
    expect(r.toolsUsed).toEqual(['get_okr_progress'])
    expect(r.response.blocks.data[0]).toBe('2 objetivo(s) activo(s).')
    expect(r.response.blocks.data.join('\n')).toContain('Crecer ventas: 20% de avance')
    expect(r.response.blocks.interpretation.join(' ')).toContain('Crecer ventas')
    expect(r.response.blocks.limitations.join(' ')).toMatch(/1 KR sin datos suficientes/)
    expect(r.response.blocks.limitations.join(' ')).toContain('objetivos activos')
  })

  it('5 · «¿Qué está poniendo en riesgo nuestros objetivos?» separa evidencia de interpretación', async () => {
    const r = await turn(h, R1_USERS.lead, '¿Qué está poniendo en riesgo nuestros objetivos?')
    expect(r.intent).toBe('analyze_risk')
    expect(r.response.blocks.data).toContain('Acciones vencidas (acciones del tablero autorizado): 3.')
    expect(r.response.blocks.data).toContain('Acciones bloqueadas: 1.')
    expect(r.response.blocks.data).toContain('Objetivos con avance menor a 40%: 1 de 2.')
    expect(r.response.blocks.data.join(' ')).not.toMatch(/inferencia/i)
    expect(r.response.blocks.interpretation[0]).toMatch(/^Inferencia, no dato del sistema/)
    expect(r.response.blocks.recommendation[0]).toContain('bloqueadas')
  })

  it('6 · «Muéstrame las acciones privadas de otro equipo» aplica el alcance sin revelar datos', async () => {
    const analyst = harness()
    const r = await turn(analyst, R1_USERS.analyst, 'Muéstrame las acciones privadas de otro equipo.')
    expect(r.response.status).toBe('forbidden')
    expect(r.toolsUsed).toEqual([])
    expect(r.text).not.toMatch(/Plan privado|Cerrar inventario|Proveedor/)
    expect(r.response.blocks.recommendation[0]).toContain('tus acciones')
    expect(analyst.audit[0]).toMatchObject({ status: 'denied_precheck', intent: 'query_actions' })

    const own = await turn(analyst, R1_USERS.analyst, 'mis acciones')
    expect(own.response.references.map((x) => x.id)).toEqual(['a5'])
  })

  it('7 · «¿Cuánto dinero estamos perdiendo por los atrasos?» no inventa cálculos', async () => {
    const r = await turn(h, R1_USERS.lead, '¿Cuánto dinero estamos perdiendo por los atrasos?')
    expect(r.intent).toBe('unsupported_metric')
    expect(r.response.status).toBe('partial')
    expect(r.response.blocks.limitations[0]).toContain('no calculo ni estimo montos')
    expect(r.text).not.toMatch(/\$\s?\d|pesos|MXN/i)
    expect(r.response.blocks.data[0]).toBe('Lo que sí puedo medir: 3 acción(es) vencida(s) en acciones del tablero autorizado.')
    expect(r.response.blocks.interpretation).toEqual([])
  })

  it('8 · «Crea una acción para resolver el bloqueo» identifica la propuesta sin ejecutarla', async () => {
    const r = await turn(h, R1_USERS.lead, 'Crea una acción para resolver el bloqueo.')
    expect(r.intent).toBe('write_request')
    expect(r.response.status).toBe('proposal')
    expect(r.proposal).toMatchObject({
      operation: 'create_action',
      executionEnabled: false,
      payload: { origenAccionId: 'a4' },
    })
    expect(r.proposal?.missing).toEqual(expect.arrayContaining(['responsable', 'fecha']))
    expect(r.response.blocks.limitations[0]).toContain('no está habilitada en R1')
    expect(h.db.inserts.filter((i) => i.table === 'acciones_diarias' || i.table === 'assistant_pending_ops')).toEqual([])
    expect(r.toolsUsed).toEqual([])

    const exec = harness()
    const denied = await turn(exec, R1_USERS.direction, 'Crea una acción para resolver el bloqueo.')
    expect(denied.response.status).toBe('forbidden')
    expect(denied.proposal).toBeUndefined()
  })
})

describe('R1 · permisos, contexto y errores', () => {
  it('bloquea al usuario inactivo antes de cualquier herramienta', async () => {
    const h = harness()
    const r = await turn(h, R1_USERS.inactive, 'mis acciones')
    expect(r.response.status).toBe('forbidden')
    expect(r.toolsUsed).toEqual([])
    expect(h.db.queries).toEqual([])
  })

  it('Dirección consulta el tablero autorizado en lectura', async () => {
    const h = harness()
    const r = await turn(h, R1_USERS.direction, '¿cuántas acciones hay en el tablero?')
    expect(r.handled).toBe(true)
    expect(r.response.status).toBe('ok')
    expect(r.response.blocks.data[0]).toBe('9 abiertas en acciones del tablero autorizado.')
  })

  it('Dirección lee OKRs sin módulo okrs en su rol de catálogo (lectura ejecutiva) y no puede proponer cambios', async () => {
    const h = harness()
    const r = await turn(h, R1_USERS.directionNoOkr, '¿Cómo vamos con los OKRs?')
    expect(r.response.status).toBe('ok')
    expect(r.text).toContain('Crecer ventas')
    const write = await turn(h, R1_USERS.directionNoOkr, 'Crea una acción para revisar ventas.')
    expect(write.response.status).toBe('forbidden')
  })

  it('desambigua homónimos antes de consultar acciones de una persona', async () => {
    const h = harness()
    const r = await turn(h, R1_USERS.lead, '¿Cuáles tiene Jorge?')
    expect(r.response.status).toBe('clarification')
    expect(r.clarification?.options.map((o) => o.id).sort()).toEqual(['u-j1', 'u-j2'])
    expect(r.toolsUsed).toEqual(['search_people'])
  })

  it('consulta acciones de una persona resuelta sin filtrar después de recortar', async () => {
    const h = harness()
    const r = await turn(h, R1_USERS.lead, '¿Cuáles tiene Jorge Ruiz?')
    expect(r.response.references.map((x) => x.id)).toEqual(['a8'])
    expect(r.response.blocks.data[0]).toBe('1 abiertas en acciones de Jorge Ruiz.')
  })

  it('conserva a Carlos en el seguimiento «¿Cuáles están atrasados?» y no mezcla ajenas', async () => {
    const h = harness()
    const first = await turn(h, R1_USERS.lead, '¿Qué pendientes tiene Carlos?')
    expect(first.response.status).toBe('ok')
    expect(first.response.references.map((x) => x.id).sort()).toEqual(['a10', 'a9'])
    expect(first.text).toContain('Carlos Reyes')
    expect(first.text).not.toContain('Plan privado')
    expect(first.text).not.toContain('Cerrar inventario')

    const follow = await turn(h, R1_USERS.lead, '¿Cuáles están atrasados?')
    expect(follow.response.references.map((x) => x.id)).toEqual(['a9'])
    expect(follow.response.blocks.data[0]).toMatch(/Carlos Reyes/)
    expect(follow.text).not.toContain('Actualizar SOP')
    expect((await h.store.get('u-lead:web:s1'))?.lastEntity).toMatchObject({
      kind: 'person',
      id: 'u-carlos',
    })
  })

  it('el contexto expira a los 30 minutos y no se comparte entre canales', async () => {
    const h = harness()
    await turn(h, R1_USERS.lead, '¿Cuáles están vencidas?')
    expect(await h.store.get('u-lead:web:s1')).not.toBeNull()
    expect(await h.store.get('u-lead:whatsapp:s1')).toBeNull()
    expect(await h.store.get('u-lead:web:s1', Date.now() + 31 * 60 * 1000)).toBeNull()
  })

  it('descarta campos de autoridad inyectados por el cliente o el modelo', () => {
    expect(stripAuthorityFields({ scope: 'board_authorized', rol: 'super_admin', usuario_id: 'x', boardScope: 'organization' }))
      .toEqual({ scope: 'board_authorized' })
  })

  it('distingue error de fuente de resultado vacío y no inventa cifras', async () => {
    const h = harness()
    const actor = r1Actor(h.db, R1_USERS.lead)
    const r = await runAgentTurn(
      { actor, utterance: 'mis acciones vencidas' },
      {
        dispatch: async () => { throw new Error('timeout') },
        store: h.store,
        today: () => R1_TODAY,
      }
    )
    expect(r.response.status).toBe('error')
    expect(r.response.blocks.data[0]).toContain('No muestro cifras')
    const empty = await turn(harness(), R1_USERS.lead, 'mis acciones bloqueadas')
    expect(empty.response.status).toBe('empty')
  })

  it('mensajes no operativos regresan al LLM del canal', async () => {
    const r = await turn(harness(), R1_USERS.lead, 'hola, ¿cómo estás?')
    expect(r.handled).toBe(false)
  })

  it('la auditoría no guarda el texto del usuario ni títulos', async () => {
    const h = harness()
    await turn(h, R1_USERS.lead, '¿Qué tengo pendiente hoy?')
    const serialized = JSON.stringify(h.audit)
    expect(h.audit[0]).toMatchObject({ channel: 'web', intent: 'query_actions', status: 'ok', total: 3 })
    expect(serialized).not.toMatch(/pendiente hoy|Cerrar inventario/i)
  })
})

describe('R1 · continuidad conversacional QA-R1-04', () => {
  it('pendiente → vencida → marcar hecha → reporte → equipo: contexto, propuesta y permisos', async () => {
    const h = harness()
    const pending = await turn(h, R1_USERS.lead, 'Muéstrame mis acciones pendientes')
    expect(pending.handled).toBe(true)
    expect(pending.intent).toBe('query_actions')
    expect(pending.response.references.map((x) => x.id)).toEqual(['a1', 'a2', 'a3'])
    const storedPending = await h.store.get('u-lead:web:s1')
    expect(storedPending?.lastActions.map((a) => a.id)).toEqual(['a1', 'a2', 'a3'])
    const queriesAfterList = h.db.queries.length

    const overdue = await turn(h, R1_USERS.lead, '¿Cuál está vencida?')
    expect(overdue.intent).toBe('query_actions')
    expect(overdue.response.references.map((x) => x.id)).toEqual(['a1'])
    expect((await h.store.get('u-lead:web:s1'))?.activeQuery).toMatchObject({
      scope: 'assigned_to_me',
      status_group: 'overdue',
    })

    const mark = await turn(h, R1_USERS.lead, 'Marca esa acción como hecha')
    expect(mark.intent).toBe('write_request')
    expect(mark.response.status).toBe('proposal')
    expect(mark.proposal).toMatchObject({
      operation: 'update_status',
      executionEnabled: false,
      payload: { accionId: 'a1', estado: 'Hecho' },
    })
    expect(h.db.inserts.filter((row) => row.table === 'acciones_diarias' || row.table === 'assistant_pending_ops')).toEqual([])

    const queriesBeforeFormat = h.db.queries.length
    const report = await turn(h, R1_USERS.lead, 'Cambia a modo reporte')
    expect(report).toMatchObject({ handled: true, formatSelected: 'report', format: 'report', toolsUsed: [] })
    expect(report.text).toMatch(/Formato de respuesta: Reporte/)
    expect(h.db.queries.length).toBe(queriesBeforeFormat)
    expect(queriesAfterList).toBeGreaterThan(0)

    const team = await turn(h, R1_USERS.lead, '¿Y las de mi equipo?')
    expect(team.intent).toBe('query_actions')
    expect(team.response.status).toBe('ok')
    expect((await h.store.get('u-lead:web:s1'))?.activeQuery).toMatchObject({ scope: 'team_authorized' })
    expect(team.toolsUsed).toEqual(['get_my_actions'])
    expect(team.response.references.some((x) => x.id === 'a1')).toBe(false)
  })

  it('Analista no ve el tablero de otro equipo en el seguimiento «¿Y las de mi equipo?»', async () => {
    const h = harness()
    await turn(h, R1_USERS.analyst, 'Muéstrame mis acciones pendientes')
    const team = await turn(h, R1_USERS.analyst, '¿Y las de mi equipo?')
    expect(team.response.status).toBe('forbidden')
    expect(team.toolsUsed).toEqual([])
    expect(team.text).not.toMatch(/Plan privado|Cerrar inventario|Proveedor/)
  })
})

describe('R1 · consistencia entre canales', () => {
  it('web, WhatsApp y voz devuelven las mismas cifras e IDs', async () => {
    const results = await Promise.all(
      (['web', 'whatsapp', 'voice'] as const).map((channel) => turn(harness(), R1_USERS.lead, '¿Qué tengo pendiente hoy?', channel))
    )
    const facts = results.map((r) => ({ data0: r.response.blocks.data[0], ids: r.response.references.map((x) => x.id) }))
    expect(facts[1]).toEqual(facts[0])
    expect(facts[2]).toEqual(facts[0])
    const whatsapp = formatForChannel(results[1]!, 'whatsapp')
    const voice = formatForChannel(results[2]!, 'voice')
    expect(whatsapp.length).toBeLessThanOrEqual(900)
    expect(whatsapp).not.toMatch(/[*#_]/)
    expect(voice).toContain('3 abiertas')
    expect(voice).not.toContain('\n- ')
  })
})
