/**
 * Contexto conversacional por sesión (CV-02): consulta activa, último resultado
 * referenciable y entidad mencionada. Expira a los 30 min y se aísla por actor,
 * canal y sesión. Guarda IDs y metadatos mínimos, no texto del usuario.
 */
import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { buildActiveQueryEntry } from '../actionQueryContract.js'
import type { ActionActiveQuery } from '../../../src/features/ai-support/actionQuery/types.js'
import type { ActionItem } from '../query/contracts.js'
import type { AgentActor, AgentChannel } from '../query/resolveActor.js'
import { coerceResponseFormat, type FormatResolution, type ResponseFormat } from './answerContract.js'
import type { AgentIntent } from './intent.js'
import { isExecutiveReviewStage, type ExecutiveSessionState } from './executiveSession.js'
import type { AgentResponse } from './respond.js'

export const SESSION_CONTEXT_TTL_MS = 30 * 60 * 1000
const MAX_REFERENCED_ITEMS = 12
const MAX_SESSIONS = 2_000

export type ReferencedAction = Pick<
  ActionItem,
  'id' | 'title' | 'estado' | 'fecha' | 'prioridad' | 'responsableId' | 'responsableNombre' | 'area' | 'updatedAt' | 'href'
>

/**
 * Última respuesta con datos, sólo en memoria de la instancia (nunca se persiste en la tabla):
 * permite volver a presentarla en otro formato sin una nueva consulta.
 */
export type CachedAnswer = {
  intent: AgentIntent['kind']
  response: AgentResponse
  auto: FormatResolution
}

export type SessionContext = {
  activeQuery: ActionActiveQuery | null
  lastActions: ReferencedAction[]
  lastEntity: { kind: 'action' | 'person'; id: string; label: string } | null
  /** Formato elegido para la sesión; ausente equivale a 'auto'. */
  responseFormat?: ResponseFormat
  lastAnswer?: CachedAnswer | null
  /** Sesión ejecutiva guiada (~15 min) en curso; sólo memoria de sesión, nunca persiste compromisos. */
  executiveSession?: ExecutiveSessionState | null
  /** Totales vivos de la última consulta autorizada; sirven para explicar cambios reales, no para congelar cifras. */
  lastTotals?: { open: number; overdue: number; blocked: number } | null
  /** Huella de capacidades con la que se construyó; si cambia, el contexto se descarta. */
  fingerprint?: string
  updatedAt: number
}

type MaybePromise<T> = T | Promise<T>

export type SessionContextStore = {
  get(key: string, now?: number): MaybePromise<SessionContext | null>
  set(key: string, value: Omit<SessionContext, 'updatedAt'>, now?: number): MaybePromise<unknown>
  clear(key: string): MaybePromise<void>
}

export function sessionContextKey(actor: Pick<AgentActor, 'usuarioId' | 'channel' | 'sessionId'>): string {
  return `${actor.usuarioId}:${actor.channel}:${actor.sessionId}`
}

export function emptySessionContext(now = Date.now()): SessionContext {
  return { activeQuery: null, lastActions: [], lastEntity: null, lastTotals: null, updatedAt: now }
}

export function toReferencedActions(items: ActionItem[]): ReferencedAction[] {
  return items.slice(0, MAX_REFERENCED_ITEMS).map((item) => ({
    id: item.id,
    title: item.title,
    estado: item.estado,
    fecha: item.fecha,
    prioridad: item.prioridad,
    responsableId: item.responsableId ?? null,
    responsableNombre: item.responsableNombre ?? null,
    area: item.area ?? null,
    updatedAt: item.updatedAt ?? null,
    href: item.href,
  }))
}

/** Referencias persistidas sin título: deben releerse con la herramienta autorizada antes de mostrarse. */
export function needsReferenceRehydration(ctx: SessionContext): boolean {
  return ctx.lastActions.some((item) => !item.title)
}

export { buildActiveQueryEntry }

/**
 * Store en memoria por instancia. En serverless es best-effort; los canales que
 * ya persisten consult_log (voz) pueden rehidratar activeQuery con readLatestActiveQuery.
 */
