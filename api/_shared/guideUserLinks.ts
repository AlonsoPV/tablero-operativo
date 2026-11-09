import { createHash, randomBytes } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { readStringEnv } from './http.js'

export const GUIDE_LINK_DURATION_MINUTES = 15
export const GUIDE_LINK_DEFAULT_DAYS = 30
export const GUIDE_LINK_MIN_DAYS = 1
export const GUIDE_LINK_MAX_DAYS = 90

export type GuideLinkRow = {
  id: string
  usuario_id: string
  status: string
  expires_at: string
  opened_at: string | null
  last_used_at: string | null
  use_count: number
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

export function buildGuideInvitationUrl(token: string) {
  return `${guideAppBaseUrl()}/guia/invitacion/${encodeURIComponent(token)}`
}

export async function createGuideUserLink(
  supabase: SupabaseClient,
  input: {
    usuarioId: string
    createdBy?: string | null
    expiresInDays?: number
    source?: string | null
  }
): Promise<{ link: string; expires_at: string; usuario_id: string; user_name: string; link_id: string }> {
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

  const { data: row, error } = await supabase
    .from('guide_user_links')
    .insert({
      usuario_id: usuario.id,
      token_hash: tokenHash,
      status: 'active',
      expires_at: expiresAt,
      created_by: input.createdBy ?? null,
      source: input.source ?? null,
    })
    .select('id,expires_at')
    .single()

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
    link: buildGuideInvitationUrl(token),
    expires_at: String(row.expires_at),
    usuario_id: usuario.id,
    user_name: typeof usuario.nombre === 'string' && usuario.nombre.trim() ? usuario.nombre.trim() : 'Usuario',
    link_id: String(row.id),
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
}> {
  const token = input.token.trim()
  if (token.length < 32) {
    throw Object.assign(new Error('Liga inválida.'), { status: 400 })
  }
  const tokenHash = hashGuideToken(token)
  const { data: row, error } = await supabase
    .from('guide_user_links')
    .select('id,usuario_id,status,expires_at,opened_at')
    .eq('token_hash', tokenHash)
    .maybeSingle()

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
  }
}

export async function resolveGuideLinkOwner(
  supabase: SupabaseClient,
  token: string
): Promise<{ link_id: string; usuario_id: string; user_name: string }> {
  const validated = await validateGuideUserLink(supabase, { token, markOpened: false })
  return {
    link_id: validated.link_id,
    usuario_id: validated.usuario_id,
    user_name: validated.user_name,
  }
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
