import { defineApiHandler, readRequestBody } from './_shared/http.js'
import { handlePilotAllowlist } from './_shared/assistantPilotAllowlistHandler.js'
import { handleR3Documents } from './_shared/assistantDocumentsHandler.js'
import { handleProactivePlanner } from './_shared/whatsappProactivePlannerHandler.js'
import { checkAssistantRateLimit, createServiceRoleClient, requireAssistantAuth } from './_shared/assistantAuth.js'
import { cancelPendingOp, confirmPendingOp, editActionEmailPendingOp, r2OptionsFromServerEnv } from './_shared/assistantOpsRuntime.js'
import { editR2PendingOp, isR2AgentTool } from './_shared/actions/r2Runtime.js'
import { editGooglePendingOp, listSessionGoogleOps } from './_shared/assistantGoogleTools.js'
import { searchLinkedWhatsappPeople } from './_shared/resolveCommunicationRecipient.js'
import { editWhatsappPendingOp } from './_shared/assistantCommunicationDrafts.js'
import { isCommunicationWriteTool } from '../src/features/ai-support/copilot/communicationTools.js'
import { isGoogleWriteTool } from '../src/features/ai-support/copilot/googleWorkspace.js'

const RATE_LIMIT = 30
const RATE_WINDOW_MS = 60_000

function readOp(req: { url?: string }): string {
  const url = req.url || ''
  const query = new URLSearchParams(url.includes('?') ? url.slice(url.indexOf('?') + 1) : '')
  return query.get('op')?.trim() || ''
}

export default defineApiHandler(async (req, res) => {
  const op = readOp(req)
  if (op === 'pilot-allowlist') return handlePilotAllowlist(req, res)
  if (op === 'proactive-planner') return handleProactivePlanner(req, res)
  if (op === 'r3-documents') return handleR3Documents(req, res)

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
      accessToken: auth.token,
    }

    if (req.method === 'GET') {
      const url = req.url || ''
      const query = new URLSearchParams(url.includes('?') ? url.slice(url.indexOf('?') + 1) : '')
      if (query.has('whatsapp_recipient')) {
        const items = await searchLinkedWhatsappPeople(actor.supabase, createServiceRoleClient, query.get('whatsapp_recipient') || '')
        return res.status(200).json({ items })
      }
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
      recipientName?: unknown
      recipientId?: unknown
      subject?: unknown
      body?: unknown
      title?: unknown
      start?: unknown
      end?: unknown
      fecha?: unknown
      responsableId?: unknown
      responsableHint?: unknown
      prioridad?: unknown
      titulo?: unknown
      contenido?: unknown
    }
    const action = typeof payload.action === 'string' ? payload.action : ''
    const opId = typeof payload.op_id === 'string' ? payload.op_id.trim() : ''
    if (!opId) return res.status(400).json({ error: 'Falta op_id.' })

    if (action === 'edit') {
      const { data: opRow, error: lookupError } = await actor.supabase
        .from('assistant_pending_ops')
        .select('tool')
        .eq('id', opId)
        .eq('usuario_id', actor.usuarioId)
        .maybeSingle()
      if (lookupError) throw new Error('DATABASE_ERROR: No se pudo consultar el borrador.')
      if (!opRow) return res.status(404).json({ error: 'No encontré ese borrador en tu cuenta.' })
      const tool = typeof opRow?.tool === 'string' ? opRow.tool : ''
      if (tool === 'notify_action_email' && typeof payload.body === 'string') {
        const proposal = await editActionEmailPendingOp(actor, opId, payload.body)
        return res.status(200).json({ status: 'pending', proposal })
      }
      if (isR2AgentTool(tool)) {
        const proposal = await editR2PendingOp(actor, opId, {
          fecha: typeof payload.fecha === 'string' ? payload.fecha : undefined,
          responsableId: typeof payload.responsableId === 'string' ? payload.responsableId : undefined,
          responsableHint: typeof payload.responsableHint === 'string' ? payload.responsableHint : undefined,
          prioridad: typeof payload.prioridad === 'string' ? payload.prioridad : undefined,
          titulo: typeof payload.titulo === 'string' ? payload.titulo : undefined,
          contenido: typeof payload.contenido === 'string' ? payload.contenido : undefined,
        })
        return res.status(200).json({ status: 'pending', proposal })
      }
      if (!isCommunicationWriteTool(tool) && !isGoogleWriteTool(tool)) {
        return res.status(400).json({
          error: 'VALIDATION_FAILED: Este tipo de operación no admite edición. Descártala y prepara una nueva.',
          code: 'VALIDATION_FAILED',
        })
      }
      const proposal = isCommunicationWriteTool(tool)
        ? await editWhatsappPendingOp(actor, opId, {
            recipientId: typeof payload.recipientId === 'string' ? payload.recipientId : undefined,
            recipientName: typeof payload.recipientName === 'string' ? payload.recipientName : undefined,
            body: typeof payload.body === 'string' ? payload.body : undefined,
          })
        : await editGooglePendingOp(actor, opId, {
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

    const result = await confirmPendingOp(actor, opId, { r2: r2OptionsFromServerEnv() })
    return res.status(200).json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo completar la operacion.'
    const code = /^([A-Z_]+):/.exec(message)?.[1]
    const conflict = /cambi[oó] despu[eé]s|expir[oó]|cancelada|en ejecuci[oó]n/i.test(message)
    const status = conflict ? 409
      : code === 'PERMISSION_DENIED' ? 403
        : code === 'RATE_LIMITED' ? 429
          : code === 'DATABASE_ERROR' || code === 'CONFIGURATION_ERROR' ? 500
            : code === 'PROVIDER_ERROR' ? 502
              : code === 'TIMEOUT' ? 504 : 400
    return res.status(status).json({ error: message.slice(0, 240), code })
  }
})
