/**
 * Membresía canónica del piloto: `agent_execution_gate.allowed_usuario_ids`.
 * Las listas env, si existen, se intersectan (fail-closed). Quitar un UUID de BD revierte
 * sin activar a nadie más.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function parseUuidAllowlist(raw: string | undefined): Set<string> {
  const set = new Set<string>()
  for (const token of (raw ?? '').split(/[\s,;]+/)) {
    const trimmed = token.trim().toLowerCase()
    if (trimmed && UUID_RE.test(trimmed)) set.add(trimmed)
  }
  return set
}

export function normalizeUsuarioId(raw: string | null | undefined): string {
  return typeof raw === 'string' ? raw.trim().toLowerCase() : ''
}

export function isUuid(raw: string | null | undefined): boolean {
  return Boolean(raw && UUID_RE.test(raw.trim()))
}

/**
 * true si el usuario pasa env AND BD.
 * envAllowlist === null → no hay candado env.
 * envAllowlist vacía → nadie.
 * dbAllowlist === null → no se aplicó el segundo factor (BD no leída).
 * dbAllowlist vacía → nadie (revocación Super Admin).
 */
export function isInCanonicalPilotAllowlist(
  usuarioId: string | null | undefined,
  envAllowlist: Set<string> | null,
  dbAllowlist: Set<string> | null
): boolean {
  const uid = normalizeUsuarioId(usuarioId)
  if (!uid || !UUID_RE.test(uid)) return false
  if (envAllowlist) {
    if (envAllowlist.size === 0 || !envAllowlist.has(uid)) return false
  }
  if (dbAllowlist) {
    if (dbAllowlist.size === 0 || !dbAllowlist.has(uid)) return false
  }
  return true
}

export async function loadPilotDbAllowlist(
  supabase: { from: (table: string) => any }
): Promise<Set<string> | null> {
  try {
    const { data, error } = await supabase
      .from('agent_execution_gate')
      .select('allowed_usuario_ids')
      .eq('id', true)
      .maybeSingle()
    if (error || !data) return null
    const raw = Array.isArray(data.allowed_usuario_ids) ? data.allowed_usuario_ids : []
    return new Set(
      raw
        .map((id: unknown) => String(id).trim().toLowerCase())
        .filter((id: string) => UUID_RE.test(id))
    )
  } catch {
    return null
  }
}
