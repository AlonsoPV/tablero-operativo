import {
  defineApiHandler,
  readNumberEnv,
  readRequestBody,
} from './_shared/http.js'
import { checkAssistantRateLimit, createServiceRoleClient, requireAssistantAuth } from './_shared/assistantAuth.js'
import { enableSystemCaCertificates } from './_shared/enableSystemCa.js'
import { isTlsCertificateError, TLS_CERTIFICATE_USER_MESSAGE } from './_shared/tlsError.js'
import {
  geminiErrorStatus,
  geminiModelCandidates,
  isGeminiCapacityStatus,
  normalizeGeminiModel,
} from './_shared/geminiModel.js'
import { runGeminiToolLoop } from './_shared/geminiToolLoop.js'
import {
  appendAssistantContexts,
  composeSystemPrompt,
  isAssistantMode,
  sanitizeMessages,
} from '../src/lib/assistantPrompts.js'
import { buildAssistantUiFromToolResults } from '../src/features/ai-support/chatViews/buildViewsFromToolResults.js'
import { isAgentOrchestratorEnabled, runChannelTurn, uiForTurn, webSessionId } from './_shared/orchestrator/channelAdapters.js'
import { EMPTY_MODEL_TURN_MESSAGE } from './_shared/orchestrator/respond.js'
import { isAgentMemoryEnabled } from './_shared/memory/flag.js'
import { loadMemoryPromptBlock } from './_shared/memory/store.js'
import { loadPilotDbAllowlist } from './_shared/pilotAllowlist.js'

type GeminiContent = {
  role: 'user' | 'model'
  parts: Array<{ text: string }>
}

const GEMINI_API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta'
const DEFAULT_MAX_OUTPUT_TOKENS = 700
const DEFAULT_TEMPERATURE = 0.25
const DEFAULT_TIMEOUT_MS = 45000
const MAX_RAW_MESSAGES = 24
const RATE_LIMIT = 40
const RATE_WINDOW_MS = 60_000

function toGeminiContents(messages: ReturnType<typeof sanitizeMessages>): GeminiContent[] {
  return messages.map((message) => ({
    role: message.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: message.content }],
  }))
}

