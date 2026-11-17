import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { readStringEnv } from './http.js'

export const GUIDE_LINK_DURATION_MINUTES = 15
export const GUIDE_LINK_DEFAULT_DAYS = 30
export const GUIDE_LINK_MIN_DAYS = 1
export const GUIDE_LINK_MAX_DAYS = 90
export const GUIDE_GRANT_TTL_MS = 15 * 60 * 1000

export type GuideAccessMode = 'read' | 'propose' | 'interview_full_read'

export type GuideLinkRow = {
  id: string
  usuario_id: string
  status: string
  expires_at: string
  opened_at: string | null
  last_used_at: string | null
  use_count: number
  access_mode?: GuideAccessMode
}

/** Piloto: ligas de entrevista con lectura organizacional. Apagar con GUIDE_INTERVIEW_FULL_READ=0. */
export function interviewFullReadPilotEnabled() {
  const raw = readStringEnv('GUIDE_INTERVIEW_FULL_READ', '1').toLowerCase()
  return raw !== '0' && raw !== 'false' && raw !== 'off' && raw !== 'no'
}

export function normalizeGuideAccessMode(raw: unknown): GuideAccessMode {
  if (raw === 'propose') return 'propose'
  if (raw === 'interview_full_read') return 'interview_full_read'
  return 'read'
}

/**
 * Modo efectivo de una liga personal.
 * Piloto: interview_full_read = lectura org + escritura (acciones/comunicaciones).
 */
export function effectiveInviteAccessMode(stored?: unknown): GuideAccessMode {
  if (interviewFullReadPilotEnabled()) return 'interview_full_read'
  const mode = normalizeGuideAccessMode(stored)
  return mode === 'propose' ? 'propose' : mode
}

/** Escritura de tablero y propuestas: propose o liga piloto interview_full_read. */
export function isGuideWriteAllowed(mode: GuideAccessMode) {
  return mode === 'propose' || mode === 'interview_full_read'
}

/**
 * Cola de borradores de comunicación (correo/WhatsApp) durante la entrevista.
 * Permitido en propose y ligas read/interview_full_read (dueño de la sesión).
 */
export function canQueueCommunicationDraft(mode: GuideAccessMode) {
  return mode === 'propose' || mode === 'read' || mode === 'interview_full_read'
}

/**
 * Confirm/envío de comunicaciones: propose o liga piloto interview_full_read
 * (actúa como el dueño de la sesión; no ampliar a `read` puro).
 */
export function canSendCommunication(mode: GuideAccessMode) {
  return mode === 'propose' || mode === 'interview_full_read'
}

export function guideBoardScopeForAccessMode(mode: GuideAccessMode): 'role' | 'organization' {
  return mode === 'interview_full_read' ? 'organization' : 'role'
}

function guideGrantSecret() {
  const dedicated = readStringEnv('GUIDE_LINK_GRANT_SECRET')
  if (dedicated) return dedicated
  const fallback = readStringEnv('SUPABASE_SERVICE_ROLE_KEY')
  if (fallback) return fallback
  throw Object.assign(new Error('Falta GUIDE_LINK_GRANT_SECRET o SUPABASE_SERVICE_ROLE_KEY.'), {
    status: 503,
  })
}

/** Grant de corta vida tras consentimiento en la landing. No guarda el token plano. */
export function issueGuideAccessGrant(input: {
  linkId: string
  usuarioId: string
  accessMode: GuideAccessMode
  ttlMs?: number
}) {
  const exp = Date.now() + (input.ttlMs ?? GUIDE_GRANT_TTL_MS)
  const body = `${input.linkId}|${input.usuarioId}|${input.accessMode}|${exp}`
  const sig = createHmac('sha256', guideGrantSecret()).update(body, 'utf8').digest('base64url')
  return `${Buffer.from(body, 'utf8').toString('base64url')}.${sig}`
}

