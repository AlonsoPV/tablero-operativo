import type { SupabaseClient } from '@supabase/supabase-js'
import { extractJsonObject, generateGuideText, GUIDE_REFLECTION_PROMPT } from '../guide-chat.js'
import { loadGuideBoardContext } from './guideBoardContext.js'
import {
  decideReportAction,
  insufficientExecutiveReport,
  transcriptDepth,
  type GuideReportStatus,
  type GuideTranscriptTurn,
} from './guideInterviewReport.js'
import {
  formatExecutiveReport,
  inferGuideWorkIntent,
  parseExecutiveReport,
  parseGuideWorkDrafts,
  serializePendingWork,
  withWorkInInterpretation,
} from './guideWork.js'
import { readNumberEnv } from './http.js'

const JOURNAL_BASE =
  'id,session_id,usuario_id,topic,summary,learning,intention,reflection_question,user_words,agent_inferences,created_at,updated_at'
const JOURNAL_FULL = `${JOURNAL_BASE},executive_report,created_work`

type SessionRow = {
  id: string
  usuario_id: string
  provider: string
  provider_session_id: string | null
  status: string
  guide_link_id?: string | null
  report_status?: GuideReportStatus | null
  report_error?: string | null
  updated_at?: string
  started_at?: string
  closed_at?: string | null
}

export type FinalizeGuideInterviewResult = {
  status: GuideReportStatus | 'missing'
  journal: Record<string, unknown> | null
  already: boolean
}

function missingColumn(error: { message?: string } | null | undefined, column: string) {
  return new RegExp(column, 'i').test(error?.message ?? '')
}

function ageMs(iso: string | undefined) {
  const time = iso ? new Date(iso).getTime() : 0
  if (!Number.isFinite(time) || time <= 0) return 0
  return Math.max(0, Date.now() - time)
}

async function loadJournal(supabase: SupabaseClient, sessionId: string) {
  const full = await supabase.from('guide_journal_entries').select(JOURNAL_FULL).eq('session_id', sessionId).maybeSingle()
  if (full.error && missingColumn(full.error, 'executive_report|created_work')) {
    return supabase.from('guide_journal_entries').select(JOURNAL_BASE).eq('session_id', sessionId).maybeSingle()
  }
  return full
}

async function saveMessages(supabase: SupabaseClient, sessionId: string, turns: GuideTranscriptTurn[]) {
  if (turns.length === 0) return
  const { count } = await supabase
    .from('guide_messages')
    .select('id', { count: 'exact', head: true })
    .eq('session_id', sessionId)
  if ((count ?? 0) >= turns.length) return
  if ((count ?? 0) > 0) {
    await supabase.from('guide_messages').delete().eq('session_id', sessionId)
  }
  const rows = turns.map((turn, index) => ({
    session_id: sessionId,
    sequence: index + 1,
    role: turn.role,
    content: turn.content.slice(0, 8000),
  }))
  const { error } = await supabase.from('guide_messages').insert(rows)
  if (error) console.error('guide interview messages', error.message)
}

async function setReportStatus(
  supabase: SupabaseClient,
  sessionId: string,
  status: GuideReportStatus,
  errorText: string | null,
  close: boolean
) {
  const patch: Record<string, unknown> = {
    report_status: status,
    report_error: errorText,
  }
  if (close) {
    patch.status = 'completed'
    patch.closed_at = new Date().toISOString()
    patch.close_reason = 'user_requested'
  }
  const updated = await supabase.from('guide_sessions').update(patch).eq('id', sessionId)
  if (updated.error && missingColumn(updated.error, 'report_status|report_error')) {
    if (!close) return
    await supabase
      .from('guide_sessions')
      .update({
        status: 'completed',
        closed_at: new Date().toISOString(),
        close_reason: 'user_requested',
      })
      .eq('id', sessionId)
      .in('status', ['active', 'closing'])
  }
}

function userWords(turns: GuideTranscriptTurn[]) {
  return turns
    .filter((turn) => turn.role === 'user')
    .map((turn) => turn.content.trim())
    .filter(Boolean)
    .join(' ')
    .slice(0, 1000)
}

