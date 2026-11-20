import { describe, expect, it } from 'vitest'
import type { AccionDiaria } from '@/types'
import { buildOperationalSnapshot } from '@/features/ai-support/operationalContext/buildOperationalSnapshot'
import type { NamedPerson } from '@/features/ai-support/copilot/matching'
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
    proceso: null,
    area: 'Operaciones',
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
  { id: 'u1', nombre: 'Ana Lopez' },
  { id: 'u2', nombre: 'Jorge Perez' },
  { id: 'u3', nombre: 'Jorge Garcia' },
  { id: 'u4', nombre: 'Lucia Ruiz' },
]

const nowMs = Date.parse('2026-11-17T18:00:00Z')

const snapshot = buildOperationalSnapshot({
  usuarioId: 'u1',
  rol: 'Operativo',
  areas: ['Operaciones'],
  seesAllBoard: true,
  canSeeOkrs: false,
  openActions: [
    action({
      id: 'a1',
      titulo_accion: 'Mia 1',
      responsable: 'u1',
      created_by: 'u1',
      estado: 'Retraso',
      fecha: '2026-11-01',
    }),
    action({
      id: 'a2',
      titulo_accion: 'Mia 2',
      responsable: 'u1',
      created_by: 'u4',
      estado: 'Pendiente',
      fecha: '2026-11-02',
    }),
    action({
      id: 'a3',
      titulo_accion: 'Mia 3',
      responsable: 'u1',
      created_by: 'u1',
      estado: 'Pendiente',
      fecha: '2026-11-04',
    }),
    action({
      id: 'b1',
      titulo_accion: 'De Jorge Perez',
      responsable: 'u2',
      created_by: 'u1',
      estado: 'Pendiente',
      fecha: '2026-11-20',
    }),
    action({
      id: 'b2',
      titulo_accion: 'Jorge vencida',
      responsable: 'u2',
      created_by: 'u1',
      estado: 'Retraso',
      fecha: '2026-11-01',
    }),
    action({
      id: 'c1',
      titulo_accion: 'De Jorge Garcia',
      responsable: 'u3',
      created_by: 'u4',
      estado: 'Pendiente',
      fecha: '2026-11-06',
    }),
    action({
      id: 'd1',
      titulo_accion: 'De Lucia',
      responsable: 'u4',
      created_by: 'u4',
      estado: 'Pendiente',
      fecha: '2026-11-07',
    }),
    action({
      id: 'd2',
      titulo_accion: 'Lucia 2',
      responsable: 'u4',
      created_by: 'u1',
      estado: 'Hoy',
      fecha: '2026-11-17',
    }),
    action({
      id: 'd3',
      titulo_accion: 'Lucia 3',
      responsable: 'u4',
      created_by: 'u3',
      estado: 'Pendiente',
      fecha: '2026-11-08',
    }),
  ],
  priorities: [],
  okrData: null,
  today: '2026-11-17',
  nowMs,
  usuarioNombreById: Object.fromEntries(people.map((p) => [p.id, p.nombre])),
})

function run(message: string, previous: ConversationQueryState | null) {
  return runConversationTurn({ message, previous, snapshot, people })
}

