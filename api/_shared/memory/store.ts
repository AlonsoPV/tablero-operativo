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

function significantTokens(text: string): string[] {
  const stop = new Set([
    'para', 'como', 'debe', 'deben', 'cada', 'todo', 'toda', 'todos', 'todas',
    'esto', 'esta', 'este', 'unos', 'unas', 'sobre', 'hacia', 'cuando', 'donde',
    'siempre', 'nunca', 'realizarse', 'hacer', 'hacerse', 'tener', 'cuenta',
  ])
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 4 && !stop.has(t))
}

function overlapsTopic(a: string, b: string): boolean {
  const ta = new Set(significantTokens(a))
  const tb = significantTokens(b)
  if (ta.size === 0 || tb.length === 0) return false
  let shared = 0
  for (const tok of tb) {
    if (ta.has(tok)) shared += 1
  }
  return shared >= 2 || (shared >= 1 && Math.min(ta.size, tb.length) <= 2)
}

export async function saveUserMemory(
  supabase: SupabaseClient,
  actor: MemoryActor,
  input: {
    body: string
    memoryType: AgentMemoryRow['memory_type']
    sourceRef?: string | null
  }
): Promise<
  | { ok: true; id: string; version: number; supersededId: string | null; body: string }
  | { ok: false; error: string }
> {
  const cleaned = input.body.replace(/\s+/g, ' ').trim().slice(0, 1800)
  if (cleaned.length < 5) {
    return { ok: false, error: 'La memoria es demasiado breve para aportar contexto operativo.' }
  }
  try {
    const { data: existing } = await supabase
      .from('agent_memory')
      .select('id,body,version')
      .eq('usuario_id', actor.usuarioId)
      .eq('validation_status', 'confirmed')
      .eq('access_level', 'owner')
      .order('updated_at', { ascending: false })
      .limit(40)

    const match = (Array.isArray(existing) ? existing : []).find(
      (row: { id: string; body: string; version: number }) =>
        overlapsTopic(row.body, cleaned)
    ) as { id: string; body: string; version: number } | undefined

    const now = new Date().toISOString()
    let supersededId: string | null = null
    let nextVersion = 1
    if (match) {
      await supabase
        .from('agent_memory')
        .update({ validation_status: 'superseded', updated_at: now })
        .eq('id', match.id)
        .eq('usuario_id', actor.usuarioId)
      supersededId = match.id
      nextVersion = (Number(match.version) || 1) + 1
    }

    const { data: inserted, error } = await supabase
      .from('agent_memory')
      .insert({
        usuario_id: actor.usuarioId,
        area_id: actor.areaId ?? null,
        memory_type: input.memoryType,
        body: cleaned,
        source_kind: 'manual',
        source_ref: input.sourceRef ? input.sourceRef.slice(0, 120) : 'chat',
        content_hash: hashBody(cleaned),
        validation_status: 'confirmed',
        access_level: 'owner',
        version: nextVersion,
        supersedes_id: supersededId,
        confirmed_by: actor.usuarioId,
        confirmed_at: now,
      })
      .select('id,version')
      .single()

    if (error || !inserted) {
      return { ok: false, error: error?.message ?? 'No se pudo guardar en memoria.' }
    }
    return {
      ok: true,
      id: String((inserted as { id: string }).id),
      version: Number((inserted as { version: number }).version) || nextVersion,
      supersededId,
      body: cleaned,
    }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'memory_write_failed' }
  }
}

export async function forgetUserMemory(
  supabase: SupabaseClient,
  actor: MemoryActor,
  query: string
): Promise<{ ok: true; count: number; bodies: string[] } | { ok: false; error: string }> {
  try {
    const { data: existing, error } = await supabase
      .from('agent_memory')
      .select('id,body')
      .eq('usuario_id', actor.usuarioId)
      .eq('validation_status', 'confirmed')
      .eq('access_level', 'owner')
      .order('updated_at', { ascending: false })
      .limit(50)
    if (error) return { ok: false, error: error.message }
    const rows = (Array.isArray(existing) ? existing : []) as Array<{ id: string; body: string }>
    const targets = rows.filter((r) => matchesQuery(r.body, query) || overlapsTopic(r.body, query))
    if (targets.length === 0) return { ok: true, count: 0, bodies: [] }

    const now = new Date().toISOString()
    const ids = targets.map((t) => t.id)
    const { error: updErr } = await supabase
      .from('agent_memory')
      .update({ validation_status: 'deleted', updated_at: now })
      .in('id', ids)
      .eq('usuario_id', actor.usuarioId)
    if (updErr) return { ok: false, error: updErr.message }
    return { ok: true, count: targets.length, bodies: targets.map((t) => t.body) }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'memory_delete_failed' }
  }
}

/**
 * Construye un bloque compacto y autorizado de memoria/documentos R3 para inyectar
 * en el contexto de Gemini (Web y WhatsApp). Combina hits por consulta con
 * preferencias/acuerdos vigentes del usuario (para planeación y priorización).
 */
export async function loadMemoryPromptBlock(
  supabase: SupabaseClient,
  actor: MemoryActor,
  query: string
): Promise<string> {
  try {
    const store = await loadSupabaseMemoryStore(supabase)
    const recalled = store.recall(actor, query)
    const hits = recalled.ok && !recalled.denied ? recalled.hits : []
    const seen = new Set(hits.map((h) => h.id))

    const standingMemories = store.memories
      .filter((row) => canSeeMemory(actor, row) && !seen.has(row.id))
      .slice(0, 6)
      .map((row) => ({
        kind: 'memory' as const,
        id: row.id,
        body: row.body,
        version: row.version,
        source_label: row.memory_type,
      }))

    const combined = [...hits, ...standingMemories].slice(0, 8)
    if (combined.length === 0) return ''

    const lines = combined.map((item) =>
      item.kind === 'document'
        ? `- [Documento: ${item.title ?? item.source_label}] ${item.body.slice(0, 320)}`
        : `- [Memoria (${item.source_label}, v${item.version})] ${item.body.slice(0, 320)}`
    )
    return [
      'MEMORIA Y DOCUMENTOS AUTORIZADOS DEL USUARIO (R3 — referencia operativa verificada; las cifras vivas del tablero siempre prevalecen):',
      ...lines,
    ].join('\n')
  } catch {
    return ''
  }
}