export function verifyGuideAccessGrant(
  grant: string,
  expected: { linkId: string; usuarioId: string }
): { ok: true; accessMode: GuideAccessMode; exp: number } | { ok: false; error: string } {
  const raw = (grant ?? '').trim()
  const dot = raw.lastIndexOf('.')
  if (dot <= 0) return { ok: false, error: 'Falta el consentimiento de la invitacion.' }
  const payloadB64 = raw.slice(0, dot)
  const sig = raw.slice(dot + 1)
  let body = ''
  try {
    body = Buffer.from(payloadB64, 'base64url').toString('utf8')
  } catch {
    return { ok: false, error: 'Consentimiento invalido.' }
  }
  const parts = body.split('|')
  if (parts.length !== 4) return { ok: false, error: 'Consentimiento invalido.' }
  const [linkId, usuarioId, mode, expRaw] = parts
  const exp = Number(expRaw)
  if (!linkId || !usuarioId || !Number.isFinite(exp)) {
    return { ok: false, error: 'Consentimiento invalido.' }
  }
  if (exp <= Date.now()) return { ok: false, error: 'El consentimiento expiro. Vuelve a la invitacion.' }
  if (linkId !== expected.linkId || usuarioId !== expected.usuarioId) {
    return { ok: false, error: 'El consentimiento no corresponde a esta liga.' }
  }
  let expectedSig = ''
  try {
    expectedSig = createHmac('sha256', guideGrantSecret()).update(body, 'utf8').digest('base64url')
  } catch {
    return { ok: false, error: 'No se pudo verificar el consentimiento.' }
  }
  const a = Buffer.from(sig)
  const b = Buffer.from(expectedSig)
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, error: 'Consentimiento invalido.' }
  }
  return { ok: true, accessMode: normalizeGuideAccessMode(mode), exp }
}

export function hashGuideToken(token: string) {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

export function generateGuideToken() {
  return randomBytes(32).toString('base64url')
}

export function clampGuideLinkDays(raw: unknown) {
  const n = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(n)) return GUIDE_LINK_DEFAULT_DAYS
  return Math.min(GUIDE_LINK_MAX_DAYS, Math.max(GUIDE_LINK_MIN_DAYS, Math.round(n)))
}

export function guideAppBaseUrl() {
  const fromEnv =
    readStringEnv('APP_PUBLIC_URL') ||
    readStringEnv('APP_BASE_URL') ||
    readStringEnv('SITE_URL') ||
    readStringEnv('VITE_APP_URL') ||
    ''
  const cleaned = fromEnv.replace(/\/+$/, '')
  return cleaned || 'https://scrumbanemx.vercel.app'
}

