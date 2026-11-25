import { describe, expect, it } from 'vitest'
import { detectAssistantIntent } from './detectAssistantIntent'

describe('detectAssistantIntent', () => {
  it('detects pending, prioritize, okrs and team intents', () => {
    expect(detectAssistantIntent('Que tengo pendiente?')).toBe('pending')
    expect(detectAssistantIntent('Que deberia priorizar?')).toBe('prioritize')
    expect(detectAssistantIntent('Como van mis OKRs?')).toBe('okrs')
    expect(detectAssistantIntent('que OKRs de equipo tengo abiertos')).toBe('okrs')
    expect(detectAssistantIntent('Que OKRs tengo')).toBe('okrs')
    expect(detectAssistantIntent('Que esta retrasando al equipo?')).toBe('team_delay')
  })

  it('prioritizes selected action for short help requests', () => {
    expect(
      detectAssistantIntent('Ayudame con esta tarea', { hasSelectedAction: true })
    ).toBe('selected_action')
  })

  it('explains a definition instead of opening OKR data', () => {
    expect(detectAssistantIntent('¿Qué es un OKR?')).toBe('concept')
    expect(detectAssistantIntent('¿Qué significa KR?')).toBe('concept')
    expect(detectAssistantIntent('Explicame Scrumban en dos lineas')).toBe('concept')
    expect(detectAssistantIntent('¿Cuáles son nuestros OKRs?')).toBe('okrs')
  })
})
