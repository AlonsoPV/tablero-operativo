import { COPILOT_FUNCTION_DECLARATIONS } from '../../src/features/ai-support/copilot/catalog.js'
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
}): Promise<{
  text: string
  finishReason?: string
  blockReason?: string
  proposals: CopilotProposal[]
  clarification?: CopilotClarification
  toolTrace: Array<{ tool: string; kind: string }>
  usage?: GeminiResponse['usageMetadata']
}> {
  const contents = [...input.contents]
  const proposals: CopilotProposal[] = []
  const toolTrace: Array<{ tool: string; kind: string }> = []
  let clarification: CopilotClarification | undefined
  let lastUsage: GeminiResponse['usageMetadata']
  let finishReason: string | undefined
  let blockReason: string | undefined
  let text = ''

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), input.timeoutMs)
    let response: Response
    try {
      response = await fetch(input.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: input.systemInstruction }] },
          contents,
          tools: [{ functionDeclarations: COPILOT_FUNCTION_DECLARATIONS }],
          toolConfig: { functionCallingConfig: { mode: 'AUTO' } },
          generationConfig: input.generationConfig,
        }),
      })
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

    if (calls.length === 0) break

    contents.push({ role: 'model', parts })
    const responseParts: GeminiPart[] = []
    for (const call of calls) {
      const result: CopilotToolResult = await dispatchCopilotTool(input.actor, call.name, call.args)
      toolTrace.push({ tool: result.tool, kind: result.kind })
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
  }

  return {
    text,
    finishReason,
    blockReason,
    proposals,
    clarification,
    toolTrace,
    usage: lastUsage,
  }
}
