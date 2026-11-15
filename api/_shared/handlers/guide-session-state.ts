/**
 * Reloj de sesion para el conversation flow de Retell.
 * Nunca 404: si no hay fila, responde fase conversation para no tumbar la llamada.
 */
import { createServiceRoleClient } from '../assistantAuth.js'
import {
  clockStateFromSession,
  GUIDE_CLOCK_FALLBACK,
  sessionIdFromRetellBody,
} from '../guideSessionClock.js'
import { verifyRetellSignature } from '../guideInterviewReport.js'
import {
  defineApiHandler,
  readHeader,
  readRequestBody,
  readStringEnv,
  type VercelRequestLike,
} from '../http.js'

function authorized(req: VercelRequestLike) {
  const apiKey = readStringEnv('RETELL_API_KEY')
  const toolSecret = readStringEnv('GUIDE_RETELL_TOOL_SECRET')
  const signature = readHeader(req, 'x-retell-signature')
  const guideSecret = readHeader(req, 'x-guide-tool-secret')
  const rawBody = typeof req.rawBody === 'string' ? req.rawBody : ''
  if (apiKey && rawBody && verifyRetellSignature(rawBody, apiKey, signature)) return true
  if (toolSecret && guideSecret && guideSecret === toolSecret) return true
  const bearer = readHeader(req, 'authorization').replace(/^Bearer\s+/i, '').trim()
  if (toolSecret && bearer && bearer === toolSecret) return true
  return false
}

export default defineApiHandler(async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ ...GUIDE_CLOCK_FALLBACK, error: 'Metodo no permitido.' })
  }

  const body = (await readRequestBody(req)) as {
    session_id?: unknown
    args?: unknown
    arguments?: unknown
    call?: { metadata?: unknown; retell_llm_dynamic_variables?: unknown }
  } | null

  if (!authorized(req)) {
    return res.status(401).json({ ...GUIDE_CLOCK_FALLBACK, error: 'No autorizado.' })
  }

  const sessionId = sessionIdFromRetellBody(body)
  if (!sessionId) {
    console.info('guide-session-state', JSON.stringify({ found: false, reason: 'no_session_id' }))
    return res.status(200).json(GUIDE_CLOCK_FALLBACK)
  }

  try {
    const supabase = createServiceRoleClient()
    const full = await supabase
      .from('guide_sessions')
      .select('id,status,expires_at,provider,guide_link_id')
      .eq('id', sessionId)
      .maybeSingle()
    const row =
      full.error && /guide_link_id/i.test(full.error.message ?? '')
        ? await supabase
            .from('guide_sessions')
            .select('id,status,expires_at,provider')
            .eq('id', sessionId)
            .maybeSingle()
        : full
    const session = (row.data ?? null) as {
      id?: string
      status?: string | null
      expires_at?: string | null
      guide_link_id?: string | null
    } | null
    if (row.error || !session?.id) {
      console.info('guide-session-state', JSON.stringify({ session: sessionId, found: false }))
      return res.status(200).json(GUIDE_CLOCK_FALLBACK)
    }

    const state = clockStateFromSession(session)
    if (session.status === 'active' && state.phase === 'closing') {
      await supabase.from('guide_sessions').update({ status: 'closing' }).eq('id', session.id).eq('status', 'active')
    }
    if (state.remaining_seconds === 0 && ['active', 'closing'].includes(String(session.status))) {
      await supabase
        .from('guide_sessions')
        .update({
          status: 'completed',
          closed_at: new Date().toISOString(),
          close_reason: 'time_limit',
        })
        .eq('id', session.id)
        .in('status', ['active', 'closing'])
    }
    console.info(
      'guide-session-state',
      JSON.stringify({
        session: sessionId,
        invitation_id: session.guide_link_id ?? null,
        phase: state.phase,
        remaining_seconds: state.remaining_seconds,
        found: true,
      })
    )
    return res.status(200).json(state)
  } catch (error) {
    console.error('guide-session-state', error instanceof Error ? error.message : error)
    return res.status(200).json(GUIDE_CLOCK_FALLBACK)
  }
})
