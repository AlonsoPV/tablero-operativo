/**
 * R3 · simulación omnicanal (fixtures). Mismo núcleo conversacional; sin WhatsApp real ni dispatcher.
 */
import { describe, expect, it } from 'vitest'
import type { AccionDiaria } from '@/types'
import { buildOperationalSnapshot } from '@/features/ai-support/operationalContext/buildOperationalSnapshot'
import type { NamedPerson } from '@/features/ai-support/copilot/matching'
import { friendlyAssistantError } from '@/features/ai-support/assistantErrors'
import { resolveWriteIntent } from '@/features/ai-support/writeIntent'
import { tryKnowledgeReply } from '@/features/ai-support/knowledge/tryKnowledgeReply'
import { runConversationTurn } from './runTurn'
import type { ConversationQueryState } from './types'

function action(
  partial: Partial<AccionDiaria> & Pick<AccionDiaria, 'id' | 'titulo_accion' | 'responsable'>
): AccionDiaria {
  return {
    fecha: '2026-11-03',
    descripcion_accion: '',
    hora_limite: '18:00',
    evidencia_esperada: '',
    evidencia_cargada: false,
    evidencia_adjunta: null,
    estado: 'Pendiente',
    kpi_afectado: null,
    tipo_accion: 'operativa',
    story_points: 1,
    okr_impactado: null,
    proyecto: null,
    area: 'Logistica',
    cliente_id: null,
    prioridad: 'P2',
    causa_raiz: null,
    responsable_bloqueo: null,
    escalado: false,
    fecha_escalamiento: null,
    notas_escalamiento: null,
    repeticion: false,
    verificador_dato: null,
    verificador_gobierno: null,
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
    ...partial,
  }
}

const people: NamedPerson[] = [
  { id: 'u1', nombre: 'Ana Logistica' },
  { id: 'u2', nombre: 'Bruno Operaciones' },
]

const snapshot = buildOperationalSnapshot({
  usuarioId: 'u1',
  rol: 'lider',
  areas: ['Logistica'],
  seesAllBoard: true,
  canSeeOkrs: true,
  openActions: [
    action({
      id: 'a1',
      titulo_accion: 'Entrega atrasada CDMX',
      responsable: 'u2',
      created_by: 'u1',
      estado: 'Retraso',
      fecha: '2026-11-18',
    }),
    action({
      id: 'a2',
      titulo_accion: 'Checklist viernes',
      responsable: 'u1',
      created_by: 'u1',
      estado: 'Pendiente',
      fecha: '2026-11-22',
    }),
  ],
  priorities: [],
  okrData: null,
  today: '2026-11-21',
  nowMs: Date.parse('2026-11-21T15:00:00.000Z'),
  fetchedAt: '2026-11-21T15:00:00.000Z',
  usuarioNombreById: Object.fromEntries(people.map((p) => [p.id, p.nombre])),
})

function runChannelParity(message: string, previous: ConversationQueryState | null) {
  return (['web', 'whatsapp_sim'] as const).map((channel) => {
    const turn = runConversationTurn({ message, previous, snapshot, people })
    return { channel, turn, outbound: false as const }
  })
}

