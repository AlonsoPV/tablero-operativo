import { describe, expect, it } from 'vitest'
import { extractResourceUrl } from './resourceUrlResolver.js'
import { runAgentTurn } from './runAgentTurn.js'
import { composeText } from './respond.js'
import { createMemorySessionContextStore } from './sessionContext.js'
import { createR1Db, r1Actor, R1_TODAY, R1_USERS } from './testing/r1Fixture.js'
import type { EntityResolutionCatalog } from './structuredActionDraft.js'
import { applyConversationTurn } from '../../../src/features/ai-support/conversation/applyTurn.js'

const GERARDO_ID = 'f7e4b655-234c-4f81-abdb-a9c15ab8fd2c'
const SAMPLE_ACTION_ID = '4fef90ec-af22-4592-9d73-c138f2438b4b'
const SAMPLE_OKR_ID = '000d7676-8694-476a-93b1-d05cfe83179d'

const CATALOG: EntityResolutionCatalog = {
  users: [
    { id: R1_USERS.superAdmin.id, nombre: 'Alonso Pérez', activo: true, hasWhatsApp: true },
    { id: GERARDO_ID, nombre: 'Gerardo Puga', activo: true, hasWhatsApp: true },
  ],
  boards: [
    { id: 'kanban_corporativo', nombre: 'Kanban corporativo', kind: 'corporativo', authorized: true },
    { id: 'tablero_equipo', nombre: 'Tablero de equipo', kind: 'equipo', authorized: true },
  ],
}

function makeDispatch(opts?: { denyActionDetails?: boolean; failInitiatives?: boolean }) {
  return async (_actor: unknown, name: string, args: Record<string, unknown>) => {
    if (name === 'get_action_details') {
      if (opts?.denyActionDetails) {
        return {
          ok: false,
          tool: name,
          kind: 'denied' as const,
          error: 'No tienes permiso para ver esta acción.',
        }
      }
      if (args.action_id === SAMPLE_ACTION_ID) {
        return {
          ok: true,
          tool: name,
          kind: 'read' as const,
          data: {
            action: {
              id: SAMPLE_ACTION_ID,
              titulo: 'Validar cobertura de entregas Q4',
              estado: 'Bloqueado',
              fecha: '2026-11-24',
              prioridad: 'P1_Alta',
              responsable_id: GERARDO_ID,
              responsable_nombre: 'Gerardo Puga',
              area: 'Operaciones',
            },
            checklist: [{ completado: true }, { completado: false }],
            comments: [{ contenido: 'Esperando confirmación de proveedor logístico.' }],
          },
        }
      }
      return { ok: false, tool: name, kind: 'error' as const, error: 'No encontré esa acción.' }
    }
    if (name === 'query_actions') {
      return {
        ok: true,
        tool: name,
        kind: 'read' as const,
        data: {
          items: [
            {
              id: SAMPLE_ACTION_ID,
              accion: 'Validar cobertura de entregas Q4',
              estado: 'Bloqueado',
              fecha: '2026-11-24',
              prioridad: 'P1_Alta',
              responsable: GERARDO_ID,
              responsable_nombre: 'Gerardo Puga',
              area: 'Operaciones',
            },
          ],
          total: 1,
          load_truncated: false,
        },
      }
    }
    if (name === 'get_okr_progress') {
      if (opts?.failInitiatives) {
        return { ok: false, tool: name, kind: 'error' as const, error: 'Database timeout' }
      }
      return {
        ok: true,
        tool: name,
        kind: 'read' as const,
        data: {
          items: [
            {
              id: SAMPLE_OKR_ID,
              nombre: 'Escalar ejecución operativa Q4',
              progress: 64,
              without_initiatives: false,
              insufficient_krs: false,
              key_results: [],
            },
          ],
          initiatives: [],
        },
      }
    }
    return { ok: true, tool: name, kind: 'read' as const, data: {} }
  }
}

