export type MemoryType = 'agreement' | 'decision' | 'preference' | 'follow_up'
export type MemoryValidationStatus = 'proposed' | 'confirmed' | 'rejected' | 'superseded' | 'deleted'
export type MemoryAccessLevel = 'owner' | 'area' | 'project_read'

export type AgentMemoryRow = {
  id: string
  usuario_id: string
  area_id: string | null
  memory_type: MemoryType
  body: string
  source_kind: 'session' | 'document' | 'manual'
  source_ref: string | null
  content_hash: string
  validation_status: MemoryValidationStatus
  access_level: MemoryAccessLevel
  version: number
  supersedes_id: string | null
  created_at: string
  updated_at: string
  expires_at: string | null
  confirmed_by: string | null
  confirmed_at: string | null
}

export type AgentDocumentRow = {
  id: string
  logical_id: string
  title: string
  body: string
  version: number
  status: 'published' | 'withdrawn'
  access_level: MemoryAccessLevel
  area_id: string | null
  content_hash: string
  source_label: string
  published_at: string | null
  withdrawn_at: string | null
}

export type MemoryRecallHit = {
  kind: 'memory' | 'document'
  id: string
  title?: string
  body: string
  version: number
  source_label: string
}

export type MemoryRecallResult =
  | { ok: true; hits: MemoryRecallHit[]; denied: false }
  | { ok: true; hits: []; denied: true }
  | { ok: false; error: string }