/** Origins allowed when the client suggests a base URL for invitation links. */
export function isAllowedGuideAppOrigin(raw: string | null | undefined) {
  const cleaned = (raw ?? '').trim().replace(/\/+$/, '')
  if (!cleaned) return false
  let url: URL
  try {
    url = new URL(cleaned)
  } catch {
    return false
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false
  const host = url.hostname.toLowerCase()
  if (host === 'localhost' || host === '127.0.0.1' || host === '[::1]') return true
  if (host === 'scrumbanemx.vercel.app' || host.endsWith('.vercel.app')) return true
  const configured = [
    readStringEnv('APP_PUBLIC_URL'),
    readStringEnv('APP_BASE_URL'),
    readStringEnv('SITE_URL'),
    readStringEnv('VITE_APP_URL'),
    readStringEnv('APP_URL'),
  ]
  return configured.some((value) => {
    if (!value) return false
    try {
      return new URL(value).origin === url.origin
    } catch {
      return false
    }
  })
}

export function resolveGuideAppBaseUrl(preferred?: string | null) {
  const candidate = (preferred ?? '').trim().replace(/\/+$/, '')
  if (candidate && isAllowedGuideAppOrigin(candidate)) return candidate
  return guideAppBaseUrl()
}

export function buildGuideInvitationUrl(token: string, baseUrl?: string | null) {
  const base = resolveGuideAppBaseUrl(baseUrl)
  return `${base}/guia/invitacion/${encodeURIComponent(token)}`
}

export function normalizeGuideLinkToken(raw: string) {
  const trimmed = raw.trim()
  if (!trimmed) return ''
  try {
    return decodeURIComponent(trimmed)
  } catch {
    return trimmed
  }
}

export async function createGuideUserLink(
  supabase: SupabaseClient,
  input: {
    usuarioId: string
    createdBy?: string | null
    expiresInDays?: number
    source?: string | null
    appBaseUrl?: string | null
  }
): Promise<{
  link: string
  expires_at: string
  usuario_id: string
  user_name: string
  link_id: string
  access_mode: GuideAccessMode
}> {
  const { data: usuario, error: userError } = await supabase
    .from('usuarios')
    .select('id,nombre,activo')
    .eq('id', input.usuarioId)
    .maybeSingle()
  if (userError || !usuario?.id) {
    throw Object.assign(new Error('Usuario destino no encontrado.'), { status: 404 })
  }
  if (usuario.activo === false) {
    throw Object.assign(new Error('El usuario destino no está activo.'), { status: 409 })
  }

  const days = clampGuideLinkDays(input.expiresInDays)
  const token = generateGuideToken()
  const tokenHash = hashGuideToken(token)
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString()
  const source = input.source ?? null

  // WhatsApp: una sola liga activa por usuario/origen (revoca previas antes de insertar).
  if (source === 'whatsapp') {
    const now = new Date().toISOString()
    await supabase
      .from('guide_user_links')
      .update({ status: 'revoked', revoked_at: now, updated_at: now })
      .eq('usuario_id', usuario.id)
      .eq('status', 'active')
      .eq('source', 'whatsapp')
  }

  const accessMode: GuideAccessMode = effectiveInviteAccessMode('read')
  let inserted = await supabase
    .from('guide_user_links')
    .insert({
      usuario_id: usuario.id,
      token_hash: tokenHash,
      status: 'active',
      expires_at: expiresAt,
      created_by: input.createdBy ?? null,
      source,
      access_mode: accessMode,
    })
    .select('id,expires_at,access_mode')
    .single()

  if (inserted.error && /access_mode|interview_full_read|check/i.test(inserted.error.message ?? '')) {
    inserted = await supabase
      .from('guide_user_links')
      .insert({
        usuario_id: usuario.id,
        token_hash: tokenHash,
        status: 'active',
        expires_at: expiresAt,
        created_by: input.createdBy ?? null,
        source,
        access_mode: 'read',
      })
      .select('id,expires_at,access_mode')
      .single()
  }
  if (inserted.error && /access_mode/i.test(inserted.error.message ?? '')) {
    inserted = await supabase
      .from('guide_user_links')
      .insert({
        usuario_id: usuario.id,
        token_hash: tokenHash,
        status: 'active',
        expires_at: expiresAt,
        created_by: input.createdBy ?? null,
        source,
      })
      .select('id,expires_at')
      .single()
  }

  const row = inserted.data
  const error = inserted.error
  if (error || !row) {
    if (/guide_user_links|PGRST205|42P01/i.test(error?.message ?? '')) {
      throw Object.assign(
        new Error('Falta la tabla guide_user_links. Aplica la migración 20261108120000_guide_user_links.sql.'),
        { status: 503 }
      )
    }
    throw Object.assign(new Error(error?.message || 'No se pudo crear la liga.'), { status: 500 })
  }

  return {
    link: buildGuideInvitationUrl(token, input.appBaseUrl),
    expires_at: String(row.expires_at),
    usuario_id: usuario.id,
    user_name: typeof usuario.nombre === 'string' && usuario.nombre.trim() ? usuario.nombre.trim() : 'Usuario',
    link_id: String(row.id),
    access_mode: effectiveInviteAccessMode((row as { access_mode?: unknown }).access_mode ?? accessMode),
  }
}

export async function validateGuideUserLink(
  supabase: SupabaseClient,
  input: { token: string; markOpened?: boolean }
): Promise<{
  valid: true
  link_id: string
  usuario_id: string
  user_name: string
  expires_at: string
  duration_minutes: number
  source: string | null
  access_mode: GuideAccessMode
}> {
  const token = normalizeGuideLinkToken(input.token)
  if (token.length < 32) {
    throw Object.assign(new Error('Liga inválida.'), { status: 400 })
  }
  const tokenHash = hashGuideToken(token)
  let rowQuery = await supabase
    .from('guide_user_links')
    .select('id,usuario_id,status,expires_at,opened_at,source,access_mode')
    .eq('token_hash', tokenHash)
    .maybeSingle()
  if (rowQuery.error && /access_mode/i.test(rowQuery.error.message ?? '')) {
    rowQuery = await supabase
      .from('guide_user_links')
      .select('id,usuario_id,status,expires_at,opened_at,source')
      .eq('token_hash', tokenHash)
      .maybeSingle()
  }
  const { data: row, error } = rowQuery

  if (error) {
    if (/guide_user_links|PGRST205|42P01/i.test(error.message)) {
      throw Object.assign(
        new Error('Falta la tabla guide_user_links. Aplica la migración correspondiente.'),
        { status: 503 }
      )
    }
    throw Object.assign(new Error('No se pudo validar la liga.'), { status: 500 })
  }
  if (!row?.id) {
    throw Object.assign(new Error('Liga inválida.'), { status: 400 })
  }
  if (row.status !== 'active') {
    throw Object.assign(new Error('Esta liga ya no está disponible.'), { status: 410 })
  }
  if (new Date(row.expires_at).getTime() <= Date.now()) {
    await supabase
      .from('guide_user_links')
      .update({ status: 'expired', updated_at: new Date().toISOString() })
      .eq('id', row.id)
      .eq('status', 'active')
    throw Object.assign(new Error('Esta liga expiró.'), { status: 410 })
  }

  const { data: usuario, error: userError } = await supabase
    .from('usuarios')
    .select('id,nombre,activo')
    .eq('id', row.usuario_id)
    .maybeSingle()
  if (userError || !usuario?.id || usuario.activo === false) {
    throw Object.assign(new Error('El usuario de esta liga no está disponible.'), { status: 410 })
  }

  if (input.markOpened && !row.opened_at) {
    const now = new Date().toISOString()
    await supabase
      .from('guide_user_links')
      .update({ opened_at: now, last_used_at: now, updated_at: now })
      .eq('id', row.id)
      .is('opened_at', null)
  }

  return {
    valid: true,
    link_id: String(row.id),
    usuario_id: String(row.usuario_id),
    user_name: typeof usuario.nombre === 'string' && usuario.nombre.trim() ? usuario.nombre.trim() : 'Usuario',
    expires_at: String(row.expires_at),
    duration_minutes: GUIDE_LINK_DURATION_MINUTES,
    source: typeof row.source === 'string' ? row.source : null,
    access_mode: effectiveInviteAccessMode((row as { access_mode?: unknown }).access_mode),
  }
}

export async function resolveGuideLinkOwner(
  supabase: SupabaseClient,
  token: string
): Promise<{
  link_id: string
  usuario_id: string
  user_name: string
  source: string | null
  access_mode: GuideAccessMode
}> {
  const validated = await validateGuideUserLink(supabase, { token, markOpened: false })
  return {
    link_id: validated.link_id,
    usuario_id: validated.usuario_id,
    user_name: validated.user_name,
    source: validated.source,
    access_mode: validated.access_mode,
  }
}

export function guideAccessGrantStorageKey(token: string) {
  return `guide_access_grant:${normalizeGuideLinkToken(token)}`
}

export async function markGuideLinkUsed(supabase: SupabaseClient, linkId: string) {
  const now = new Date().toISOString()
  const { data: current } = await supabase
    .from('guide_user_links')
    .select('use_count')
    .eq('id', linkId)
    .maybeSingle()
  const next = (typeof current?.use_count === 'number' ? current.use_count : 0) + 1
  await supabase
    .from('guide_user_links')
    .update({ use_count: next, last_used_at: now, updated_at: now })
    .eq('id', linkId)
}
