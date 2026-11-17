/**
 * Custom function de Retell: consulta o propone con el copiloto del usuario de la sesión.
 * La identidad sale de guide_sessions, no de un usuario enviado por el modelo.
 */
import { dispatchCopilotTool } from '../assistantOpsRuntime.js'
import { checkAssistantRateLimit, createServiceRoleClient } from '../assistantAuth.js'
import { defineApiHandler, readHeader, readNumberEnv, readRequestBody, readStringEnv } from '../http.js'
import { verifyRetellSignature } from '../guideInterviewReport.js'
import {
  effectiveInviteAccessMode,
  guideBoardScopeForAccessMode,
  isGuideWriteAllowed,
  normalizeGuideAccessMode,
  type GuideAccessMode,
} from '../guideUserLinks.js'
import {
  buildRetellToolMetrics,
  classifyRetellToolResult,
  consultLogEntry,
  estimatePayloadBytes,
  isRetellBoardTool,
  isRetellWriteTool,
  readRetellToolCall,
  type ConsultLogEntry,
} from '../guideRetellTool.js'

function asString(value: unknown, max = 80) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function timedOutResult(tool: string) {
  return {
    status: 'error' as const,
    tool,
    result: 'No pude recuperar ese dato a tiempo. No inventes cifras; ofrece reintentar o reformular.',
    data: null,
  }
}

async function appendConsultLog(
  supabase: ReturnType<typeof createServiceRoleClient>,
  sessionId: string,
  entry: ConsultLogEntry
) {
  const rpc = await supabase.rpc('append_guide_consult_log', {
    p_session_id: sessionId,
    p_entry: entry,
    p_max: 16,
  })
  if (!rpc.error) return

  // Fallback RMW si la migración aún no está en el proyecto.
  if (!/append_guide_consult_log|function|schema cache/i.test(rpc.error.message ?? '')) {
    console.error('guide-retell-tool log rpc', rpc.error.message)
  }
  const { data, error } = await supabase.from('guide_sessions').select('consult_log').eq('id', sessionId).maybeSingle()
  if (error) {
    console.error('guide-retell-tool log read', error.message)
    return
  }
  const current = Array.isArray(data?.consult_log) ? (data.consult_log as ConsultLogEntry[]) : []
  const next = [...current, entry].slice(-16)
  const updated = await supabase.from('guide_sessions').update({ consult_log: next }).eq('id', sessionId)
  if (updated.error) console.error('guide-retell-tool log write', updated.error.message)
}

function scheduleConsultLog(
  supabase: ReturnType<typeof createServiceRoleClient>,
  sessionId: string,
  entry: ConsultLogEntry
) {
  const logStarted = Date.now()
  void appendConsultLog(supabase, sessionId, entry)
    .catch((error) => {
      console.error('guide-retell-tool log async', error instanceof Error ? error.message : error)
    })
    .finally(() => {
      // consult_log_ms se midió al programar; el trabajo real no bloquea la respuesta.
      void logStarted
    })
}

