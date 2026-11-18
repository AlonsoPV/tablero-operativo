import {
  COPILOT_FUNCTION_DECLARATIONS,
  isCopilotWriteTool,
  type GeminiFunctionDeclaration,
} from '../../src/features/ai-support/copilot/catalog.js'
import type { CopilotClarification, CopilotProposal, CopilotToolResult } from '../../src/features/ai-support/copilot/types.js'
import {
  dispatchCopilotTool,
  serializeToolResultForModel,
  type CopilotActor,
} from './assistantOpsRuntime.js'

type GeminiPart =
  | { text: string }
  | { functionCall: { name: string; args?: Record<string, unknown> } }
  | { functionResponse: { name: string; response: Record<string, unknown> } }

type GeminiContent = {
  role: 'user' | 'model'
  parts: GeminiPart[]
}

type GeminiResponse = {
  candidates?: Array<{
    content?: { parts?: GeminiPart[] }
    finishReason?: string
  }>
  promptFeedback?: { blockReason?: string }
  usageMetadata?: {
    promptTokenCount?: number
    candidatesTokenCount?: number
    totalTokenCount?: number
  }
}

const MAX_ROUNDS = 3
const MAX_CALLS_PER_ROUND = 4

function functionCallsFrom(parts: GeminiPart[] | undefined) {
  return (parts ?? []).flatMap((part) =>
    'functionCall' in part && part.functionCall?.name
      ? [{ name: part.functionCall.name, args: part.functionCall.args ?? {} }]
      : []
  )
}

