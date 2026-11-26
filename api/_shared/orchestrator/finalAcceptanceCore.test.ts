import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { classifyAgentIntent } from './intent.js'
import { runAgentTurn } from './runAgentTurn.js'
import { composeText } from './respond.js'
import { createMemorySessionContextStore } from './sessionContext.js'
import { createR1Db, r1Actor, R1_USERS } from './testing/r1Fixture.js'
import type { EntityResolutionCatalog } from './structuredActionDraft.js'
import { applyConversationTurn } from '../../../src/features/ai-support/conversation/applyTurn.js'
import { wrapUntrustedToolData } from '../../../src/features/ai-support/copilot/matching.js'
import type { ConversationQueryState } from '../../../src/features/ai-support/conversation/types.js'
import type { ToolDispatcher } from '../query/index.js'

const ALONSO_ID = 'dd764c9f-8145-45d4-9111-0a8ec7f687e5'
const GERARDO_ID = 'f7e4b655-234c-4f81-abdb-a9c15ab8fd2c'
const ACTION_ID = '4fef90ec-af22-4592-9d73-c138f2438b4b'
const TODAY = '2026-11-26'

const ALONSO_USER = {
  ...R1_USERS.superAdmin,
  id: ALONSO_ID,
  nombre: 'Alonso Pérez',
} as const

const CATALOG: EntityResolutionCatalog = {
  users: [
    { id: ALONSO_ID, nombre: 'Alonso Pérez', activo: true, hasWhatsApp: true },
    { id: GERARDO_ID, nombre: 'Gerardo Puga', activo: true, hasWhatsApp: true },
  ],
  boards: [{ id: 'kanban_corporativo', nombre: 'Kanban corporativo', kind: 'corporativo', authorized: true }],
}

function makeDispatcher(): ToolDispatcher {
  return vi.fn(async (_ctx, tool, args) => {
    if (tool === 'get_action_details') {
      if (args.action_id === ACTION_ID) {
        return {
          ok: true,
          tool,
          kind: 'read',
          data: wrapUntrustedToolData({
            action: {
              id: ACTION_ID,
              title: 'Cerrar conciliación operativa Q4',
              estado: 'Pendiente',
              prioridad: 'Rojo',
              fecha: '2026-11-13',
              responsable: GERARDO_ID,
              href: `/kanban?accion=${ACTION_ID}`,
            },
            checklist: [],
            comments: [],
          }),
        }
      }
      return { ok: false, tool, kind: 'read', error: 'Acción no encontrada' }
    }
    if (tool === 'search_people') {
      const q = String(args.name ?? args.query ?? '').toLowerCase()
      const people = [
        { id: ALONSO_ID, nombre: 'Alonso Pérez', area: 'Dirección' },
        { id: GERARDO_ID, nombre: 'Gerardo Puga', area: 'Operaciones' },
      ].filter((p) => !q || p.nombre.toLowerCase().includes(q))
      return { ok: true, tool, kind: 'read', data: wrapUntrustedToolData({ items: people, people }) }
    }
    if (tool === 'get_my_actions') {
      return {
        ok: true,
        tool,
        kind: 'read',
        data: {
          items: [
            {
              id: ACTION_ID,
              title: 'Cerrar conciliación operativa Q4',
              estado: 'Pendiente',
              prioridad: 'Rojo',
              fecha: '2026-11-13',
              responsable: GERARDO_ID,
              responsable_nombre: 'Gerardo Puga',
              area: 'Operaciones',
            },
            {
              id: 'dc561a62-0a6f-56cb-a25f-07c369dc2534',
              title: 'Validar presupuesto anual',
              estado: 'Pendiente',
              prioridad: 'Amarillo',
              fecha: TODAY,
              responsable: ALONSO_ID,
              responsable_nombre: 'Alonso Pérez',
              area: 'Dirección',
            },
          ],
          total: 2,
          load_truncated: false,
        },
      }
    }
    if (tool === 'notify_user_email') {
      return {
        ok: true,
        tool,
        kind: 'write',
        proposal: {
          id: '11111111-1111-4111-8111-111111111111',
          tool: 'notify_user_email',
          summary: `Enviar correo a ${String(args.recipient ?? 'Alonso Pérez')}`,
          expiresAt: new Date(Date.now() + 600_000).toISOString(),
          workspace: {
            toUserId: String(args.recipient_id ?? ALONSO_ID),
            subject: String(args.subject ?? 'Seguimiento'),
            body: String(args.body ?? ''),
            needsInfo: false,
            incomplete: false,
          },
        },
      }
    }
    return { ok: true, tool, kind: 'read', data: {} }
  }) as unknown as ToolDispatcher
}

