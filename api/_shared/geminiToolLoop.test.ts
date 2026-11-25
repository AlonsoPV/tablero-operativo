import { afterEach, expect, it, vi } from 'vitest'
import { dispatchCopilotTool } from './assistantOpsRuntime.js'
import { runGeminiToolLoop } from './geminiToolLoop.js'

vi.mock('./assistantOpsRuntime.js', () => ({
  dispatchCopilotTool: vi.fn(async () => ({
    ok: true, kind: 'clarification', tool: 'notify_action_email',
    clarification: { question: '¿De qué acción?', options: [] },
  })),
  serializeToolResultForModel: () => ({ status: 'needs_clarification' }),
}))

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

it.each(['gmail_prepare_send', 'gmail_search'])(
  'uses Kanban email when the chat tried %s during a notification request',
  async (tool) => {
    const fetchModel = vi.fn()
      .mockResolvedValueOnce(Response.json({ candidates: [{ content: { parts: [
        { functionCall: { name: tool, args: { to_email: 'wrong@example.test' } } },
      ] } }] }))
      .mockResolvedValueOnce(Response.json({ candidates: [{ content: { parts: [{ text: '¿De qué acción?' }] } }] }))
    vi.stubGlobal('fetch', fetchModel)
    const actor = {} as never
    await runGeminiToolLoop({
      apiKey: 'test-key',
      url: 'https://example.test',
      model: 'test-model',
      systemInstruction: '',
      contents: [],
      generationConfig: {},
      actor,
      timeoutMs: 1000,
      allowPersonalGmailWrites: false,
      boardEmailRequest: true,
    })
    const { tools } = JSON.parse(fetchModel.mock.calls[0]?.[1].body)
    expect(tools[0].functionDeclarations.some(({ name }: { name: string }) => name.startsWith('gmail_'))).toBe(false)
    expect(tools[0].functionDeclarations.map(({ name }: { name: string }) => name)).toEqual(['notify_action_email'])
    expect(dispatchCopilotTool).toHaveBeenCalledExactlyOnceWith(actor, 'notify_action_email', {
      action_id: undefined,
      query: undefined,
    })
  }
)

it('asks for the board action when the model returns an unsupported Gmail explanation', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({
    candidates: [{ content: { parts: [{ text: 'Ese destinatario es externo.' }] } }],
  })))
  const result = await runGeminiToolLoop({
    apiKey: 'test-key',
    url: 'https://example.test',
    model: 'test-model',
    systemInstruction: '',
    contents: [],
    generationConfig: {},
    actor: {} as never,
    timeoutMs: 1000,
    allowPersonalGmailWrites: false,
    boardEmailRequest: true,
  })
  expect(result.text).toBe('¿De qué acción?')
  expect(result.clarification?.question).toBe('¿De qué acción?')
})

it.each([false, true])('returns a persisted summary email after a prose fallback when needed (%s)', async (modelStartsWithProse) => {
  const proposal = { id: 'draft-1', tool: 'notify_user_email', summary: 'Correo para Alonso. Revisa el contenido antes de aprobar.' }
  vi.mocked(dispatchCopilotTool).mockResolvedValueOnce({
    ok: true, kind: 'proposal', tool: 'notify_user_email', proposal,
  } as never)
  const model = vi.fn(async () => Response.json({
    candidates: [{ content: { parts: [{
      functionCall: {
        name: 'notify_user_email',
        args: { recipient: 'Alonso Pérez', subject: 'Resumen', body: 'Una acción abierta.' },
      },
    }] } }],
  }))
  if (modelStartsWithProse) {
    model.mockResolvedValueOnce(Response.json({
      candidates: [{ content: { parts: [{ text: 'Copia y envía el resumen.' }] } }],
    }))
  }
  vi.stubGlobal('fetch', model)
  const result = await runGeminiToolLoop({
    apiKey: 'test-key',
    url: 'https://example.test',
    model: 'test-model',
    systemInstruction: '',
    contents: [],
    generationConfig: {},
    actor: {} as never,
    timeoutMs: 1000,
    allowPersonalGmailWrites: false,
    boardEmailRequest: true,
    summaryEmailRequest: true,
  })
  expect(result.proposals).toEqual([proposal])
  expect(result.text).toBe(proposal.summary)
  expect(model).toHaveBeenCalledTimes(modelStartsWithProse ? 2 : 1)
})