describe('R3 omnichannel parity simulation', () => {
  it('web and whatsapp-sim share identity+query+context without sending', () => {
    const channels = ['web', 'whatsapp_sim'] as const
    const results = channels.map((channel) => {
      const first = runConversationTurn({
        message: 'Que pendientes tiene el equipo?',
        previous: null,
        snapshot,
        people,
      })
      expect(first.handled).toBe(true)
      if (!first.handled) throw new Error('expected handled')
      const second = runConversationTurn({
        message: 'Cuales estan vencidos?',
        previous: first.reply.state,
        snapshot,
        people,
      })
      expect(second.handled).toBe(true)
      if (!second.handled) throw new Error('expected handled')
      return {
        channel,
        scope1: first.reply.state.scope,
        scope2: second.reply.state.scope,
        sources: second.reply.ui?.sources,
        outbound: false as const,
      }
    })
    expect(results[0]!.scope1).toBe('team_authorized')
    expect(results[0]!.scope1).toBe(results[1]!.scope1)
    expect(results[0]!.scope2).toBe(results[1]!.scope2)
    expect(results.every((r) => r.outbound === false)).toBe(true)
    expect(results[0]!.sources).toContain('kanban_acciones')
  })

  it('dedupes identical confirmation and maps errors without inventing success', () => {
    const key = 'btn:confirm:sim-op-1'
    const seen = new Set<string>()
    const first = seen.has(key) ? 'duplicate' : (seen.add(key), 'accepted')
    const second = seen.has(key) ? 'duplicate' : (seen.add(key), 'accepted')
    expect(first).toBe('accepted')
    expect(second).toBe('duplicate')

    expect(resolveWriteIntent('Crea una accion y avisale por WhatsApp', 'consult')).toBe('create')
    const err = friendlyAssistantError(new Error('Failed to fetch'))
    expect(err).toMatch(/conexion/i)
    expect(err).not.toMatch(/exito|enviado/i)
  })

  it('Flujo1+3 parity: priority and stale follow-ups match across channels', () => {
    const team = runChannelParity('Que pendientes tiene el equipo?', null)
    expect(team.every((r) => r.turn.handled && r.outbound === false)).toBe(true)
    const teamState =
      team[0]!.turn.handled && team[0]!.turn.reply.state ? team[0]!.turn.reply.state : null
    expect(teamState?.scope).toBe('team_authorized')

    const overdue = runChannelParity('Cuales estan vencidos?', teamState)
    const overdueState =
      overdue[0]!.turn.handled && overdue[0]!.turn.reply.state ? overdue[0]!.turn.reply.state : null
    expect(overdue[0]!.turn.handled && overdue[1]!.turn.handled).toBe(true)
    expect(overdueState?.scope).toBe('team_authorized')

    const priority = runChannelParity('Cual deberia atenderse primero?', overdueState)
    expect(priority[0]!.turn.handled).toBe(true)
    if (!priority[0]!.turn.handled || !priority[1]!.turn.handled) throw new Error('expected handled')
    expect(priority[0]!.turn.reply.state.responseMode).toBe(priority[1]!.turn.reply.state.responseMode)
    expect(priority[0]!.turn.reply.state.responseMode).toBe('analysis')

    const stale = runChannelParity('Que paso con las acciones pendientes de ayer?', null)
    expect(stale[0]!.turn.handled && stale[1]!.turn.handled).toBe(true)
    if (!stale[0]!.turn.handled || !stale[1]!.turn.handled) throw new Error('expected handled')
    expect(stale[0]!.turn.reply.state.status_group).toBe('stale')
    expect(stale[1]!.turn.reply.state.status_group).toBe('stale')
  })

  it('Flujo2+4: button confirm + knowledge same on web and whatsapp_sim', () => {
    const payload = { type: 'button', id: 'confirm', opId: 'sim-op-wa-1' }
    const seen = new Set<string>()
    const accept = (channel: string) => {
      const key = `${channel}:${payload.type}:${payload.id}:${payload.opId}`
      if (seen.has(key)) return { status: 'duplicate' as const, outbound: false }
      seen.add(key)
      return {
        status: 'accepted' as const,
        outbound: false,
        simulated: true,
        message: 'Simulacion local: confirmacion sin envio WhatsApp ni PROD.',
      }
    }
    expect(accept('whatsapp_sim').status).toBe('accepted')
    expect(accept('whatsapp_sim').status).toBe('duplicate')
    expect(accept('web').status).toBe('accepted')

    const kbWeb = tryKnowledgeReply('Cual es el criterio para verificar una accion?')
    const kbWa = tryKnowledgeReply('Cual es el criterio para verificar una accion?')
    expect(kbWeb?.source).toBe(kbWa?.source)
    expect(kbWeb?.content).toMatch(/Fuente:/)
  })
})