describe('P1 — Resolución segura de URLs internas y externas', () => {
  it('parsea rutas internas soportadas y clasifica enlaces externos', () => {
    expect(extractResourceUrl(`Revisa https://tablero-operativo.vercel.app/kanban?accion=${SAMPLE_ACTION_ID}`)).toEqual({
      kind: 'action',
      rawUrl: `https://tablero-operativo.vercel.app/kanban?accion=${SAMPLE_ACTION_ID}`,
      actionId: SAMPLE_ACTION_ID,
      href: `/kanban?accion=${SAMPLE_ACTION_ID}`,
    })
    expect(extractResourceUrl('Abre /kanban-equipos/tablero?area=ops')).toMatchObject({
      kind: 'board',
      boardKind: 'equipo',
      areaId: 'ops',
    })
    expect(extractResourceUrl(`Ver https://tablero-operativo.vercel.app/okrs#okr-objective-${SAMPLE_OKR_ID}`)).toMatchObject({
      kind: 'okr',
      objectiveId: SAMPLE_OKR_ID,
    })
    expect(extractResourceUrl('Revisa https://example.com/report.pdf')).toMatchObject({
      kind: 'external',
      hostname: 'example.com',
    })
  })

  it('resuelve una acción real desde URL y prepara un mensaje contextual para su responsable', async () => {
    const store = createMemorySessionContextStore()
    const actor = r1Actor(createR1Db(), R1_USERS.superAdmin, 'web', 'url-session')
    const url = `https://tablero-operativo.vercel.app/kanban?accion=${SAMPLE_ACTION_ID}`

    const res = await runAgentTurn(
      { actor, utterance: `Revisa esta acción y prepara un mensaje para su responsable: ${url}` },
      { store, today: () => R1_TODAY, entityCatalog: CATALOG, dispatch: makeDispatch() }
    )
    const text = composeText(res.response, { headings: true })

    expect(res.handled).toBe(true)
    expect(res.toolsUsed).toContain('get_action_details')
    expect(res.communicationProposal?.recipients[0]?.recipientId).toBe(GERARDO_ID)
    expect(res.communicationProposal?.recipients[0]?.recipientName).toBe('Gerardo Puga')
    expect(res.communicationProposal?.recipients[0]?.messageBody).toContain('Validar cobertura de entregas Q4')
    expect(res.communicationProposal?.recipients[0]?.messageBody).not.toContain('https://')
    expect(text).toContain('Gerardo Puga')
  })

  it('consulta detalle real al revisar una URL de acción sin inventar datos', async () => {
    const store = createMemorySessionContextStore()
    const actor = r1Actor(createR1Db(), R1_USERS.superAdmin, 'web', 'url-inspect')
    const url = `https://tablero-operativo.vercel.app/kanban?accion=${SAMPLE_ACTION_ID}`

    const res = await runAgentTurn(
      { actor, utterance: `Revisa esta acción: ${url}` },
      { store, today: () => R1_TODAY, entityCatalog: CATALOG, dispatch: makeDispatch() }
    )
    const text = composeText(res.response, { headings: true })

    expect(res.handled).toBe(true)
    expect(res.toolsUsed).toContain('get_action_details')
    expect(text).toContain('Validar cobertura de entregas Q4')
    expect(text).toContain('Gerardo Puga')
    expect(text).toContain('Bloqueado')
    expect(text).toContain('1/2')
  })

  it('respeta permisos cuando un usuario no autorizado pega una URL de acción ajena', async () => {
    const store = createMemorySessionContextStore()
    const actor = r1Actor(createR1Db(), R1_USERS.analyst, 'web', 'url-denied')
    const url = `https://tablero-operativo.vercel.app/kanban?accion=${SAMPLE_ACTION_ID}`

    const res = await runAgentTurn(
      { actor, utterance: `Revisa esta acción: ${url}` },
      { store, today: () => R1_TODAY, entityCatalog: CATALOG, dispatch: makeDispatch({ denyActionDetails: true }) }
    )
    expect(res.handled).toBe(true)
    expect(res.response.status).toBe('forbidden')
    expect(composeText(res.response, { headings: true })).not.toContain('Validar cobertura de entregas Q4')
  })

  it('resuelve URL interna de objetivo OKR y comunica limitación honesta ante URL externa', async () => {
    const store = createMemorySessionContextStore()
    const actor = r1Actor(createR1Db(), R1_USERS.superAdmin, 'web', 'url-okr-ext')

    const okrRes = await runAgentTurn(
      { actor, utterance: `Revisa este objetivo https://tablero-operativo.vercel.app/okrs#okr-objective-${SAMPLE_OKR_ID}` },
      { store, today: () => R1_TODAY, entityCatalog: CATALOG, dispatch: makeDispatch() }
    )
    expect(okrRes.handled).toBe(true)
    expect(composeText(okrRes.response, { headings: true })).toContain('Escalar ejecución operativa Q4')
    expect(composeText(okrRes.response, { headings: true })).toContain('64%')

    const extRes = await runAgentTurn(
      { actor, utterance: 'Revisa este documento https://example.com/archivo-externo' },
      { store, today: () => R1_TODAY, entityCatalog: CATALOG, dispatch: makeDispatch() }
    )
    expect(extRes.handled).toBe(true)
    expect(extRes.toolsUsed).toHaveLength(0)
    expect(composeText(extRes.response, { headings: true })).toContain('No puedo abrir ni consultar el enlace externo')
  })

  it('pre-router cliente hace handoff de mensajes con URLs hacia el orquestador compartido', () => {
    const turn = applyConversationTurn({
      message: `Revisa esta acción: https://tablero-operativo.vercel.app/kanban?accion=${SAMPLE_ACTION_ID}`,
      previous: null,
      people: [{ id: GERARDO_ID, nombre: 'Gerardo Puga' }],
      canSeeTeam: true,
    })
    expect(turn.kind).toBe('handoff')
  })
})

