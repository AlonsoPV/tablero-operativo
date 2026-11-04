/**
 * Autocontenida: --use-api / Dashboard solo sube index.ts (no ../_shared).
 */
// @ts-nocheck — runtime Deno Edge; el bundler exige specifier npm:
import { createClient } from 'npm:@supabase/supabase-js@2'

declare const Deno: {
  env: { get(key: string): string | undefined }
  serve: (handler: (req: Request) => Response | Promise<Response>) => void
}

const DEFAULT_ALLOWED_ORIGINS = [
  'https://scrumbanemx.vercel.app',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
]

function allowedOrigins(): string[] {
  const fromEnv = (Deno.env.get('CORS_ALLOWED_ORIGINS') || '')
    .split(',')
    .map((v: string) => v.trim())
    .filter(Boolean)
  const appBase = (Deno.env.get('APP_BASE_URL') || Deno.env.get('APP_PUBLIC_URL') || '').replace(
    /\/+$/,
    ''
  )
  const list = [...DEFAULT_ALLOWED_ORIGINS, ...fromEnv]
  if (appBase) list.push(appBase)
  return [...new Set(list)]
}

function corsHeadersFor(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin')?.trim() || ''
  const allowed = allowedOrigins()
  const allowOrigin = origin && allowed.includes(origin) ? origin : allowed[0] || '*'
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type, x-supabase-api-version, prefer, accept',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}

function jsonResponse(body: unknown, status = 200, req?: Request): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...(req ? corsHeadersFor(req) : corsHeadersFor(new Request('http://localhost'))),
      'Content-Type': 'application/json; charset=utf-8',
    },
  })
}

function handleCorsPreflight(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeadersFor(req) })
  }
  return null
}

const ADMIN_BUSINESS_ROLES = ['dg', 'sistemas', 'super_admin'] as const
const DIRECTION_ROLE = 'direccion'

function normalizeBusinessRole(rol: unknown): string {
  return (typeof rol === 'string' ? rol : '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es-MX')
}

function isDirectionRole(rol: unknown): boolean {
  return normalizeBusinessRole(rol) === DIRECTION_ROLE
}

function isBusinessAdminRole(rol: unknown): boolean {
  const normalized = normalizeBusinessRole(rol)
  return ADMIN_BUSINESS_ROLES.some((role) => normalized === role)
}

function canInviteUsers(params: {
  appRole: string | null | undefined
  businessRol: unknown
  activo: boolean | null | undefined
}): boolean {
  const isAppAdmin = params.appRole === 'admin' || params.appRole === 'super_admin'
  const businessAllowed =
    Boolean(params.activo) &&
    (isDirectionRole(params.businessRol) || isBusinessAdminRole(params.businessRol))
  return isAppAdmin || businessAllowed
}

async function requireAuthUser(req: Request) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!supabaseUrl || !serviceRoleKey) {
    return {
      ok: false as const,
      response: jsonResponse({ error: 'Configuración de servidor incompleta' }, 500, req),
    }
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return {
      ok: false as const,
      response: jsonResponse({ error: 'No autorizado' }, 401, req),
    }
  }

  const token = authHeader.slice(7)
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  })

  const { data: userData, error: userError } = await adminClient.auth.getUser(token)
  if (userError || !userData.user) {
    return {
      ok: false as const,
      response: jsonResponse({ error: 'Sesión inválida' }, 401, req),
    }
  }

  return {
    ok: true as const,
    data: { user: userData.user, token },
  }
}

