import { describe, expect, it } from 'vitest'
import { applyConversationTurn } from './applyTurn'
import { initialConversationState, type ConversationQueryState } from './types'

const PEOPLE = [
  { id: 'u-gerardo', nombre: 'Gerardo Puga' },
  { id: 'u-carlos', nombre: 'Carlos Mendoza' },
  { id: 'u-jorge-1', nombre: 'Jorge Ruiz' },
  { id: 'u-jorge-2', nombre: 'Jorge Perez' },
]

function stateWithPendingPersonClarification(): ConversationQueryState {
  return {
    ...initialConversationState(),
    entity: 'kanban_action',
    intent: 'clarify',
    responseMode: 'clarify',
    pendingClarification: {
      kind: 'person',
      hint: 'jorge',
      originalMessage: '¿Cuáles tiene Jorge?',
      candidates: [
        { id: 'u-jorge-1', nombre: 'Jorge Ruiz' },
        { id: 'u-jorge-2', nombre: 'Jorge Perez' },
      ],
    },
  }
}

describe('applyConversationTurn — pending clarification never traps operational/control turns', () => {
  const OPERATIONAL_TURNS = [
    'Envíale a Gerardo un WhatsApp con la información de su día de hoy.',
    'Prepárala para Gerardo.',
    'Mejor para Carlos.',
    'Dile que priorice los vencidos.',
    'Mejor por correo.',
    'Haz lo mismo con Jorge.',
    'Asígnale revisar inventario para el viernes y avísale.',
    'Cambia la fecha al lunes.',
    '¿Cómo quedó?',
    'Cancela lo anterior.',
    'No, mejor para Carlos.',
    'No, cancélalo.',
    '¿Puedes prepararla para Gerardo?',
  ]

  it.each(OPERATIONAL_TURNS)(
    'hands off "%s" and clears pendingClarification instead of searching a literal person name',
    (message) => {
      const turn = applyConversationTurn({
        message,
        previous: stateWithPendingPersonClarification(),
        people: PEOPLE,
        canSeeTeam: true,
      })
      expect(turn.kind).toBe('handoff')
      expect(turn.state.pendingClarification).toBeNull()
      expect(JSON.stringify(turn)).not.toMatch(/No encontr[eé] a nadie llamado/i)
    }
  )

  it('never treats "Prepárala para Gerardo" as a person search even without prior pendingClarification', () => {
    const turn = applyConversationTurn({
      message: 'Prepárala para Gerardo',
      previous: null,
      people: PEOPLE,
      canSeeTeam: true,
    })
    expect(turn.kind).toBe('handoff')
    expect(JSON.stringify(turn)).not.toMatch(/No encontr[eé] a nadie llamado/i)
  })

  it('still resolves a valid pending clarification answer ("Jorge Perez" or "Sí")', () => {
    const byName = applyConversationTurn({
      message: 'Jorge Perez',
      previous: stateWithPendingPersonClarification(),
      people: PEOPLE,
      canSeeTeam: true,
    })
    expect(byName.kind).toBe('query')
    expect(byName.state.person?.nombre).toBe('Jorge Perez')
    expect(byName.state.pendingClarification).toBeNull()

    const byYes = applyConversationTurn({
      message: 'Sí',
      previous: stateWithPendingPersonClarification(),
      people: PEOPLE,
      canSeeTeam: true,
    })
    expect(byYes.kind).toBe('query')
    expect(byYes.state.person?.nombre).toBe('Jorge Ruiz')
    expect(byYes.state.pendingClarification).toBeNull()
  })
})
