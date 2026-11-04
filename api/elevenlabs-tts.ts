/**
 * Proxy servidor a ElevenLabs TTS. Devuelve audioBase64 (mp3).
 * Secrets: ELEVENLABS_API_KEY, ELEVENLABS_VOICE_ID (opcionales: ELEVENLABS_MODEL_ID).
 * Requiere JWT de Asistente IA (área OKRS / Super Admin).
 */
import type { ServerResponse } from 'node:http'
import {
  asJsonResponse,
  readRequestBody,
  readStringEnv,
  type VercelRequestLike,
} from './_shared/http'
import { checkAssistantRateLimit, requireAssistantAuth } from './_shared/assistantAuth'

const MAX_TEXT_CHARS = 1200
const DEFAULT_MODEL = 'eleven_multilingual_v2'
const DEFAULT_VOICE = '21m00Tcm4TlvDq8ikWAM'
const RATE_LIMIT = 20
const RATE_WINDOW_MS = 60_000

export default async function handler(req: VercelRequestLike, serverRes: ServerResponse) {
  const res = asJsonResponse(serverRes)

  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Metodo no permitido. Usa POST.' })
    }

    const auth = await requireAssistantAuth(req, { requireAiModule: true })
    if (!auth.ok) {
      return res.status(auth.status).json({ error: auth.error })
    }

    const rate = checkAssistantRateLimit({
      key: `${auth.usuarioId}:elevenlabs-tts`,
      limit: RATE_LIMIT,
      windowMs: RATE_WINDOW_MS,
    })
    if (rate.ok === false) {
      return res.status(429).json({
        error: `Demasiadas solicitudes de voz. Espera ${rate.retryAfterSec}s.`,
      })
    }

    const apiKey = process.env.ELEVENLABS_API_KEY
    if (!apiKey) {
      return res.status(500).json({
        error: 'Falta configurar ELEVENLABS_API_KEY en variables de entorno del servidor.',
        code: 'missing_elevenlabs_key',
      })
    }

    const body = await readRequestBody(req)
    if (!body || typeof body !== 'object') {
      return res.status(400).json({ error: 'Solicitud invalida.' })
    }

    const text = typeof (body as { text?: unknown }).text === 'string'
      ? (body as { text: string }).text.trim().slice(0, MAX_TEXT_CHARS)
      : ''

    if (!text) {
      return res.status(400).json({ error: 'Debes enviar texto para sintetizar.' })
    }

    const voiceId = readStringEnv('ELEVENLABS_VOICE_ID', DEFAULT_VOICE)
    const modelId = readStringEnv('ELEVENLABS_MODEL_ID', DEFAULT_MODEL)
    const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
        'xi-api-key': apiKey,
      },
      body: JSON.stringify({
        text,
        model_id: modelId,
        voice_settings: {
          stability: 0.4,
          similarity_boost: 0.75,
        },
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('elevenlabs-tts error', response.status, errorText.slice(0, 400))
      return res.status(502).json({
        error: 'ElevenLabs no pudo sintetizar el audio.',
        code: 'elevenlabs_upstream',
      })
    }

    const buffer = Buffer.from(await response.arrayBuffer())
    return res.status(200).json({
      audioBase64: buffer.toString('base64'),
      mimeType: 'audio/mpeg',
      truncated: text.length >= MAX_TEXT_CHARS,
    })
  } catch (error) {
    console.error('elevenlabs-tts unexpected:', error)
    return res.status(500).json({
      error: 'Ocurrio un error inesperado al generar voz.',
    })
  }
}
