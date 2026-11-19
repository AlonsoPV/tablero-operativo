/**
 * Contexto conversacional por sesión (CV-02): consulta activa, último resultado
 * referenciable y entidad mencionada. Expira a los 30 min y se aísla por actor,
 * canal y sesión. Guarda IDs y metadatos mínimos, no texto del usuario.
 */
import { buildActiveQueryEntry } from '../actionQueryContract.js'
import type { ActionActiveQuery } from '../../../src/features/ai-support/actionQuery/types.js'
import type { ActionItem } from '../query/contracts.js'
import type { AgentActor } from '../query/resolveActor.js'

export const SESSION_CONTEXT_TTL_MS = 30 * 60 * 1000
const MAX_REFERENCED_ITEMS = 12
const MAX_SESSIONS = 2_000

export type ReferencedAction = Pick<ActionItem, 'id' | 'title' | 'estado' | 'fecha' | 'prioridad' | 'responsableId' | 'responsableNombre' | 'href'>

export type SessionContext = {
  activeQuery: ActionActiveQuery | null
  lastActions: ReferencedAction[]
  lastEntity: { kind: 'action' | 'person'; id: string; label: string } | null
  updatedAt: number
}

export type SessionContextStore = {
  get(key: string, now?: number): SessionContext | null
  set(key: string, value: Omit<SessionContext, 'updatedAt'>, now?: number): SessionContext
  clear(key: string): void
}

export function sessionContextKey(actor: Pick<AgentActor, 'usuarioId' | 'channel' | 'sessionId'>): string {
  return `${actor.usuarioId}:${actor.channel}:${actor.sessionId}`
}

export function emptySessionContext(now = Date.now()): SessionContext {
  return { activeQuery: null, lastActions: [], lastEntity: null, updatedAt: now }
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
    href: item.href,
  }))
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
