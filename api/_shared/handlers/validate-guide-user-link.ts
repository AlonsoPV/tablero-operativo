/**
 * Valida una liga personal de Guía (público, sin JWT).
 */
import { checkAssistantRateLimit, createServiceRoleClient } from '../assistantAuth.js'
import { defineApiHandler, readHeader, readRequestBody } from '../http.js'
import { enableSystemCaCertificates } from '../enableSystemCa.js'
import { hashGuideToken, normalizeGuideLinkToken, validateGuideUserLink } from '../guideUserLinks.js'

export default defineApiHandler(async (req, res) => {
  enableSystemCaCertificates()
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Metodo no permitido. Usa POST.' })
  }

  const body = await readRequestBody(req)
  if (!body || typeof body !== 'object') {
    return res.status(400).json({ error: 'Solicitud invalida.' })
  }
  const payload = body as { token?: unknown; mark_opened?: unknown }
  const token = normalizeGuideLinkToken(typeof payload.token === 'string' ? payload.token : '')
  if (!token) {
    return res.status(400).json({ error: 'Falta el token.' })
  }

  const ip = readHeader(req, 'x-forwarded-for').split(',')[0]?.trim() || 'unknown'
  const rate = checkAssistantRateLimit({
    key: `guide-validate:${hashGuideToken(token).slice(0, 16)}:${ip}`,
    limit: 30,
    windowMs: 60_000,
  })
  if (rate.ok === false) {
    return res.status(429).json({ error: `Demasiados intentos. Espera ${rate.retryAfterSec}s.`, valid: false })
  }

  try {
    const supabase = createServiceRoleClient()
    const result = await validateGuideUserLink(supabase, {
      token,
      markOpened: payload.mark_opened !== false,
    })
    return res.status(200).json(result)
  } catch (error) {
    const status = typeof (error as { status?: number }).status === 'number' ? (error as { status: number }).status : 500
    const message = error instanceof Error ? error.message : 'No se pudo validar la liga.'
    return res.status(status).json({ error: message, valid: false })
  }
})

