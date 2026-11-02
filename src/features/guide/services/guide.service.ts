import { supabase } from '@/lib/supabase/client'
import type {
  GuideChatCloseResponse,
  GuideChatTurnResponse,
  GuideCloseReason,
  GuideCompactMessage,
  GuideJournalEntry,
  GuideMessage,
  GuideRetellWebCallResponse,
  GuideSession,
} from '@/features/guide/types'

const SESSION_SELECT =
  'id,usuario_id,provider,provider_session_id,status,started_at,expires_at,closed_at,close_reason,created_at,updated_at'
const MESSAGE_SELECT = 'id,session_id,sequence,role,content,created_at'
const JOURNAL_SELECT =
  'id,session_id,usuario_id,topic,summary,learning,intention,reflection_question,user_words,agent_inferences,created_at,updated_at'

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
  const { data } = await supabase.auth.getSession()
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

  async createRetellWebCall(opts?: { replaceActive?: boolean }): Promise<GuideRetellWebCallResponse> {
    const headers = await authHeaders()
    const response = await fetch('/api/guide-retell-web-call', {
      method: 'POST',
      headers,
      body: JSON.stringify({ replace_active: opts?.replaceActive ?? true }),
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

  async sendTurn(session: Pick<GuideSession, 'id' | 'expires_at'>): Promise<GuideChatTurnResponse> {
    const headers = await authHeaders()
    const messages = compactMessages(await this.listMessages(session.id))
    const response = await fetch('/api/guide-chat', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        session_id: session.id,
        expires_at: session.expires_at,
        messages,
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
    opts?: { messages?: GuideCompactMessage[] }
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
      }),
    })
    const payload = (await response.json().catch(() => ({}))) as GuideChatCloseResponse & {
      error?: string
    }
    if (!response.ok) {
      throw new Error(payload.error || 'No se pudo cerrar la sesion de Guia.')
    }
    if (isLocalSessionId(session.id)) clearLocalState()
    return payload
  },

  async listJournal(usuarioId: string, limit = 12): Promise<GuideJournalEntry[]> {
    const { data, error } = await supabase
      .from('guide_journal_entries')
      .select(JOURNAL_SELECT)
      .eq('usuario_id', usuarioId)
      .order('created_at', { ascending: false })
      .limit(limit)
    if (error) {
      if (isMissingGuideTable(error)) return []
      throwGuideError(error, 'No se pudo leer el diario de Guia.')
    }
    return (data ?? []) as GuideJournalEntry[]
  },
}
