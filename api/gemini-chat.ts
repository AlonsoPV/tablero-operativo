import type { ServerResponse } from 'node:http'
import {
  asJsonResponse,
  readNumberEnv,
  readRequestBody,
  type VercelRequestLike,
} from './_shared/http'
import { enableSystemCaCertificates } from './_shared/enableSystemCa'
import { isTlsCertificateError, TLS_CERTIFICATE_USER_MESSAGE } from './_shared/tlsError'

enableSystemCaCertificates()
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

type GeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>
    }
    finishReason?: string
  }>
  promptFeedback?: {
    blockReason?: string
  }
}

const GEMINI_API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta'
const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash-lite'
const DEFAULT_MAX_OUTPUT_TOKENS = 700
const DEFAULT_TEMPERATURE = 0.25
const DEFAULT_TIMEOUT_MS = 20000

function toGeminiContents(messages: ReturnType<typeof sanitizeMessages>): GeminiContent[] {
  return messages.map((message) => ({
    role: message.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: message.content }],
  }))
}

function getGeminiText(data: GeminiResponse) {
  return data.candidates?.[0]?.content?.parts
    ?.map((part) => part.text)
    .filter((text): text is string => Boolean(text))
    .join('')
    .trim()
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

  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Metodo no permitido. Usa POST.' })
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
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), readNumberEnv('GEMINI_TIMEOUT_MS', DEFAULT_TIMEOUT_MS))

    let response: Response

    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: systemInstruction }],
          },
          contents: toGeminiContents(cleanMessages),
          generationConfig: {
            maxOutputTokens: readNumberEnv('GEMINI_MAX_TOKENS', DEFAULT_MAX_OUTPUT_TOKENS),
            temperature: readNumberEnv('GEMINI_TEMPERATURE', DEFAULT_TEMPERATURE),
          },
        }),
      })
    } finally {
      clearTimeout(timeout)
    }

    if (!response.ok) {
      const errorText = await response.text()
      const safeReason = readGeminiError(errorText)

      console.error('Gemini API Error:', {
        status: response.status,
        model,
        reason: safeReason,
      })

      if ([400, 401, 403, 404].includes(response.status)) {
        return res.status(502).json({
          error: `Gemini rechazo la solicitud (${response.status}). Revisa GEMINI_API_KEY, GEMINI_MODEL y permisos del proyecto.`,
        })
      }

      if (response.status === 429) {
        return res.status(503).json({
          error: 'Gemini esta limitando las solicitudes. Intenta nuevamente en unos minutos.',
        })
      }

      return res.status(502).json({
        error: 'No se pudo obtener respuesta del asistente. Intenta nuevamente.',
      })
    }

    const data = (await response.json()) as GeminiResponse

    if (data.promptFeedback?.blockReason) {
      return res.status(400).json({
        error: 'Gemini bloqueo la solicitud por politicas de seguridad.',
      })
    }

    const finishReason = data.candidates?.[0]?.finishReason
    const text = getGeminiText(data)

    if (!text) {
      console.error('Gemini empty response:', {
        model,
        finishReason,
        blockReason: data.promptFeedback?.blockReason,
      })

      return res.status(502).json({
        error: 'Gemini no regreso contenido util. Intenta con una pregunta mas corta o vuelve a intentar.',
      })
    }

    const rawContent =
      finishReason === 'MAX_TOKENS'
        ? `${text}\n\nNota: la respuesta se corto por limite de longitud. Puedes pedirme que continue.`
        : text
    const content = cleanAssistantText(rawContent)

    return res.status(200).json({ answer: content })
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
