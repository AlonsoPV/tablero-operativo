import { describe, expect, it } from 'vitest'
import {
  buildAssistantUiFromToolResults,
  unwrapToolPayloadForTests,
} from './buildViewsFromToolResults'
import { wrapUntrustedToolData } from '@/features/ai-support/copilot/matching'

describe('buildAssistantUiFromToolResults', () => {
  it('unwraps untrusted tool payloads', () => {
    const wrapped = wrapUntrustedToolData({ total: 2, items: [] })
    expect(unwrapToolPayloadForTests(wrapped)).toEqual({ total: 2, items: [] })
  })

  it('maps get_my_actions into an action_list with totals', () => {
    const ui = buildAssistantUiFromToolResults([
      {
        tool: 'get_my_actions',
        kind: 'read',
        data: wrapUntrustedToolData({
          scope: 'assigned_to_me',
          population: 'asignadas_a_mi',
          total: 9,
          returned: 2,
          truncated: true,
          items: [
            {
              id: 'a1',
              title: 'Cerrar POD',
              estado: 'Retraso',
              fecha: '2026-11-01',
              prioridad: 'P1',
              href: '/kanban?accion=a1',
            },
            {
              id: 'a2',
              title: 'Validar checklist',
              estado: 'Hoy',
              fecha: '2026-11-17',
              href: '/kanban?accion=a2',
            },
          ],
        }),
      },
    ])

    expect(ui).toBeTruthy()
    expect(ui!.views[0]?.type).toBe('action_list')
    if (ui!.views[0]?.type !== 'action_list') throw new Error('expected action_list')
    expect(ui!.views[0].total).toBe(9)
    expect(ui!.views[0].visible).toBe(2)
    expect(ui!.views[0].truncated).toBe(true)
    expect(ui!.views[0].actions[0]?.title).toBe('Cerrar POD')
    expect(ui!.views[0].actions[0]?.href).toContain('accion=a1')
  })

  it('maps empty action results to empty view', () => {
    const ui = buildAssistantUiFromToolResults([
      {
        tool: 'get_my_actions',
        kind: 'read',
        data: wrapUntrustedToolData({
          total: 0,
          items: [],
          population: 'asignadas_a_mi',
        }),
      },
    ])
    expect(ui!.views[0]?.type).toBe('empty')
  })

  it('maps get_okr_progress without inventing 0% for null progress', () => {
    const ui = buildAssistantUiFromToolResults([
      {
        tool: 'get_okr_progress',
        kind: 'read',
        data: wrapUntrustedToolData({
          objectives: 2,
          keyResults: 4,
          initiatives: 1,
          truncated: false,
          items: [
            {
              id: 'o1',
              nombre: 'Disponibilidad',
              progress: null,
              pace: 'sin_datos',
              without_initiatives: true,
              krs: [{ id: 'k1' }, { id: 'k2' }],
            },
            {
              id: 'o2',
              nombre: 'OTIF',
              progress: 42.2,
              pace: 'en_ritmo',
              without_initiatives: false,
              krs: [{ id: 'k3' }],
            },
          ],
        }),
      },
    ])

    expect(ui!.views[0]?.type).toBe('okr_list')
    if (ui!.views[0]?.type !== 'okr_list') throw new Error('expected okr_list')
    expect(ui!.views[0].okrs[0]?.progress).toBeNull()
    expect(ui!.views[0].okrs[0]?.initiativesHint).toMatch(/Sin iniciativas/)
    expect(ui!.views[0].okrs[1]?.progress).toBe(42.2)
    expect(ui!.views[0].okrs[1]?.href).toContain('objective=o2')
  })

  it('maps dashboard summary into operational_summary metrics', () => {
    const ui = buildAssistantUiFromToolResults([
      {
        tool: 'get_dashboard_summary',
        kind: 'read',
        data: wrapUntrustedToolData({
          open: 9,
          overdue: 3,
          blocked: 1,
          due_today: 2,
          scope_note: 'Solo acciones propias',
          sample_overdue: [
            { id: 'x1', title: 'Retraso critico', fecha: '2026-11-01', estado: 'Retraso' },
          ],
        }),
      },
    ])

    expect(ui!.views[0]?.type).toBe('operational_summary')
    if (ui!.views[0]?.type !== 'operational_summary') throw new Error('expected operational_summary')
    expect(ui!.views[0].metrics.find((m) => m.id === 'overdue')?.value).toBe(3)
    expect(ui!.views[0].actions?.[0]?.title).toBe('Retraso critico')
  })

  it('surfaces tool errors as error view when no reads succeed', () => {
    const ui = buildAssistantUiFromToolResults([
      {
        tool: 'get_my_actions',
        kind: 'denied',
        error: 'No tienes vista de tablero completo.',
      },
    ])
    expect(ui!.views[0]).toEqual({
      type: 'error',
      message: 'No tienes vista de tablero completo.',
    })
  })
})
