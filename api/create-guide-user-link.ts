/**
 * Crea una liga personal de Guía.
 * Auth: Bearer JWT (usuario) o header x-whatsapp-assistant-secret (origen WhatsApp).
 */
import { timingSafeEqual } from 'node:crypto'
import { defineApiHandler, readRequestBody, readStringEnv } from './_shared/http.js'
import { createServiceRoleClient, requireAssistantAuth } from './_shared/assistantAuth.js'
import { enableSystemCaCertificates } from './_shared/enableSystemCa.js'
import { createGuideUserLink } from './_shared/guideUserLinks.js'
import {
  isAppSuperAdminByAppRole,
  isDirectionByRole,
  isSuperAdminByRole,
} from '../src/features/auth/lib/permissions.js'

function secretsMatch(provided: string, expected: string) {
  if (!expected || !provided) return false
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

function readHeader(req: { headers?: Record<string, string | string[] | undefined> }, name: string) {
  const wanted = name.toLowerCase()
  for (const [key, value] of Object.entries(req.headers ?? {})) {
    if (key.toLowerCase() !== wanted) continue
    if (Array.isArray(value)) return value[0]
    return typeof value === 'string' ? value : undefined
  }
  return undefined
}

function canCreateForOthers(rol: string | null, appRole: string | null) {
  const key = (rol ?? '').trim().toLowerCase()
  return (
    isSuperAdminByRole(rol) ||
    isAppSuperAdminByAppRole(appRole) ||
    isDirectionByRole(rol) ||
    key === 'dg' ||
    key === 'sistemas' ||
    key === 'super_admin' ||
    key === 'direccion'
  )
}

export default defineApiHandler(async (req, res) => {
  enableSystemCaCertificates()
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Metodo no permitido. Usa POST.' })
  }

  const body = await readRequestBody(req)
  if (!body || typeof body !== 'object') {
    return res.status(400).json({ error: 'Solicitud invalida.' })
  }
  const payload = body as {
    usuario_id?: unknown
    expires_in_days?: unknown
    source?: unknown
  }
  const usuarioId = typeof payload.usuario_id === 'string' ? payload.usuario_id.trim() : ''
  if (!usuarioId) {
    return res.status(400).json({ error: 'Falta usuario_id.' })
  }
  const source = typeof payload.source === 'string' ? payload.source.trim().slice(0, 40) : null

  const expected = readStringEnv('WHATSAPP_ASSISTANT_SECRET')
  const provided = readHeader(req, 'x-whatsapp-assistant-secret') ?? ''
  const internal = Boolean(expected && secretsMatch(provided, expected))

  let createdBy: string | null = null

  if (!internal) {
    const auth = await requireAssistantAuth(req, { requireAiModule: false })
    if (!auth.ok) {
      return res.status(auth.status).json({ error: auth.error })
    }
    createdBy = auth.usuarioId
    const { data: roles } = await auth.supabase
      .from('user_roles')
      .select('app_role')
      .eq('user_id', auth.authUserId)
      .limit(1)
    const appRole = roles?.[0] ? String(roles[0].app_role) : null
    if (usuarioId !== auth.usuarioId && !canCreateForOthers(auth.rol, appRole)) {
      return res.status(403).json({ error: 'No puedes crear ligas para otros usuarios.' })
    }
  }

  try {
    // Tabla sin grants a authenticated: siempre service role tras validar permiso.
    const supabase = createServiceRoleClient()
    const created = await createGuideUserLink(supabase, {
      usuarioId,
      createdBy,
      expiresInDays: payload.expires_in_days,
      source: source || (internal ? 'whatsapp' : 'app'),
    })
    return res.status(200).json({
      ...created,
      message: 'Liga personal de Guía creada.',
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'missing_supabase_admin') {
      return res.status(500).json({ error: 'Falta SUPABASE_SERVICE_ROLE_KEY en el servidor.' })
    }
    const status = typeof (error as { status?: number }).status === 'number' ? (error as { status: number }).status : 500
    const message = error instanceof Error ? error.message : 'No se pudo crear la liga.'
    return res.status(status).json({ error: message })
  }
})
