import { supabase } from '@/lib/supabase/client'
import type {
  GuideChatCloseResponse,
  GuideChatTurnResponse,
  GuideCloseReason,
  GuideCompactMessage,
  GuideCreatedWork,
  GuideJournalEntry,
  GuideMessage,
  GuideRetellWebCallResponse,
  GuideSession,
} from '@/features/guide/types'

const SESSION_SELECT =
  'id,usuario_id,provider,provider_session_id,status,started_at,expires_at,closed_at,close_reason,created_at,updated_at'
const MESSAGE_SELECT = 'id,session_id,sequence,role,content,created_at'
const JOURNAL_SELECT_BASE =
  'id,session_id,usuario_id,topic,summary,learning,intention,reflection_question,user_words,agent_inferences,created_at,updated_at'
const JOURNAL_SELECT = `${JOURNAL_SELECT_BASE},executive_report,created_work`

/** 15 min menos 1 s para no chocar el CHECK `expires_at <= started_at + 15 minutes`. */
const SESSION_MS = 15 * 60 * 1000 - 1000
const LOCAL_PREFIX = 'local-'
const LOCAL_STORAGE_KEY = 'tablero.guide.local-session'

type LocalGuideState = {
  session: GuideSession
  messages: GuideMessage[]
}

function isMissingGuideTable(error: { message?: string; code?: string } | null | undefined) {
  const message = error?.message ?? ''
  const code = error?.code ?? ''
  return (
    code === 'PGRST205' ||
    code === '42P01' ||
    /Could not find the table ['"]?public\.guide_/i.test(message) ||
    /relation ['"]?public\.guide_/i.test(message)
  )
}

function guideErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    if (isMissingGuideTable({ message: error.message })) {
      return 'Faltan las tablas de Guia en este proyecto de Supabase. Aplica supabase/migrations/20261101120000_create_guide_companion.sql.'
    }
    return error.message
  }
  if (error && typeof error === 'object') {
    const payload = error as { message?: unknown; code?: unknown }
    const message = typeof payload.message === 'string' ? payload.message : ''
    const code = typeof payload.code === 'string' ? payload.code : ''
    if (isMissingGuideTable({ message, code })) {
      return 'Faltan las tablas de Guia en este proyecto de Supabase. Aplica supabase/migrations/20261101120000_create_guide_companion.sql.'
    }
    if (message) return message
  }
  return fallback
}

function throwGuideError(error: unknown, fallback: string): never {
  throw new Error(guideErrorMessage(error, fallback))
}

function isLocalSessionId(sessionId: string) {
  return sessionId.startsWith(LOCAL_PREFIX)
}

function isMissingJournalExtraCols(error: { message?: string } | null | undefined) {
  return /executive_report|created_work/i.test(error?.message ?? '')
}

function normalizeCreatedWork(raw: unknown): GuideCreatedWork[] {
  let value: unknown = raw
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value) as unknown
    } catch {
      return []
    }
  }
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const row = item as Record<string, unknown>
    const title = typeof row.title === 'string' ? row.title.trim() : ''
    if (!title) return []
    const id = typeof row.id === 'string' ? row.id : ''
    const pending = row.pending === true || (!id && row.pending !== false && typeof row.error !== 'string')
    const priorityRaw = typeof row.priority === 'string' ? row.priority : ''
    const priority: GuideCreatedWork['priority'] = /p1|alta|critic/i.test(priorityRaw)
      ? 'P1_Alta'
      : /p3|baja/i.test(priorityRaw)
        ? 'P3_Baja'
        : priorityRaw
          ? 'P2_Media'
          : undefined
    return [
      {
        kind: row.kind === 'initiative' ? 'initiative' : 'action',
        id,
        title,
        keyResultTitle: typeof row.keyResultTitle === 'string' ? row.keyResultTitle : null,
        alreadyExisted: row.alreadyExisted === true,
        error: typeof row.error === 'string' ? row.error : undefined,
        pending,
        dueDateHint: typeof row.dueDateHint === 'string' ? row.dueDateHint : null,
        description: typeof row.description === 'string' ? row.description : undefined,
        objective: typeof row.objective === 'string' ? row.objective : undefined,
        evidenceExpected: typeof row.evidenceExpected === 'string' ? row.evidenceExpected : undefined,
        priority,
        activities: Array.isArray(row.activities)
          ? row.activities.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
          : undefined,
        ownerHint: typeof row.ownerHint === 'string' ? row.ownerHint : null,
      },
    ]
  })
}