export function createMemorySessionContextStore(ttlMs = SESSION_CONTEXT_TTL_MS): SessionContextStore {
  const map = new Map<string, SessionContext>()
  return {
    get(key, now = Date.now()) {
      const value = map.get(key)
      if (!value) return null
      if (now - value.updatedAt > ttlMs) {
        map.delete(key)
        return null
      }
      return value
    },
    set(key, value, now = Date.now()) {
      const next: SessionContext = { ...value, updatedAt: now }
      map.set(key, next)
      if (map.size > MAX_SESSIONS) {
        for (const [k, v] of map) {
          if (now - v.updatedAt > ttlMs) map.delete(k)
        }
        if (map.size > MAX_SESSIONS) {
          const oldest = map.keys().next().value
          if (oldest) map.delete(oldest)
        }
      }
      return next
    },
    clear(key) {
      map.delete(key)
    },
  }
}

export const defaultSessionContextStore = createMemorySessionContextStore()

type ParsedKey = { usuarioId: string; channel: AgentChannel; sessionHash: string }

/** El identificador de sesión (p. ej. el número de WhatsApp) nunca se guarda en claro. */
export function hashSessionId(sessionId: string): string {
  return createHash('sha256').update(sessionId).digest('hex')
}

function parseKey(key: string): ParsedKey | null {
  const [usuarioId, channel, ...rest] = key.split(':')
  const sessionId = rest.join(':')
  if (!usuarioId || !sessionId || (channel !== 'web' && channel !== 'whatsapp' && channel !== 'voice')) return null
  return { usuarioId, channel, sessionHash: hashSessionId(sessionId) }
}

type PersistedPayload = {
  activeQuery: ActionActiveQuery | null
  lastActions: Array<Pick<ReferencedAction, 'id' | 'estado' | 'fecha' | 'prioridad' | 'responsableId'>>
  lastEntity: { kind: 'action' | 'person'; id: string } | null
  responseFormat?: ResponseFormat
  lastTotals?: { open: number; overdue: number; blocked: number } | null
  executiveSession?: ExecutiveSessionState | null
}

/** Sólo IDs y campos de orden; títulos y nombres se releen con permisos vigentes. */
function coerceExecutiveSession(raw: unknown): ExecutiveSessionState | null {
  if (!raw || typeof raw !== 'object') return null
  const s = raw as Partial<ExecutiveSessionState>
  if (s.active !== true || !isExecutiveReviewStage(s.stage) || typeof s.startedAt !== 'string') return null
  return {
    active: true,
    startedAt: s.startedAt,
    stage: s.stage,
    focusedPriorityIndex: typeof s.focusedPriorityIndex === 'number' ? s.focusedPriorityIndex : null,
    decisions: Array.isArray(s.decisions) ? s.decisions.filter((d): d is string => typeof d === 'string').slice(0, 12) : [],
    draftCommitments: Array.isArray(s.draftCommitments)
      ? s.draftCommitments.slice(0, 6).map((d) => ({
          titulo: typeof d?.titulo === 'string' ? d.titulo : '',
          responsableSugerido: typeof d?.responsableSugerido === 'string' ? d.responsableSugerido : 'Por definir',
          fechaPropuesta: typeof d?.fechaPropuesta === 'string' ? d.fechaPropuesta : null,
          origenAccionId: typeof d?.origenAccionId === 'string' ? d.origenAccionId : null,
          persisted: false as const,
        }))
      : [],
    pendingTopics: Array.isArray(s.pendingTopics) ? s.pendingTopics.filter((t): t is string => typeof t === 'string').slice(0, 8) : [],
    skippedStages: Array.isArray(s.skippedStages) ? s.skippedStages.filter(isExecutiveReviewStage) : [],
  }
}

export function toPersistedPayload(value: Omit<SessionContext, 'updatedAt'>): PersistedPayload {
  return {
    activeQuery: value.activeQuery,
    lastActions: value.lastActions.slice(0, MAX_REFERENCED_ITEMS).map((item) => ({
      id: item.id,
      estado: item.estado,
      fecha: item.fecha,
      prioridad: item.prioridad,
      responsableId: item.responsableId ?? null,
    })),
    lastEntity: value.lastEntity ? { kind: value.lastEntity.kind, id: value.lastEntity.id } : null,
    responseFormat: coerceResponseFormat(value.responseFormat),
    lastTotals: value.lastTotals ?? null,
    executiveSession: value.executiveSession ?? null,
  }
}