export async function finalizeGuideInterview(
  supabase: SupabaseClient,
  input: {
    sessionId?: string | null
    callId?: string | null
    turns?: GuideTranscriptTurn[]
    event: 'call_ended' | 'call_analyzed' | 'client' | 'retry'
  }
): Promise<FinalizeGuideInterviewResult> {
  const loadSession = async (column: 'id' | 'provider_session_id', value: string) => {
    const full = await supabase
      .from('guide_sessions')
      .select('id,usuario_id,provider,provider_session_id,status,guide_link_id,report_status,report_error,updated_at,started_at,closed_at')
      .eq(column, value)
      .maybeSingle()
    if (!full.error) return (full.data as SessionRow | null) ?? null
    if (!missingColumn(full.error, 'guide_link_id|report_status|report_error')) return null
    const base = await supabase
      .from('guide_sessions')
      .select('id,usuario_id,provider,provider_session_id,status,updated_at,started_at,closed_at')
      .eq(column, value)
      .maybeSingle()
    return (base.data as SessionRow | null) ?? null
  }

  let session: SessionRow | null = input.sessionId ? await loadSession('id', input.sessionId) : null
  if (!session && input.callId) session = await loadSession('provider_session_id', input.callId)
  if (!session || session.provider !== 'retell') {
    return { status: 'missing', journal: null, already: false }
  }

  const existing = await loadJournal(supabase, session.id)
  const journal = (existing.data as Record<string, unknown> | null) ?? null
  const hasReport = Boolean(journal && typeof journal.executive_report === 'string' && journal.executive_report.trim())
  const current = (session.report_status ?? (hasReport ? 'ready' : null)) as GuideReportStatus | null
  const turns = input.turns ?? []
  if (turns.length > 0 && current !== 'ready') await saveMessages(supabase, session.id, turns)

  const decision = decideReportAction({
    event: input.event,
    current,
    depth: transcriptDepth(turns),
    hasJournal: hasReport,
    processingAgeMs: ageMs(session.updated_at),
  })

  if (decision === 'return_existing') {
    return { status: current === 'insufficient' ? 'insufficient' : 'ready', journal, already: true }
  }
  if (decision === 'busy' || decision === 'wait') {
    if (input.event === 'call_ended') {
      await setReportStatus(supabase, session.id, 'pending', null, true)
    }
    return { status: 'pending', journal, already: false }
  }

  if (decision === 'insufficient') {
    const words = userWords(turns)
    const executive = insufficientExecutiveReport(words)
    const payload = {
      session_id: session.id,
      usuario_id: session.usuario_id,
      topic: 'Entrevista breve',
      summary: 'No hubo informacion suficiente para un informe consultivo.',
      learning: null,
      intention: null,
      reflection_question: null,
      user_words: words || null,
      agent_inferences: 'Sin inferencias. La entrevista no aporta base para una hipotesis.',
      executive_report: executive,
      created_work: [],
      updated_at: new Date().toISOString(),
    }
    const saved = await supabase
      .from('guide_journal_entries')
      .upsert(payload, { onConflict: 'session_id' })
      .select(JOURNAL_FULL)
      .maybeSingle()
    await setReportStatus(supabase, session.id, 'insufficient', null, true)
    return { status: 'insufficient', journal: (saved.data as Record<string, unknown> | null) ?? payload, already: false }
  }

  await setReportStatus(supabase, session.id, 'processing', null, true)

  const transcript = turns.map((turn) => `${turn.role === 'user' ? 'Usuario' : 'Guia'}: ${turn.content}`).join('\n')
  let boardContext = ''
  try {
    boardContext = await loadGuideBoardContext(supabase, 2400)
  } catch (error) {
    console.error('guide interview board', error)
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 28000)
  try {
    const now = new Date()
    const today = now.toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' })
    const raw = await generateGuideText(
      GUIDE_REFLECTION_PROMPT,
      [
        `Hoy es ${today} (America/Mexico_City).`,
        boardContext || 'Contexto del tablero: no disponible.',
        '',
        transcript,
        '',
        inferGuideWorkIntent(transcript) === 'create'
          ? 'Hubo un pendiente explicito. Genera actionDrafts solo con lo dicho.'
          : 'Genera el reporte ejecutivo solo con lo dicho. Si falta base para una conclusion, dilo.',
        'Separa lo que dijo la persona de lo que infieres. No inventes cifras, responsables ni acuerdos.',
      ].join('\n'),
      readNumberEnv('GUIDE_CLOSE_MAX_TOKENS', 1600),
      controller.signal
    )
    let reflection: Record<string, unknown> = {}
    try {
      reflection = extractJsonObject(raw) as Record<string, unknown>
    } catch {
      reflection = {
        topic: 'Entrevista con Guia',
        summary: 'Se conservo la conversacion, pero el informe estructurado no pudo redactarse.',
      }
    }
    const drafts = parseGuideWorkDrafts(reflection.actionDrafts)
    const pending = serializePendingWork(drafts)
    const executive = formatExecutiveReport(
      parseExecutiveReport(reflection.executiveReport ?? reflection.executive_report),
      {
        summary: typeof reflection.summary === 'string' ? reflection.summary : null,
        learning: typeof reflection.learning === 'string' ? reflection.learning : null,
        intention: typeof reflection.intention === 'string' ? reflection.intention : null,
      },
      [],
      drafts
    )
    const payload = {
      session_id: session.id,
      usuario_id: session.usuario_id,
      topic: String(reflection.topic ?? '').slice(0, 200) || null,
      summary: String(reflection.summary ?? '').slice(0, 2000) || null,
      learning: String(reflection.learning ?? '').slice(0, 1000) || null,
      intention: String(reflection.intention ?? '').slice(0, 1000) || null,
      reflection_question: String(reflection.reflection_question ?? '').slice(0, 500) || null,
      user_words: String(reflection.user_words ?? userWords(turns)).slice(0, 1000) || null,
      agent_inferences: withWorkInInterpretation(
        typeof reflection.agent_inferences === 'string' ? reflection.agent_inferences : '',
        []
      ),
      executive_report: executive,
      created_work: pending,
      updated_at: new Date().toISOString(),
    }
    const saved = await supabase
      .from('guide_journal_entries')
      .upsert(payload, { onConflict: 'session_id' })
      .select(JOURNAL_FULL)
      .maybeSingle()
    if (saved.error) {
      await setReportStatus(supabase, session.id, 'failed', 'journal', false)
      console.error('guide interview journal', saved.error.message)
      return { status: 'failed', journal: null, already: false }
    }
    await setReportStatus(supabase, session.id, 'ready', null, true)
    return { status: 'ready', journal: (saved.data as Record<string, unknown> | null) ?? payload, already: false }
  } catch (error) {
    console.error('guide interview generate', error instanceof Error ? error.message : error)
    await setReportStatus(supabase, session.id, 'failed', 'generate', false)
    return { status: 'failed', journal: null, already: false }
  } finally {
    clearTimeout(timeout)
  }
}
