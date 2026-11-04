import { defineApiHandler, readRequestBody } from './_shared/http'
import { checkAssistantRateLimit, requireAssistantAuth } from './_shared/assistantAuth'
import { cancelPendingOp, confirmPendingOp } from './_shared/assistantOpsRuntime'

const RATE_LIMIT = 30
const RATE_WINDOW_MS = 60_000

export default defineApiHandler(async (req, res) => {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Metodo no permitido. Usa POST.' })
    }

    const auth = await requireAssistantAuth(req, { requireAiModule: true })
    if (!auth.ok) return res.status(auth.status).json({ error: auth.error })

    const rate = checkAssistantRateLimit({
      key: `${auth.usuarioId}:assistant-ops`,
      limit: RATE_LIMIT,
      windowMs: RATE_WINDOW_MS,
    })
    if (rate.ok === false) {
      return res.status(429).json({
        error: `Demasiadas operaciones. Espera ${rate.retryAfterSec}s.`,
      })
    }

    const body = await readRequestBody(req)
    if (!body || typeof body !== 'object') {
      return res.status(400).json({ error: 'Solicitud invalida.' })
    }
    const payload = body as { action?: unknown; op_id?: unknown }
    const action = typeof payload.action === 'string' ? payload.action : ''
    const opId = typeof payload.op_id === 'string' ? payload.op_id.trim() : ''
    if (!opId) return res.status(400).json({ error: 'Falta op_id.' })
    if (action !== 'confirm' && action !== 'cancel') {
      return res.status(400).json({ error: 'Accion invalida. Usa confirm o cancel.' })
    }

    const actor = {
      supabase: auth.supabase,
      usuarioId: auth.usuarioId,
      authUserId: auth.authUserId,
      rol: auth.rol,
    }

    if (action === 'cancel') {
      const result = await cancelPendingOp(actor, opId)
      return res.status(200).json(result)
    }

    const result = await confirmPendingOp(actor, opId)
    return res.status(200).json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo completar la operacion.'
    const conflict = /cambio despues|expiro|cancelada/i.test(message)
    return res.status(conflict ? 409 : 400).json({ error: message.slice(0, 240) })
  }
})
