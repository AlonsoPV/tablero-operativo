import { describe, expect, it } from 'vitest'
import { buildProactiveCandidates } from './proactivePlanner.js'

describe('proactive planner candidates', () => {
  it('maps overdue, prolonged block, stale, and pending verification without sending', () => {
    const today = '2026-11-27'
    const items = buildProactiveCandidates(
      [
        {
          id: 'a1',
          titulo_accion: 'Cerrar inventario',
          estado: 'Retraso',
          fecha: '2026-11-20',
          responsable: 'u-1',
          updated_at: '2026-11-20T10:00:00Z',
        },
        {
          id: 'a2',
          titulo_accion: 'Esperar refacción',
          estado: 'Bloqueado',
          fecha: '2026-11-30',
          responsable: 'u-1',
          updated_at: '2026-11-20T10:00:00Z',
        },
        {
          id: 'a3',
          titulo_accion: 'Subir evidencia',
          estado: 'Hecho',
          fecha: '2026-11-26',
          responsable: 'u-2',
          updated_at: '2026-11-26T10:00:00Z',
        },
      ],
      today
    )
    expect(items.some((c) => c.category === 'overdue_alert' && c.entityId === 'a1')).toBe(true)
    expect(items.some((c) => c.category === 'stale_blocker' && c.entityId === 'a2')).toBe(true)
    expect(items.some((c) => c.category === 'pending_verification' && c.entityId === 'a3')).toBe(true)
  })
})
