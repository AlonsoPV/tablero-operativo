/**
 * Emite un grant de consentimiento de corta vida para arrancar la voz por URL.
 * Publico (sin JWT). No basta con consent:true en el cliente.
 */
import { checkAssistantRateLimit, createServiceRoleClient } from '../assistantAuth.js'
import { defineApiHandler, readHeader, readRequestBody } from '../http.js'
import { enableSystemCaCertificates } from '../enableSystemCa.js'
import {
  GUIDE_GRANT_TTL_MS,
  hashGuideToken,
  issueGuideAccessGrant,
  normalizeGuideLinkToken,
  validateGuideUserLink,
} from '../guideUserLinks.js'

export default defineApiHandler(async (req, res) => {
  enableSystemCaCertificates()
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Metodo no permitido. Usa POST.' })
  }

  const body = await readRequestBody(req)
  if (!body || typeof body !== 'object') {
    return res.status(400).json({ error: 'Solicitud invalida.' })
  }
  const payload = body as {
    token?: unknown
    confirm_identity?: unknown
    consent?: unknown
  }
  const token = normalizeGuideLinkToken(typeof payload.token === 'string' ? payload.token : '')
  if (!token) {
    return res.status(400).json({ error: 'Falta el token.' })
  }
  if (payload.confirm_identity !== true || payload.consent !== true) {
    return res.status(400).json({
      error: 'Debes confirmar identidad y consentimiento para continuar.',
    })
  }

  const ip = readHeader(req, 'x-forwarded-for').split(',')[0]?.trim() || 'unknown'
  const rate = checkAssistantRateLimit({
    key: `guide-consent:${hashGuideToken(token).slice(0, 16)}:${ip}`,
    limit: 30,
    windowMs: 60_000,
  })
  if (rate.ok === false) {
    return res.status(429).json({ error: `Demasiados intentos. Espera ${rate.retryAfterSec}s.` })
  }

  try {
    const supabase = createServiceRoleClient()
    const validated = await validateGuideUserLink(supabase, { token, markOpened: true })
    const accessGrant = issueGuideAccessGrant({
      linkId: validated.link_id,
      usuarioId: validated.usuario_id,
      accessMode: validated.access_mode,
    })
    return res.status(200).json({
      ok: true,
      access_grant: accessGrant,
      access_mode: validated.access_mode,
      expires_in_seconds: Math.floor(GUIDE_GRANT_TTL_MS / 1000),
      link_id: validated.link_id,
      usuario_id: validated.usuario_id,
      user_name: validated.user_name,
      expires_at: validated.expires_at,
      duration_minutes: validated.duration_minutes,
    })
  } catch (error) {
    const status =
      typeof (error as { status?: number }).status === 'number' ? (error as { status: number }).status : 500
    const message = error instanceof Error ? error.message : 'No se pudo confirmar el consentimiento.'
    return res.status(status).json({ error: message, ok: false })
  }
})
