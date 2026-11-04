/**
 * Transcribe audio dictado (webm/mp4/ogg) a texto con Gemini.
 * Auth: Authorization Bearer (JWT Supabase) + módulo ai_assist.
 */
import type { ServerResponse } from 'node:http'
import {
  asJsonResponse,
  readNumberEnv,
  readRequestBody,
  readStringEnv,
  type VercelRequestLike,
} from './_shared/http'
import { checkAssistantRateLimit, requireAssistantAuth } from './_shared/assistantAuth'
import { enableSystemCaCertificates } from './_shared/enableSystemCa'
import { isTlsCertificateError, TLS_CERTIFICATE_USER_MESSAGE } from './_shared/tlsError'

const GEMINI_API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta'
const DEFAULT_MODEL = 'gemini-2.5-flash'
const MAX_AUDIO_CHARS = 6_000_000
const RATE_LIMIT = 25
const RATE_WINDOW_MS = 60_000
const ALLOWED_MIME = /^(audio\/(webm|mp4|mpeg|mp3|ogg|wav|x-wav|flac)|audio\/webm;codecs=opus|audio\/ogg;codecs=opus|audio\/mp4;codecs=mp4a\.40\.2)/i

function cleanTranscript(text: string) {
  const cleaned = text
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/^transcripci[oó]n:\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (
    !cleaned ||
    /^(no se (entiende|escucha|detecta|distingue).*(nada|audio|voz)?|silencio|(vac[ií]o)|n\/a|none)$/i.test(
      cleaned
    )
  ) {
    return ''
  }
  return cleaned
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
      key: `${auth.usuarioId}:assistant-transcribe`,
      limit: RATE_LIMIT,
      windowMs: RATE_WINDOW_MS,
    })
    if (rate.ok === false) {
      return res.status(429).json({
        error: `Demasiadas transcripciones. Espera ${rate.retryAfterSec}s e intenta de nuevo.`,
      })
    }

    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      return res.status(500).json({ error: 'Falta GEMINI_API_KEY para transcribir el dictado.' })
    }

    const body = await readRequestBody(req)
    if (!body || typeof body !== 'object') {
      return res.status(400).json({ error: 'Solicitud invalida.' })
    }
    const payload = body as { audioBase64?: unknown; mimeType?: unknown }
    const audioBase64 = typeof payload.audioBase64 === 'string' ? payload.audioBase64.trim() : ''
    const mimeType = typeof payload.mimeType === 'string' ? payload.mimeType.trim() : 'audio/webm'
    if (!audioBase64 || audioBase64.length < 80) {
      return res.status(400).json({ error: 'No llego audio para transcribir.' })
    }
    if (audioBase64.length > MAX_AUDIO_CHARS) {
      return res.status(413).json({ error: 'El dictado es demasiado largo. Intenta en partes mas cortas.' })
    }
    if (!ALLOWED_MIME.test(mimeType.split(';')[0] ?? mimeType)) {
      return res.status(400).json({ error: 'Formato de audio no soportado.' })
    }

    const model = readStringEnv('GEMINI_TRANSCRIBE_MODEL', readStringEnv('GEMINI_MODEL', DEFAULT_MODEL)).replace(
      /^models\//,
      ''
    )
    const url = `${GEMINI_API_BASE_URL}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), readNumberEnv('GEMINI_TIMEOUT_MS', 35000))

    let response: Response
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [
                { inlineData: { mimeType: mimeType.split(';')[0] || 'audio/webm', data: audioBase64 } },
                {
                  text: 'Transcribe este audio en espanol. Devuelve solo las palabras dichas, sin comillas ni comentarios. Si no hay habla, responde exactamente nada (cadena vacia).',
                },
              ],
            },
          ],
          generationConfig: {
            maxOutputTokens: 800,
            temperature: 0,
          },
        }),
      })
    } finally {
      clearTimeout(timeout)
    }

    if (!response.ok) {
      const errorText = await response.text()
      console.error('assistant-transcribe Gemini', response.status, errorText.slice(0, 400))
      return res.status(502).json({ error: 'No se pudo transcribir el dictado.' })
    }

    const data = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
    }
    const transcript = cleanTranscript(
      data.candidates?.[0]?.content?.parts
        ?.map((part) => part.text)
        .filter(Boolean)
        .join(' ') ?? ''
    )

    return res.status(200).json({ transcript })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return res.status(504).json({ error: 'La transcripcion tardo demasiado.' })
    }
    if (isTlsCertificateError(error)) {
      return res.status(502).json({ error: TLS_CERTIFICATE_USER_MESSAGE })
    }
    console.error('assistant-transcribe', error)
    return res.status(500).json({ error: 'Error inesperado al transcribir.' })
  }
}
