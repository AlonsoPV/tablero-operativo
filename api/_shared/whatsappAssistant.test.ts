import { afterEach, expect, it, vi } from 'vitest'
import handler from '../whatsapp-assistant'

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  runGeminiToolLoop: vi.fn(),
  confirmPendingOp: vi.fn(),
}))

vi.mock('./assistantAuth.js', () => ({
  checkAssistantRateLimit: () => ({ ok: true }),
  createServiceRoleClient: () => ({
    from: mocks.from,
    rpc: async () => ({ data: true }),
  }),
}))
vi.mock('./enableSystemCa.js', () => ({ enableSystemCaCertificates: () => {} }))
vi.mock('./geminiToolLoop.js', () => ({ runGeminiToolLoop: mocks.runGeminiToolLoop }))
vi.mock('./assistantOpsRuntime.js', () => ({
  cancelPendingOp: vi.fn(),
  confirmPendingOp: mocks.confirmPendingOp,
  dispatchCopilotTool: vi.fn().mockResolvedValue({ ok: true }),
  serializeToolResultForModel: (value: unknown) => value,
}))

afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllEnvs()
})

async function send(text: string): Promise<Response> {
  vi.stubEnv('WHATSAPP_ASSISTANT_SECRET', 'test-only')
  vi.stubEnv('GEMINI_API_KEY', 'test-only')
  const request = new Request('https://example.test/api/whatsapp-assistant', {
    method: 'POST',
    headers: { 'x-whatsapp-assistant-secret': 'test-only', 'content-type': 'application/json' },
    body: JSON.stringify({ usuario_id: 'usuario', wa_id: 'contacto', text }),
  })
  const response = await handler(request, undefined)
  if (!(response instanceof Response)) throw new Error('Expected a Web Response')
  return response
}

it.each(['ai', 'automation'])('answers a repeated board query without replaying a pending draft from %s', async (source) => {
  const query = '¿Cómo van los OKRs?'
  const history = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({ data: [
      { direction: 'outbound', source, body_text: 'Prepare este borrador de Google. Correo pendiente.' },
      { direction: 'inbound', source: 'contact', body_text: 'Consulta el tablero' },
      { direction: 'inbound', source: 'contact', body_text: query },
    ] }),
  }
  mocks.from.mockImplementation((table: string) => {
    if (table === 'usuarios') return {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: async () => ({ data: { id: 'usuario', user_id: 'auth', activo: true } }),
    }
    if (table === 'whatsapp_messages') return history
    throw new Error(`Unexpected query to ${table}`)
  })
  mocks.runGeminiToolLoop.mockResolvedValue({ text: 'Estos son tus OKRs.', proposals: [] })

  const response = await send(query)

  expect(await response.json()).toMatchObject({ text: 'Estos son tus OKRs.', proposals: [] })
  expect(history.eq).toHaveBeenCalledWith('usuario_id', 'usuario')
  expect(mocks.from).not.toHaveBeenCalledWith('assistant_pending_ops')
  expect(mocks.confirmPendingOp).not.toHaveBeenCalled()
  const call = mocks.runGeminiToolLoop.mock.calls[0][0]
  expect(call.readOnly).toBe(true)
  expect(call.contents.at(-1)).toEqual({ role: 'user', parts: [{ text: query }] })
  expect(JSON.stringify(call.contents)).not.toContain('Correo pendiente')
  expect(call.functionDeclarations).toEqual(expect.arrayContaining([
    expect.objectContaining({ name: 'get_module_data' }),
    expect.objectContaining({ name: 'search_board' }),
  ]))
})
