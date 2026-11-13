import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import type { CopilotToolResult } from '../../src/features/ai-support/copilot/types.js'
import { verifyRetellSignature } from './guideInterviewReport.js'
import {
  classifyRetellToolResult,
  consultLogEntry,
  groundVerifiedLines,
  isRetellBoardTool,
  readRetellToolCall,
  stripModelIdentity,
  verifiedFactsFromLog,
} from './guideRetellTool.js'

function signed(body: string) {
  const key = 'retell-test-key'
  return { key, signature: createHmac('sha256', key).update(body).digest('hex') }
}

describe('retell tool bridge', () => {
  it('rejects a body whose signature does not match', () => {
    const body = '{"name":"get_my_actions"}'
    const { key, signature } = signed(body)
    expect(verifyRetellSignature(body, key, signature)).toBe(true)
    expect(verifyRetellSignature(body, key, 'deadbeef')).toBe(false)
  })

  it('takes the session from call metadata and drops a user id sent by the model', () => {
    const parsed = readRetellToolCall({
      name: 'scrumban',
      args: {
        tool: 'get_my_actions',
        usuario_id: 'usuario-falso',
        user_id: 'auth-falso',
        filter: 'open',
      },
      call: {
        metadata: {
          product: 'guide',
          guide_session_id: 'session-real',
          usuario_id: 'otro-usuario',
        },
      },
    })
    expect(parsed.sessionId).toBe('session-real')
    expect(parsed.tool).toBe('get_my_actions')
    expect(parsed.args).toEqual({ filter: 'open' })
    expect(parsed.modelUsuarioId).toBe('otro-usuario')
    expect(stripModelIdentity({ usuario_id: 'x', query: 'otif' })).toEqual({ query: 'otif' })
  })

  it('refuses tools outside the interview allowlist', () => {
    expect(isRetellBoardTool('get_my_actions')).toBe(true)
    expect(isRetellBoardTool('gmail_search')).toBe(false)
    expect(isRetellBoardTool('create_action')).toBe(true)
  })

  it('asks for clarification when several people match and does not pick one', () => {
    const result = classifyRetellToolResult({
      ok: true,
      tool: 'search_people',
      kind: 'clarification',
      clarification: {
        question: 'Hay dos personas llamadas Carlos. Cual de las dos?',
        options: [
          { id: 'a', label: 'Carlos Ruiz' },
          { id: 'b', label: 'Carlos Vega' },
        ],
      },
    })
    expect(result.status).toBe('needs_clarification')
    expect(result.spoken).toContain('Carlos')
    expect(JSON.stringify(result.data)).not.toMatch(/elegi|asignado/i)
  })

  it('reports an empty board read without inventing rows', () => {
    const result = classifyRetellToolResult({
      ok: true,
      tool: 'get_my_actions',
      kind: 'read',
      data: { filter: 'open', items: [] },
    })
    expect(result.status).toBe('empty')
    expect(result.spoken).toMatch(/no encontro/i)
  })

  it('turns a tool failure into an error the agent must not fill in', () => {
    const result = classifyRetellToolResult({
      ok: false,
      tool: 'get_okr_progress',
      kind: 'error',
      error: 'timeout',
    })
    expect(result.status).toBe('error')
    expect(result.data).toBeNull()
    expect(result.spoken).toMatch(/no pude consultar/i)
  })

  it('keeps a create_action as a proposal and says nothing was written', () => {
    const proposal: CopilotToolResult = {
      ok: true,
      tool: 'create_action',
      kind: 'proposal',
      proposal: {
        id: 'op-1',
        tool: 'create_action',
        title: 'Revisar inventario',
        summary: 'Propuesta',
        fields: [],
        expiresAt: '2026-11-13T19:00:00.000Z',
      },
    }
    const result = classifyRetellToolResult(proposal)
    expect(result.status).toBe('needs_confirmation')
    expect(result.spoken).toMatch(/no se creo/i)
    const entry = consultLogEntry('create_action', result.status, result.data, '2026-11-13T18:00:00.000Z')
    expect(entry.summary).toBe('Propuesta pendiente: Revisar inventario')
    expect(entry.summary).not.toMatch(/[{}]|token|secret/i)
  })

  it('lets the report cite only successful tool results', () => {
    const facts = verifiedFactsFromLog([
      { tool: 'get_my_actions', status: 'error', summary: '{"items":[{"titulo":"inventado"}]}' },
      { tool: 'get_my_actions', status: 'ok', summary: '{"items":[{"titulo":"Cerrar OTIF"}]}' },
    ])
    expect(facts.hadError).toBe(true)
    expect(facts.hadSuccess).toBe(true)
    expect(facts.lines.join('\n')).toContain('Cerrar OTIF')
    expect(facts.lines.join('\n')).not.toContain('inventado')
    expect(verifiedFactsFromLog(null)).toEqual({ lines: [], hadError: false, hadSuccess: false })
  })

  it('stores a short phrase and keeps model-written verified text out of the report', () => {
    const entry = consultLogEntry('get_my_actions', 'ok', {
      items: [{ title: 'Cerrar OTIF' }, { titulo: 'Revisar inventario' }],
    })
    expect(entry.summary).toBe('Cerrar OTIF, Revisar inventario')
    expect(entry.summary).not.toMatch(/[{}]/)
    const grounded = groundVerifiedLines(
      [`get_my_actions: ${entry.summary}`],
      ['Hay 40 acciones vencidas y el indicador OTIF esta en 92%.']
    )
    expect(grounded).toEqual(['get_my_actions: Cerrar OTIF, Revisar inventario'])
    expect(grounded.join('\n')).not.toMatch(/92%|40 acciones/)
  })
})
