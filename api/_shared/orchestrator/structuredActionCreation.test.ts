import { describe, expect, it } from 'vitest'
import type { CopilotActor, CopilotToolResult } from '../../../src/features/ai-support/copilot/types.js'
import { resolveActor } from '../query/resolveActor.js'
import { runAgentTurn } from './runAgentTurn.js'
import { formatForChannel } from './channelAdapters.js'
import { createMemorySessionContextStore, type SessionContextStore } from './sessionContext.js'
import type { EntityResolutionCatalog } from './structuredActionDraft.js'
import type { ToolDispatcher } from '../query/index.js'
import {
  buildWhatsAppInteractiveProposalButtons,
  formatWhatsAppProposalPrompt,
  parseWhatsAppApprovalIntent,
  resolveWhatsAppProposalApproval,
  type WhatsAppProposalBinding,
} from '../whatsappR2Adapter.js'

const TODAY = '2026-11-25' // Miércoles 2026-11-25 -> mañana=2026-11-26, viernes=2026-11-27

const CATALOG: EntityResolutionCatalog = {
  users: [
    { id: 'u-admin', nombre: 'Alonso Pérez', activo: true, areas: ['direccion'] },
    { id: 'u-carlos', nombre: 'Carlos López', activo: true, areas: ['operaciones'] },
    { id: 'u-maria-a', nombre: 'María García', activo: true, areas: ['operaciones'] },
    { id: 'u-maria-b', nombre: 'María Torres', activo: true, areas: ['finanzas'] },
  ],
  boards: [
    { id: 'kanban_corporativo', nombre: 'Kanban corporativo', kind: 'corporativo', authorized: true },
    { id: 'tablero_equipo', nombre: 'Tablero de equipo', kind: 'equipo', authorized: true },
    { id: 'tablero_finanzas', nombre: 'Tablero de Finanzas', kind: 'equipo', authorized: false },
  ],
}

function makeActor(
  id: string,
  nombre: string,
  rol: 'Super Admin' | 'Operativo' = 'Super Admin',
  channel: 'web' | 'whatsapp' | 'voice' = 'whatsapp',
  sessionId = 's-struct-1'
) {
  const copilot: CopilotActor = {
    supabase: {} as CopilotActor['supabase'],
    usuarioId: id,
    nombre,
    email: 'test@empresa.test',
    rol,
    areas: ['operaciones'],
    modulosPermitidos: ['dashboard', 'kanban', 'okrs', 'equipo'],
  }
  return resolveActor(copilot, { channel, sessionId })
}

function createDispatcher(): ToolDispatcher {
  return async (_actor, name): Promise<CopilotToolResult> => {
    if (name === 'get_my_actions') {
      return {
        ok: true,
        kind: 'ok',
        name,
        data: {
          total: 1,
          items: [
            {
              id: 'act-1',
              title: 'Revisar cierre mensual',
              estado: 'Pendiente',
              fecha: '2026-11-26',
              prioridad: 'P1 - Alta',
              responsable: 'u-admin',
              responsable_nombre: 'Alonso Pérez',
            },
          ],
        },
      }
    }
    return { ok: true, kind: 'ok', name, data: { total: 0, items: [] } }
  }
}

async function say(
  utterance: string,
  opts: {
    store: SessionContextStore
    actor?: ReturnType<typeof makeActor>
    channel?: 'web' | 'whatsapp' | 'voice'
    catalog?: EntityResolutionCatalog
  }
) {
  const channel = opts.channel ?? 'whatsapp'
  const actor = opts.actor ?? makeActor('u-admin', 'Alonso Pérez', 'Super Admin', channel)
  const turn = await runAgentTurn(
    { actor: { ...actor, channel }, utterance },
    {
      dispatch: createDispatcher(),
      store: opts.store,
      today: () => TODAY,
      entityCatalog: opts.catalog ?? CATALOG,
    }
  )
  const text = formatForChannel(turn, channel)
  return { turn, text }
}

