/**
 * Estado, informe y WhatsApp de una entrevista abierta con liga personal.
 * Auth: el token de la liga (no se acepta un id de otra persona).
 */
import { createServiceRoleClient } from '../assistantAuth.js'
import { finalizeGuideInterview } from '../finalizeGuideInterview.js'
import {
  retellCallEndedAt,
  turnsFromRetellCall,
  type GuideTranscriptTurn,
} from '../guideInterviewReport.js'
import { resolveGuideLinkOwner } from '../guideUserLinks.js'
import { fetchRetellCall } from '../retellCallFetch.js'
import { shareGuideReport } from '../shareGuideReport.js'
import { defineApiHandler, readRequestBody } from '../http.js'
import { proposalFromPendingRow } from '../assistantGoogleTools.js'

const PUBLIC_JOURNAL =
  'id,usuario_id,topic,summary,learning,intention,reflection_question,user_words,agent_inferences,executive_report,created_at'

function asTurns(raw: unknown): GuideTranscriptTurn[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const row = item as { role?: unknown; content?: unknown }
      const role = row.role === 'assistant' || row.role === 'agent' ? 'assistant' : row.role === 'user' ? 'user' : null
      const content = typeof row.content === 'string' ? row.content.trim().slice(0, 8000) : ''
      if (!role || !content) return null
      return { role, content } satisfies GuideTranscriptTurn
    })
    .filter((turn): turn is GuideTranscriptTurn => Boolean(turn))
    .slice(0, 80)
}

export default defineApiHandler(async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metodo no permitido.' })
  const body = (await readRequestBody(req)) as {
    guide_token?: unknown
    action?: unknown
    call_id?: unknown
    messages?: unknown
    confirm?: unknown
  } | null
  const token = typeof body?.guide_token === 'string' ? body.guide_token.trim() : ''
  const action = typeof body?.action === 'string' ? body.action : 'status'
  if (!token) return res.status(400).json({ error: 'Falta la liga.' })

  let supabase: ReturnType<typeof createServiceRoleClient>
  try {
    supabase = createServiceRoleClient()
  } catch {
    return res.status(500).json({ error: 'Falta la configuracion del servidor.' })
  }

  let owner: { usuario_id: string; link_id: string }
  try {
    owner = await resolveGuideLinkOwner(supabase, token)
  } catch (error) {
    const status = typeof (error as { status?: number }).status === 'number' ? (error as { status: number }).status : 400
    return res.status(status).json({ error: error instanceof Error ? error.message : 'Liga invalida.' })
  }

  const callId = typeof body?.call_id === 'string' ? body.call_id.trim() : ''
  const sessionSelect =
    'id,usuario_id,provider_session_id,report_status,status,guide_link_id,started_at,updated_at,closed_at'
  const byCall = callId
    ? await supabase
        .from('guide_sessions')
        .select(sessionSelect)
        .eq('provider_session_id', callId)
        .eq('usuario_id', owner.usuario_id)
        .maybeSingle()
    : null
  const byLink =
    byCall?.data
      ? byCall
      : await supabase
          .from('guide_sessions')
          .select(sessionSelect)
          .eq('guide_link_id', owner.link_id)
          .eq('usuario_id', owner.usuario_id)
          .order('started_at', { ascending: false })
          .limit(1)
          .maybeSingle()
  const sessionResult = byCall?.error && /guide_link_id|report_status/i.test(byCall.error.message ?? '') ? null : byLink
  const session = (sessionResult?.data ?? null) as {
    id: string
    usuario_id: string
    provider_session_id?: string | null
    report_status?: string | null
    guide_link_id?: string | null
    started_at?: string | null
    updated_at?: string | null
    closed_at?: string | null
  } | null
  if (!session || session.usuario_id !== owner.usuario_id) {
    return res.status(404).json({ error: 'No hay una entrevista asociada a esta liga.' })
  }
  if (session.guide_link_id && session.guide_link_id !== owner.link_id) {
    return res.status(403).json({ error: 'Esta liga no corresponde a la entrevista.' })
  }

  const POLL_TIMEOUT_MS = 90_000
  const ageMs = (iso: string | null | undefined) => {
    const time = iso ? Date.parse(iso) : Number.NaN
    if (!Number.isFinite(time)) return 0
    return Math.max(0, Date.now() - time)
  }
  const stalePending =
    !['ready', 'insufficient', 'failed'].includes(String(session.report_status || '')) &&
    ageMs(session.updated_at || session.closed_at || session.started_at) >= POLL_TIMEOUT_MS

  if (action === 'finalize' || action === 'retry' || action === 'poll-timeout' || (action === 'status' && stalePending)) {
    const targetCallId = callId || session.provider_session_id || ''
    let turns = asTurns(body?.messages)
    let endedAt: string | null = null
    const shouldFetch =
      action === 'retry' ||
      action === 'poll-timeout' ||
      action === 'status' ||
      (action === 'finalize' && turns.length === 0 && Boolean(targetCallId))
    if (shouldFetch && targetCallId) {
      const call = await fetchRetellCall(targetCallId)
      if (call) {
        const fetched = turnsFromRetellCall(call)
        if (fetched.length >= turns.length) turns = fetched
        endedAt = retellCallEndedAt(call)
      }
    }
    const event =
      action === 'retry' || action === 'poll-timeout' || action === 'status' ? 'retry' : 'client'
    const started = Date.now()
    const result = await finalizeGuideInterview(supabase, {
      sessionId: session.id,
      callId: targetCallId || undefined,
      turns,
      event,
      endedAt,
    })
    console.info(
      'guide-link-report',
      JSON.stringify({
        action,
        invitation_id: owner.link_id,
        session: session.id,
        call_id: targetCallId || null,
        report_status: result.status,
        fetched: shouldFetch,
        ms: Date.now() - started,
      })
    )
    const communications = await loadSessionCommunications(supabase, session.id, owner.usuario_id)
    return res.status(200).json(publicPayload(result.status, result.journal, communications))
  }

  if (action === 'whatsapp') {
    const { data: journal } = await supabase
      .from('guide_journal_entries')
      .select(PUBLIC_JOURNAL)
      .eq('session_id', session.id)
      .eq('usuario_id', owner.usuario_id)
      .maybeSingle()
    if (!journal?.id || journal.usuario_id !== owner.usuario_id) {
      return res.status(409).json({ error: 'El informe todavia no esta disponible.' })
    }
    const share = await shareGuideReport(supabase, journal, body?.confirm === true)
    return res.status(200).json({
      ok: share.ok,
      code: share.code,
      preview: share.preview,
      phone: share.phone,
      sent: share.code === 'sent',
    })
  }

  const { data: journal } = await supabase
    .from('guide_journal_entries')
    .select(PUBLIC_JOURNAL)
    .eq('session_id', session.id)
    .eq('usuario_id', owner.usuario_id)
    .maybeSingle()
  const status =
    session.report_status ||
    (journal?.executive_report ? 'ready' : 'pending')
  const communications = await loadSessionCommunications(supabase, session.id, owner.usuario_id)
  return res.status(200).json(publicPayload(String(status), journal, communications))
})

