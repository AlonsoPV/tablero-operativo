import { readRequestBody, type JsonResponse, type VercelRequestLike } from './http.js'
import {
  checkAssistantRateLimit,
  createServiceRoleClient,
  isSuperAdminAssistantUser,
  requireAssistantAuth,
} from './assistantAuth.js'
import { isUuid } from './pilotAllowlist.js'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function handlePilotAllowlist(req: VercelRequestLike, res: JsonResponse) {
  try {
    const auth = await requireAssistantAuth(req, { requireAiModule: true })
    if (!auth.ok) return res.status(auth.status).json({ error: auth.error })

    const isAdmin = await isSuperAdminAssistantUser(auth.supabase, auth.authUserId, auth.usuarioId, auth.rol)
    if (!isAdmin) return res.status(403).json({ error: 'Solo Super Admin puede gestionar el piloto.' })

    const rate = checkAssistantRateLimit({
      key: `${auth.usuarioId}:pilot-allowlist`,
      limit: 20,
      windowMs: 60_000,
    })
    if (rate.ok === false) {
      return res.status(429).json({ error: `Espera ${rate.retryAfterSec}s.` })
    }

    const admin = createServiceRoleClient()
    const { data: gate, error: gateError } = await admin
      .from('agent_execution_gate')
      .select('enabled, project_ref, allowed_usuario_ids')
      .eq('id', true)
      .maybeSingle()
    if (gateError) return res.status(500).json({ error: 'No pude leer la puerta de ejecución.' })

    if (req.method === 'GET') {
      const ids = Array.isArray(gate?.allowed_usuario_ids) ? gate.allowed_usuario_ids.map(String) : []
      const { data: users } = ids.length
        ? await admin.from('usuarios').select('id,nombre,email,activo').in('id', ids)
        : { data: [] }
      const { data: followup } = await admin
        .from('whatsapp_followup_settings')
        .select('proactive_enabled')
        .eq('id', 'default')
        .maybeSingle()
      return res.status(200).json({
        enabled: gate?.enabled === true,
        projectRef: gate?.project_ref ?? null,
        usuarioIds: ids,
        users: users ?? [],
        envLocks: {
          r2: Boolean(process.env.R2_PILOT_USERS?.trim()),
          whatsapp: Boolean(process.env.WHATSAPP_ORCHESTRATOR_PILOT_USERS?.trim()),
          r3: Boolean(process.env.AGENT_MEMORY_R3_PILOT_USERS?.trim()),
        },
        capabilities: {
          r2Mode: process.env.R2_EXECUTION_MODE || 'off',
          r2Pilot: process.env.R2_EXECUTION_MODE === 'pilot',
          whatsappPilot: process.env.WHATSAPP_PILOT_ENABLED === '1',
          r3: process.env.AGENT_MEMORY_R3 === '1',
          proactiveEnabled: followup?.proactive_enabled === true,
        },
        channels: {
          web: true,
          whatsappPilot: process.env.WHATSAPP_PILOT_ENABLED === '1',
          whatsappGlobal: process.env.WHATSAPP_GLOBAL_ORCHESTRATOR_ENABLED === '1',
        },
      })
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Usa GET o POST.' })
    const body = await readRequestBody(req)
    if (!body || typeof body !== 'object') return res.status(400).json({ error: 'Solicitud invalida.' })
    const payload = body as { action?: unknown; usuarioId?: unknown }
    const action = typeof payload.action === 'string' ? payload.action : ''
    const usuarioId = typeof payload.usuarioId === 'string' ? payload.usuarioId.trim().toLowerCase() : ''
    if (!isUuid(usuarioId) || !UUID_RE.test(usuarioId)) {
      return res.status(400).json({ error: 'Indica un UUID de usuario válido. No se aceptan comodines.' })
    }
    if (action !== 'add' && action !== 'remove') {
      return res.status(400).json({ error: 'Acción inválida. Usa add o remove.' })
    }

    const current = new Set(
      (Array.isArray(gate?.allowed_usuario_ids) ? gate.allowed_usuario_ids : []).map((id) =>
        String(id).trim().toLowerCase()
      )
    )
    if (action === 'add') {
      const { data: user } = await admin.from('usuarios').select('id,activo').eq('id', usuarioId).maybeSingle()
      if (!user?.id || user.activo === false) {
        return res.status(400).json({ error: 'El usuario no existe o está inactivo.' })
      }
      current.add(usuarioId)
    } else {
      current.delete(usuarioId)
    }

    const next = [...current]
    const { error: updateError } = await admin
      .from('agent_execution_gate')
      .update({ allowed_usuario_ids: next })
      .eq('id', true)
    if (updateError) return res.status(500).json({ error: 'No pude actualizar la allowlist.' })

    try {
      await admin.from('assistant_op_log').insert({
        usuario_id: auth.usuarioId,
        tool: 'pilot_allowlist_update',
        result: 'ok',
        channel: 'web',
        payload: { action, usuarioId, size: next.length },
      })
    } catch {
      /* auditoría best-effort */
    }

    return res.status(200).json({
      usuarioIds: next,
      action,
      usuarioId,
      note: 'Si existen listas env en Vercel, también deben incluir el UUID. Quitar aquí revoca de inmediato.',
    })
  } catch (error) {
    console.error('assistant-pilot-allowlist', error)
    return res.status(500).json({ error: 'No pude gestionar el piloto.' })
  }
}