function fromPersistedPayload(payload: unknown, fingerprint: string, updatedAt: number): SessionContext | null {
  if (!payload || typeof payload !== 'object') return null
  const p = payload as Partial<PersistedPayload>
  const lastActions = (Array.isArray(p.lastActions) ? p.lastActions : []).flatMap((raw) =>
    raw && typeof raw.id === 'string'
      ? [{
          id: raw.id,
          title: '',
          estado: raw.estado ?? null,
          fecha: raw.fecha ?? null,
          prioridad: raw.prioridad ?? null,
          responsableId: raw.responsableId ?? null,
          responsableNombre: null,
          href: `/kanban?accion=${encodeURIComponent(raw.id)}`,
        }]
      : []
  )
  const entity = p.lastEntity && typeof p.lastEntity.id === 'string' &&
    (p.lastEntity.kind === 'action' || p.lastEntity.kind === 'person')
    ? { kind: p.lastEntity.kind, id: p.lastEntity.id, label: '' }
    : null
  const totals = p.lastTotals && typeof p.lastTotals === 'object'
    ? {
        open: Number(p.lastTotals.open) || 0,
        overdue: Number(p.lastTotals.overdue) || 0,
        blocked: Number(p.lastTotals.blocked) || 0,
      }
    : null
  return {
    activeQuery: p.activeQuery && typeof p.activeQuery === 'object' ? p.activeQuery : null,
    lastActions,
    lastEntity: entity,
    responseFormat: coerceResponseFormat(p.responseFormat),
    lastTotals: totals,
    executiveSession: coerceExecutiveSession(p.executiveSession),
    fingerprint,
    updatedAt,
  }
}

/**
 * Store compartido entre instancias (tabla agent_session_context, migración 20261119140000).
 * Web usa el cliente con JWT del usuario (RLS dueño); WhatsApp el cliente de servicio con el
 * usuario ya verificado por vínculo de canal. Si la tabla no existe o falla, cae al store en memoria.
 */
export function createSupabaseSessionContextStore(
  supabase: SupabaseClient,
  fallback: SessionContextStore = defaultSessionContextStore,
  ttlMs = SESSION_CONTEXT_TTL_MS
): SessionContextStore {
  const store: SessionContextStore = {
    async get(key, now = Date.now()) {
      const parsed = parseKey(key)
      if (!parsed) return fallback.get(key, now)
      try {
        const { data, error } = await supabase
          .from('agent_session_context')
          .select('payload, capability_fingerprint, expires_at, updated_at')
          .eq('usuario_id', parsed.usuarioId)
          .eq('channel', parsed.channel)
          .eq('session_hash', parsed.sessionHash)
          .maybeSingle()
        if (error || !data) return fallback.get(key, now)
        const row = data as { payload: unknown; capability_fingerprint: string; expires_at: string; updated_at: string }
        if (Date.parse(row.expires_at) <= now) {
          await store.clear(key)
          return null
        }
        const persisted = fromPersistedPayload(row.payload, row.capability_fingerprint, Date.parse(row.updated_at) || now)
        const local = await fallback.get(key, now)
        if (local && persisted && local.fingerprint === persisted.fingerprint && local.updatedAt >= persisted.updatedAt) {
          return local
        }
        return persisted
      } catch {
        return fallback.get(key, now)
      }
    },
    async set(key, value, now = Date.now()) {
      const parsed = parseKey(key)
      await fallback.set(key, value, now)
      if (!parsed) return
      try {
        const { error } = await supabase.from('agent_session_context').upsert(
          {
            usuario_id: parsed.usuarioId,
            channel: parsed.channel,
            session_hash: parsed.sessionHash,
            payload: toPersistedPayload(value),
            capability_fingerprint: value.fingerprint ?? 'none',
            expires_at: new Date(now + ttlMs).toISOString(),
            updated_at: new Date(now).toISOString(),
          },
          { onConflict: 'usuario_id,channel,session_hash' }
        )
        if (error) {
          console.error('agent_session_context: no se persistió el turno', error.code ?? error.message)
        }
      } catch (error) {
        console.error(
          'agent_session_context: fallo al persistir',
          error instanceof Error ? error.message : error
        )
      }
    },
    async clear(key) {
      await fallback.clear(key)
      const parsed = parseKey(key)
      if (!parsed) return
      try {
        await supabase
          .from('agent_session_context')
          .delete()
          .eq('usuario_id', parsed.usuarioId)
          .eq('channel', parsed.channel)
          .eq('session_hash', parsed.sessionHash)
      } catch {
        /* best-effort */
      }
    },
  }
  return store
}
