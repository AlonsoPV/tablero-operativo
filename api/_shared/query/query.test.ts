import { describe, expect, it } from 'vitest'
import { wrapUntrustedToolData } from '../../../src/features/ai-support/copilot/matching.js'
import type { CopilotToolResult } from '../../../src/features/ai-support/copilot/types.js'
import {
  combineStatuses,
  normalizeActionsToolResult,
  normalizeOkrToolResult,
  queryCombined,
  sourcesFor,
  type ActionsQueryRequest,
} from './index.js'

const request: ActionsQueryRequest = { entity: 'actions', scope: 'assigned_to_me', statusGroup: 'open', visual: 'none' }

function read(tool: 'get_my_actions' | 'get_okr_progress', payload: unknown): CopilotToolResult {
  return { ok: true, tool, kind: 'read', data: wrapUntrustedToolData(payload) }
}

describe('normalizeActionsToolResult', () => {
  it('ok con totales, fuentes y corte', () => {
    const r = normalizeActionsToolResult(
      read('get_my_actions', {
        total: 2, population: 'responsable_actual', as_of: '2026-11-19T16:00:00Z', load_truncated: false,
        items: [{ id: 'a1', title: 'Uno', estado: 'Pendiente', fecha: '2026-11-19', responsable: 'u1', href: '/kanban?accion=a1' }, { id: 'a2', title: 'Dos' }],
      }),
      request
    )
    expect(r).toMatchObject({ status: 'ok', totals: { total: 2, returned: 2 }, scopeApplied: 'responsable_actual', asOf: '2026-11-19T16:00:00Z' })
    expect(r.items[0]).toMatchObject({ id: 'a1', responsableId: 'u1' })
    expect(r.sources.map((s) => s.id)).toContain('acciones_diarias')
  })

  it('empty cuando no hay filas', () => {
    expect(normalizeActionsToolResult(read('get_my_actions', { total: 0, items: [] }), request).status).toBe('empty')
  })

  it('partial cuando la fuente se truncó; el recorte de presentación sólo es limitación', () => {
    const truncated = normalizeActionsToolResult(read('get_my_actions', { total: 200, load_truncated: true, items: [{ id: 'a' }] }), request)
    expect(truncated.status).toBe('partial')
    const clipped = normalizeActionsToolResult(read('get_my_actions', { total: 30, load_truncated: false, items: [{ id: 'a' }] }), request)
    expect(clipped.status).toBe('ok')
    expect(clipped.limitations).toContain('Se muestran 1 de 30.')
  })

  it('forbidden y error son estados distintos y sin items', () => {
    const denied = normalizeActionsToolResult({ ok: false, tool: 'get_my_actions', kind: 'denied', error: 'Sin vista' }, request)
    expect(denied).toMatchObject({ status: 'forbidden', items: [], error: { code: 'denied', message: 'Sin vista' } })
    const failed = normalizeActionsToolResult({ ok: false, tool: 'get_my_actions', kind: 'error', error: 'boom' }, request)
    expect(failed).toMatchObject({ status: 'error', items: [], error: { code: 'source_failed' } })
  })
})

describe('normalizeOkrToolResult', () => {
  it('declara KR sin datos como limitación y no estima su avance', () => {
    const r = normalizeOkrToolResult(read('get_okr_progress', {
      objectives: 1, insufficient_krs: 1, truncated: false,
      items: [{ id: 'o1', nombre: 'Obj', progress: 50, without_initiatives: false, insufficient_krs: 1,
        krs: [{ id: 'k1', title: 'K', actual: null, meta: null, progress: null }] }],
    }))
    expect(r.status).toBe('ok')
    expect(r.items[0]!.keyResults[0]).toMatchObject({ measurable: false, progress: null })
    expect(r.limitations.join(' ')).toContain('no se estima')
  })
})

describe('combineStatuses', () => {
  it.each([
    [['ok', 'ok'], 'ok'],
    [['ok', 'forbidden'], 'partial'],
    [['empty', 'error'], 'error'],
    [['forbidden', 'forbidden'], 'forbidden'],
    [['empty', 'empty'], 'empty'],
    [['ok', 'empty'], 'ok'],
  ] as const)('%j → %s', (input, expected) => {
    expect(combineStatuses([...input])).toBe(expected)
  })
})

describe('queryCombined', () => {
  it('una fuente denegada produce partial con limitación explícita', async () => {
    const dispatch = async (_a: unknown, name: string): Promise<CopilotToolResult> =>
      name === 'get_okr_progress'
        ? { ok: false, tool: 'get_okr_progress', kind: 'denied', error: 'Sin OKRs' }
        : read('get_my_actions', { total: 1, items: [{ id: 'a1' }] })
    const actor = { supabase: { from: () => ({ select: () => ({ in: async () => ({ data: [], error: null }) }) }) } } as never
    const r = await queryCombined(actor, { entity: 'combined', actions: { scope: 'assigned_to_me', statusGroup: 'open', visual: 'none' }, okrs: {} }, dispatch)
    expect(r.status).toBe('partial')
    expect(r.limitations).toContain('OKRs fuera de tu alcance: no se incluyen.')
  })
})

it('catálogo de fuentes cubre acciones y OKRs', () => {
  expect(sourcesFor('combined').map((s) => s.id)).toEqual(['acciones_diarias', 'priorities', 'okr_dashboard', 'okr_key_results'])
})
