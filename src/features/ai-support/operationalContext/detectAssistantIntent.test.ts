import { describe, expect, it } from 'vitest'
import { detectAssistantIntent } from './detectAssistantIntent'

describe('detectAssistantIntent', () => {
  it('detects pending, prioritize, okrs and team intents', () => {
    expect(detectAssistantIntent('Que tengo pendiente?')).toBe('pending')
    expect(detectAssistantIntent('Que deberia priorizar?')).toBe('prioritize')
    expect(detectAssistantIntent('Como van mis OKRs?')).toBe('okrs')
    expect(detectAssistantIntent('Que esta retrasando al equipo?')).toBe('team_delay')
  })

  it('prioritizes selected action for short help requests', () => {
    expect(
      detectAssistantIntent('Ayudame con esta tarea', { hasSelectedAction: true })
    ).toBe('selected_action')
  })

  it('falls back to general without signals', () => {
    expect(detectAssistantIntent('Explicame Scrumban en dos lineas')).toBe('general')
  })
})
