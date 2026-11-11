/**
 * Guía voz — crea sesión provider=retell y un web call de Retell.
 * Auth: Authorization Bearer (JWT del usuario). Secrets: RETELL_API_KEY + RETELL_GUIDE_AGENT_ID.
 * No reutiliza RETELL_AGENT_ID (entrevistas).
 */
import {
  defineApiHandler,
  readRequestBody,
  readStringEnv,
} from '../http.js'
import {
  checkAssistantRateLimit,
  createServiceRoleClient,
  requireAssistantAuth,
} from '../assistantAuth.js'
import { enableSystemCaCertificates } from '../enableSystemCa.js'
import { loadGuideBoardContext } from '../guideBoardContext.js'
import { markGuideLinkUsed, resolveGuideLinkOwner } from '../guideUserLinks.js'
import { guideOpening, guideWorkInstructions } from '../guideWork.js'
import { guideAppBaseUrl } from '../guideUserLinks.js'
import { isTlsCertificateError, TLS_CERTIFICATE_USER_MESSAGE } from '../tlsError.js'

const SESSION_MS = 15 * 60 * 1000 - 1000
const SESSION_SELECT =
  'id,usuario_id,provider,provider_session_id,status,started_at,expires_at,closed_at,close_reason,created_at,updated_at'

