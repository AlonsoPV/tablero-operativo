import { defineApiHandler, readRequestBody } from './_shared/http.js'
import { checkAssistantRateLimit, requireAssistantAuth } from './_shared/assistantAuth.js'
import { cancelPendingOp, confirmPendingOp } from './_shared/assistantOpsRuntime.js'
import { editGooglePendingOp, listSessionGoogleOps } from './_shared/assistantGoogleTools.js'

const RATE_LIMIT = 30
const RATE_WINDOW_MS = 60_000

export default defineApiHandler(async (req, res) => {
  try {
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

    const actor = {
      supabase: auth.supabase,
      usuarioId: auth.usuarioId,
      authUserId: auth.authUserId,
      rol: auth.rol,
    }

    if (req.method === 'GET') {
      const url = req.url || ''
      const query = new URLSearchParams(url.includes('?') ? url.slice(url.indexOf('?') + 1) : '')
      const sessionId = query.get('session_id')?.trim() || ''
      if (!sessionId) return res.status(400).json({ error: 'Falta session_id.' })
      const items = await listSessionGoogleOps(actor, sessionId)
      return res.status(200).json({ items })
    }

    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Metodo no permitido. Usa POST o GET.' })
    }

    const body = await readRequestBody(req)
    if (!body || typeof body !== 'object') {
      return res.status(400).json({ error: 'Solicitud invalida.' })
    }
    const payload = body as {
      action?: unknown
      op_id?: unknown
      subject?: unknown
      body?: unknown
      title?: unknown
      start?: unknown
      end?: unknown
    }
    const action = typeof payload.action === 'string' ? payload.action : ''
    const opId = typeof payload.op_id === 'string' ? payload.op_id.trim() : ''
    if (!opId) return res.status(400).json({ error: 'Falta op_id.' })

    if (action === 'edit') {
      const proposal = await editGooglePendingOp(actor, opId, {
        subject: typeof payload.subject === 'string' ? payload.subject : undefined,
        body: typeof payload.body === 'string' ? payload.body : undefined,
        title: typeof payload.title === 'string' ? payload.title : undefined,
        start: typeof payload.start === 'string' ? payload.start : undefined,
        end: typeof payload.end === 'string' ? payload.end : undefined,
      })
      return res.status(200).json({ status: 'pending', proposal })
    }
    if (action === 'cancel') {
      const result = await cancelPendingOp(actor, opId)
      return res.status(200).json(result)
    }
    if (action !== 'confirm') {
      return res.status(400).json({ error: 'Accion invalida. Usa confirm, cancel o edit.' })
    }

    const result = await confirmPendingOp(actor, opId)
    return res.status(200).json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo completar la operacion.'
    const conflict = /cambio despues|expiro|cancelada/i.test(message)
    return res.status(conflict ? 409 : 400).json({ error: message.slice(0, 240) })
  }
})