describe('Final Acceptance Sprint — Shared Core (Sections 4, 5, 9)', () => {
  const envBackup = { ...process.env }

  beforeEach(() => {
    process.env.SUPABASE_URL = 'https://xhpasmjzuwifmjhrsumb.supabase.co'
    process.env.R2_EXECUTION_MODE = 'pilot'
    process.env.R2_PILOT_USERS = ALONSO_ID
    process.env.WHATSAPP_COMMUNICATIONS_ENABLED = '1'
    process.env.WHATSAPP_COMMUNICATIONS_SENDERS = ALONSO_ID
    process.env.WHATSAPP_COMMUNICATIONS_RECIPIENTS = ALONSO_ID
    process.env.WHATSAPP_COMMUNICATIONS_CHANNELS = 'whatsapp,email'
  })

  afterEach(() => {
    process.env = { ...envBackup }
  })

  it('executes the exact 5-turn Section 9 URL sequence cleanly across shared core and web pre-router', async () => {
    const store = createMemorySessionContextStore()
    const dispatch = makeDispatcher()
    const db = createR1Db()
    db.tables.usuarios.push({
      id: GERARDO_ID,
      user_id: 'a-ger-real',
      nombre: 'Gerardo Puga',
      rol: 'Gerente',
      area: 'Operaciones',
      activo: true,
    })
    const actor = r1Actor(db, ALONSO_USER, 'web', 'sec9-url-session')
    actor.copilot.accessToken = 'synthetic-jwt'

    const people = [
      { id: ALONSO_ID, nombre: 'Alonso Pérez' },
      { id: GERARDO_ID, nombre: 'Gerardo Puga' },
    ]
    const turns = [
      `Resume esta acción: https://tablero-operativo.vercel.app/kanban?accion=${ACTION_ID}`,
      '¿Quién es el responsable?',
      '¿Cuál es su situación?',
      'Prepara un WhatsApp para su responsable',
      'Prepara un correo con el seguimiento necesario',
    ]

    let convState: ConversationQueryState | null = null
    for (const msg of turns) {
      const pre = applyConversationTurn({ message: msg, previous: convState, people, canSeeTeam: true })
      expect(pre.kind, `pre-router must hand off "${msg}"`).toBe('handoff')
      convState = pre.state
    }

    const ask = async (utterance: string) => {
      const res = await runAgentTurn({ actor, utterance }, { store, today: () => TODAY, entityCatalog: CATALOG, dispatch })
      return { res, text: composeText(res.response, { headings: true }) }
    }

    const t1 = await ask(turns[0]!)
    expect(t1.text).toContain('Cerrar conciliación operativa Q4')
    expect(t1.text).toContain('Gerardo Puga')

    const t2 = await ask(turns[1]!)
    expect(t2.res.intent).toBe('inspect_referenced_action')
    expect(t2.text).toContain('Gerardo Puga')
    expect(t2.text).toContain('Cerrar conciliación operativa Q4')

    const t3 = await ask(turns[2]!)
    expect(t3.res.intent).toBe('inspect_referenced_action')
    expect(t3.text).toContain('Pendiente')
    expect(t3.text).toContain('Rojo')
    expect(t3.text).toContain('2026-11-13')

    const t4 = await ask(turns[3]!)
    expect(t4.text).toContain('Gerardo')
    expect(t4.res.communicationProposal?.channel).toBe('whatsapp')
    expect(t4.res.communicationProposal?.canSendDirect).toBe(false)
    expect(t4.res.proposal).toBeUndefined()

    const t5 = await ask(turns[4]!)
    expect(t5.text).toContain('Gerardo')
    expect(t5.res.communicationProposal?.channel).toBe('email')
    expect(t5.res.communicationProposal?.canSendDirect).toBe(false)
    expect(t5.res.proposal).toBeUndefined()
  })

  it('classifies all Section 5 existing-action edits cleanly and hands them off from web pre-router', () => {
    const session = { lastEntityKind: 'action' as const, lastActionCount: 1 }
    const people = [
      { id: ALONSO_ID, nombre: 'Alonso Pérez' },
      { id: GERARDO_ID, nombre: 'Gerardo Puga' },
    ]

    const cases: Array<[string, string, Record<string, unknown>?]> = [
      ['Cambia el responsable a Gerardo', 'update_action'],
      ['Cambia la fecha al lunes', 'update_action'],
      ['Cambia la prioridad a alta', 'update_action'],
      ['Agrega comentario: esperando proveedor', 'add_comment', { contenido: 'esperando proveedor' }],
      ['Registra bloqueo: falta aprobación del proveedor', 'register_blocker', { motivo: 'falta aprobación del proveedor' }],
      ['Marca como en curso', 'update_status', { estado: 'En_Ejecucion' }],
      ['Marca como hecho', 'update_status', { estado: 'Hecho' }],
    ]

    for (const [utterance, expectedOp, extra] of cases) {
      const pre = applyConversationTurn({ message: utterance, previous: null, people, canSeeTeam: true })
      expect(pre.kind, `applyTurn handoff for "${utterance}"`).toBe('handoff')

      const intent = classifyAgentIntent(utterance, null, session)
      expect(intent.kind, `intent kind for "${utterance}"`).toBe('write_request')
      if (intent.kind === 'write_request') {
        expect(intent.operation, `operation for "${utterance}"`).toBe(expectedOp)
        if (extra) expect(intent).toMatchObject(extra)
      }
    }
  })

  it('prepares immediate approval card on authenticated Web pilot for allowlisted email (Alonso) without auto-sending', async () => {
    const store = createMemorySessionContextStore()
    const dispatch = makeDispatcher()
    const db = createR1Db()
    db.tables.acciones_diarias.push({
      id: 'dc561a62-0a6f-56cb-a25f-07c369dc2534',
      titulo_accion: 'Validar presupuesto anual',
      estado: 'Pendiente',
      fecha: TODAY,
      responsable: ALONSO_ID,
      created_by: ALONSO_ID,
      prioridad: 'P2_Media',
      area: 'Dirección',
      updated_at: `${TODAY}T10:00:00Z`,
    })
    const actor = r1Actor(db, ALONSO_USER, 'web', 'web-pilot-email')
    actor.copilot.accessToken = 'synthetic-jwt'

    const res = await runAgentTurn(
      { actor, utterance: 'Envíame un correo a Alonso Pérez con mis pendientes de hoy' },
      { store, today: () => TODAY, entityCatalog: CATALOG, dispatch }
    )
    const text = composeText(res.response, { headings: true })

    expect(res.intent, `text=${text}`).toBe('write_request')
    expect(res.communicationProposal?.channel, `text=${text}`).toBe('email')
    expect(res.communicationProposal?.canSendDirect).toBe(true)
    expect(res.proposal?.tool).toBe('notify_user_email')
    expect(res.proposal?.workspace?.toUserId).toBe(ALONSO_ID)
    expect(text).toContain('Validar presupuesto anual')
    expect(text).toContain('Todavía no se envió')
  })

  it('clears stale person entity on self-scope and impersonal board-wide queries and handles review/edit/cancel-all turns', async () => {
    const store = createMemorySessionContextStore()
    const dispatch = makeDispatcher()
    const db = createR1Db()
    db.tables.usuarios.push({
      id: GERARDO_ID,
      user_id: 'a-ger-real',
      nombre: 'Gerardo Puga',
      rol: 'Gerente',
      area: 'Operaciones',
      activo: true,
    })
    const actor = r1Actor(db, ALONSO_USER, 'web', 'no-person-leak-session')
    actor.copilot.accessToken = 'synthetic-jwt'
    const ask = async (utterance: string) => {
      const res = await runAgentTurn({ actor, utterance }, { store, today: () => TODAY, entityCatalog: CATALOG, dispatch })
      return { res, text: composeText(res.response, { headings: true }) }
    }

    // 1. Set person context to Gerardo Puga
    const tGerardo = await ask('¿Qué tiene Gerardo para hoy?')
    expect(tGerardo.text).toContain('Gerardo Puga')

    // 2. Self-scope query must NOT keep Gerardo Puga label
    const tMine = await ask('¿Qué acciones tengo abiertas?')
    expect(tMine.text).toContain('tus acciones como responsable')
    expect(tMine.text).not.toContain('acciones de Gerardo Puga')

    // 3. Re-set Gerardo Puga, then run impersonal board-wide overdue & blocked queries
    await ask('¿Qué tiene Gerardo para hoy?')
    const tOverdue = await ask('¿Qué acciones vencidas hay?')
    expect(tOverdue.text).not.toContain('acciones de Gerardo Puga')

    await ask('¿Qué tiene Gerardo para hoy?')
    const tBlocked = await ask('¿Qué acciones bloqueadas hay?')
    expect(tBlocked.text).not.toContain('acciones de Gerardo Puga')

    // 4. Intent checks for exact Production continuity regressions
    expect(
      classifyAgentIntent('¿Cómo quedó la acción?', null, {
        pendingWrite: { operation: 'create_action', request: 'Revisar inventario' },
        hasPendingCommunication: true,
      })
    ).toMatchObject({ kind: 'review_pending', target: 'action' })

    expect(
      classifyAgentIntent('Cámbiala a correo mejor', null, {
        pendingWrite: { operation: 'create_action', request: 'Revisar inventario' },
        hasPendingCommunication: true,
      })
    ).toMatchObject({ kind: 'communication_action', action: 'edit' })
  })
})
