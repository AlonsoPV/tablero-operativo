import type { ServerResponse } from 'node:http'
import {
  asJsonResponse,
  readNumberEnv,
  readRequestBody,
  type VercelRequestLike,
} from './_shared/http'
import { checkAssistantRateLimit, requireAssistantAuth } from './_shared/assistantAuth'
import { enableSystemCaCertificates } from './_shared/enableSystemCa'
import { isTlsCertificateError, TLS_CERTIFICATE_USER_MESSAGE } from './_shared/tlsError'
import { runGeminiToolLoop } from './_shared/geminiToolLoop'
import {
  appendAssistantContexts,
  composeSystemPrompt,
  isAssistantMode,
  sanitizeMessages,
} from '../src/lib/assistantPrompts'

type GeminiContent = {
  role: 'user' | 'model'
  parts: Array<{ text: string }>
}

const GEMINI_API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta'
const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash-lite'
const DEFAULT_MAX_OUTPUT_TOKENS = 700
const DEFAULT_TEMPERATURE = 0.25
const DEFAULT_TIMEOUT_MS = 20000
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

function normalizeGeminiModel(model: string) {
  return model.trim().replace(/^models\//, '') || DEFAULT_GEMINI_MODEL
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

export default async function handler(req: VercelRequestLike, serverRes: ServerResponse) {
  const res = asJsonResponse(serverRes)
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
    if (!rate.ok) {
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

    const { mode, messages, actionContext, okrContext, boardContext } = body as {
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

    const cleanMessages = appendAssistantContexts(
      sanitizeMessages(messages as { role: 'user' | 'assistant'; content: string }[]),
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
    const systemInstruction = composeSystemPrompt(mode, {
      hasActionContext,
      hasOkrContext,
      hasBoardContext,
    })

    const model = normalizeGeminiModel(process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL)
    const url = `${GEMINI_API_BASE_URL}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`
    const generationConfig = {
      maxOutputTokens: readNumberEnv('GEMINI_MAX_TOKENS', DEFAULT_MAX_OUTPUT_TOKENS),
      temperature: readNumberEnv('GEMINI_TEMPERATURE', DEFAULT_TEMPERATURE),
    }

    let loopResult: Awaited<ReturnType<typeof runGeminiToolLoop>>
    try {
      loopResult = await runGeminiToolLoop({
        apiKey,
        url,
        model,
        systemInstruction,
        contents: toGeminiContents(cleanMessages),
        generationConfig,
        actor: {
          supabase: auth.supabase,
          usuarioId: auth.usuarioId,
          authUserId: auth.authUserId,
          rol: auth.rol,
        },
        timeoutMs: readNumberEnv('GEMINI_TIMEOUT_MS', DEFAULT_TIMEOUT_MS),
      })
    } catch (error) {
      const status = typeof (error as { status?: number }).status === 'number' ? (error as { status: number }).status : 0
      const safeReason = readGeminiError(error instanceof Error ? error.message : '')
      console.error('Gemini API Error:', { status, model, reason: safeReason })
      if ([400, 401, 403, 404].includes(status)) {
        return res.status(502).json({
          error: `Gemini rechazo la solicitud (${status}). Revisa GEMINI_API_KEY, GEMINI_MODEL y permisos del proyecto.`,
        })
      }
      if (status === 429) {
        return res.status(503).json({
          error: 'Gemini esta limitando las solicitudes. Intenta nuevamente en unos minutos.',
        })
      }
      throw error
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

    const text = loopResult.text
    if (!text && loopResult.proposals.length === 0 && !loopResult.clarification) {
      console.error('Gemini empty response:', {
        model,
        finishReason: loopResult.finishReason,
      })
      return res.status(502).json({
        error: 'Gemini no regreso contenido util. Intenta con una pregunta mas corta o vuelve a intentar.',
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
}
