/**
 * Valida una liga personal de Guía (público, sin JWT).
 */
import { defineApiHandler, readRequestBody } from './_shared/http.js'
import { createServiceRoleClient } from './_shared/assistantAuth.js'
import { enableSystemCaCertificates } from './_shared/enableSystemCa.js'
import { validateGuideUserLink } from './_shared/guideUserLinks.js'

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
  const token = typeof payload.token === 'string' ? payload.token : ''
  if (!token.trim()) {
    return res.status(400).json({ error: 'Falta el token.' })
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
