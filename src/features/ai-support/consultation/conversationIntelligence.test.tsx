/**
 * Inteligencia conversacional: la intención se decide antes de buscar personas o listar registros.
 * Variaciones semánticas, no solo las dos frases reportadas.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import type { AccionDiaria } from '@/types'
import { AssistantMessageBody } from '@/features/ai-support/components/AssistantMessageBody'
import { AssistantReplyViews } from '@/features/ai-support/chatViews'
import type { AssistantUiPayload } from '@/features/ai-support/chatViews/types'
import { buildOperationalSnapshot } from '@/features/ai-support/operationalContext/buildOperationalSnapshot'
import { applyConversationTurn } from '@/features/ai-support/conversation/applyTurn'
import { initialConversationState } from '@/features/ai-support/conversation/types'
import type { NamedPerson } from '@/features/ai-support/copilot/matching'
import { classifyConsultation } from './classifyConsultation'
import { resolveAssistantTurn } from './answerConsultation'
import { isMethodQuestion, isPersonSeeking, isWhoLags } from './speechAct'

function action(
  partial: Partial<AccionDiaria> & Pick<AccionDiaria, 'id' | 'titulo_accion' | 'responsable'>
): AccionDiaria {
  return {
    fecha: '2026-11-01',
    descripcion_accion: '',
    hora_limite: '18:00',
    evidencia_esperada: '',
    evidencia_cargada: false,
    evidencia_adjunta: null,
    estado: 'Retraso',
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
    updated_at: '2026-11-03T12:00:00Z',
    ...partial,
  }
}

const people: NamedPerson[] = [
  { id: 'u1', nombre: 'Ana Lopez' },
  { id: 'u2', nombre: 'Jorge Perez' },
  { id: 'u3', nombre: 'Jorge Garcia' },
]

function board(seesAllBoard: boolean, openActions = defaultActions()) {
  return buildOperationalSnapshot({
    usuarioId: 'u1',
    rol: 'Lider',
    areas: ['Operaciones'],
    seesAllBoard,
    canSeeOkrs: true,
    openActions,
    pendingVerificationActions: [],
    priorities: [],
    okrData: null,
    today: '2026-11-03',
    fetchedAt: '2026-11-03T18:00:00.000Z',
    nowMs: Date.parse('2026-11-03T18:00:00Z'),
    usuarioNombreById: { u1: 'Ana Lopez', u2: 'Jorge Perez' },
  })
}

function defaultActions() {
  return [
    action({ id: 'a1', titulo_accion: 'Cerrar evidencia', responsable: 'u1' }),
    action({ id: 'a2', titulo_accion: 'Revisar plazo', responsable: 'u1' }),
    action({ id: 'a3', titulo_accion: 'Cobrar pendiente', responsable: 'u2' }),
  ]
}

function markup(content: string, ui: AssistantUiPayload | undefined) {
  if (ui?.views.length) {
    return renderToStaticMarkup(
      <MemoryRouter>
        <AssistantReplyViews ui={ui} narrative={content} />
      </MemoryRouter>
    )
  }
  return renderToStaticMarkup(<AssistantMessageBody content={content} />)
}

describe('acto de habla antes de la entidad', () => {
  it('no trata un verbo de finalidad como persona', () => {
    const phrase = '¿Cómo hago para mejorar el cierre de las acciones en tiempo?'
    expect(isMethodQuestion(phrase)).toBe(true)
    expect(isPersonSeeking(phrase)).toBe(false)
    expect(classifyConsultation(phrase).kind).toBe('recommendation')
    const direct = applyConversationTurn({
      message: phrase,
      previous: {
        ...initialConversationState(),
        entity: 'kanban_action',
        person: { id: 'u2', nombre: 'Jorge Perez' },
        relation: 'person_responsable',
      },
      people,
      canSeeTeam: true,
    })
    expect(direct.kind).toBe('handoff')
    expect(direct.state.person).toBeNull()
    expect(JSON.stringify(direct)).not.toMatch(/llamado|mejorar el cierre/)
  })

  it('sigue resolviendo a una persona cuando la frase la pide', () => {
    expect(isPersonSeeking('¿Cuáles tiene Jorge?')).toBe(true)
    const turn = applyConversationTurn({
      message: '¿Cuáles tiene Jorge?',
      previous: null,
      people,
      canSeeTeam: true,
    })
    expect(turn.kind).toBe('clarify')
    if (turn.kind !== 'clarify') throw new Error('se esperaba aclaración')
    expect(turn.clarification.question).toMatch(/Jorge/)
    expect(turn.clarification.question).not.toMatch(/llamado «mejorar»/)
  })
})

describe('respuesta y herramienta local', () => {
  const howTo = [
    '¿Cómo hago para mejorar el cierre de las acciones en tiempo?',
    '¿Cómo puedo lograr que cerremos a tiempo?',
    '¿De qué manera mejoro el cumplimiento de las fechas?',
    '¿Qué hago para que las tareas no se atrasen?',
    '¿Qué recomiendas para cerrar a tiempo?',
  ]

  it.each(howTo)('asesora «%s» sin buscar a una persona', (phrase) => {
    const turn = resolveAssistantTurn({
      message: phrase,
      snapshot: board(true),
      people,
    })
    expect(turn.handled).toBe(true)
    expect(turn.conversationState).toBeNull()
    expect(turn.clarification).toBeUndefined()
    expect(turn.content).toMatch(/fechas realistas/)
    expect(turn.content).toMatch(/evidencia de cierre/)
    expect(turn.content).toMatch(/No cambié ninguna acción/)
    expect(turn.content).not.toMatch(/llamado|No encontré/)
    expect(markup(turn.content!, turn.ui)).not.toMatch(/llamado|Jorge Perez|Cerrar evidencia/)
    expect(turn.ui?.views.find((view) => view.type === 'action_list' || view.type === 'okr_list')).toBeUndefined()
  })

  const concepts = [
    ['¿Qué es un OKR?', /objetivo con resultados medibles/],
    ['¿Qué significa un objetivo?', /objetivo con resultados medibles/],
    ['Explícame cómo funciona un KR', /resultado clave/],
    ['¿Cómo funciona el Kanban?', /lista de acciones/],
  ] as const

  it.each(concepts)('explica «%s» sin listar registros', (phrase, pattern) => {
    const turn = resolveAssistantTurn({ message: phrase, snapshot: board(true), people })
    expect(turn.handled).toBe(true)
    expect(turn.content).toMatch(pattern)
    expect(turn.content).not.toMatch(/llamado|Ana Lopez|%/)
    expect(turn.ui?.views ?? []).toEqual([])
    expect(markup(turn.content!, turn.ui)).not.toMatch(/Ana Lopez|En retraso/)
  })

  it('consulta quién concentra atrasos y no inventa el nombre «más»', () => {
    expect(isWhoLags('¿Y quiénes tienen más atrasos?')).toBe(true)
    expect(isPersonSeeking('¿Y quiénes tienen más atrasos?')).toBe(false)
    const turn = resolveAssistantTurn({
      message: '¿Y quiénes tienen más atrasos?',
      snapshot: board(true),
      people,
    })
    expect(turn.content).toMatch(/datos autorizados/)
    expect(turn.content).toMatch(/Ana Lopez \(2\)/)
    expect(turn.content).toMatch(/Jorge Perez \(1\)/)
    expect(turn.content).not.toMatch(/llamado/)
    expect(markup(turn.content!, turn.ui)).toContain('Ana Lopez')
  })

  it('sin permiso de tablero no nombra a los demás', () => {
    const turn = resolveAssistantTurn({
      message: '¿Quiénes tienen más retrasos?',
      snapshot: board(false),
      people,
    })
    expect(turn.content).toMatch(/no nombro a otras personas|no hay retrasos/i)
    expect(turn.content).not.toMatch(/Jorge/)
    expect(markup(turn.content!, turn.ui)).not.toContain('Jorge')
  })

  it('sin retrasos no inventa responsables', () => {
    const turn = resolveAssistantTurn({
      message: '¿Quiénes van más atrasados?',
      snapshot: board(true, [
        action({ id: 'ok', titulo_accion: 'Al día', responsable: 'u1', estado: 'Pendiente', fecha: '2026-11-20' }),
      ]),
      people,
    })
    expect(turn.content).toMatch(/no hay acciones en retraso/i)
    expect(turn.content).not.toMatch(/Ana Lopez|Jorge|llamado/)
  })

  it('sin tablero cargado no inventa el ranking', () => {
    const turn = resolveAssistantTurn({
      message: '¿Quiénes tienen más atrasos?',
      snapshot: null,
      people,
    })
    expect(turn.content).toMatch(/no invento/i)
    expect(turn.ui?.views[0]?.type).toBe('empty')
  })

  it('una acción de alta no se vuelve asesoría ni persona', () => {
    const phrase = 'Crea una acción para cerrar evidencias'
    expect(isMethodQuestion(phrase)).toBe(false)
    const direct = applyConversationTurn({
      message: phrase,
      previous: null,
      people,
      canSeeTeam: true,
    })
    expect(direct.kind).toBe('handoff')
    expect(JSON.stringify(direct)).not.toMatch(/llamado/)
  })

  it('encadena asesoría, datos y prioridad sin arrastrar un nombre falso', () => {
    const data = board(true)
    const prior: string[] = []
    const first = resolveAssistantTurn({
      message: '¿Cómo mejoramos el cumplimiento?',
      snapshot: data,
      priorUserMessages: prior,
      people,
    })
    prior.push('¿Cómo mejoramos el cumplimiento?')
    const second = resolveAssistantTurn({
      message: '¿Y quiénes tienen más atrasos?',
      snapshot: data,
      priorUserMessages: prior,
      people,
    })
    prior.push('¿Y quiénes tienen más atrasos?')
    const third = resolveAssistantTurn({
      message: '¿Qué harías primero?',
      snapshot: data,
      priorUserMessages: prior,
      people,
    })

    expect(first.content).toMatch(/fechas realistas/)
    expect(first.content).not.toMatch(/Ana Lopez|llamado/)
    expect(first.conversationState).toBeNull()

    expect(second.content).toMatch(/Ana Lopez \(2\)/)
    expect(second.conversationState).toBeNull()

    expect(third.content).toMatch(/Primero atendería a Ana Lopez/)
    expect(third.content).toMatch(/fechas realistas/)
    expect(third.content).toMatch(/No cambié ninguna acción/)
    expect(third.content).not.toMatch(/llamado/)
    expect(third.conversationState).toBeNull()
  })
})
