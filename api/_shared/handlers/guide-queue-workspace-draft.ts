/**
 * Custom function de Retell: encola / actualiza / cancela borradores de correo/WhatsApp/evento.
 * No envia nada. Al colgar, finalizeGuideInterview rellena el borrador.
 * La identidad sale de guide_sessions, no de metadata.usuario_id del modelo.
 */
import { createServiceRoleClient } from '../assistantAuth.js'
import { defineApiHandler, readHeader, readRequestBody, readStringEnv } from '../http.js'
import { verifyRetellSignature } from '../guideInterviewReport.js'
import {
  canQueueCommunicationDraft,
  effectiveInviteAccessMode,
  isGuideWriteAllowed,
  normalizeGuideAccessMode,
} from '../guideUserLinks.js'
import { normalizeCommunicationChannel } from '../../../src/features/ai-support/copilot/communicationTools.js'
import {
  mutateVoiceWorkspaceDraft,
  normalizeVoiceDraftAction,
} from '../workspaceDraftVoice.js'

type RetellCall = {
  call_id?: unknown
  metadata?: unknown
}

function asString(value: unknown, max = 400) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

export default defineApiHandler(async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Metodo no permitido.' })
  }

  const apiKey = readStringEnv('RETELL_API_KEY')
  const rawBody = typeof req.rawBody === 'string' ? req.rawBody : ''
  const signature = readHeader(req, 'x-retell-signature')
  if (!apiKey) {
    return res.status(503).json({ error: 'Falta RETELL_API_KEY.' })
  }
  if (!rawBody || !verifyRetellSignature(rawBody, apiKey, signature)) {
    return res.status(401).json({ error: 'Firma de Retell invalida.' })
  }

  const body = (await readRequestBody(req)) as {
    name?: unknown
    args?: unknown
    arguments?: unknown
    call?: RetellCall
    tool_call_id?: unknown
    id?: unknown
  } | null
  if (!body || typeof body !== 'object') {
    return res.status(400).json({ error: 'Solicitud invalida.' })
  }

  const call = (body.call ?? {}) as RetellCall
  const metadata = (call.metadata ?? {}) as {
    guide_session_id?: unknown
    usuario_id?: unknown
    product?: unknown
  }
  if (metadata.product && metadata.product !== 'guide') {
    return res.status(200).json({ result: 'Ignorado: no es una llamada de Guia.' })
  }

  const sessionId = asString(metadata.guide_session_id, 80)
  if (!sessionId) {
    return res.status(200).json({
      result:
        'No pude anotar el borrador porque falta la sesion. Sigue la conversacion; no afirmo que se envio. ¿Lo reintentamos?',
    })
  }

  const args = (
    body.args && typeof body.args === 'object'
      ? body.args
      : body.arguments && typeof body.arguments === 'object'
        ? body.arguments
        : body
  ) as Record<string, unknown>

  const action = normalizeVoiceDraftAction(args.action)
  const channel = normalizeCommunicationChannel(args.channel || args.type)
  const typeFromLegacy = asString(args.type, 12).toLowerCase()
  const resolvedChannel =
    channel === 'email' && (typeFromLegacy === 'event' || typeFromLegacy === 'calendar')
      ? 'event'
      : channel

  const purpose = asString(args.purpose, 500)
  const attendees = Array.isArray(args.attendees)
    ? args.attendees.map((item) => String(item).trim()).filter(Boolean)
    : asString(args.attendees, 300)
      ? asString(args.attendees, 300)
          .split(/[,;]+/)
          .map((item) => item.trim())
          .filter(Boolean)
      : undefined

  try {
    const supabase = createServiceRoleClient()
    let sessionQuery = await supabase
      .from('guide_sessions')
      .select('id,usuario_id,provider,status,guide_link_id,access_mode')
      .eq('id', sessionId)
      .maybeSingle()
    if (sessionQuery.error && /access_mode|guide_link_id/i.test(sessionQuery.error.message ?? '')) {
      sessionQuery = await supabase
        .from('guide_sessions')
        .select('id,usuario_id,provider,status')
        .eq('id', sessionId)
        .maybeSingle()
    }
    const session = sessionQuery.data as {
      id?: string
      usuario_id?: string
      provider?: string
      status?: string
      guide_link_id?: string | null
      access_mode?: string | null
    } | null
    if (sessionQuery.error || !session?.id || session.provider !== 'retell' || !session.usuario_id) {
      return res.status(200).json({
        result: 'No pude asociar el borrador a la sesion. No afirmo que se envio. ¿Lo reintentamos?',
      })
    }
    if (session.status !== 'active' && session.status !== 'closing') {
      return res.status(200).json({
        result: 'La sesion de voz ya no esta abierta. No anote el borrador.',
      })
    }

    let accessMode = normalizeGuideAccessMode(session.access_mode)
    if (!session.access_mode && session.guide_link_id) {
      accessMode = effectiveInviteAccessMode('read')
    }
    if (!session.access_mode && !session.guide_link_id) accessMode = 'propose'
    if (session.guide_link_id) accessMode = effectiveInviteAccessMode(session.access_mode || accessMode)

    const isComm =
      resolvedChannel === 'email' || resolvedChannel === 'whatsapp' || resolvedChannel === 'both'
    if (isComm) {
      if (!canQueueCommunicationDraft(accessMode)) {
        return res.status(200).json({
          result: 'No puedo dejar borradores de comunicacion en este modo. No inventes que se envio.',
        })
      }
    } else if (!isGuideWriteAllowed(accessMode)) {
      return res.status(200).json({
        result:
          'Esta invitacion es de solo lectura. No puedo dejar borradores de calendario. No inventes que se envio.',
      })
    }

    const usuarioId = String(session.usuario_id)
    const { data: usuario, error } = await supabase
      .from('usuarios')
      .select('id,user_id,rol,activo')
      .eq('id', usuarioId)
      .maybeSingle()
    if (error || !usuario?.id || usuario.activo === false || !usuario.user_id) {
      return res.status(200).json({
        result: 'No pude anotar el borrador para este usuario. ¿Lo reintentamos?',
      })
    }

    const actor = {
      supabase,
      usuarioId,
      authUserId: String(usuario.user_id),
      rol: typeof usuario.rol === 'string' ? usuario.rol : null,
    }

    const toolCallId =
      asString(args.idempotency_key, 160) ||
      asString(body.tool_call_id, 160) ||
      asString(body.id, 160) ||
      undefined

    const result = await mutateVoiceWorkspaceDraft(actor, {
      action,
      channel: resolvedChannel,
      purpose,
      recipient: asString(args.recipient, 160) || undefined,
      utteredAt: asString(args.uttered_at, 40) || new Date().toISOString(),
      timeAnchor: asString(args.time_anchor, 80) || undefined,
      attendees,
      sessionId,
      pendingOpId: asString(args.pending_op_id, 80) || undefined,
      idempotencyKey: toolCallId,
    })

    return res.status(200).json({
      result: result.spoken,
      pending_op_ids: result.pending_op_ids,
      pending_op_id: result.pending_op_id,
      action: result.action,
      ok: result.ok,
    })
  } catch (error) {
    console.error('guide-queue-workspace-draft', error instanceof Error ? error.message : error)
    return res.status(200).json({
      result: 'No pude guardar el borrador ahora. No afirmo que se haya enviado. ¿Lo reintentamos?',
      ok: false,
    })
  }
})