function isMissingGuideTable(error: { message?: string; code?: string } | null | undefined) {
  const message = error?.message ?? ''
  const code = error?.code ?? ''
  return (
    code === 'PGRST205' ||
    code === '42P01' ||
    /Could not find the table ['"]?public\.guide_/i.test(message) ||
    /relation ['"]?public\.guide_/i.test(message)
  )
}

export default defineApiHandler(async (req, res) => {
  enableSystemCaCertificates()

  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Metodo no permitido. Usa POST.' })
    }

    const apiKey = readStringEnv('RETELL_API_KEY')
    const agentId = readStringEnv('RETELL_GUIDE_AGENT_ID')
    if (!apiKey || !agentId) {
      return res.status(503).json({
        error:
          'Falta configurar RETELL_API_KEY y RETELL_GUIDE_AGENT_ID en Vercel (Project Settings → Environment Variables).',
        code: 'missing_retell_guide',
      })
    }

    const body = await readRequestBody(req)
    if (body !== null && body !== undefined && typeof body !== 'object') {
      return res.status(400).json({ error: 'Solicitud invalida.' })
    }
    const payload = (body ?? {}) as {
      replace_active?: unknown
      guide_token?: unknown
      consent?: unknown
      intent?: unknown
    }
    const replaceActive = Boolean(payload.replace_active)
    const guideToken = typeof payload.guide_token === 'string' ? payload.guide_token.trim() : ''
    const consent = payload.consent === true

    let usuarioId = ''
    let guideLinkId = ''
    let supabase: ReturnType<typeof createServiceRoleClient>

    if (guideToken) {
      if (!consent) {
        return res.status(400).json({ error: 'Debes aceptar el consentimiento para iniciar la voz.' })
      }
      try {
        supabase = createServiceRoleClient()
      } catch {
        return res.status(500).json({ error: 'Falta SUPABASE_SERVICE_ROLE_KEY en el servidor.' })
      }
      try {
        const owner = await resolveGuideLinkOwner(supabase, guideToken)
        usuarioId = owner.usuario_id
        guideLinkId = owner.link_id
        // Ligas creadas desde WhatsApp: mismo gate OKRS/Super Admin que el bot.
        if (owner.source === 'whatsapp') {
          const { data: allowed, error: accessError } = await supabase.rpc(
            'can_use_ai_whatsapp_for_usuario',
            { p_usuario_id: usuarioId }
          )
          if (accessError || allowed !== true) {
            return res.status(403).json({
              error:
                'El asistente de voz por WhatsApp solo está disponible para perfiles OKRS o Super Admin.',
              code: 'whatsapp_ai_denied',
            })
          }
        }
      } catch (error) {
        const status =
          typeof (error as { status?: number }).status === 'number' ? (error as { status: number }).status : 400
        const message = error instanceof Error ? error.message : 'Liga inválida.'
        return res.status(status).json({ error: message })
      }
    } else {
      const auth = await requireAssistantAuth(req, { requireAiModule: true })
      if (!auth.ok) {
        return res.status(auth.status).json({ error: auth.error })
      }
      usuarioId = auth.usuarioId
      supabase = auth.supabase
    }

    const rate = checkAssistantRateLimit({
      key: `${usuarioId}:guide-retell`,
      limit: 10,
      windowMs: 60_000,
    })
    if (rate.ok === false) {
      return res.status(429).json({
        error: `Demasiadas llamadas de voz. Espera ${rate.retryAfterSec}s.`,
      })
    }

    const { data: usuario, error: usuarioError } = await supabase
      .from('usuarios')
      .select('id,nombre')
      .eq('id', usuarioId)
      .maybeSingle()

    if (usuarioError || !usuario?.id) {
      return res.status(403).json({ error: 'No hay un perfil de usuario para iniciar Guia.' })
    }

    const { data: openRows, error: openError } = await supabase
      .from('guide_sessions')
      .select('id,status')
      .eq('usuario_id', usuario.id)
      .in('status', ['active', 'closing'])
      .order('started_at', { ascending: false })
      .limit(5)

    if (openError) {
      if (isMissingGuideTable(openError)) {
        return res.status(503).json({
          error:
            'Faltan las tablas de Guia en este proyecto de Supabase. Aplica supabase/migrations/20261101120000_create_guide_companion.sql.',
        })
      }
      console.error('guide-retell-web-call open', openError)
      return res.status(500).json({ error: 'No se pudo revisar la sesion de Guia.' })
    }

    const openList = openRows ?? []
    if (openList.length > 0) {
      if (!replaceActive) {
        return res.status(409).json({ error: 'Ya hay una sesion de Guia abierta.' })
      }
      const openIds = openList.map((row) => row.id).filter(Boolean)
      const { error: abandonError } = await supabase
        .from('guide_sessions')
        .update({
          status: 'abandoned',
          closed_at: new Date().toISOString(),
          close_reason: 'abandoned',
        })
        .in('id', openIds)
        .in('status', ['active', 'closing'])
      if (abandonError) {
        console.error('guide-retell-web-call abandon', abandonError)
        return res.status(500).json({ error: 'No se pudo liberar la sesion anterior.' })
      }
    }

    const startedAt = new Date()
    const expiresAt = new Date(startedAt.getTime() + SESSION_MS)
    const sessionInsert: Record<string, unknown> = {
      usuario_id: usuario.id,
      provider: 'retell',
      status: 'active',
      started_at: startedAt.toISOString(),
      expires_at: expiresAt.toISOString(),
      report_status: 'pending',
    }
    if (guideLinkId) sessionInsert.guide_link_id = guideLinkId
    let inserted = await supabase.from('guide_sessions').insert(sessionInsert).select(SESSION_SELECT).single()
    if (inserted.error && /guide_link_id|report_status/i.test(inserted.error.message ?? '')) {
      const { guide_link_id: _link, report_status: _status, ...base } = sessionInsert
      inserted = await supabase.from('guide_sessions').insert(base).select(SESSION_SELECT).single()
    }
    const session = inserted.data
    const insertError = inserted.error

    if (insertError || !session) {
      if (isMissingGuideTable(insertError)) {
        return res.status(503).json({
          error:
            'Faltan las tablas de Guia en este proyecto de Supabase. Aplica supabase/migrations/20261101120000_create_guide_companion.sql.',
        })
      }
      console.error('guide-retell-web-call insert', insertError)
      return res.status(500).json({ error: 'No se pudo iniciar la sesion de voz.' })
    }

    const abandonInserted = async () => {
      await supabase
        .from('guide_sessions')
        .update({
          status: 'abandoned',
          closed_at: new Date().toISOString(),
          close_reason: 'abandoned',
        })
        .eq('id', session.id)
        .in('status', ['active', 'closing'])
    }

    let boardContext = ''
    try {
      boardContext = await loadGuideBoardContext(supabase, 2400)
    } catch (error) {
      console.error('guide-retell-web-call board', error)
    }

    const retellResponse = await fetch('https://api.retellai.com/v3/create-web-call', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        agent_id: agentId,
        metadata: {
          guide_session_id: session.id,
          usuario_id: usuario.id,
          guide_link_id: guideLinkId || '',
          product: 'guide',
          source: guideLinkId ? 'guide_link' : 'authenticated',
          queue_workspace_url: `${guideAppBaseUrl()}/api/guide-queue-workspace-draft`,
        },
        retell_llm_dynamic_variables: {
          user_name: typeof usuario.nombre === 'string' && usuario.nombre.trim() ? usuario.nombre.trim() : 'Usuario',
          session_id: session.id,
          expires_at: session.expires_at,
          board_context: boardContext,
          understanding_context: boardContext,
          guide_intent: 'auto',
          guide_opening: guideOpening(),
          guide_work_instructions: guideWorkInstructions(),
          guide_preferences: '',
          relevant_memories: '',
          recent_journal: '',
          pillar_history: '',
          queue_workspace_draft:
            'Si piden correo o evento, llama queue_workspace_draft. No envies nada durante la llamada.',
        },
      }),
    })

    const retellRaw = await retellResponse.text()
    let retellJson: {
      access_token?: unknown
      call_id?: unknown
      transport?: unknown
      ice_servers?: unknown
      message?: unknown
      error?: unknown
    } = {}
    try {
      retellJson = retellRaw ? (JSON.parse(retellRaw) as typeof retellJson) : {}
    } catch {
      retellJson = {}
    }

    if (!retellResponse.ok) {
      console.error('guide-retell-web-call retell', retellResponse.status, retellRaw.slice(0, 400))
      await abandonInserted()
      const detail =
        (typeof retellJson.message === 'string' && retellJson.message) ||
        (typeof retellJson.error === 'string' && retellJson.error) ||
        'Retell rechazo la llamada web.'
      return res.status(502).json({ error: detail })
    }

    const accessToken = typeof retellJson.access_token === 'string' ? retellJson.access_token : ''
    const callId = typeof retellJson.call_id === 'string' ? retellJson.call_id : ''
    if (!accessToken || !callId) {
      await abandonInserted()
      return res.status(502).json({ error: 'Retell no devolvio access_token o call_id.' })
    }

    const { data: updated, error: updateError } = await supabase
      .from('guide_sessions')
      .update({ provider_session_id: callId })
      .eq('id', session.id)
      .select(SESSION_SELECT)
      .single()

    if (updateError) {
      console.error('guide-retell-web-call call_id', updateError)
    }

    if (guideLinkId) {
      try {
        await markGuideLinkUsed(createServiceRoleClient(), guideLinkId)
      } catch (error) {
        console.error('guide-retell-web-call link use', error)
      }
    }

    const transport = retellJson.transport === 'gateway' || retellJson.transport === 'livekit' ? retellJson.transport : undefined

    return res.status(200).json({
      access_token: accessToken,
      call_id: callId,
      transport,
      ice_servers: Array.isArray(retellJson.ice_servers) ? retellJson.ice_servers : undefined,
      guide_session_id: session.id,
      expires_at: session.expires_at,
      max_duration_seconds: 900,
      session: updated ?? { ...session, provider_session_id: callId },
    })
  } catch (error) {
    if (isTlsCertificateError(error)) {
      console.error('guide-retell-web-call TLS', error)
      return res.status(502).json({ error: TLS_CERTIFICATE_USER_MESSAGE })
    }
    console.error('guide-retell-web-call error', error)
    return res.status(500).json({ error: 'Error inesperado al iniciar la voz de Guia.' })
  }
})