describe('P0 — Las 7 consultas operativas obligatorias mantienen alcance exacto y honestidad', () => {
  it('clasifica y responde las 7 consultas sin confundir iniciativas, acciones ni OKRs', async () => {
    const ask = async (utterance: string, opts?: { failInitiatives?: boolean }) => {
      const actor = r1Actor(createR1Db(), R1_USERS.superAdmin, 'web', `q-${utterance.slice(0, 12)}`)
      const res = await runAgentTurn(
        { actor, utterance },
        { store: createMemorySessionContextStore(), today: () => R1_TODAY, entityCatalog: CATALOG, dispatch: makeDispatch(opts) }
      )
      return { res, text: composeText(res.response, { headings: true }) }
    }

    expect((await ask('¿Qué tengo pendiente hoy?')).res.intent).toBe('query_actions')
    expect((await ask('¿Qué tiene Gerardo para hoy?')).res.intent).toBe('query_actions')
    expect((await ask('¿Cuáles son mis acciones vencidas?')).res.intent).toBe('query_actions')
    expect((await ask('¿Qué acciones están bloqueadas?')).res.intent).toBe('query_actions')

    // Cero iniciativas personales -> informa cero iniciativas sin ampliar alcance
    const initEmpty = await ask('¿Qué iniciativas tengo activas?')
    expect(initEmpty.res.intent).toBe('query_initiatives')
    expect(initEmpty.res.response.status).toBe('empty')
    expect(initEmpty.text).toMatch(/No tienes iniciativas activas/i)

    // Error real en fuente -> status error, NUNCA empty
    const initErr = await ask('¿Qué iniciativas tengo activas?', { failInitiatives: true })
    expect(initErr.res.response.status).toBe('error')
    expect(initErr.text).not.toMatch(/No tienes iniciativas activas/i)

    const okrs = await ask('¿Cómo van nuestros objetivos?')
    expect(okrs.res.intent).toBe('query_okrs')
    expect(okrs.text).toContain('Escalar ejecución operativa Q4')

    const attention = await ask('¿Qué requiere atención inmediata?')
    expect(attention.res.handled).toBe(true)
    expect(['executive_brief', 'recommend_next', 'query_actions']).toContain(attention.res.intent)
  })
})