function normalizeJournal(row: GuideJournalEntry): GuideJournalEntry {
  return {
    ...row,
    executive_report: typeof row.executive_report === 'string' ? row.executive_report : row.executive_report ?? null,
    created_work: normalizeCreatedWork(row.created_work),
  }
}

function readLocalState(): LocalGuideState | null {
  if (typeof sessionStorage === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(LOCAL_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as LocalGuideState
    if (!parsed?.session?.id || !Array.isArray(parsed.messages)) return null
    return parsed
  } catch {
    return null
  }
}

function writeLocalState(state: LocalGuideState) {
  if (typeof sessionStorage === 'undefined') return
  sessionStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(state))
}

function clearLocalState() {
  if (typeof sessionStorage === 'undefined') return
  sessionStorage.removeItem(LOCAL_STORAGE_KEY)
}

function createLocalSession(usuarioId: string): GuideSession {
  const startedAt = new Date()
  const expiresAt = new Date(startedAt.getTime() + SESSION_MS)
  const iso = startedAt.toISOString()
  return {
    id: `${LOCAL_PREFIX}${crypto.randomUUID()}`,
    usuario_id: usuarioId,
    provider: 'text',
    provider_session_id: null,
    status: 'active',
    started_at: iso,
    expires_at: expiresAt.toISOString(),
    closed_at: null,
    close_reason: null,
    created_at: iso,
    updated_at: iso,
  }
}

async function authHeaders() {
  const { data, error } = await supabase.auth.getSession()
  if (error) {
    const message = error.message.toLowerCase()
    if (message.includes('refresh token') || message.includes('invalid jwt')) {
      throw new Error('Tu sesion expiro. Cierra sesion e inicia de nuevo.')
    }
    throw error
  }
  const token = data.session?.access_token
  if (!token) throw new Error('Debes iniciar sesion para usar Guia.')
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  }
}

function compactMessages(messages: GuideMessage[]) {
  return messages.map((message) => ({
    sequence: message.sequence,
    role: message.role,
    content: message.content,
  }))
}