async function loadSessionCommunications(
  supabase: ReturnType<typeof createServiceRoleClient>,
  sessionId: string,
  usuarioId: string
) {
  const { data } = await supabase
    .from('assistant_pending_ops')
    .select('id,tool,preview,status,expires_at,error_message')
    .eq('session_id', sessionId)
    .eq('usuario_id', usuarioId)
    .in('tool', [
      'gmail_prepare_send',
      'gmail_prepare_reply',
      'whatsapp_prepare_send',
      'calendar_prepare_event',
      'calendar_prepare_update',
      'calendar_prepare_cancel',
    ])
    .order('created_at', { ascending: true })
  return (data ?? []).map((row) => ({
    ...proposalFromPendingRow({
      id: String(row.id),
      tool: String(row.tool),
      preview: (row.preview ?? {}) as Record<string, unknown>,
      expires_at: String(row.expires_at),
      status: String(row.status),
    }),
    status: String(row.status),
    errorMessage: typeof row.error_message === 'string' ? row.error_message : null,
  }))
}

function publicPayload(
  status: string,
  journal: Record<string, unknown> | null,
  communications: unknown[] = []
) {
  return {
    report_status: status,
    entry_id: typeof journal?.id === 'string' ? journal.id : null,
    topic: journal?.topic ?? null,
    summary: journal?.summary ?? null,
    learning: journal?.learning ?? null,
    intention: journal?.intention ?? null,
    reflection_question: journal?.reflection_question ?? null,
    user_words: journal?.user_words ?? null,
    agent_inferences: journal?.agent_inferences ?? null,
    executive_report: journal?.executive_report ?? null,
    created_at: journal?.created_at ?? null,
    communications,
  }
}
