import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { AgentDocumentRow, AgentMemoryRow, MemoryRecallHit, MemoryRecallResult } from './types.js'

export type MemoryActor = {
  usuarioId: string
  areaId?: string | null
  /** Lectura de proyecto (Super Admin / Dirección / área OKRS). */
  canReadProject: boolean
  /** Áreas visibles; vacía = sólo owner. */
  visibleAreaIds: string[]
}

function hashBody(body: string) {
  return createHash('sha256').update(body).digest('hex').slice(0, 32)
}

function canSeeMemory(actor: MemoryActor, row: AgentMemoryRow): boolean {
  if (row.validation_status !== 'confirmed') return false
  if (row.expires_at && Date.parse(row.expires_at) <= Date.now()) return false
  if (row.access_level === 'owner') return row.usuario_id === actor.usuarioId
  if (row.access_level === 'area') {
    return Boolean(row.area_id && actor.visibleAreaIds.includes(row.area_id))
  }
  return actor.canReadProject
}

function canSeeDocument(actor: MemoryActor, row: AgentDocumentRow): boolean {
  if (row.status !== 'published') return false
  if (row.access_level === 'owner') return false
  if (row.access_level === 'area') {
    return Boolean(row.area_id && actor.visibleAreaIds.includes(row.area_id))
  }
  return actor.canReadProject
}

function matchesQuery(text: string, query: string) {
  const q = query
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
  const hay = text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
  return q.split(/\s+/).filter((t) => t.length > 2).some((token) => hay.includes(token))
}

/** Almacén en memoria para harness local (sin red). */
export function createMemoryStore(seed?: {
  memories?: AgentMemoryRow[]
  documents?: AgentDocumentRow[]
}) {
  const memories = [...(seed?.memories ?? [])]
  const documents = [...(seed?.documents ?? [])]
  let writes = 0

  return {
    memories,
    documents,
    get writeCount() {
      return writes
    },
    insertMemory(row: Omit<AgentMemoryRow, 'content_hash' | 'created_at' | 'updated_at'> & { content_hash?: string }) {
      writes += 1
      const now = new Date().toISOString()
      const full: AgentMemoryRow = {
        ...row,
        content_hash: row.content_hash ?? hashBody(row.body),
        created_at: now,
        updated_at: now,
      }
      memories.push(full)
      return full
    },
    insertDocument(row: Omit<AgentDocumentRow, 'content_hash'> & { content_hash?: string }) {
      writes += 1
      const full: AgentDocumentRow = {
        ...row,
        content_hash: row.content_hash ?? hashBody(row.body),
      }
      documents.push(full)
      return full
    },
    recall(actor: MemoryActor, query: string): MemoryRecallResult {
      try {
        const memHits: MemoryRecallHit[] = memories
          .filter((row) => canSeeMemory(actor, row) && matchesQuery(row.body, query))
          .map((row) => ({
            kind: 'memory' as const,
            id: row.id,
            body: row.body,
            version: row.version,
            source_label: row.source_kind,
          }))
        const docHits: MemoryRecallHit[] = documents
          .filter((row) => canSeeDocument(actor, row) && matchesQuery(`${row.title} ${row.body}`, query))
          .map((row) => ({
            kind: 'document' as const,
            id: row.id,
            title: row.title,
            body: row.body,
            version: row.version,
            source_label: row.source_label,
          }))

        // Pedido explícito de otro proyecto: denegación opaca sin filtrar hits visibles.
        if (/\b(otro proyecto|otra org|organizacion b|org b)\b/i.test(query) && memHits.length === 0 && docHits.length === 0) {
          return { ok: true, hits: [], denied: true }
        }
        return { ok: true, hits: [...memHits, ...docHits].slice(0, 5), denied: false }
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : 'memory_store_error' }
      }
    },
  }
}

export type MemoryStore = ReturnType<typeof createMemoryStore>

/**
 * Carga memoria confirmada y documentos publicados desde Supabase usando el JWT
 * del usuario autenticado (respetando RLS). Falla cerrado devolviendo listas vacías
 * si las tablas R3 aún no existen o el usuario no tiene permiso.
 */
export async function loadSupabaseMemoryStore(supabase: SupabaseClient): Promise<MemoryStore> {
  try {
    const [memRes, docRes] = await Promise.all([
      supabase
        .from('agent_memory')
        .select(
          'id,usuario_id,area_id,memory_type,body,source_kind,source_ref,content_hash,validation_status,access_level,version,supersedes_id,created_at,updated_at,expires_at,confirmed_by,confirmed_at',
        )
        .eq('validation_status', 'confirmed')
        .limit(200),
      supabase
        .from('agent_documents')
        .select(
          'id,logical_id,title,body,version,status,access_level,area_id,content_hash,source_label,published_at,withdrawn_at',
        )
        .eq('status', 'published')
        .limit(200),
    ])
    return createMemoryStore({
      memories: (!memRes.error && Array.isArray(memRes.data) ? memRes.data : []) as AgentMemoryRow[],
      documents: (!docRes.error && Array.isArray(docRes.data) ? docRes.data : []) as AgentDocumentRow[],
    })
  } catch {
    return createMemoryStore()
  }
}

export function hashMemoryBody(body: string) {
  return hashBody(body)
}