export const guideService = {
  isLocalSession(sessionId: string) {
    return isLocalSessionId(sessionId)
  },

  remainingSeconds(session: Pick<GuideSession, 'expires_at'>): number {
    const ends = new Date(session.expires_at).getTime()
    if (!Number.isFinite(ends)) return 0
    return Math.max(0, Math.floor((ends - Date.now()) / 1000))
  },

  async getOpenSession(usuarioId: string): Promise<GuideSession | null> {
    const { data, error } = await supabase
      .from('guide_sessions')
      .select(SESSION_SELECT)
      .eq('usuario_id', usuarioId)
      .in('status', ['active', 'closing'])
      .maybeSingle()

    if (error) {
      if (isMissingGuideTable(error)) {
        const local = readLocalState()
        if (local && local.session.usuario_id === usuarioId && ['active', 'closing'].includes(local.session.status)) {
          if (this.remainingSeconds(local.session) > 0) return local.session
          clearLocalState()
        }
        return null
      }
      throwGuideError(error, 'No se pudo cargar la sesion de Guia.')
    }

    const session = (data as GuideSession | null) ?? null
    if (!session) {
      const local = readLocalState()
      if (local && local.session.usuario_id === usuarioId && ['active', 'closing'].includes(local.session.status)) {
        if (this.remainingSeconds(local.session) > 0) return local.session
        clearLocalState()
      }
      return null
    }

    if (this.remainingSeconds(session) <= 0) {
      try {
        await this.abandonSession(session.id)
      } catch {
        /* no bloquear el inicio de una sesion nueva */
      }
      return null
    }

    // El access_token de Retell caduca (~30 s) y no se puede reanudar al recargar.
    if (session.provider === 'retell') {
      try {
        await this.abandonSession(session.id)
      } catch {
        /* no bloquear el inicio de una sesion nueva */
      }
      return null
    }

    return session
  },

  async startSession(usuarioId: string, opts?: { replaceActive?: boolean }): Promise<GuideSession> {
    const open = await this.getOpenSession(usuarioId)
    if (open) {
      const left = this.remainingSeconds(open)
      if (!opts?.replaceActive && left >= 60) return open
      await this.abandonSession(open.id)
    }

    const startedAt = new Date()
    const expiresAt = new Date(startedAt.getTime() + SESSION_MS)
    const { data, error } = await supabase
      .from('guide_sessions')
      .insert({
        usuario_id: usuarioId,
        provider: 'text',
        status: 'active',
        started_at: startedAt.toISOString(),
        expires_at: expiresAt.toISOString(),
      })
      .select(SESSION_SELECT)
      .single()

    if (error) {
      if (isMissingGuideTable(error)) {
        const session = createLocalSession(usuarioId)
        writeLocalState({ session, messages: [] })
        return session
      }
      throwGuideError(error, 'No se pudo iniciar Guia.')
    }

    clearLocalState()
    return data as GuideSession
  },

  async createRetellWebCall(opts?: {
    replaceActive?: boolean
    intent?: 'consult' | 'create'
    guideToken?: string
    consent?: boolean
  }): Promise<GuideRetellWebCallResponse> {
    const token = opts?.guideToken?.trim() || ''
    const headers = token
      ? { 'Content-Type': 'application/json' }
      : await authHeaders()
    const response = await fetch('/api/guide-retell-web-call', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        replace_active: opts?.replaceActive ?? true,
        intent: opts?.intent === 'create' ? 'create' : 'consult',
        ...(token
          ? {
              guide_token: token,
              consent: opts?.consent === true,
            }
          : {}),
      }),
    })
    const payload = (await response.json().catch(() => ({}))) as GuideRetellWebCallResponse & {
      error?: string
    }
    if (!response.ok) {
      throw new Error(payload.error || 'No se pudo iniciar la llamada de Guia.')
    }
    if (!payload.access_token || !payload.session?.id) {
      throw new Error('Retell no devolvio una sesion usable.')
    }
    return payload
  },

  async createUserLink(usuarioId: string, expiresInDays = 30) {
    const headers = await authHeaders()
    const response = await fetch('/api/create-guide-user-link', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        usuario_id: usuarioId,
        expires_in_days: expiresInDays,
        source: 'app',
      }),
    })
    const payload = (await response.json().catch(() => ({}))) as {
      link?: string
      expires_at?: string
      usuario_id?: string
      user_name?: string
      error?: string
    }
    if (!response.ok || !payload.link) {
      throw new Error(payload.error || 'No se pudo crear la liga personal.')
    }
    return {
      link: payload.link,
      expires_at: payload.expires_at ?? '',
      usuario_id: payload.usuario_id ?? usuarioId,
      user_name: payload.user_name ?? '',
    }
  },

  async validateUserLink(token: string, markOpened = true) {
    const response = await fetch('/api/validate-guide-user-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, mark_opened: markOpened }),
    })
    const payload = (await response.json().catch(() => ({}))) as {
      valid?: boolean
      user_name?: string
      expires_at?: string
      duration_minutes?: number
      error?: string
    }
    if (!response.ok || payload.valid !== true) {
      throw new Error(payload.error || 'Liga inválida o no disponible.')
    }
    return {
      user_name: payload.user_name ?? 'Usuario',
      expires_at: payload.expires_at ?? '',
      duration_minutes: payload.duration_minutes ?? 15,
    }
  },

  async abandonSession(sessionId: string): Promise<void> {
    if (isLocalSessionId(sessionId)) {
      clearLocalState()
      return
    }
    const { error } = await supabase
      .from('guide_sessions')
      .update({
        status: 'abandoned',
        closed_at: new Date().toISOString(),
        close_reason: 'abandoned',
      })
      .eq('id', sessionId)
      .in('status', ['active', 'closing'])
    if (error && !isMissingGuideTable(error)) {
      throwGuideError(error, 'No se pudo abandonar la sesion de Guia.')
    }
    clearLocalState()
  },

  async listMessages(sessionId: string): Promise<GuideMessage[]> {
    if (isLocalSessionId(sessionId)) {
      const local = readLocalState()
      return local?.session.id === sessionId ? local.messages : []
    }
    const { data, error } = await supabase
      .from('guide_messages')
      .select(MESSAGE_SELECT)
      .eq('session_id', sessionId)
      .order('sequence', { ascending: true })
    if (error) {
      if (isMissingGuideTable(error)) return readLocalState()?.messages ?? []
      throwGuideError(error, 'No se pudieron leer los mensajes de Guia.')
    }
    return (data ?? []) as GuideMessage[]
  },

  /**
   * Abre una sesion nueva de 15 min con el hilo previo (o el resumen del diario)
   * para continuar la conversacion desde el historial.
   */
  async resumeFromJournal(
    usuarioId: string,
    entry: Pick<
      GuideJournalEntry,
      'session_id' | 'topic' | 'summary' | 'executive_report' | 'agent_inferences' | 'intention' | 'learning'
    >
  ): Promise<GuideSession> {
    const prior = entry.session_id ? await this.listMessages(entry.session_id) : []
    const session = await this.startSession(usuarioId, { replaceActive: true })

    const seed: Array<{ role: GuideMessage['role']; content: string }> = []
    const topic = entry.topic?.trim()
    const summary =
      entry.executive_report?.trim() ||
      entry.summary?.trim() ||
      entry.agent_inferences?.trim() ||
      ''
    const bridgeParts = [
      topic
        ? `Retomamos tu sesion anterior sobre «${topic.slice(0, 120)}».`
        : 'Retomamos tu sesion anterior con Guia.',
      summary ? `Contexto breve:\n${summary.slice(0, 900)}` : null,
      entry.intention?.trim() ? `Intencion pendiente: ${entry.intention.trim().slice(0, 240)}` : null,
      entry.learning?.trim() ? `Aprendizaje previo: ${entry.learning.trim().slice(0, 240)}` : null,
      'Tienes 15 minutos mas. Continuemos desde donde lo dejaste.',
    ].filter(Boolean) as string[]
    seed.push({ role: 'assistant', content: bridgeParts.join('\n\n').slice(0, 1800) })

    for (const message of prior.slice(-16)) {
      const content = message.content.trim().slice(0, 1800)
      if (!content) continue
      seed.push({ role: message.role, content })
    }

    await this.seedMessages(session.id, seed)
    return session
  },

  async seedMessages(
    sessionId: string,
    items: Array<{ role: GuideMessage['role']; content: string }>
  ): Promise<GuideMessage[]> {
    const rows = items
      .map((item) => ({
        role: item.role,
        content: item.content.trim().slice(0, 1800),
      }))
      .filter((item) => item.content.length > 0)
    if (rows.length === 0) return []

    if (isLocalSessionId(sessionId)) {
      const local = readLocalState()
      if (!local || local.session.id !== sessionId) {
        throw new Error('No hay una sesion local de Guia activa.')
      }
      const now = new Date().toISOString()
      const messages: GuideMessage[] = rows.map((row, index) => ({
        id: `${LOCAL_PREFIX}msg-${crypto.randomUUID()}`,
        session_id: sessionId,
        sequence: index + 1,
        role: row.role,
        content: row.content,
        created_at: now,
      }))
      writeLocalState({ session: local.session, messages })
      return messages
    }

    const payload = rows.map((row, index) => ({
      session_id: sessionId,
      sequence: index + 1,
      role: row.role,
      content: row.content,
    }))
    const { data, error } = await supabase.from('guide_messages').insert(payload).select(MESSAGE_SELECT)
    if (error) {
      if (isMissingGuideTable(error)) {
        const local = readLocalState()
        if (local && local.session.id === sessionId) {
          const now = new Date().toISOString()
          const messages: GuideMessage[] = rows.map((row, index) => ({
            id: `${LOCAL_PREFIX}msg-${crypto.randomUUID()}`,
            session_id: sessionId,
            sequence: index + 1,
            role: row.role,
            content: row.content,
            created_at: now,
          }))
          writeLocalState({ session: local.session, messages })
          return messages
        }
      }
      throwGuideError(error, 'No se pudo preparar el historial para retomar.')
    }
    return ((data ?? []) as GuideMessage[]).sort((a, b) => a.sequence - b.sequence)
  },

  async insertUserMessage(sessionId: string, content: string): Promise<GuideMessage> {
    const text = content.trim()
    if (isLocalSessionId(sessionId)) {
      const local = readLocalState()
      if (!local || local.session.id !== sessionId) {
        throw new Error('No hay una sesion local de Guia activa.')
      }
      const message: GuideMessage = {
        id: `${LOCAL_PREFIX}msg-${crypto.randomUUID()}`,
        session_id: sessionId,
        sequence: (local.messages.at(-1)?.sequence ?? 0) + 1,
        role: 'user',
        content: text,
        created_at: new Date().toISOString(),
      }
      writeLocalState({ session: local.session, messages: [...local.messages, message] })
      return message
    }

    const { data: last, error: lastError } = await supabase
      .from('guide_messages')
      .select('sequence')
      .eq('session_id', sessionId)
      .order('sequence', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (lastError) throwGuideError(lastError, 'No se pudo preparar el mensaje.')

    const sequence = (last?.sequence ?? 0) + 1
    const { data, error } = await supabase
      .from('guide_messages')
      .insert({
        session_id: sessionId,
        sequence,
        role: 'user',
        content: text,
      })
      .select(MESSAGE_SELECT)
      .single()
    if (error) throwGuideError(error, 'No se pudo guardar el mensaje.')
    return data as GuideMessage
  },

  async sendTurn(
    session: Pick<GuideSession, 'id' | 'expires_at'>,
    opts?: { intent?: 'consult' | 'create' }
  ): Promise<GuideChatTurnResponse> {
    const headers = await authHeaders()
    const messages = compactMessages(await this.listMessages(session.id))
    const response = await fetch('/api/guide-chat', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        session_id: session.id,
        expires_at: session.expires_at,
        messages,
        intent: opts?.intent === 'create' ? 'create' : 'consult',
      }),
    })
    const payload = (await response.json().catch(() => ({}))) as GuideChatTurnResponse & {
      error?: string
    }
    if (!response.ok) {
      throw new Error(payload.error || 'No se pudo obtener respuesta de Guia.')
    }

    if (isLocalSessionId(session.id) && payload.answer) {
      const local = readLocalState()
      if (local && local.session.id === session.id) {
        const assistant: GuideMessage = {
          id: `${LOCAL_PREFIX}msg-${crypto.randomUUID()}`,
          session_id: session.id,
          sequence: payload.sequence || (local.messages.at(-1)?.sequence ?? 0) + 1,
          role: 'assistant',
          content: payload.answer,
          created_at: new Date().toISOString(),
        }
        writeLocalState({ session: local.session, messages: [...local.messages, assistant] })
      }
    }

    return payload
  },

  async closeSession(
    session: Pick<GuideSession, 'id' | 'expires_at'>,
    reason: GuideCloseReason = 'user_requested',
    opts?: { messages?: GuideCompactMessage[]; intent?: 'consult' | 'create' }
  ): Promise<GuideChatCloseResponse> {
    const headers = await authHeaders()
    const messages = opts?.messages ?? compactMessages(await this.listMessages(session.id))
    const response = await fetch('/api/guide-chat', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        session_id: session.id,
        action: 'close',
        reason,
        expires_at: session.expires_at,
        messages,
        intent: opts?.intent === 'create' ? 'create' : 'consult',
      }),
    })
    const payload = (await response.json().catch(() => ({}))) as GuideChatCloseResponse & {
      error?: string
    }
    if (!response.ok) {
      throw new Error(payload.error || 'No se pudo cerrar la sesion de Guia.')
    }
    if (isLocalSessionId(session.id)) clearLocalState()
    if (payload.journal) payload.journal = normalizeJournal(payload.journal)
    if (!payload.createdWork) payload.createdWork = payload.journal?.created_work ?? []
    if (!payload.pendingWork) {
      payload.pendingWork = (payload.createdWork ?? []).filter((item) => item.pending)
    }
    if (!payload.executiveReport) payload.executiveReport = payload.journal?.executive_report ?? null
    return payload
  },

  async saveJournalWork(entryId: string, createdWork: GuideCreatedWork[]) {
    if (!entryId || entryId.startsWith(LOCAL_PREFIX)) return
    const { error } = await supabase
      .from('guide_journal_entries')
      .update({ created_work: createdWork, updated_at: new Date().toISOString() })
      .eq('id', entryId)
    if (error && !isMissingJournalExtraCols(error)) {
      console.error('guide journal work', error)
    }
  },

  async listJournal(usuarioId: string, limit = 12): Promise<GuideJournalEntry[]> {
    const full = await supabase
      .from('guide_journal_entries')
      .select(JOURNAL_SELECT)
      .eq('usuario_id', usuarioId)
      .order('created_at', { ascending: false })
      .limit(limit)
    const result =
      full.error && isMissingJournalExtraCols(full.error)
        ? await supabase
            .from('guide_journal_entries')
            .select(JOURNAL_SELECT_BASE)
            .eq('usuario_id', usuarioId)
            .order('created_at', { ascending: false })
            .limit(limit)
        : full
    if (result.error) {
      if (isMissingGuideTable(result.error)) return []
      throwGuideError(result.error, 'No se pudo leer el diario de Guia.')
    }
    return ((result.data ?? []) as GuideJournalEntry[]).map(normalizeJournal)
  },
}
