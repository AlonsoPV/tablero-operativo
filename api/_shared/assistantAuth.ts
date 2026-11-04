/**
 * Auth compartida para endpoints privados del Asistente IA / Guía en Vercel.
 * Valida JWT Supabase y restringe a área OKRS o Super Admin.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { VercelRequestLike } from './http.js'

export type AssistantAuthSuccess = {
  ok: true
  token: string
  authUserId: string
  usuarioId: string
  rol: string | null
  supabase: SupabaseClient
}

export type AssistantAuthFailure = {
  ok: false
  status: 401 | 403 | 500
  error: string
}

export type AssistantAuthResult = AssistantAuthSuccess | AssistantAuthFailure

export type RequireAssistantAuthOptions = {
  /**
   * Si true (default), exige área OKRS o Super Admin.
   * false solo valida sesión/perfil activo (uso interno excepcional).
   */
  requireAiModule?: boolean
}

function readHeader(req: VercelRequestLike, name: string) {
  const wanted = name.toLowerCase()
  const headers = req.headers ?? {}
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() !== wanted) continue
    if (Array.isArray(value)) return value[0]
    return typeof value === 'string' ? value : undefined
  }
  return undefined
}

export function readAuthToken(req: VercelRequestLike): string | null {
  const header = readHeader(req, 'authorization')
  if (!header) return null
  const match = header.match(/^Bearer\s+(.+)$/i)
  return match?.[1]?.trim() || null
}

export function createUserClient(token: string): SupabaseClient {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const anon = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !anon) {
    throw new Error('missing_supabase')
  }
  return createClient(url, anon, {
    global: {
      fetch: (input, init) => {
        const headers = new Headers(init?.headers)
        headers.set('Authorization', `Bearer ${token}`)
        headers.set('apikey', anon)
        return fetch(input, { ...init, headers })
      },
    },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}

function normalizeRole(rol: string | null | undefined): string {
  return (rol ?? '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es-MX')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

async function isSuperAdminAssistantUser(
  supabase: SupabaseClient,
  authUserId: string,
  rol: string | null
): Promise<boolean> {
  if (normalizeRole(rol) === 'super_admin') return true

  const { data: roles } = await supabase
    .from('user_roles')
    .select('app_role')
    .eq('user_id', authUserId)

  const appRoles = (roles ?? []).map((row) => normalizeRole(String((row as { app_role?: string }).app_role)))
  return appRoles.some((r) => r === 'super_admin')
}

async function belongsToOkrsArea(
  supabase: SupabaseClient,
  usuarioId: string,
  primaryArea: string | null
): Promise<boolean> {
  if (normalizeRole(primaryArea) === 'okrs') return true

  const { data: areaLinks } = await supabase
    .from('usuario_areas')
    .select('area_id, areas(nombre)')
    .eq('user_id', usuarioId)

  return (areaLinks ?? []).some((row) => {
    const areas = (row as { areas?: { nombre?: string } | { nombre?: string }[] | null }).areas
    const nombre = Array.isArray(areas) ? areas[0]?.nombre : areas?.nombre
    return normalizeRole(nombre) === 'okrs'
  })
}

/**
 * Exige Bearer JWT válido + fila en `usuarios` + (opcional) área OKRS / Super Admin.
 */
export async function requireAssistantAuth(
  req: VercelRequestLike,
  options: RequireAssistantAuthOptions = {}
): Promise<AssistantAuthResult> {
  const requireAiScope = options.requireAiModule !== false
  const token = readAuthToken(req)
  if (!token) {
    return { ok: false, status: 401, error: 'Falta Authorization Bearer. Inicia sesion.' }
  }

  let supabase: SupabaseClient
  try {
    supabase = createUserClient(token)
  } catch {
    return {
      ok: false,
      status: 500,
      error: 'Falta SUPABASE_URL / SUPABASE_ANON_KEY (o VITE_*) en el servidor.',
    }
  }

  const { data: authData, error: authError } = await supabase.auth.getUser(token)
  if (authError || !authData.user?.id) {
    return { ok: false, status: 401, error: 'Sesion invalida. Vuelve a iniciar sesion.' }
  }

  const { data: usuario, error: usuarioError } = await supabase
    .from('usuarios')
    .select('id,rol,activo,area')
    .eq('user_id', authData.user.id)
    .maybeSingle()

  if (usuarioError || !usuario?.id) {
    return { ok: false, status: 403, error: 'No hay un perfil de usuario activo para el asistente.' }
  }

  if (usuario.activo === false) {
    return { ok: false, status: 403, error: 'Tu usuario esta inactivo.' }
  }

  const rol = typeof usuario.rol === 'string' ? usuario.rol : null
  const area = typeof usuario.area === 'string' ? usuario.area : null

  if (requireAiScope) {
    const privileged = await isSuperAdminAssistantUser(supabase, authData.user.id, rol)
    if (!privileged) {
      const inOkrs = await belongsToOkrsArea(supabase, usuario.id as string, area)
      if (!inOkrs) {
        return {
          ok: false,
          status: 403,
          error: 'El Asistente IA solo esta disponible para el area OKRs y Super Admin.',
        }
      }
    }
  }

  return {
    ok: true,
    token,
    authUserId: authData.user.id,
    usuarioId: usuario.id as string,
    rol,
    supabase,
  }
}

/** Ventana deslizante en memoria por instancia (best-effort en serverless). */
const rateBuckets = new Map<string, number[]>()

export function checkAssistantRateLimit(input: {
  key: string
  limit: number
  windowMs: number
}): { ok: true } | { ok: false; retryAfterSec: number } {
  const now = Date.now()
  const windowMs = Math.max(1_000, input.windowMs)
  const limit = Math.max(1, input.limit)
  const prev = rateBuckets.get(input.key) ?? []
  const recent = prev.filter((ts) => now - ts < windowMs)
  if (recent.length >= limit) {
    const oldest = recent[0] ?? now
    const retryAfterSec = Math.max(1, Math.ceil((windowMs - (now - oldest)) / 1000))
    rateBuckets.set(input.key, recent)
    return { ok: false, retryAfterSec }
  }
  recent.push(now)
  rateBuckets.set(input.key, recent)

  // Evitar crecimiento indefinido en instancias longevas.
  if (rateBuckets.size > 5_000) {
    const cutoff = now - windowMs * 2
    for (const [k, stamps] of rateBuckets) {
      const next = stamps.filter((ts) => ts >= cutoff)
      if (next.length === 0) rateBuckets.delete(k)
      else rateBuckets.set(k, next)
    }
  }

  return { ok: true }
}

/** Solo para tests. */
export function __resetAssistantRateLimitForTests() {
  rateBuckets.clear()
}