type InviteUserPayload = {
  email?: string
  nombre?: string
  rol?: string
  area?: string | null
  activo?: boolean
}

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function generateTemporaryPassword(length = 16): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%'
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  let out = ''
  for (let i = 0; i < length; i++) out += alphabet[bytes[i]! % alphabet.length]
  return out
}

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req)
  if (preflight) return preflight

  if (req.method !== 'POST') {
    return jsonResponse({ ok: false, message: 'Metodo no permitido' }, 405, req)
  }

  const auth = await requireAuthUser(req)
  if (!auth.ok) {
    const payload = (await auth.response.json().catch(() => ({}))) as { error?: string }
    const message =
      payload.error === 'Sesión inválida'
        ? 'Sesion invalida'
        : payload.error === 'No autorizado'
          ? 'No autorizado'
          : 'No se pudo validar permisos'
    const status = auth.response.status === 401 ? 401 : auth.response.status
    return jsonResponse({ ok: false, message }, status, req)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ ok: false, message: 'Faltan credenciales de Supabase' }, 500, req)
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  })

  const callerId = auth.data.user.id

  const { data: roleRow, error: roleError } = await adminClient
    .from('user_roles')
    .select('app_role')
    .eq('user_id', callerId)
    .maybeSingle()

  if (roleError) {
    return jsonResponse({ ok: false, message: 'No se pudo validar permisos' }, 500, req)
  }

  const { data: businessRoleRow, error: businessRoleError } = await adminClient
    .from('usuarios')
    .select('rol, activo')
    .eq('user_id', callerId)
    .maybeSingle()

  if (businessRoleError) {
    return jsonResponse({ ok: false, message: 'No se pudo validar permisos' }, 500, req)
  }

  if (
    !canInviteUsers({
      appRole: roleRow?.app_role,
      businessRol: businessRoleRow?.rol,
      activo: businessRoleRow?.activo,
    })
  ) {
    return jsonResponse(
      { ok: false, message: 'Solo administradores pueden invitar usuarios' },
      403,
      req
    )
  }

  const body = (await req.json().catch(() => null)) as InviteUserPayload | null
  const email = normalizeText(body?.email).toLowerCase()
  const nombre = normalizeText(body?.nombre)
  const rol = normalizeText(body?.rol)
  const area = normalizeText(body?.area)

  if (!email || !nombre || !rol) {
    return jsonResponse({ ok: false, message: 'Correo, nombre y rol son obligatorios' }, 400, req)
  }

  const userMetadata = {
    nombre,
    rol,
    area: area || undefined,
    activo: body?.activo ?? true,
  }

  const temporaryPassword = generateTemporaryPassword()

  const { data: createData, error: createError } = await adminClient.auth.admin.createUser({
    email,
    password: temporaryPassword,
    email_confirm: true,
    user_metadata: {
      ...userMetadata,
      must_reset_password: true,
    },
  })

  if (createError) {
    const message = createError.message || 'No se pudo crear el usuario'
    const status = /already|exists|registered/i.test(message) ? 409 : 400
    return jsonResponse({ ok: false, message }, status, req)
  }

  const invitedUserId = createData.user?.id
  if (!invitedUserId) {
    return jsonResponse(
      { ok: false, message: 'No se pudo obtener el identificador del usuario creado' },
      500,
      req
    )
  }

  const { data: profile, error: profileUpsertError } = await adminClient
    .from('usuarios')
    .upsert(
      {
        user_id: invitedUserId,
        nombre,
        rol,
        area: area || null,
        activo: body?.activo ?? true,
      },
      { onConflict: 'user_id' }
    )
    .select('id, user_id, nombre, rol, area, activo, created_at, updated_at')
    .single()

  if (profileUpsertError) {
    return jsonResponse(
      {
        ok: false,
        message:
          profileUpsertError.message || 'Usuario creado, pero no se pudo registrar su perfil',
      },
      500,
      req
    )
  }

  const { error: roleInsertError } = await adminClient.from('user_roles').upsert(
    { user_id: invitedUserId, app_role: 'viewer' },
    { onConflict: 'user_id' }
  )

  if (roleInsertError) {
    return jsonResponse(
      {
        ok: false,
        message:
          roleInsertError.message || 'Usuario creado, pero no se pudo asignar rol de aplicacion',
      },
      500,
      req
    )
  }

  return jsonResponse(
    {
      ok: true,
      message:
        'Usuario creado y confirmado. Comparte la contraseña temporal por un canal seguro; el usuario debera cambiarla.',
      email,
      user_id: invitedUserId,
      temporary_password: temporaryPassword,
      profile: profile ? { ...profile, email } : null,
    },
    200,
    req
  )
})