describe('SCRUMBAN — Creación estructurada de acciones y ejecución conversacional (Casos A–M)', () => {
  it('A. Crear una acción con todos los atributos en un solo mensaje (sin jerga interna ni paréntesis)', async () => {
    const store = createMemorySessionContextStore()
    const { turn, text } = await say(
      'Crea una acción para revisar inventario mañana, asígnamela en el Kanban corporativo con prioridad alta',
      { store }
    )
    expect(turn.handled).toBe(true)
    expect(turn.intent).toBe('write_request')
    expect(text).toContain('Nueva acción')
    expect(text).toContain('Título: Revisar inventario')
    expect(text).toContain('Responsable: Alonso Pérez')
    expect(text).toContain('Fecha de entrega: 2026-11-26')
    expect(text).toContain('Tablero: Kanban corporativo')
    expect(text).toContain('Prioridad: Alta')
    expect(text).toContain('Estado: Pendiente')
    expect(text).not.toMatch(/create_action|write_request|pendingWrite|\bR2\b|assistant_pending_ops|\(/)
  })

  it('B. Complementar responsable y tablero en mensajes posteriores SIN contaminar el título', async () => {
    const store = createMemorySessionContextStore()
    const t1 = await say('Crea una acción para revisar inventario mañana', { store })
    expect(t1.text).toContain('Título: Revisar inventario')
    expect(t1.text).toContain('Fecha de entrega: 2026-11-26')
    expect(t1.text).toContain('Responsable: Pendiente de definir')

    const t2 = await say('Asígnamela en el Kanban corporativo', { store })
    expect(t2.text).toContain('Título: Revisar inventario')
    expect(t2.text).not.toContain('(Asígnamela')
    expect(t2.text).not.toContain('Kanban corporativo)')
    expect(t2.text).toContain('Responsable: Alonso Pérez')
    expect(t2.text).toContain('Tablero: Kanban corporativo')
    expect(t2.text).toContain('Fecha de entrega: 2026-11-26')
  })

  it('C, D, E, F. Modificar fecha, responsable, prioridad y título explícito de forma independiente', async () => {
    const store = createMemorySessionContextStore()
    await say('Crea una acción para revisar inventario mañana', { store })
    await say('Asígnamela en el Kanban corporativo', { store })

    // C. Modificar fecha sin modificar título
    const tDate = await say('Mejor para el viernes', { store })
    expect(tDate.text).toContain('Título: Revisar inventario')
    expect(tDate.text).toContain('Fecha de entrega: 2026-11-27')

    // D. Modificar responsable sin modificar descripción ni título
    const tResp = await say('Asígnala a Carlos López', { store })
    expect(tResp.text).toContain('Título: Revisar inventario')
    expect(tResp.text).toContain('Responsable: Carlos López')

    // E. Modificar prioridad
    const tPrio = await say('Ponla como prioridad alta', { store })
    expect(tPrio.text).toContain('Título: Revisar inventario')
    expect(tPrio.text).toContain('Prioridad: Alta')

    // F. Cambiar explícitamente el título
    const tTitle = await say('Cambia el título a auditoría de inventario', { store })
    expect(tTitle.text).toContain('Título: Auditoría de inventario')
    expect(tTitle.text).toContain('Responsable: Carlos López')
    expect(tTitle.text).toContain('Fecha de entrega: 2026-11-27')
    expect(tTitle.text).toContain('Prioridad: Alta')
  })

  it('G. Crear mediante nota de voz (canal voice/whatsapp) y complementar mediante texto (transversal Web/WhatsApp)', async () => {
    const store = createMemorySessionContextStore()
    const tVoice = await say('Crea una acción para validar entregas mañana', { store, channel: 'whatsapp' })
    expect(tVoice.text).toContain('Título: Validar entregas')
    const tText = await say('Asígnamela en el Kanban', { store, channel: 'whatsapp' })
    expect(tText.text).toContain('Título: Validar entregas')
    expect(tText.text).toContain('Responsable: Alonso Pérez')
    expect(tText.text).toContain('Tablero: Kanban corporativo')

    // Transversalidad en canal Web
    const webStore = createMemorySessionContextStore()
    const w1 = await say('Crea una acción para revisar inventario mañana', { store: webStore, channel: 'web' })
    const w2 = await say('Asígnamela en el Kanban corporativo', { store: webStore, channel: 'web' })
    expect(w1.text).toContain('Título: Revisar inventario')
    expect(w2.text).toContain('Título: Revisar inventario')
    expect(w2.text).toContain('Responsable: Alonso Pérez')
  })

  it('H. Resolver responsables y tableros ambiguos pidiendo aclaración breve sin inventar IDs', async () => {
    const store = createMemorySessionContextStore()
    await say('Crea una acción para revisar facturas mañana', { store })
    const ambResp = await say('Asígnala a María', { store })
    expect(ambResp.turn.response.status).toBe('clarification')
    expect(ambResp.text).toContain('María García')
    expect(ambResp.text).toContain('María Torres')

    const ambBoard = await say('Ponla en el tablero', { store })
    expect(ambBoard.turn.response.status).toBe('clarification')
    expect(ambBoard.text).toContain('Kanban corporativo')
    expect(ambBoard.text).toContain('Tablero de equipo')
  })

  it('I. Cancelar borrador y comenzar otra acción limpia', async () => {
    const store = createMemorySessionContextStore()
    await say('Crea una acción para revisar inventario mañana', { store })
    const cancelled = await say('Cancela', { store })
    expect(cancelled.turn.intent).toBe('cancel_write_draft')
    expect(cancelled.text).toContain('Cancelé el borrador')

    const fresh = await say('Crea una acción para auditar compras el viernes', { store })
    expect(fresh.text).toContain('Título: Auditar compras')
    expect(fresh.text).not.toContain('Revisar inventario')
  })

  it('J. Consultar pendientes durante una creación SIN contaminar ni perder el borrador', async () => {
    const store = createMemorySessionContextStore()
    await say('Crea una acción para revisar inventario mañana', { store })

    const queryTurn = await say('¿Qué acciones tengo pendientes?', { store })
    expect(queryTurn.turn.intent).toBe('query_actions')
    expect(queryTurn.text).toContain('Revisar cierre mensual')

    const resumed = await say('Asígnamela en el Kanban corporativo', { store })
    expect(resumed.turn.intent).toBe('write_request')
    expect(resumed.text).toContain('Título: Revisar inventario')
    expect(resumed.text).toContain('Responsable: Alonso Pérez')
    expect(resumed.text).not.toContain('Revisar cierre mensual')
  })

  it('K y L. Confirmar propuesta desactualizada rechazada; con R2 OFF no hay botones ni afirmación de guardado', () => {
    const staleBinding: WhatsAppProposalBinding = {
      proposalId: 'op-1',
      version: 'NEWVER99',
      usuarioId: 'u-admin',
      operation: 'agent_create_action',
      summary: 'Nueva acción: Revisar inventario',
      scope: 'Kanban corporativo',
      expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
      editable: true,
    }
    // K. Confirmar con versión anterior (desactualizada) -> version_mismatch
    const staleAttempt = resolveWhatsAppProposalApproval({
      actorUsuarioId: 'u-admin',
      actorActive: true,
      pending: [staleBinding],
      decision: parseWhatsAppApprovalIntent({ text: 'confirmar OLDVER11' }),
      executionMode: 'pilot',
    })
    expect(staleAttempt.status).toBe('version_mismatch')

    // L. Intentar ejecutar con R2 OFF -> sin botones, sin pedir confirmación, sin afirmar guardado en Scrumban
    const offPrompt = formatWhatsAppProposalPrompt(staleBinding, { executionMode: 'disabled' })
    expect(offPrompt).toContain('no se guardó en Scrumban')
    expect(offPrompt).not.toContain('confirmar NEWVER99')
    expect(offPrompt).not.toContain('create_action')
    expect(buildWhatsAppInteractiveProposalButtons(staleBinding, 'disabled')).toEqual([])

    const offExec = resolveWhatsAppProposalApproval({
      actorUsuarioId: 'u-admin',
      actorActive: true,
      pending: [staleBinding],
      decision: parseWhatsAppApprovalIntent({ text: 'confirmar NEWVER99' }),
      executionMode: 'disabled',
    })
    expect(offExec.status).toBe('draft_only_r2_off')
  })

  it('M. Intentar asignar a un usuario o tablero fuera del alcance autorizado es rechazado', async () => {
    const store = createMemorySessionContextStore()
    const opActor = makeActor('u-op', 'Sofía Operativa', 'Operativo')
    await say('Crea una acción para revisar inventario mañana', { store, actor: opActor })

    const foreignUser = await say('Asígnala a Carlos López', { store, actor: opActor })
    expect(foreignUser.turn.response.status).toBe('forbidden')
    expect(foreignUser.text).toContain('No tienes permiso para asignar acciones')

    const forbiddenBoard = await say('Ponla en el tablero de Finanzas', { store, actor: opActor })
    expect(forbiddenBoard.turn.response.status).toBe('forbidden')
    expect(forbiddenBoard.text).toContain('No tienes permiso')
  })
})
