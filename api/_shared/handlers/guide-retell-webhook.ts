/**
 * Webhook Retell para entrevistas de Guía.
 * Configurar en el agente: POST {APP}/api/guide-retell-webhook
 * Firma: HMAC-SHA256 del cuerpo con RETELL_API_KEY, header x-retell-signature.
 */
import { createServiceRoleClient } from '../assistantAuth.js'
import { finalizeGuideInterview } from '../finalizeGuideInterview.js'
import { retellCallEndedAt, turnsFromRetellCall, verifyRetellSignature } from '../guideInterviewReport.js'
import { defineApiHandler, readHeader, readStringEnv } from '../http.js'

export default defineApiHandler(async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Metodo no permitido.' })
  }

  const apiKey = readStringEnv('RETELL_API_KEY')
  const rawBody = typeof req.rawBody === 'string' ? req.rawBody : ''
  const signature = readHeader(req, 'x-retell-signature')
  if (!apiKey || !rawBody || !verifyRetellSignature(rawBody, apiKey, signature)) {
    return res.status(401).json({ error: 'Firma de Retell invalida.' })
  }

  const body = (req.body ?? {}) as { event?: unknown; call?: unknown }
  const eventName = typeof body.event === 'string' ? body.event : ''
  if (eventName !== 'call_ended' && eventName !== 'call_analyzed') {
    return res.status(200).json({ ok: true, ignored: eventName || 'unknown' })
  }

  const call = (body.call ?? {}) as {
    call_id?: unknown
    metadata?: unknown
  }
  const metadata = (call.metadata ?? {}) as { guide_session_id?: unknown; product?: unknown }
  if (metadata.product && metadata.product !== 'guide') {
    return res.status(200).json({ ok: true, ignored: 'other_product' })
  }
  const sessionId = typeof metadata.guide_session_id === 'string' ? metadata.guide_session_id : ''
  const callId = typeof call.call_id === 'string' ? call.call_id : ''
  if (!sessionId && !callId) {
    return res.status(200).json({ ok: true, ignored: 'no_session' })
  }

  try {
    const supabase = createServiceRoleClient()
    const result = await finalizeGuideInterview(supabase, {
      sessionId,
      callId,
      turns: turnsFromRetellCall(call),
      event: eventName,
      endedAt: retellCallEndedAt(call),
    })
    return res.status(200).json({ ok: true, status: result.status, already: result.already })
  } catch (error) {
    console.error('guide-retell-webhook', error instanceof Error ? error.message : error)
    return res.status(500).json({ error: 'No se pudo procesar la entrevista.' })
  }
})
