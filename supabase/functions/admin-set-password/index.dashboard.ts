/**
 * Versión autocontenida para pegar en Supabase Dashboard → Edge Functions → admin-set-password.
 * Reemplaza TODO el contenido del editor por este archivo.
 *
 * Proyecto PROD (scrumbanemx): xhpasmjzuwifmjhrsumb
 *
 * Configuración:
 * - verify_jwt: OFF (la función valida el JWT internamente)
 * - Secrets: SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY (suelen estar predefinidos)
 *
 * Mantener en sync con index.ts + _shared cuando alguien pueda usar CLI deploy.
 */
// @ts-nocheck — runtime Deno Edge; el bundler de Supabase exige import npm:
import { createClient } from 'npm:@supabase/supabase-js@2'

/** Runtime Deno en Supabase Edge (el IDE del repo no lo incluye por defecto). */
declare const Deno: {
  env: { get(key: string): string | undefined }
  serve: (handler: (req: Request) => Response | Promise<Response>) => void
}

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json; charset=utf-8',
    },
  })
}

function handleCorsPreflight(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }
  return null
}

const ADMIN_BUSINESS_ROLES = ['dg', 'sistemas', 'super_admin'] as const
const DIRECTION_ROLE = 'direccion'
const PASSWORD_MIN_LENGTH = 6
const PASSWORD_MAX_LENGTH = 72
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

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
      response: jsonResponse({ error: 'Configuración de servidor incompleta' }, 500),
    }
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return {
      ok: false as const,
      response: jsonResponse({ error: 'No autorizado' }, 401),
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
      response: jsonResponse({ error: 'Sesión inválida' }, 401),
    }
  }

  return {
    ok: true as const,
    data: { user: userData.user, token },
  }
}

type SetPasswordPayload = {
  usuario_id?: unknown
  password?: unknown
}

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req)
  if (preflight) return preflight

  if (req.method !== 'POST') {
    return jsonResponse({ ok: false, message: 'Método no permitido' }, 405)
  }

  const auth = await requireAuthUser(req)
  if (auth.ok === false) {
    const payload = (await auth.response.json().catch(() => ({}))) as { error?: string }
    const message =
      payload.error === 'Sesión inválida'
        ? 'Sesión inválida'
        : payload.error === 'No autorizado'
          ? 'No autorizado'
          : 'No se pudo validar permisos'
    const status = auth.response.status === 401 ? 401 : auth.response.status
    return jsonResponse({ ok: false, message }, status)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ ok: false, message: 'Faltan credenciales de Supabase' }, 500)
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
    return jsonResponse({ ok: false, message: 'No se pudo validar permisos' }, 500)
  }

  const { data: businessRoleRow, error: businessRoleError } = await adminClient
    .from('usuarios')
    .select('rol, activo')
    .eq('user_id', callerId)
    .maybeSingle()

  if (businessRoleError) {
    return jsonResponse({ ok: false, message: 'No se pudo validar permisos' }, 500)
  }

  if (
    !canInviteUsers({
      appRole: roleRow?.app_role,
      businessRol: businessRoleRow?.rol,
      activo: businessRoleRow?.activo,
    })
  ) {
    return jsonResponse(
      { ok: false, message: 'Solo administradores pueden cambiar contraseñas de usuarios' },
      403,
    )
  }

  const body = (await req.json().catch(() => null)) as SetPasswordPayload | null
  const usuarioId = typeof body?.usuario_id === 'string' ? body.usuario_id.trim() : ''
  const password = typeof body?.password === 'string' ? body.password : ''

  if (!UUID_RE.test(usuarioId)) {
    return jsonResponse({ ok: false, message: 'Identificador de usuario inválido' }, 400)
  }
  if (password.length < PASSWORD_MIN_LENGTH) {
    return jsonResponse(
      { ok: false, message: `La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres` },
      400,
    )
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    return jsonResponse(
      { ok: false, message: `La contraseña no puede superar ${PASSWORD_MAX_LENGTH} caracteres` },
      400,
    )
  }

  const { data: profile, error: profileError } = await adminClient
    .from('usuarios')
    .select('id, user_id')
    .eq('id', usuarioId)
    .maybeSingle()

  if (profileError) {
    return jsonResponse({ ok: false, message: 'No se pudo consultar el perfil' }, 500)
  }
  if (!profile) {
    return jsonResponse({ ok: false, message: 'No encontramos a esa persona en el directorio' }, 404)
  }
  if (!profile.user_id) {
    return jsonResponse(
      {
        ok: false,
        message:
          'Esta persona no tiene cuenta de acceso. Invítala de nuevo antes de asignar contraseña.',
      },
      409,
    )
  }

  const { error: updateError } = await adminClient.auth.admin.updateUserById(profile.user_id, {
    password,
  })
  if (updateError) {
    return jsonResponse(
      { ok: false, message: updateError.message || 'No se pudo actualizar la contraseña' },
      400,
    )
  }

  return jsonResponse({ ok: true, message: 'Contraseña actualizada' })
})