export default defineApiHandler(async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Metodo no permitido.' })
  }

  const authStarted = Date.now()
  const apiKey = readStringEnv('RETELL_API_KEY')
  const toolSecret = readStringEnv('GUIDE_RETELL_TOOL_SECRET')
  const toolTimeoutMs = readNumberEnv('GUIDE_RETELL_TOOL_TIMEOUT_MS', 3000)
  const rawBody = typeof req.rawBody === 'string' ? req.rawBody : ''
  const signature = readHeader(req, 'x-retell-signature')
  const guideSecret = readHeader(req, 'x-guide-tool-secret')
  const bearer = readHeader(req, 'authorization').replace(/^Bearer\s+/i, '').trim()
  const signedOk = Boolean(apiKey && rawBody && verifyRetellSignature(rawBody, apiKey, signature))
  const secretOk = Boolean(toolSecret && ((guideSecret && guideSecret === toolSecret) || (bearer && bearer === toolSecret)))
  if (!apiKey && !toolSecret) {
    return res.status(503).json({ status: 'error', result: 'Falta configurar la voz.' })
  }
  if (!signedOk && !secretOk) {
    return res.status(401).json({ status: 'error', result: 'Firma de Retell invalida.' })
  }
  const auth_ms = Date.now() - authStarted

  const body = (await readRequestBody(req)) as {
    name?: unknown
    args?: unknown
    arguments?: unknown
    call?: { call_id?: unknown; metadata?: unknown }
  } | null
  if (!body || typeof body !== 'object') {
    return res.status(400).json({ status: 'error', result: 'Solicitud invalida.' })
  }

  const callId = asString(body.call?.call_id, 80) || null
  const parsed = readRetellToolCall(body)
  if (parsed.product && parsed.product !== 'guide') {
    return res.status(200).json({ status: 'error', result: 'Ignorado: no es una llamada de Guia.' })
  }
  if (!parsed.sessionId) {
    return res.status(200).json({
      status: 'error',
      result: 'No pude consultar porque falta la sesion. No inventes datos del tablero.',
    })
  }
  if (!parsed.tool || !isRetellBoardTool(parsed.tool)) {
    return res.status(200).json({
      status: 'error',
      tool: parsed.tool || null,
      result: 'Esa herramienta no esta disponible en la entrevista. No inventes el resultado.',
    })
  }

  const rate = checkAssistantRateLimit({
    key: `${parsed.sessionId}:guide-retell-tool`,
    limit: 24,
    windowMs: 60_000,
  })
  if (rate.ok === false) {
    return res.status(200).json({
      status: 'error',
      tool: parsed.tool,
      result: 'Demasiadas consultas en esta llamada. Espera un momento y no inventes datos.',
    })
  }

  const started = Date.now()
  let session_ms = 0
  let user_ms = 0
  let dispatch_ms = 0
  const consult_log_ms = 0

  type SessionRow = {
    id: string
    usuario_id: string
    provider?: string
    status?: string
    guide_link_id?: string | null
    access_mode?: string | null
  }
  type ToolResponse = {
    status: 'error' | 'denied' | 'ok' | 'empty' | 'needs_clarification' | 'needs_confirmation'
    tool: string
    result: string
    data?: unknown
  }
  type WorkDone =
    | {
        early: true
        response: ToolResponse
        session: SessionRow | null
        accessMode: GuideAccessMode | null
      }
    | {
        early: false
        session: SessionRow
        accessMode: GuideAccessMode
        usuario: { id: string }
        classified: ReturnType<typeof classifyRetellToolResult>
      }

  try {
    const supabase = createServiceRoleClient()

    const work = async (): Promise<WorkDone> => {
      const sessionStarted = Date.now()
      let sessionQuery = await supabase
        .from('guide_sessions')
        .select('id,usuario_id,provider,status,guide_link_id,access_mode')
        .eq('id', parsed.sessionId)
        .maybeSingle()
      if (sessionQuery.error && /access_mode|guide_link_id/i.test(sessionQuery.error.message ?? '')) {
        sessionQuery = await supabase
          .from('guide_sessions')
          .select('id,usuario_id,provider,status')
          .eq('id', parsed.sessionId)
          .maybeSingle()
      }
      session_ms = Date.now() - sessionStarted
      const raw = sessionQuery.data as {
        id?: string
        usuario_id?: string
        provider?: string
        status?: string
        guide_link_id?: string | null
        access_mode?: string | null
      } | null
      if (sessionQuery.error || !raw?.id || raw.provider !== 'retell' || !raw.usuario_id) {
        return {
          early: true,
          session: null,
          accessMode: null,
          response: {
            status: 'error',
            tool: parsed.tool,
            result: 'No pude asociar esta llamada a un usuario. No inventes datos del tablero.',
          },
        }
      }
      const session: SessionRow = {
        id: raw.id,
        usuario_id: raw.usuario_id,
        provider: raw.provider,
        status: raw.status,
        guide_link_id: raw.guide_link_id ?? null,
        access_mode: raw.access_mode ?? null,
      }
      if (session.status !== 'active' && session.status !== 'closing') {
        return {
          early: true,
          session,
          accessMode: null,
          response: {
            status: 'error',
            tool: parsed.tool,
            result: 'La sesion de voz ya no esta abierta. No inventes datos del tablero.',
          },
        }
      }

      let accessMode: GuideAccessMode = normalizeGuideAccessMode(session.access_mode)
      if (!session.access_mode && session.guide_link_id) {
        accessMode = effectiveInviteAccessMode('read')
      }
      if (!session.access_mode && !session.guide_link_id) accessMode = 'propose'
      if (session.guide_link_id) accessMode = effectiveInviteAccessMode(session.access_mode || accessMode)

      if (!isGuideWriteAllowed(accessMode) && isRetellWriteTool(parsed.tool)) {
        const entry = consultLogEntry(parsed.tool, 'denied', { status: 'denied', reason: 'read_only_invite' })
        scheduleConsultLog(supabase, session.id, entry)
        return {
          early: true,
          session,
          accessMode,
          response: {
            status: 'denied',
            tool: parsed.tool,
            result:
              'Esta invitacion es de solo lectura. No puedo crear ni modificar acciones. No inventes que quedo hecho.',
          },
        }
      }

      const userStarted = Date.now()
      const { data: usuario, error: userError } = await supabase
        .from('usuarios')
        .select('id,user_id,rol,activo')
        .eq('id', session.usuario_id)
        .maybeSingle()
      user_ms = Date.now() - userStarted
      if (userError || !usuario?.id || usuario.activo === false || !usuario.user_id) {
        return {
          early: true,
          session,
          accessMode,
          response: {
            status: 'denied',
            tool: parsed.tool,
            result: 'Este usuario no puede consultar el tablero ahora.',
          },
        }
      }

      const dispatchStarted = Date.now()
      const result = await dispatchCopilotTool(
        {
          supabase,
          usuarioId: String(usuario.id),
          authUserId: String(usuario.user_id),
          rol: typeof usuario.rol === 'string' ? usuario.rol : null,
          boardScope: guideBoardScopeForAccessMode(accessMode),
          voiceChannel: true,
        },
        parsed.tool,
        parsed.args
      )
      dispatch_ms = Date.now() - dispatchStarted
      const classified = classifyRetellToolResult(result)
      const entry = consultLogEntry(parsed.tool, classified.status, classified.data)
      scheduleConsultLog(supabase, session.id, entry)
      return {
        early: false,
        session,
        accessMode,
        usuario: { id: String(usuario.id) },
        classified,
      }
    }

    let timeoutHandle: ReturnType<typeof setTimeout> | undefined
    const raced = await Promise.race([
      work().then((done): { kind: 'done'; done: WorkDone } => ({ kind: 'done', done })),
      new Promise<{ kind: 'timeout' }>((resolve) => {
        timeoutHandle = setTimeout(() => resolve({ kind: 'timeout' }), toolTimeoutMs)
      }),
    ])
    if (timeoutHandle) clearTimeout(timeoutHandle)

    if (raced.kind === 'timeout') {
      console.info(
        'guide-retell-tool',
        JSON.stringify(
          buildRetellToolMetrics({
            call_id: callId,
            session: asString(parsed.sessionId),
            invitation_id: null,
            tool: parsed.tool,
            status: 'timeout',
            access_mode: 'unknown',
            auth_ms,
            session_ms,
            user_ms,
            dispatch_ms,
            consult_log_ms,
            payload_bytes: 0,
            ms: Date.now() - started,
            ignored_model_user: false,
          })
        )
      )
      return res.status(200).json(timedOutResult(parsed.tool))
    }

    const done = raced.done
    if (done.early) {
      console.info(
        'guide-retell-tool',
        JSON.stringify(
          buildRetellToolMetrics({
            call_id: callId,
            session: asString(done.session?.id ?? parsed.sessionId),
            invitation_id: done.session?.guide_link_id ?? null,
            tool: parsed.tool,
            status: done.response.status,
            access_mode: done.accessMode ?? 'unknown',
            auth_ms,
            session_ms,
            user_ms,
            dispatch_ms,
            consult_log_ms,
            payload_bytes: estimatePayloadBytes(done.response),
            ms: Date.now() - started,
            ignored_model_user: false,
          })
        )
      )
      return res.status(200).json(done.response)
    }

    const payload = {
      status: done.classified.status,
      tool: parsed.tool,
      result: done.classified.spoken,
      data: done.classified.data,
    }
    console.info(
      'guide-retell-tool',
      JSON.stringify(
        buildRetellToolMetrics({
          call_id: callId,
          session: asString(done.session.id),
          invitation_id: done.session.guide_link_id ?? null,
          tool: parsed.tool,
          status: done.classified.status,
          access_mode: done.accessMode,
          auth_ms,
          session_ms,
          user_ms,
          dispatch_ms,
          consult_log_ms,
          payload_bytes: estimatePayloadBytes(payload),
          ms: Date.now() - started,
          ignored_model_user: Boolean(parsed.modelUsuarioId && parsed.modelUsuarioId !== done.usuario.id),
        })
      )
    )
    return res.status(200).json(payload)
  } catch (error) {
    console.error('guide-retell-tool', error instanceof Error ? error.message : error)
    return res.status(200).json({
      status: 'error',
      tool: parsed.tool,
      result: 'No pude consultar el tablero. Prefiero no dar informacion que no pueda confirmar.',
    })
  }
})
