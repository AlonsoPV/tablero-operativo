import { describe, expect, it } from 'vitest'
import { buildProactiveCandidates, decideGroupedDryRun } from './proactivePlanner.js'
import { PROACTIVE_CATEGORIES, type ProactiveUserPreferences } from './whatsappProactive.js'

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

  it('groups dry-run by responsable and never inserts jobs', () => {
    const today = '2026-11-27'
    const candidates = buildProactiveCandidates(
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
    const prefs: ProactiveUserPreferences = {
      usuarioId: 'u-1',
      waId: '5215511112222',
      active: true,
      consent: true,
      timezone: 'America/Mexico_City',
      windowStartHour: 8,
      windowEndHour: 19,
      allowedWeekdays: [1, 2, 3, 4, 5],
      enabledCategories: new Set(PROACTIVE_CATEGORIES),
      maxPerDay: 5,
      minIntervalMinutes: 30,
    }
    const grouped = decideGroupedDryRun(
      candidates,
      new Map([['u-1', prefs]]),
      new Set(),
      '2026-11-27T16:00:00.000Z'
    )
    const owner = grouped.find((row) => row.usuarioId === 'u-1')
    const other = grouped.find((row) => row.usuarioId === 'u-2')
    expect(owner?.digest.dryRun).toBe(true)
    expect(owner?.digest.includedCount).toBeGreaterThan(0)
    expect(other?.missingConsent).toBe(true)
    expect(other?.digest.allowed).toBe(false)
    expect(grouped.every((row) => row.digest.dryRun)).toBe(true)
  })
})
