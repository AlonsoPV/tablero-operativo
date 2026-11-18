/**
 * Resuelve destinatarios de comunicaciones por nombre, rol o área.
 * Ambiguo / equipo → needs_info; nunca elige al azar ni cruza orgs.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { NamedPerson } from '../../src/features/ai-support/copilot/matching.js'
import { searchActivePeopleByName } from './searchActivePeople.js'

export type ResolvedCommunicationRecipient = {
  toUserId: string | null
  phone: string | null
  email: string | null
  name: string | null
  ambiguous: boolean
  needsInfoReason: string | null
}

function fold(value: string) {
  return value
    .trim()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
}

const TEAM_HINT =
  /\b(equipo|participantes|todos|la reunion|el grupo|area completa|todo el equipo)\b/i

const ROLE_ALIASES: Array<{ re: RegExp; tokens: string[] }> = [
  { re: /\b(mi )?director(a)?\b/i, tokens: ['director', 'directora'] },
  { re: /\bgerent(e|a)\b/i, tokens: ['gerente'] },
  { re: /\bresponsable\b/i, tokens: ['responsable'] },
  { re: /\boperacion(es)?\b/i, tokens: ['operacion', 'operaciones', 'ops'] },
  { re: /\bcomercial\b/i, tokens: ['comercial', 'ventas'] },
  { re: /\bfinanzas\b/i, tokens: ['finanzas'] },
  { re: /\brh\b|\brecursos humanos\b/i, tokens: ['rh', 'recursos humanos'] },
  { re: /\bdireccion\b/i, tokens: ['director', 'direccion'] },
]

function extractRoleAreaTokens(hint: string): string[] {
  const tokens = new Set<string>()
  for (const alias of ROLE_ALIASES) {
    if (alias.re.test(hint)) {
      for (const t of alias.tokens) tokens.add(t)
    }
  }
  return [...tokens]
}

function matchByRoleOrArea(people: NamedPerson[], hint: string): NamedPerson[] {
  const tokens = extractRoleAreaTokens(hint)
  if (!tokens.length) return []
  const wantOps = /\boperacion/i.test(hint)
  const wantResponsable = /\bresponsable\b/i.test(hint)
  return people.filter((person) => {
    const rol = fold(person.rol || '')
    const area = fold(person.area || '')
    const hay = `${rol} ${area}`
    const tokenHit = tokens.some((t) => hay.includes(fold(t)))
    if (!tokenHit) return false
    if (wantOps && wantResponsable) {
      return (
        (rol.includes('responsable') || hay.includes('responsable')) &&
        (area.includes('operacion') || rol.includes('operacion') || hay.includes('ops'))
      )
    }
    return true
  })
}

async function loadActivePeople(supabase: SupabaseClient): Promise<NamedPerson[]> {
  const { data, error } = await supabase
    .from('usuarios')
    .select('id,nombre,rol,area,activo')
    .eq('activo', true)
    .limit(200)
  if (error) throw error
  return ((data ?? []) as NamedPerson[]).filter((u) => u?.id)
}

async function loadWhatsappPhone(supabase: SupabaseClient, usuarioId: string) {
  const { data, error } = await supabase
    .from('user_channel_identities')
    .select('external_user_id,status')
    .eq('channel', 'whatsapp')
    .eq('usuario_id', usuarioId)
    .eq('status', 'active')
    .maybeSingle()
  if (error) throw new Error('DATABASE_ERROR: No se pudo consultar el contacto de WhatsApp.')
  return typeof data?.external_user_id === 'string' ? data.external_user_id : null
}

export async function searchLinkedWhatsappPeople(
  supabase: SupabaseClient,
  contacts: () => SupabaseClient,
  query: string
) {
  if (query.trim().length < 2) return []
  const people = await searchActivePeopleByName(supabase, query.trim().slice(0, 100), 40, {
    includePartialMatches: true,
  })
  if (people.length === 0) return []
  const { data, error } = await contacts()
    .from('user_channel_identities')
    .select('usuario_id,external_user_id')
    .eq('channel', 'whatsapp')
    .eq('status', 'active')
    .in('usuario_id', people.map((person) => person.id))
  if (error) throw new Error('DATABASE_ERROR: No se pudo consultar el directorio de WhatsApp.')
  const linkedIds = new Set((data ?? [])
    .filter((row) => /^\d{10,15}$/.test(String(row.external_user_id).replace(/\D/g, '')))
    .map((row) => row.usuario_id))
  return people.filter((person) => linkedIds.has(person.id))
}

export async function resolveLinkedWhatsappPerson(
  supabase: SupabaseClient,
  contacts: () => SupabaseClient,
  usuarioId: string
) {
  const { data: person, error } = await supabase
    .from('usuarios')
    .select('id,nombre')
    .eq('id', usuarioId)
    .eq('activo', true)
    .maybeSingle()
  if (error) throw new Error('DATABASE_ERROR: No se pudo verificar al destinatario.')
  if (!person) throw new Error('VALIDATION_FAILED: Selecciona un usuario activo del directorio.')
  const phone = await loadWhatsappPhone(contacts(), usuarioId)
  if (!phone || !/^\d{10,15}$/.test(phone.replace(/\D/g, ''))) {
    throw new Error('MISSING_CONTACT: El usuario ya no tiene WhatsApp vinculado.')
  }
  return { toUserId: usuarioId, phone, name: String(person.nombre), needsInfoReason: null }
}

async function loadPersonEmail(supabase: SupabaseClient, usuarioId: string) {
  const { data, error } = await supabase.rpc('assistant_person_email', { p_usuario_id: usuarioId })
  if (error) throw new Error('DATABASE_ERROR: No se pudo consultar el correo.')
  return typeof data === 'string' && data.trim() ? data.trim().toLowerCase() : null
}

export async function resolveCommunicationRecipient(
  supabase: SupabaseClient,
  recipientHint: string,
  channel: 'whatsapp' | 'email' = 'whatsapp',
  options?: { selfId?: string; contactClient?: () => SupabaseClient }
): Promise<ResolvedCommunicationRecipient> {
  const hint = recipientHint.trim()
  if (!hint) {
    return {
      toUserId: null,
      phone: null,
      email: null,
      name: null,
      ambiguous: false,
      needsInfoReason:
        channel === 'email'
          ? 'Falta el destinatario del correo.'
          : 'Falta el destinatario del WhatsApp.',
    }
  }

  if (TEAM_HINT.test(hint)) {
    return {
      toUserId: null,
      phone: null,
      email: null,
      name: null,
      ambiguous: true,
      needsInfoReason: `"${hint}" parece un grupo. Indica una persona concreta en el informe.`,
    }
  }

  let matches: NamedPerson[]
  if (options?.selfId && /^(yo|mi|a mi|para mi|a mi mismo|a mi misma)$/.test(fold(hint))) {
    const { data, error } = await supabase.from('usuarios').select('id,nombre')
      .eq('id', options.selfId).eq('activo', true).maybeSingle()
    if (error) throw new Error('DATABASE_ERROR: No se pudo consultar tu perfil.')
    matches = data ? [data as NamedPerson] : []
  } else {
    matches = await searchActivePeopleByName(supabase, hint)
  }
  if (matches.length === 0 && extractRoleAreaTokens(hint).length) {
    const people = await loadActivePeople(supabase)
    matches = matchByRoleOrArea(people, hint)
  }

  if (matches.length === 0) {
    return {
      toUserId: null,
      phone: null,
      email: null,
      name: null,
      ambiguous: false,
      needsInfoReason: `No encontre a "${hint}" en Scrumban (nombre, rol o area).`,
    }
  }

  if (matches.length > 1) {
    const sample = matches
      .slice(0, 3)
      .map((p) => p.nombre)
      .filter(Boolean)
      .join(', ')
    return {
      toUserId: null,
      phone: null,
      email: null,
      name: null,
      ambiguous: true,
      needsInfoReason: `Hay varias personas que coinciden con "${hint}"${sample ? ` (${sample})` : ''}. Indica el nombre completo.`,
    }
  }

  const user = matches[0]
  const name = typeof user.nombre === 'string' ? user.nombre : hint
  const toUserId = String(user.id)

  if (channel === 'email') {
    const email = await loadPersonEmail(supabase, toUserId)
    if (!email) {
      return {
        toUserId,
        phone: null,
        email: null,
        name,
        ambiguous: false,
        needsInfoReason: `${name} no tiene correo disponible en Scrumban.`,
      }
    }
    return {
      toUserId,
      phone: null,
      email,
      name,
      ambiguous: false,
      needsInfoReason: null,
    }
  }

  const phone = await loadWhatsappPhone(options?.contactClient?.() ?? supabase, toUserId)
  if (!phone) {
    return {
      toUserId,
      phone: null,
      email: null,
      name,
      ambiguous: false,
      needsInfoReason: `${name} no tiene WhatsApp vinculado en Scrumban.`,
    }
  }

  return {
    toUserId,
    phone,
    email: null,
    name,
    ambiguous: false,
    needsInfoReason: null,
  }
}

/** Compat: callers that only need WhatsApp fields. */
export async function resolveWhatsappRecipient(
  supabase: SupabaseClient,
  recipientHint: string
): Promise<{
  toUserId: string | null
  phone: string | null
  name: string | null
  ambiguous: boolean
  needsInfoReason: string | null
}> {
  const resolved = await resolveCommunicationRecipient(supabase, recipientHint, 'whatsapp')
  return {
    toUserId: resolved.toUserId,
    phone: resolved.phone,
    name: resolved.name,
    ambiguous: resolved.ambiguous,
    needsInfoReason: resolved.needsInfoReason,
  }
}
