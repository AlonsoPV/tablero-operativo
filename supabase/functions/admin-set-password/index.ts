/**
 * Admin: asignar contraseña de Auth a un usuario existente.
 * POST { usuario_id, password } — no se persiste en public.usuarios ni se devuelve.
 *
 * Permisos: mismos que invite-user (canInviteUsers).
 * verify_jwt: false en config.toml; se valida el Bearer internamente.
 */
import { createClient } from '@supabase/supabase-js'
import { handleCorsPreflight, jsonResponse } from '../_shared/cors.ts'
import { requireAuthUser } from '../_shared/requireUser.ts'
import { canInviteUsers } from '../_shared/invitePermissions.ts'

const PASSWORD_MIN_LENGTH = 6
const PASSWORD_MAX_LENGTH = 72
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

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