describe('conversation e2e sequence (Fase 13)', () => {
  it('walks open → assigned-by-me → Jorge clarify → resolve → overdue → board → created', () => {
    // 1. abiertas
    let turn = run('Que acciones tengo abiertas?', null)
    expect(turn.handled).toBe(true)
    if (!turn.handled) throw new Error('expected handled')
    expect(turn.reply.state.scope).toBe('assigned_to_me')
    expect(turn.reply.debug?.resultCount).toBe(3)
    expect(turn.reply.content).not.toContain('Hallazgo:')
    let state = turn.reply.state

    // 2. las que asigné
    turn = run('Las que yo he asignado', state)
    expect(turn.handled).toBe(true)
    if (!turn.handled) throw new Error('expected handled')
    expect(turn.reply.state.scope).toBe('created_by_me')
    expect(turn.reply.debug?.resultCount).toBe(5) // a1,a3,b1,b2,d2
    const createdTitles =
      turn.reply.ui.views[0]?.type === 'action_list'
        ? turn.reply.ui.views[0].actions.map((a) => a.title)
        : []
    expect(createdTitles).toContain('De Jorge Perez')
    expect(createdTitles).not.toContain('De Lucia')
    state = turn.reply.state

    // 3. cuáles tiene Jorge → homónimo
    turn = run('Cuales tiene Jorge?', state)
    expect(turn.handled).toBe(true)
    if (!turn.handled) throw new Error('expected handled')
    expect(turn.reply.state.intent).toBe('clarify')
    expect(turn.reply.clarification?.options.map((o) => o.label)).toEqual(
      expect.arrayContaining(['Jorge Perez', 'Jorge Garcia'])
    )
    state = turn.reply.state

    // 4. Jorge Perez
    turn = run('Jorge Perez', state)
    expect(turn.handled).toBe(true)
    if (!turn.handled) throw new Error('expected handled')
    expect(turn.reply.state.person?.id).toBe('u2')
    expect(turn.reply.debug?.resultCount).toBe(2)
    state = turn.reply.state

    // 5. y vencidas
    turn = run('Y vencidas?', state)
    expect(turn.handled).toBe(true)
    if (!turn.handled) throw new Error('expected handled')
    expect(turn.reply.state.person?.id).toBe('u2')
    expect(turn.reply.state.visual === 'overdue' || turn.reply.state.status_group === 'overdue').toBe(
      true
    )
    expect(turn.reply.debug?.resultCount).toBe(1)
    state = turn.reply.state

    // 6. muéstrame todas (conserva persona + overdue filtros vía continuity — "todas" restores visual)
    turn = run('Muestrame todas', state)
    expect(turn.handled).toBe(true)
    if (!turn.handled) throw new Error('expected handled')
    expect(turn.reply.state.person?.id).toBe('u2')
    expect(turn.reply.state.responseMode).toBe('list')
    state = turn.reply.state

    // 7. tablero
    turn = run('Ahora todas las del tablero', state)
    expect(turn.handled).toBe(true)
    if (!turn.handled) throw new Error('expected handled')
    expect(turn.reply.state.scope).toBe('board_authorized')
    expect(turn.reply.state.person).toBeNull()
    expect(turn.reply.debug?.resultCount).toBe(9)
    state = turn.reply.state

    // 8. enlistalas
    turn = run('Enlistalas', state)
    expect(turn.handled).toBe(true)
    if (!turn.handled) throw new Error('expected handled')
    expect(turn.reply.state.scope).toBe('board_authorized')
    expect(turn.reply.state.responseMode).toBe('list')
    expect(turn.reply.ui.views.some((v) => v.type === 'action_list')).toBe(true)
    state = turn.reply.state

    // 9. creadas
    turn = run('Cuales he creado yo?', state)
    expect(turn.handled).toBe(true)
    if (!turn.handled) throw new Error('expected handled')
    expect(turn.reply.state.scope).toBe('created_by_me')
    expect(turn.reply.debug?.resultCount).toBe(5)
  })

  it('resolves yes after person clarification', () => {
    const clarify = run('Cuales tiene Jorge?', null)
    expect(clarify.handled).toBe(true)
    if (!clarify.handled) throw new Error('expected handled')
    const yes = run('Si', clarify.reply.state)
    expect(yes.handled).toBe(true)
    if (!yes.handled) throw new Error('expected handled')
    expect(yes.reply.state.person?.nombre).toBe('Jorge Perez')
  })

  it('reports missing person without inventing', () => {
    const turn = run('Cuales tiene Gerardo?', null)
    expect(turn.handled).toBe(true)
    if (!turn.handled) throw new Error('expected handled')
    expect(turn.reply.content.toLowerCase()).toContain('no encontr')
    expect(turn.reply.clarification?.options).toEqual([])
  })

  it('does not force Hallazgo template on simple list', () => {
    const turn = run('Enlistalas mis acciones abiertas', null)
    expect(turn.handled).toBe(true)
    if (!turn.handled) throw new Error('expected handled')
    expect(turn.reply.content).not.toMatch(/Hallazgo:|Evidencia:|Recomendacion:/)
  })

  it('hands off non-kanban topics', () => {
    const turn = run('Como van mis OKRs?', null)
    expect(turn.handled).toBe(false)
  })

  it('format directives take precedence over person matching and do not invent a name', () => {
    for (const message of ['modo reporte', 'automático', 'formato directo', 'Análisis']) {
      const turn = run(message, null)
      expect(turn.handled).toBe(false)
      if (turn.handled) throw new Error('expected handoff')
      expect(turn.reason).toBe('format_directive')
    }
  })

  it('delegates to the orchestrator when a format other than Auto is selected', () => {
    const turn = runConversationTurn({
      message: 'Que acciones tengo abiertas?',
      previous: null,
      snapshot,
      people,
      responseFormat: 'report',
    })
    expect(turn.handled).toBe(false)
    if (turn.handled) throw new Error('expected handoff')
    expect(turn.reason).toBe('format_selected')
  })

  it('keeps the local kanban path in Auto without a format command', () => {
    const turn = runConversationTurn({
      message: 'Que acciones tengo abiertas?',
      previous: null,
      snapshot,
      people,
      responseFormat: 'auto',
    })
    expect(turn.handled).toBe(true)
  })

  it('hands off email/WhatsApp even when the body mentions acciones', () => {
    const email = run(
      'Envia un correo a alpeva96@gmail.com con el resumen de sus acciones',
      null
    )
    expect(email.handled).toBe(false)
    expect(email.reason).toBe('non_kanban')

    const wa = run('Mandale por WhatsApp el resumen de mis acciones abiertas', null)
    expect(wa.handled).toBe(false)
  })

  it('maps filter chips to scopes without Hallazgo template', () => {
    const mine = run('Asignadas a mi', null)
    expect(mine.handled).toBe(true)
    if (!mine.handled) throw new Error('expected handled')
    expect(mine.reply.state.scope).toBe('assigned_to_me')
    expect(mine.reply.state.responseMode).toBe('list')
    expect(mine.reply.content).not.toMatch(/Hallazgo:/)

    const byMe = run('Asignadas por mi', mine.reply.state)
    expect(byMe.handled).toBe(true)
    if (!byMe.handled) throw new Error('expected handled')
    expect(byMe.reply.state.scope).toBe('created_by_me')
    expect(byMe.reply.debug?.resultCount).toBe(5)

    const board = run('Tablero', byMe.reply.state)
    expect(board.handled).toBe(true)
    if (!board.handled) throw new Error('expected handled')
    expect(board.reply.state.scope).toBe('board_authorized')
    expect(board.reply.debug?.resultCount).toBe(9)

    const overdue = run('Vencidas', board.reply.state)
    expect(overdue.handled).toBe(true)
    if (!overdue.handled) throw new Error('expected handled')
    expect(
      overdue.reply.state.visual === 'overdue' || overdue.reply.state.status_group === 'overdue'
    ).toBe(true)
  })
})
