/**
 * Transcribe audio dictado (webm/mp4/ogg) a texto con Gemini.
 * Auth: Authorization Bearer (JWT Supabase) + módulo ai_assist.
 */
import {
  defineApiHandler,
  readNumberEnv,
  readRequestBody,
  readStringEnv,
} from '../http.js'
import { checkAssistantRateLimit, requireAssistantAuth } from '../assistantAuth.js'
import { enableSystemCaCertificates } from '../enableSystemCa.js'
import {
  DEFAULT_TRANSCRIBE_MODEL,
  transcribeAudioBase64WithGemini,
  validateAudioPayload,
} from '../audioTranscription.js'
import { isTlsCertificateError, TLS_CERTIFICATE_USER_MESSAGE } from '../tlsError.js'

const RATE_LIMIT = 25
const RATE_WINDOW_MS = 60_000

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
    const validation = validateAudioPayload({
      mimeType,
      base64Length: audioBase64.length,
    })
    if (!validation.ok) {
      const status = validation.code === 'audio_too_large' ? 413 : 400
      return res.status(status).json({ error: validation.message })
    }

    const result = await transcribeAudioBase64WithGemini({
      audioBase64,
      mimeType: validation.mimeType,
      apiKey,
      preferredModel: readStringEnv(
        'GEMINI_TRANSCRIBE_MODEL',
        readStringEnv('GEMINI_MODEL', DEFAULT_TRANSCRIBE_MODEL)
      ),
      timeoutMs: readNumberEnv('GEMINI_TIMEOUT_MS', 35000),
    })

    if (!result.ok) {
      return res.status(result.status).json({ error: result.message })
    }

    return res.status(200).json({ transcript: result.transcript })
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
})
