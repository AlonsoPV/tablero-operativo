/**
 * Estado, informe y WhatsApp de una entrevista abierta con liga personal.
 * Auth: el token de la liga (no se acepta un id de otra persona).
 */
import { createServiceRoleClient } from '../assistantAuth.js'
import { finalizeGuideInterview } from '../finalizeGuideInterview.js'
import type { GuideTranscriptTurn } from '../guideInterviewReport.js'
import { resolveGuideLinkOwner } from '../guideUserLinks.js'
import { shareGuideReport } from '../shareGuideReport.js'
import { defineApiHandler, readRequestBody } from '../http.js'

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
  const sessionSelect = 'id,usuario_id,provider_session_id,report_status,status,guide_link_id'
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
  } | null
  if (!session || session.usuario_id !== owner.usuario_id) {
    return res.status(404).json({ error: 'No hay una entrevista asociada a esta liga.' })
  }
  if (session.guide_link_id && session.guide_link_id !== owner.link_id) {
    return res.status(403).json({ error: 'Esta liga no corresponde a la entrevista.' })
  }

  if (action === 'finalize' || action === 'retry') {
    const result = await finalizeGuideInterview(supabase, {
      sessionId: session.id,
      callId: callId || session.provider_session_id || undefined,
      turns: asTurns(body?.messages),
      event: action === 'retry' ? 'retry' : 'client',
    })
    return res.status(200).json(publicPayload(result.status, result.journal))
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
  return res.status(200).json(publicPayload(String(status), journal))
})

function publicPayload(status: string, journal: Record<string, unknown> | null) {
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
  }
}