export async function runGeminiToolLoop(input: {
  apiKey: string
  url: string
  model: string
  systemInstruction: string
  contents: GeminiContent[]
  generationConfig: Record<string, unknown>
  actor: CopilotActor
  timeoutMs: number
  /** Si se define, solo esas declaraciones; por defecto catálogo completo. */
  functionDeclarations?: GeminiFunctionDeclaration[]
  /** Bloquea escrituras aunque el modelo las pida (p. ej. WhatsApp QUERY). */
  readOnly?: boolean
  /** En el chat, solo habilita Gmail de escritura si el usuario lo pidió explícitamente. */
  allowPersonalGmailWrites?: boolean
  boardEmailRequest?: boolean
  summaryEmailRequest?: boolean
  requestedEmail?: string
}): Promise<{
  text: string
  finishReason?: string
  blockReason?: string
  proposals: CopilotProposal[]
  clarification?: CopilotClarification
  toolTrace: Array<{ tool: string; kind: string }>
  /** Resultados de lectura/error para proyectar UI estructurada en el cliente. */
  toolReads: Array<{ tool: string; kind: string; data?: unknown; error?: string }>
  usage?: GeminiResponse['usageMetadata']
}> {
  const contents = [...input.contents]
  const proposals: CopilotProposal[] = []
  const toolTrace: Array<{ tool: string; kind: string }> = []
  const toolReads: Array<{ tool: string; kind: string; data?: unknown; error?: string }> = []
  let clarification: CopilotClarification | undefined
  let lastUsage: GeminiResponse['usageMetadata']
  let finishReason: string | undefined
  let blockReason: string | undefined
  let text = ''
  const catalog = input.functionDeclarations ?? COPILOT_FUNCTION_DECLARATIONS
  const routeToBoardEmail = (tool: string) =>
    input.allowPersonalGmailWrites === false &&
    (tool === 'gmail_prepare_send' || tool === 'gmail_prepare_reply' ||
      (input.boardEmailRequest === true && tool.startsWith('gmail_')))
  const declarations = catalog.filter(({ name }) => !routeToBoardEmail(name))
  const boardEmailTool = declarations.find(({ name }) => name === 'notify_action_email')
  const summaryEmailTool = input.summaryEmailRequest && !input.readOnly
    ? declarations.find(({ name }) => name === 'notify_user_email')
    : undefined
  const readyEmail = () => proposals.find(({ tool }) => tool === 'notify_user_email' || tool === 'notify_action_email')
  const deadline = Date.now() + input.timeoutMs
  let finishSummaryDraft = false

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const requireBoardEmail = round === 0 && !input.readOnly && input.boardEmailRequest === true &&
      !input.summaryEmailRequest && boardEmailTool
    const requiredTool = requireBoardEmail ||
      ((finishSummaryDraft || round === MAX_ROUNDS - 1) ? summaryEmailTool : undefined)
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), Math.max(0, deadline - Date.now()))
    let response: Response
    try {
      response = await fetch(input.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: input.systemInstruction }] },
          contents,
          tools: [{ functionDeclarations: requiredTool ? [requiredTool] : declarations }],
          toolConfig: { functionCallingConfig: { mode: requiredTool ? 'ANY' : 'AUTO' } },
          generationConfig: input.generationConfig,
        }),
      })
    } catch (error) {
      if (controller.signal.aborted && (proposals.length || clarification)) {
        text = clarification?.question || readyEmail()?.summary || 'La propuesta está lista para revisar.'
        break
      }
      throw error
    } finally {
      clearTimeout(timeout)
    }

    if (!response.ok) {
      const errorText = await response.text()
      throw Object.assign(new Error(errorText.slice(0, 400)), { status: response.status })
    }

    const data = (await response.json()) as GeminiResponse
    lastUsage = data.usageMetadata
    blockReason = data.promptFeedback?.blockReason
    if (blockReason) break

    const parts = data.candidates?.[0]?.content?.parts ?? []
    finishReason = data.candidates?.[0]?.finishReason
    const calls = functionCallsFrom(parts).slice(0, MAX_CALLS_PER_ROUND)
    const texts = parts
      .map((part) => ('text' in part ? part.text : ''))
      .filter(Boolean)
      .join('')
      .trim()
    if (texts) text = texts

    if (calls.length === 0) {
      if (summaryEmailTool && !requiredTool && texts) {
        contents.push({ role: 'model', parts })
        contents.push({ role: 'user', parts: [{ text: 'Prepara ahora el borrador del correo solicitado con notify_user_email.' }] })
        finishSummaryDraft = true
        continue
      }
      if (requireBoardEmail) {
        const result = await dispatchCopilotTool(input.actor, 'notify_action_email', {})
        clarification = result.clarification
        text = clarification?.question || 'Indica de qué acción del tablero quieres preparar el correo.'
      }
      break
    }

    contents.push({ role: 'model', parts })
    const responseParts: GeminiPart[] = []
    for (const call of calls) {
      if (input.readOnly && isCopilotWriteTool(call.name)) {
        const blocked: CopilotToolResult = {
          ok: false,
          tool: call.name as CopilotToolResult['tool'],
          kind: 'denied',
          error:
            'Esta consulta es solo lectura. Si el usuario quiere modificar una tarea, pregunta si desea actualizarla (handoff task_update).',
        }
        toolTrace.push({ tool: call.name, kind: 'blocked_write' })
        responseParts.push({
          functionResponse: {
            name: call.name,
            response: serializeToolResultForModel(blocked) as Record<string, unknown>,
          },
        })
        continue
      }
      const result: CopilotToolResult =
        routeToBoardEmail(call.name)
          ? await dispatchCopilotTool(input.actor, 'notify_action_email', {
              action_id: call.args.action_id,
              query: call.args.query,
              ...(input.requestedEmail ? { requested_email: input.requestedEmail } : {}),
            })
          : await dispatchCopilotTool(input.actor, call.name, {
              ...call.args,
              ...((call.name === 'notify_action_email' || call.name === 'notify_user_email') && input.requestedEmail
                ? { requested_email: input.requestedEmail } : {}),
            })
      toolTrace.push({ tool: result.tool, kind: result.kind })
      if (result.kind === 'read' || result.kind === 'denied' || result.kind === 'error') {
        toolReads.push({
          tool: result.tool,
          kind: result.kind,
          data: result.data,
          error: result.error,
        })
      }
      if (result.proposal) proposals.push(result.proposal)
      if (result.clarification && !clarification) clarification = result.clarification
      responseParts.push({
        functionResponse: {
          name: call.name,
          response: serializeToolResultForModel(result) as Record<string, unknown>,
        },
      })
    }
    contents.push({ role: 'user', parts: responseParts })
    const prepared = readyEmail()
    if (prepared) {
      text = prepared.summary
      break
    }
    if (input.boardEmailRequest && clarification) {
      text = clarification.question
      break
    }
  }

  return {
    text,
    finishReason,
    blockReason,
    proposals,
    clarification,
    toolTrace,
    toolReads,
    usage: lastUsage,
  }
}
