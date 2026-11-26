import { describe, expect, it } from 'vitest'
import { runAgentTurn } from './runAgentTurn.js'
import { composeText } from './respond.js'
import { createMemorySessionContextStore } from './sessionContext.js'
import { createR1Db, r1Actor, R1_TODAY, R1_USERS } from './testing/r1Fixture.js'
import type { EntityResolutionCatalog } from './structuredActionDraft.js'
import { applyConversationTurn } from '../../../src/features/ai-support/conversation/applyTurn.js'
import type { ConversationQueryState } from '../../../src/features/ai-support/conversation/types.js'

const GERARDO_ID = '22222222-2222-4222-8222-222222222222'
const CARLOS_ID = '33333333-3333-4333-8333-333333333333'

const CATALOG: EntityResolutionCatalog = {
  users: [
    { id: R1_USERS.superAdmin.id, nombre: 'Alonso Pérez', activo: true, hasWhatsApp: true },
    { id: GERARDO_ID, nombre: 'Gerardo Puga', activo: true, hasWhatsApp: true },
    { id: CARLOS_ID, nombre: 'Carlos Mendoza', activo: true, hasWhatsApp: true },
  ],
  boards: [
    { id: 'kanban_corporativo', nombre: 'Kanban corporativo', kind: 'corporativo', authorized: true },
    { id: 'tablero_equipo', nombre: 'Tablero de equipo', kind: 'equipo', authorized: true },
  ],
}

const SPRINT_TODAY = '2026-11-24' // Martes -> default es miércoles 2026-11-25 y "viernes" debe resolver a 2026-11-27

const SAMPLE_ACTIONS = [
  {
    id: 'act-1',
    accion: 'Cerrar conciliación de entregas',
    estado: 'Pendiente',
    fecha: SPRINT_TODAY,
    prioridad: 'P1_Alta',
    responsable: GERARDO_ID,
    responsable_nombre: 'Gerardo Puga',
    area: 'Operaciones',
  },
  {
    id: 'act-2',
    accion: 'Revisar plan semanal',
    estado: 'Pendiente',
    fecha: SPRINT_TODAY,
    prioridad: 'P2_Media',
    responsable: R1_USERS.superAdmin.id,
    responsable_nombre: 'Alonso Pérez',
    area: 'Dirección',
  },
]

async function runTenTurnSequence(channel: 'web' | 'whatsapp' | 'voice') {
  const store = createMemorySessionContextStore()
  const key = `${R1_USERS.superAdmin.id}:${channel}:ten-turn-session`
  const ask = async (utterance: string) => {
    const actor = r1Actor(createR1Db(), R1_USERS.superAdmin, channel, 'ten-turn-session')
    if (channel === 'web') actor.copilot.accessToken = 'synthetic-jwt'
    const res = await runAgentTurn(
      { actor, utterance },
      {
        store,
        today: () => SPRINT_TODAY,
        entityCatalog: CATALOG,
        dispatch: async (_a, name) => {
          if (name === 'query_actions') {
            return {
              ok: true,
              tool: name,
              kind: 'read',
              data: { items: SAMPLE_ACTIONS, total: SAMPLE_ACTIONS.length, load_truncated: false },
            }
          }
          return { ok: true, tool: name, kind: 'read', data: {} }
        },
      }
    )
    const text = composeText(res.response, { headings: channel === 'web' })
    return { res, text, ctx: structuredClone(store.get(key)) }
  }

  const t1 = await ask('Crea una acción para revisar el inventario')
  const t2 = await ask('Prepárala para Gerardo')
  const t3 = await ask('Mejor para el viernes')
  const t4 = await ask('Ponle prioridad alta')
  const t5 = await ask('¿Cómo quedó?')
  const t6 = await ask('Avísale por WhatsApp')
  const t7 = await ask('Mejor por correo')
  const t8 = await ask('¿Qué acciones tengo abiertas?')
  const t9 = await ask('Regresa al borrador anterior')
  const t10 = await ask('Confirma la propuesta')

  return { t1, t2, t3, t4, t5, t6, t7, t8, t9, t10 }
}

