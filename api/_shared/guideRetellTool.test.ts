import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import type { CopilotToolResult } from '../../src/features/ai-support/copilot/types.js'
import { verifyRetellSignature } from './guideInterviewReport.js'
import {
  buildRetellToolMetrics,
  classifyRetellToolResult,
  consultLogEntry,
  estimatePayloadBytes,
  groundVerifiedLines,
  isRetellBoardTool,
  isRetellWriteTool,
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
    expect(isRetellWriteTool('create_action')).toBe(true)
    expect(isRetellWriteTool('get_my_actions')).toBe(false)
  })

  it('parses string args and falls back to dynamic session_id', () => {
    const parsed = readRetellToolCall({
      name: 'scrumban',
      args: JSON.stringify({ tool: 'get_okr_progress', usuario_id: 'intruso' }),
      call: {
        metadata: { product: 'guide' },
        retell_llm_dynamic_variables: { session_id: 'session-dyn' },
      },
    })
    expect(parsed.sessionId).toBe('session-dyn')
    expect(parsed.tool).toBe('get_okr_progress')
    expect(parsed.args).not.toHaveProperty('usuario_id')
  })

  it('drops a forged usuario_id from the model and keeps the session id', () => {
    const parsed = readRetellToolCall({
      name: 'create_action',
      args: { tool: 'create_action', usuario_id: 'intruso', title: 'Nueva' },
      call: { metadata: { product: 'guide', guide_session_id: 'session-real', usuario_id: 'intruso' } },
    })
    expect(parsed.sessionId).toBe('session-real')
    expect(parsed.args).not.toHaveProperty('usuario_id')
    expect(parsed.tool).toBe('create_action')
    expect(isRetellWriteTool(parsed.tool)).toBe(true)
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
      error: 'boom',
    })
    expect(result.status).toBe('error')
    expect(result.data).toBeNull()
    expect(result.spoken).toMatch(/no pude consultar/i)
  })

  it('speaks a typed timeout without inventing board data', () => {
    const result = classifyRetellToolResult({
      ok: false,
      tool: 'get_okr_progress',
      kind: 'error',
      error: 'timeout',
    })
    expect(result.status).toBe('error')
    expect(result.spoken).toMatch(/a tiempo/i)
    expect(result.data).toBeNull()
  })

  it('compacts ok reads into voice-slim payloads with capped items', () => {
    const items = Array.from({ length: 20 }, (_, i) => ({
      id: `a-${i}`,
      titulo_accion: `Accion ${i}`,
      estado: 'Pendiente',
      fecha: '2026-11-16',
      secret_field: 'drop-me',
    }))
    const result = classifyRetellToolResult({
      ok: true,
      tool: 'get_my_actions',
      kind: 'read',
      data: { filter: 'open', items, total: 20 },
    })
    expect(result.status).toBe('ok')
    const data = result.data as {
      voice_slim?: boolean
      truncated?: boolean
      items?: unknown[]
      items_total?: number
    }
    expect(data.voice_slim).toBe(true)
    expect(data.truncated).toBe(true)
    expect(data.items).toHaveLength(8)
    expect(JSON.stringify(data)).not.toMatch(/secret_field|drop-me/)
    expect(estimatePayloadBytes(data)).toBeGreaterThan(0)
    const metrics = buildRetellToolMetrics({
      call_id: 'call-1',
      session: 'session-1',
      invitation_id: null,
      tool: 'get_my_actions',
      status: 'ok',
      access_mode: 'propose',
      auth_ms: 1,
      session_ms: 2,
      user_ms: 3,
      dispatch_ms: 4,
      consult_log_ms: 0,
      payload_bytes: estimatePayloadBytes(data),
      ms: 10,
      ignored_model_user: false,
    })
    expect(metrics.channel).toBe('retell')
    expect(metrics.payload_bytes).toBeGreaterThan(0)
    expect(Object.keys(metrics)).toEqual(
      expect.arrayContaining([
        'call_id',
        'session',
        'tool',
        'auth_ms',
        'session_ms',
        'user_ms',
        'dispatch_ms',
        'consult_log_ms',
        'payload_bytes',
        'ms',
        'status',
      ])
    )
  })

  it('keeps a create_action as a proposal and asks for confirm_pending_op', () => {
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
    expect(result.spoken).toMatch(/confirm_pending_op/i)
    expect(result.data).toMatchObject({ pending_op_id: 'op-1' })
    const entry = consultLogEntry('create_action', result.status, result.data, '2026-11-13T18:00:00.000Z')
    expect(entry.summary).toBe('Propuesta pendiente: Revisar inventario')
    expect(entry.summary).not.toMatch(/[{}]|token|secret/i)
  })

  it('treats confirm_pending_op and cancel_pending_op as write tools with spoken outcomes', () => {
    expect(isRetellWriteTool('confirm_pending_op')).toBe(true)
    expect(isRetellWriteTool('cancel_pending_op')).toBe(true)
    const confirmed = classifyRetellToolResult({
      ok: true,
      tool: 'confirm_pending_op',
      kind: 'read',
      data: { status: 'confirmed', pending_op_id: 'op-1', spoken_hint: 'Listo, quedo registrada.' },
    })
    expect(confirmed.status).toBe('ok')
    expect(confirmed.spoken).toMatch(/quedo registrada/i)
    const cancelled = classifyRetellToolResult({
      ok: true,
      tool: 'cancel_pending_op',
      kind: 'read',
      data: { status: 'cancelled', pending_op_id: 'op-1' },
    })
    expect(cancelled.spoken).toMatch(/cancelado/i)
    const failed = classifyRetellToolResult({
      ok: false,
      tool: 'confirm_pending_op',
      kind: 'error',
      error: 'expired',
    })
    expect(failed.status).toBe('error')
    expect(failed.spoken).toMatch(/no digas que quedo hecha/i)
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
    expect(facts.lines.join('\n')).not.toMatch(/get_my_actions:/)
    expect(facts.technicalAttention.length).toBeGreaterThan(0)
    expect(verifiedFactsFromLog(null)).toEqual({
      lines: [],
      sources: [],
      metrics: [],
      technicalAttention: [],
      hadError: false,
      hadSuccess: false,
    })
  })

  it('stores a short phrase and keeps model-written verified text out of the report', () => {
    const entry = consultLogEntry('get_my_actions', 'ok', {
      items: [{ title: 'Cerrar OTIF' }, { titulo: 'Revisar inventario' }],
    })
    expect(entry.summary).toBe('Cerrar OTIF, Revisar inventario')
    expect(entry.summary).not.toMatch(/[{}]/)
    const facts = verifiedFactsFromLog([entry])
    const grounded = groundVerifiedLines(facts.lines, [
      'Hay 40 acciones vencidas y el indicador OTIF esta en 92%.',
    ])
    expect(grounded).toEqual(['Cerrar OTIF, Revisar inventario'])
    expect(grounded.join('\n')).not.toMatch(/92%|40 acciones|get_my_actions/)
  })
})
