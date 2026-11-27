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
  return tokenOverlapScore(text, query) > 0
}

function foldText(text: string) {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function tokenOverlapScore(text: string, query: string) {
  const tokens = foldText(query)
    .split(/\s+/)
    .filter((t) => t.length > 2)
  if (tokens.length === 0) return 0
  const hay = foldText(text)
  let hits = 0
  for (const token of tokens) {
    if (hay.includes(token)) hits += 1
  }
  return hits / tokens.length
}

function recencyBoost(iso: string | null | undefined) {
  if (!iso) return 0
  const ageDays = (Date.now() - Date.parse(iso)) / 86_400_000
  if (!Number.isFinite(ageDays)) return 0
  return Math.max(0, 1 - ageDays / 90)
}

const MEMORY_TYPE_BOOST: Record<AgentMemoryRow['memory_type'], number> = {
  agreement: 0.22,
  decision: 0.2,
  preference: 0.16,
  follow_up: 0.05,
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
    publishLocal(input: { title: string; body: string; sourceLabel: string; logicalId?: string }) {
      const logicalId = slugLogicalId(input.logicalId || input.title)
      const now = new Date().toISOString()
      for (const row of documents) {
        if (row.logical_id === logicalId && row.status === 'published') {
          row.status = 'withdrawn'
          row.withdrawn_at = now
        }
      }
      const version =
        documents.filter((row) => row.logical_id === logicalId).reduce((max, row) => Math.max(max, row.version), 0) + 1
      return this.insertDocument({
        id: `doc-${logicalId}-v${version}`,
        logical_id: logicalId,
        title: input.title.trim().slice(0, 200),
        body: input.body.trim().slice(0, 32_768),
        version,
        status: 'published',
        access_level: 'project_read',
        area_id: null,
        source_label: input.sourceLabel.trim().slice(0, 120) || 'sop',
        published_at: now,
        withdrawn_at: null,
      })
    },
    withdrawLocal(logicalId: string) {
      const now = new Date().toISOString()
      let count = 0
      for (const row of documents) {
        if (row.logical_id === logicalId && row.status === 'published') {
          row.status = 'withdrawn'
          row.withdrawn_at = now
          count += 1
        }
      }
      return count
    },
    forgetLocal(ids: string[]) {
      const set = new Set(ids)
      for (const row of memories) {
        if (set.has(row.id)) row.validation_status = 'deleted'
      }
    },
    recall(
      actor: MemoryActor,
      query: string,
      options?: { focus?: 'documents' | 'memory' | 'either' }
    ): MemoryRecallResult {
      try {
        const focus = options?.focus ?? 'either'
        const scored: Array<MemoryRecallHit & { score: number }> = []
        if (focus !== 'documents') {
          for (const row of memories) {
            if (!canSeeMemory(actor, row)) continue
            const overlap = tokenOverlapScore(row.body, query)
            if (overlap <= 0) continue
            scored.push({
              kind: 'memory',
              id: row.id,
              body: row.body,
              version: row.version,
              source_label: row.source_kind,
              score:
                overlap +
                recencyBoost(row.updated_at || row.created_at) * 0.35 +
                (MEMORY_TYPE_BOOST[row.memory_type] ?? 0),
            })
          }
        }
        if (focus !== 'memory') {
          for (const row of documents) {
            if (!canSeeDocument(actor, row)) continue
            const overlap = tokenOverlapScore(`${row.title} ${row.body} ${row.source_label}`, query)
            if (overlap <= 0) continue
            scored.push({
              kind: 'document',
              id: row.id,
              title: row.title,
              body: row.body,
              version: row.version,
              source_label: row.source_label,
              score: overlap + recencyBoost(row.published_at) * 0.3 + 0.12,
            })
          }
        }
        scored.sort((a, b) => b.score - a.score)
        const hits = scored.slice(0, 5).map(({ score: _score, ...hit }) => hit)

        // Pedido explícito de otro proyecto: denegación opaca sin filtrar hits visibles.
        if (/\b(otro proyecto|otra org|organizacion b|org b)\b/i.test(query) && hits.length === 0) {
          return { ok: true, hits: [], denied: true }
        }
        return { ok: true, hits, denied: false }
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
    const contentHash = hashBody(cleaned)
    const temporal =
      /\b(hoy|esta (?:manana|tarde|noche|semana)|por ahora|solo (?:hoy|esta vez)|temporal)\b/i.test(cleaned)
    const expiresAt = temporal
      ? new Date(Date.now() + 7 * 86_400_000).toISOString()
      : null

    const { data: existing } = await supabase
      .from('agent_memory')
      .select('id,body,version,content_hash')
      .eq('usuario_id', actor.usuarioId)
      .eq('validation_status', 'confirmed')
      .eq('access_level', 'owner')
      .order('updated_at', { ascending: false })
      .limit(40)

    const rows = (Array.isArray(existing) ? existing : []) as Array<{
      id: string
      body: string
      version: number
      content_hash: string
    }>
    const hashMatch = rows.find((row) => row.content_hash === contentHash)
    if (hashMatch) {
      return {
        ok: true,
        id: hashMatch.id,
        version: hashMatch.version,
        supersededId: null,
        body: cleaned,
      }
    }
    const match = rows.find((row) => overlapsTopic(row.body, cleaned))

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
        content_hash: contentHash,
        validation_status: 'confirmed',
        access_level: 'owner',
        version: nextVersion,
        supersedes_id: supersededId,
        expires_at: expiresAt,
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
): Promise<{ ok: true; count: number; bodies: string[]; ids: string[] } | { ok: false; error: string }> {
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
    if (targets.length === 0) return { ok: true, count: 0, bodies: [], ids: [] }

    const now = new Date().toISOString()
    const ids = targets.map((t) => t.id)
    const { error: updErr } = await supabase
      .from('agent_memory')
      .update({ validation_status: 'deleted', updated_at: now })
      .in('id', ids)
      .eq('usuario_id', actor.usuarioId)
    if (updErr) return { ok: false, error: updErr.message }
    return { ok: true, count: targets.length, bodies: targets.map((t) => t.body), ids }
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
    const forgetTurn = /\b(olvida|borra(?:\s+de)?(?:\s+la)?\s+memoria|elimina(?:\s+la)?\s+(?:memoria|regla|preferencia|acuerdo))\b/i.test(
      query
    )
    const recalled = store.recall(actor, query)
    const hits = recalled.ok && !recalled.denied ? recalled.hits : []
    const seen = new Set(hits.map((h) => h.id))

    const standingMemories = forgetTurn
      ? []
      : store.memories
      .filter((row) => canSeeMemory(actor, row) && !seen.has(row.id))
      .sort(
        (a, b) =>
          Date.parse(b.updated_at || b.created_at) - Date.parse(a.updated_at || a.created_at)
      )
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

function slugLogicalId(raw: string) {
  const slug = foldText(raw)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
  return slug || 'documento'
}

export async function listDocuments(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from('agent_documents')
    .select(
      'id,logical_id,title,body,version,status,access_level,area_id,content_hash,source_label,published_at,withdrawn_at'
    )
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(80)
  if (error) return { ok: false as const, error: error.message }
  return { ok: true as const, documents: (Array.isArray(data) ? data : []) as AgentDocumentRow[] }
}

export async function publishDocument(
  supabase: SupabaseClient,
  input: { title: string; body: string; sourceLabel: string; logicalId?: string }
) {
  const title = input.title.replace(/\s+/g, ' ').trim().slice(0, 200)
  const body = input.body.replace(/\r\n/g, '\n').trim().slice(0, 32_768)
  const sourceLabel = input.sourceLabel.replace(/\s+/g, ' ').trim().slice(0, 120) || 'sop'
  if (title.length < 3 || body.length < 12) {
    return { ok: false as const, error: 'Indica un título y un cuerpo suficientes para el procedimiento.' }
  }
  const logicalId = slugLogicalId(input.logicalId || title)
  const now = new Date().toISOString()
  try {
    const { data: existing, error: existingError } = await supabase
      .from('agent_documents')
      .select('id,version,status')
      .eq('logical_id', logicalId)
      .order('version', { ascending: false })
      .limit(20)
    if (existingError) return { ok: false as const, error: existingError.message }
    const rows = (Array.isArray(existing) ? existing : []) as Array<{ id: string; version: number; status: string }>
    const publishedIds = rows.filter((row) => row.status === 'published').map((row) => row.id)
    if (publishedIds.length) {
      await supabase
        .from('agent_documents')
        .update({ status: 'withdrawn', withdrawn_at: now })
        .in('id', publishedIds)
    }
    const version = (rows[0]?.version ?? 0) + 1
    const { data: inserted, error } = await supabase
      .from('agent_documents')
      .insert({
        logical_id: logicalId,
        title,
        body,
        version,
        status: 'published',
        access_level: 'project_read',
        area_id: null,
        content_hash: hashBody(`${title}\n${body}`),
        source_label: sourceLabel,
        published_at: now,
        withdrawn_at: null,
      })
      .select(
        'id,logical_id,title,body,version,status,access_level,area_id,content_hash,source_label,published_at,withdrawn_at'
      )
      .single()
    if (error || !inserted) return { ok: false as const, error: error?.message ?? 'No se pudo publicar el documento.' }
    return { ok: true as const, document: inserted as AgentDocumentRow }
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : 'document_publish_failed' }
  }
}

export async function withdrawDocument(supabase: SupabaseClient, logicalIdRaw: string) {
  const logicalId = slugLogicalId(logicalIdRaw)
  const now = new Date().toISOString()
  try {
    const { data, error } = await supabase
      .from('agent_documents')
      .update({ status: 'withdrawn', withdrawn_at: now })
      .eq('logical_id', logicalId)
      .eq('status', 'published')
      .select('id,logical_id,version')
    if (error) return { ok: false as const, error: error.message }
    return { ok: true as const, count: Array.isArray(data) ? data.length : 0, logicalId }
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : 'document_withdraw_failed' }
  }
}

export async function recallDocumentsFts(supabase: SupabaseClient, query: string): Promise<AgentDocumentRow[]> {
  const q = query.replace(/\s+/g, ' ').trim().slice(0, 240)
  if (!q) return []
  try {
    const { data, error } = await supabase.rpc('recall_agent_documents', { q })
    if (error || !Array.isArray(data)) return []
    return data as AgentDocumentRow[]
  } catch {
    return []
  }
}

export async function mergeFtsDocumentHits(store: MemoryStore, supabase: SupabaseClient, query: string) {
  const rows = await recallDocumentsFts(supabase, query)
  const seen = new Set(store.documents.map((row) => row.id))
  for (const row of rows) {
    if (seen.has(row.id)) continue
    store.documents.push(row)
    seen.add(row.id)
  }
}