describe('SCRUMBAN P0 — Secuencia obligatoria de 10 turnos de inteligencia conversacional', () => {
  it.each(['web', 'whatsapp', 'voice'] as const)(
    '%s: conserva contexto, atributos independientes, consulta intermedia y recuperación de borrador',
    async (channel) => {
      const seq = await runTenTurnSequence(channel)

      // 1. Crea una acción para revisar el inventario
      expect(seq.t1.res.handled).toBe(true)
      const draft1 = seq.t1.ctx?.pendingWrite?.draft
      expect(draft1?.titulo?.toLowerCase()).toContain('revisar el inventario')

      // 2. Prepárala para Gerardo (cambia responsable sin contaminar título/descripción)
      expect(seq.t2.res.handled).toBe(true)
      const draft2 = seq.t2.ctx?.pendingWrite?.draft
      expect(draft2?.responsableId).toBe(GERARDO_ID)
      expect(draft2?.titulo).toBe(draft1?.titulo)
      expect(draft2?.titulo?.toLowerCase()).not.toContain('gerardo')

      // 3. Mejor para el viernes (actualiza fecha, conserva responsable y título)
      expect(seq.t3.res.handled).toBe(true)
      const draft3 = seq.t3.ctx?.pendingWrite?.draft
      expect(draft3?.responsableId).toBe(GERARDO_ID)
      expect(draft3?.titulo).toBe(draft1?.titulo)
      expect(draft3?.fecha).toBe('2026-11-27')
      expect(draft3?.fecha).not.toBe(draft2?.fecha)

      // 4. Ponle prioridad alta (actualiza prioridad, conserva fecha, responsable y título)
      expect(seq.t4.res.handled).toBe(true)
      const draft4 = seq.t4.ctx?.pendingWrite?.draft
      expect(draft4?.prioridad).toBe('P1_Alta')
      expect(draft4?.responsableId).toBe(GERARDO_ID)
      expect(draft4?.fecha).toBe(draft3?.fecha)
      expect(draft4?.titulo).toBe(draft1?.titulo)

      // 5. ¿Cómo quedó? (revisa sin mutar ni perder atributos)
      expect(seq.t5.res.handled).toBe(true)
      expect(seq.t5.text).toContain('Gerardo')
      expect(seq.t5.text.toLowerCase()).toContain('inventario')
      expect(seq.t5.ctx?.pendingWrite?.draft).toEqual(draft4)

      // 6. Avísale por WhatsApp (prepara comunicación para Gerardo sobre la acción/contexto)
      expect(seq.t6.res.handled).toBe(true)
      const comm6 = seq.t6.ctx?.pendingCommunication
      expect(comm6?.channel).toBe('whatsapp')
      expect(comm6?.recipients[0]?.recipientId).toBe(GERARDO_ID)
      expect(comm6?.recipients[0]?.messageBody).not.toMatch(/Avísale por WhatsApp/i)

      // 7. Mejor por correo (cambia canal a email, conserva destinatario y propósito)
      expect(seq.t7.res.handled).toBe(true)
      const comm7 = seq.t7.ctx?.pendingCommunication
      expect(comm7?.channel).toBe('email')
      expect(comm7?.recipients[0]?.recipientId).toBe(GERARDO_ID)
      expect(comm7?.version).toBeGreaterThan(comm6!.version)

      // 8. ¿Qué acciones tengo abiertas? (consulta sin destruir borradores pendientes)
      expect(seq.t8.res.handled).toBe(true)
      expect(seq.t8.res.intent).toBe('query_actions')
      expect(seq.t8.ctx?.pendingWrite?.draft).toEqual(draft4)
      expect(seq.t8.ctx?.pendingCommunication?.channel).toBe('email')

      // 9. Regresa al borrador anterior (recupera borradores sin mutar)
      expect(seq.t9.res.handled).toBe(true)
      expect(seq.t9.res.intent).toBe('review_pending')
      expect(seq.t9.ctx?.pendingWrite?.draft).toEqual(draft4)
      expect(seq.t9.ctx?.pendingCommunication?.channel).toBe('email')

      // 10. Confirma la propuesta (nunca auto-ejecuta silenciosamente sin aprobación explícita; exige precisión o aprobación real)
      expect(seq.t10.res.handled).toBe(true)
      expect(seq.t10.text).not.toMatch(/No encontré a nadie llamado/i)
    }
  )

  it('pre-router cliente (Web/Flotante) delega todos los turnos operativos/control al orquestador compartido', () => {
    let state: ConversationQueryState | null = null
    const people = [
      { id: GERARDO_ID, nombre: 'Gerardo Puga' },
      { id: CARLOS_ID, nombre: 'Carlos Mendoza' },
    ]
    const shouldHandoff = [
      'Crea una acción para revisar el inventario',
      'Prepárala para Gerardo',
      'Mejor para el viernes',
      'Ponle prioridad alta',
      '¿Cómo quedó?',
      'Avísale por WhatsApp',
      'Mejor por correo',
      'Regresa al borrador anterior',
      'Confirma la propuesta',
    ]
    for (const message of shouldHandoff) {
      const turn = applyConversationTurn({ message, previous: state, people, canSeeTeam: true })
      expect(turn.kind, `turn "${message}" must handoff to shared orchestrator`).toBe('handoff')
      state = turn.state
    }
  })
})