function cleanAssistantText(text: string) {
  return text
    .replace(/[#*]/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function readGeminiError(errorText: string) {
  try {
    const parsed = JSON.parse(errorText) as {
      error?: {
        message?: string
        status?: string
      }
    }

    return [parsed.error?.status, parsed.error?.message].filter(Boolean).join(': ')
  } catch {
    return errorText.trim().slice(0, 220)
  }
}

export default defineApiHandler(async (req, res) => {
  enableSystemCaCertificates()

  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Metodo no permitido. Usa POST.' })
    }

    const auth = await requireAssistantAuth(req, { requireAiModule: true })
    if (!auth.ok) {
      return res.status(auth.status).json({ error: auth.error })
    }

    const rate = checkAssistantRateLimit({
      key: `${auth.usuarioId}:gemini-chat`,
      limit: RATE_LIMIT,
      windowMs: RATE_WINDOW_MS,
    })
    if (rate.ok === false) {
      return res.status(429).json({
        error: `Demasiadas solicitudes al asistente. Espera ${rate.retryAfterSec}s.`,
      })
    }

    const apiKey = process.env.GEMINI_API_KEY

    if (!apiKey) {
      return res.status(500).json({
        error: 'Falta configurar GEMINI_API_KEY en variables de entorno.',
      })
    }

    const body = await readRequestBody(req)

    if (!body || typeof body !== 'object') {
      return res.status(400).json({ error: 'Solicitud invalida.' })
    }

    const { mode, messages, actionContext, okrContext, boardContext, requestId, responseFormat, conversationId } = body as {
      requestId?: unknown
      conversationId?: unknown
      responseFormat?: unknown
      mode?: unknown
      messages?: unknown
      actionContext?: unknown
      okrContext?: unknown
      boardContext?: unknown
    }

    if (!isAssistantMode(mode)) {
      return res.status(400).json({ error: 'Modo de asistente invalido.' })
    }

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Debes enviar al menos un mensaje.' })
    }

    if (messages.length > MAX_RAW_MESSAGES) {
      return res.status(400).json({
        error: `Demasiados mensajes en la solicitud (maximo ${MAX_RAW_MESSAGES}).`,
      })
    }

    const sanitizedMessages = sanitizeMessages(messages as { role: 'user' | 'assistant'; content: string }[])
    const lastUserMessage = sanitizedMessages.filter((message) => message.role === 'user').at(-1)?.content || ''
    const allowPersonalGmailWrites = /\b(?:mi gmail|gmail personal|mi correo personal|mi cuenta personal de google)\b/i.test(lastUserMessage)
    const boardEmailRequest = !allowPersonalGmailWrites &&
      !/\b(?:whatsapp|wasap)\b/i.test(lastUserMessage) &&
      !/\bno\s+(?:(?:le|lo|me|nos|les)\s+)?(?:envi\w*|env[ií]a\w*|m[aá]nd\w*|prepar\w*|compart\w*|notific\w*)\b/i.test(lastUserMessage) &&
      /\b(?:correo|email|mail)\b/i.test(lastUserMessage) &&
      /\b(?:envi\w*|env[ií]a\w*|m[aá]nd\w*|compart\w*|prepar\w*|redact\w*|notific\w*)\b/i.test(lastUserMessage)
    const requestedEmail = boardEmailRequest
      ? lastUserMessage.match(/[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}/i)?.[0]
      : undefined
    const previousReply = sanitizedMessages.filter((message) => message.role === 'assistant').at(-1)?.content || ''
    const summaryEmailRequest = boardEmailRequest &&
      (/\b(?:resumen|consolidado|reporte|informe|okr|okrs|indicadores|informaci[oó]n)\b/i.test(lastUserMessage) ||
        (/\b(?:eso|esto|env[ií]alo|m[aá]ndalo|env[ií]amelo|m[aá]ndamelo)\b/i.test(lastUserMessage) &&
          /\b(?:resumen|consolidado|reporte|informe|okr|okrs)\b/i.test(previousReply)))
    const cleanMessages = appendAssistantContexts(
      sanitizedMessages,
      actionContext,
      okrContext,
      boardContext
    )

    if (cleanMessages.length === 0) {
      return res.status(400).json({ error: 'El mensaje no puede estar vacio.' })
    }

    const hasActionContext = Boolean(actionContext && typeof actionContext === 'object')
    const hasOkrContext = Boolean(okrContext && typeof okrContext === 'object')
    const hasBoardContext = Boolean(boardContext && typeof boardContext === 'object')
    const baseSystemInstruction = composeSystemPrompt(mode, {
      hasActionContext,
      hasOkrContext,
      hasBoardContext,
    })
    let dbAllowlist: Set<string> | null = null
    try {
      dbAllowlist = await loadPilotDbAllowlist(createServiceRoleClient())
    } catch {
      dbAllowlist = null
    }
    const memoryBlock = isAgentMemoryEnabled(process.env, auth.usuarioId, dbAllowlist)
      ? await loadMemoryPromptBlock(
          auth.supabase,
          {
            usuarioId: auth.usuarioId,
            canReadProject: auth.rol === 'Super Admin',
            visibleAreaIds: [],
          },
          lastUserMessage
        )
      : ''
    const systemInstruction = memoryBlock
      ? `${baseSystemInstruction}\n\n${memoryBlock}`
      : baseSystemInstruction

    if (isAgentOrchestratorEnabled() && lastUserMessage) {
      try {
        const turn = await runChannelTurn({
          identity: {
            supabase: auth.supabase,
            authUserId: auth.authUserId,
            usuarioId: auth.usuarioId,
            rol: auth.rol,
            active: true,
            accessToken: auth.token,
          },
          channel: 'web',
          focusedActionIds: (Array.isArray(actionContext) ? actionContext : actionContext ? [actionContext] : []).map(item => (item as { id?: unknown }).id),
          sessionId: webSessionId(conversationId, requestId),
          utterance: lastUserMessage,
          priorAssistantText: previousReply || undefined,
          responseFormat,
        })
        if (turn.handled) {
          const proposals = turn.proposals?.length
            ? turn.proposals
            : turn.proposal && 'tool' in turn.proposal
              ? [turn.proposal]
              : []
          return res.status(200).json({
            answer: turn.text,
            proposals,
            batchId: turn.batchId ?? null,
            clarification: turn.clarification,
            ui: uiForTurn(turn, turn.text),
            toolTrace: turn.toolsUsed.map((tool) => ({ tool, kind: 'read' })),
            agent: {
              intent: turn.intent,
              status: turn.response.status,
              format: turn.format,
              formatSelected: turn.formatSelected,
              offerDetail: turn.offerDetail,
              blocks: turn.response.blocks,
              references: turn.response.references,
              asOf: turn.response.asOf,
              executionEnabled: turn.executionEnabled === true,
            },
          })
        }
      } catch (error) {
        console.error('Agent orchestrator error:', error)
        return res.status(502).json({
          error: 'No pude consultar el tablero en este momento. No muestro cifras inventadas.',
        })
      }
    }

    const candidates = geminiModelCandidates(process.env.GEMINI_MODEL)
    const generationConfig = {
      maxOutputTokens: readNumberEnv('GEMINI_MAX_TOKENS', DEFAULT_MAX_OUTPUT_TOKENS),
      temperature: readNumberEnv('GEMINI_TEMPERATURE', DEFAULT_TEMPERATURE),
    }
    const timeoutMs = Math.min(Math.max(readNumberEnv('GEMINI_TIMEOUT_MS', DEFAULT_TIMEOUT_MS), 45_000), 52_000)
    const contents = toGeminiContents(cleanMessages)
    const actor = {
      supabase: auth.supabase,
      usuarioId: auth.usuarioId,
      authUserId: auth.authUserId,
      rol: auth.rol,
      accessToken: auth.token,
      requestId: typeof requestId === 'string' ? requestId.trim().slice(0, 100) : undefined,
    }

    let loopResult: Awaited<ReturnType<typeof runGeminiToolLoop>> | undefined
    let model = candidates[0] ?? normalizeGeminiModel(process.env.GEMINI_MODEL)
    let lastError: unknown
    let sawCapacity = false

    for (let i = 0; i < candidates.length; i++) {
      model = candidates[i]!
      const url = `${GEMINI_API_BASE_URL}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`
      try {
        loopResult = await runGeminiToolLoop({
          apiKey,
          url,
          model,
          systemInstruction,
          contents,
          generationConfig,
          actor,
          timeoutMs,
          allowPersonalGmailWrites,
          boardEmailRequest,
          summaryEmailRequest,
          requestedEmail,
        })
        if (i > 0) {
          console.warn('Gemini fallback model used', { model, attempted: candidates.slice(0, i + 1) })
        }
        break
      } catch (error) {
        lastError = error
        const status = geminiErrorStatus(error)
        const safeReason = readGeminiError(error instanceof Error ? error.message : '')
        console.error('Gemini API Error:', { status, model, reason: safeReason })
        if ([400, 401, 403, 404].includes(status)) {
          return res.status(502).json({
            error: safeReason
              ? `Gemini rechazo la solicitud (${status}) con modelo "${model}": ${safeReason.slice(0, 180)}`
              : `Gemini rechazo la solicitud (${status}) con modelo "${model}". Usa un ID tipo gemini-3.5-flash-lite (no el nombre de la UI).`,
          })
        }
        const hasMore = i < candidates.length - 1
        if (isGeminiCapacityStatus(status) && hasMore) {
          sawCapacity = true
          console.warn('Gemini capacity; trying next model', { model, status, next: candidates[i + 1] })
          continue
        }
        if (isGeminiCapacityStatus(status)) {
          return res.status(503).json({
            error:
              'El proveedor de IA está saturado. Tu pregunta se conservó; puedes reintentar sin perder la conversación.',
            retryable: true,
          })
        }
        throw error
      }
    }

    if (!loopResult) {
      throw lastError instanceof Error ? lastError : new Error('gemini_failed')
    }

    if (loopResult.usage) {
      console.info('assistant gemini usage', {
        model,
        totalTokenCount: loopResult.usage.totalTokenCount,
        promptTokenCount: loopResult.usage.promptTokenCount,
        candidatesTokenCount: loopResult.usage.candidatesTokenCount,
        tools: loopResult.toolTrace.map((item) => item.tool),
      })
    }

    if (loopResult.blockReason) {
      return res.status(400).json({
        error: 'Gemini bloqueo la solicitud por politicas de seguridad.',
      })
    }

    const ui = buildAssistantUiFromToolResults(loopResult.toolReads)
    const lastToolFailure = loopResult.toolReads.filter(({ kind, error }) =>
      (kind === 'error' || kind === 'denied') && error
    ).at(-1)
    const text = loopResult.text || loopResult.clarification?.question ||
      (loopResult.proposals.length ? loopResult.proposals[0]?.summary : '') ||
      lastToolFailure?.error || (ui?.views.length ? 'Estos son los resultados del tablero.' : '')
    if (!text && loopResult.proposals.length === 0 && !loopResult.clarification) {
      console.error('Gemini empty response:', {
        model,
        finishReason: loopResult.finishReason,
        tools: loopResult.toolTrace.map((item) => item.tool),
      })
      if (sawCapacity || isGeminiCapacityStatus(geminiErrorStatus(lastError))) {
        return res.status(503).json({
          error:
            'El proveedor de IA no completó la respuesta. Tu pregunta se conservó; reintenta en un momento.',
          retryable: true,
        })
      }
      return res.status(200).json({
        answer: EMPTY_MODEL_TURN_MESSAGE,
        proposals: [],
        toolTrace: loopResult.toolTrace,
        degraded: true,
      })
    }

    const rawContent =
      loopResult.finishReason === 'MAX_TOKENS'
        ? `${text}\n\nNota: la respuesta se corto por limite de longitud. Puedes pedirme que continue.`
        : text || 'Revisa la propuesta o las opciones para continuar.'
    const content = cleanAssistantText(rawContent)

    return res.status(200).json({
      answer: content,
      proposals: loopResult.proposals,
      clarification: loopResult.clarification,
      toolTrace: loopResult.toolTrace,
      ui,
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return res.status(504).json({
        error: 'Gemini tardo demasiado en responder. Intenta de nuevo con una pregunta mas concreta.',
      })
    }

    if (isTlsCertificateError(error)) {
      console.error('AI assistant TLS error:', error)
      return res.status(502).json({ error: TLS_CERTIFICATE_USER_MESSAGE })
    }

    console.error('AI assistant error:', error)

    return res.status(500).json({
      error: 'Ocurrio un error inesperado al procesar la solicitud.',
    })
  }
})
