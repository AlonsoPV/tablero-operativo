import { describe, expect, it } from 'vitest'
import { isOperacionRoute } from './operacionRoutes'

describe('isOperacionRoute', () => {
  it('matches Operacion module routes', () => {
    expect(isOperacionRoute('/dashboard')).toBe(true)
    expect(isOperacionRoute('/dashboard/kpis')).toBe(true)
    expect(isOperacionRoute('/okrs')).toBe(true)
    expect(isOperacionRoute('/kanban')).toBe(true)
    expect(isOperacionRoute('/kanban-equipos')).toBe(true)
    expect(isOperacionRoute('/kanban-equipos/tablero')).toBe(true)
    expect(isOperacionRoute('/dashboard-equipos')).toBe(true)
  })

  it('excludes non-Operacion routes', () => {
    expect(isOperacionRoute('/asistente-ia')).toBe(false)
    expect(isOperacionRoute('/asistente-ia/historial')).toBe(false)
    expect(isOperacionRoute('/tickets')).toBe(false)
    expect(isOperacionRoute('/calendario')).toBe(false)
    expect(isOperacionRoute('/academia')).toBe(false)
    expect(isOperacionRoute('/settings')).toBe(false)
  })
})
