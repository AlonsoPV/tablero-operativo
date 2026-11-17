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
import {
  classifyDenialReason,
  guideToolFailure,
  guideToolSuccess,
  logGuideToolEvent,
  newGuideRequestId,
  statusToErrorCode,
  type GuideToolPayload,
} from '../guideToolResult.js'

function asString(value: unknown, max = 80) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function timedOutResult(tool: string) {
  return guideToolFailure({
    code: 'TIMEOUT',
    user_message: 'No pude recuperar ese dato a tiempo. No inventes cifras; ofrece reintentar o reformular.',
    tool,
  })
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

  const requestId = newGuideRequestId('retell')
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
    return res.status(503).json(
      guideToolFailure({
        code: 'AUTHENTICATION_FAILED',
        user_message: 'Falta configurar la voz.',
      })
    )
  }
  if (!signedOk && !secretOk) {
    logGuideToolEvent({
      request_id: requestId,
      tool_name: 'guide-retell-tool',
      phase: 'auth',
      success: false,
      error_code: 'AUTHENTICATION_FAILED',
      duration_ms: Date.now() - authStarted,
    })
    return res.status(401).json(
      guideToolFailure({
        code: 'AUTHENTICATION_FAILED',
        user_message: 'Firma de Retell invalida.',
      })
    )
  }
  const auth_ms = Date.now() - authStarted

  const body = (await readRequestBody(req)) as {
    name?: unknown
    args?: unknown
    arguments?: unknown
    call?: { call_id?: unknown; metadata?: unknown }
  } | null
  if (!body || typeof body !== 'object') {
    return res.status(400).json(
      guideToolFailure({
        code: 'RESPONSE_FORMAT_ERROR',
        user_message: 'Solicitud invalida.',
      })
    )
  }

  const callId = asString(body.call?.call_id, 80) || null
  const parsed = readRetellToolCall(body)
  if (parsed.product && parsed.product !== 'guide') {
    return res.status(200).json(
      guideToolFailure({
        code: 'VALIDATION_FAILED',
        user_message: 'Ignorado: no es una llamada de Guia.',
      })
    )
  }
  if (!parsed.sessionId) {
    return res.status(200).json(
      guideToolFailure({
        code: 'SESSION_NOT_FOUND',
        user_message: 'No pude consultar porque falta la sesion. No inventes datos del tablero.',
      })
    )
  }
  if (!parsed.tool || !isRetellBoardTool(parsed.tool)) {
    return res.status(200).json(
      guideToolFailure({
        code: 'TOOL_NOT_FOUND',
        user_message: 'Esa herramienta no esta disponible en la entrevista. No inventes el resultado.',
        tool: parsed.tool || null,
      })
    )
  }

  const rate = checkAssistantRateLimit({
    key: `${parsed.sessionId}:guide-retell-tool`,
    limit: 24,
    windowMs: 60_000,
  })
  if (rate.ok === false) {
    return res.status(200).json(
      guideToolFailure({
        code: 'TIMEOUT',
        user_message: 'Demasiadas consultas en esta llamada. Espera un momento y no inventes datos.',
        tool: parsed.tool,
        retryable: true,
      })
    )
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
  type ToolResponse = GuideToolPayload
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
          response: guideToolFailure({
            code: 'SESSION_NOT_FOUND',
            user_message: 'No pude asociar esta llamada a un usuario. No inventes datos del tablero.',
            tool: parsed.tool,
          }),
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
          response: guideToolFailure({
            code: 'SESSION_NOT_FOUND',
            user_message: 'La sesion de voz ya no esta abierta. No inventes datos del tablero.',
            tool: parsed.tool,
          }),
        }
      }

      let accessMode: GuideAccessMode = normalizeGuideAccessMode(session.access_mode)
      if (!session.access_mode && session.guide_link_id) {
        accessMode = effectiveInviteAccessMode('read')
      }
      if (!session.access_mode && !session.guide_link_id) accessMode = 'propose'
      if (session.guide_link_id) accessMode = effectiveInviteAccessMode(session.access_mode || accessMode)

      if (!isGuideWriteAllowed(accessMode) && isRetellWriteTool(parsed.tool)) {
        const userMessage =
          'No tienes permiso de escritura en este modo. No inventes que quedo hecho.'
        const entry = consultLogEntry(
          parsed.tool,
          'denied',
          { status: 'denied', reason: 'read_only_invite' },
          undefined,
          {
            summaryHint: userMessage,
            error_code: 'PERMISSION_DENIED',
            denial_reason: 'permission',
          }
        )
        scheduleConsultLog(supabase, session.id, entry)
        return {
          early: true,
          session,
          accessMode,
          response: guideToolFailure({
            code: 'PERMISSION_DENIED',
            user_message: userMessage,
            status: 'denied',
            tool: parsed.tool,
          }),
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
          response: guideToolFailure({
            code: 'PERMISSION_DENIED',
            user_message: 'Este usuario no puede consultar el tablero ahora.',
            status: 'denied',
            tool: parsed.tool,
          }),
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
          guideAccessMode: accessMode,
          guideSessionId: session.id,
        },
        parsed.tool,
        parsed.args
      )
      dispatch_ms = Date.now() - dispatchStarted
      const classified = classifyRetellToolResult(result)
      const entry = consultLogEntry(parsed.tool, classified.status, classified.data, undefined, {
        summaryHint: classified.spoken,
        error_code: classified.error_code,
        denial_reason: classified.denial_reason,
      })
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
      logGuideToolEvent({
        request_id: requestId,
        call_id: callId,
        session_id: asString(parsed.sessionId),
        tool_name: parsed.tool,
        phase: 'timeout',
        success: false,
        error_code: 'TIMEOUT',
        duration_ms: Date.now() - started,
      })
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
            status: done.response.status as 'error' | 'denied' | 'ok' | 'empty' | 'needs_clarification' | 'needs_confirmation' | 'timeout',
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
      logGuideToolEvent({
        request_id: requestId,
        call_id: callId,
        session_id: asString(done.session?.id ?? parsed.sessionId),
        tool_name: parsed.tool,
        phase: 'early',
        success: done.response.success === true,
        error_code: done.response.success === false ? done.response.error.code : null,
        denial_reason:
          done.response.success === false
            ? classifyDenialReason(done.response.error.user_message)
            : null,
        access_mode: done.accessMode,
        duration_ms: Date.now() - started,
      })
      return res.status(200).json(done.response)
    }

    const okStatuses = new Set(['ok', 'empty', 'needs_clarification', 'needs_confirmation'])
    const failureCode =
      done.classified.error_code ??
      statusToErrorCode(done.classified.status, done.classified.spoken)
    const payload =
      okStatuses.has(done.classified.status)
        ? guideToolSuccess({
            message: done.classified.spoken,
            status: done.classified.status,
            tool: parsed.tool,
            data: done.classified.data,
            operation_id:
              done.classified.data &&
              typeof done.classified.data === 'object' &&
              'pending_op_id' in (done.classified.data as object)
                ? String((done.classified.data as { pending_op_id?: unknown }).pending_op_id ?? '') || null
                : null,
          })
        : guideToolFailure({
            code: failureCode,
            user_message: done.classified.spoken,
            status: done.classified.status === 'denied' ? 'denied' : 'error',
            tool: parsed.tool,
            data: done.classified.data,
          })
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
    logGuideToolEvent({
      request_id: requestId,
      call_id: callId,
      session_id: done.session.id,
      tool_name: parsed.tool,
      operation_id: payload.operation_id,
      phase: 'complete',
      success: payload.success,
      error_code: payload.success ? null : payload.error.code,
      denial_reason: payload.success
        ? null
        : done.classified.denial_reason ?? classifyDenialReason(done.classified.spoken),
      access_mode: done.accessMode,
      duration_ms: Date.now() - started,
    })
    return res.status(200).json(payload)
  } catch (error) {
    console.error('guide-retell-tool', error instanceof Error ? error.message : error)
    return res.status(200).json(
      guideToolFailure({
        code: 'UNKNOWN_ERROR',
        user_message: 'No pude consultar el tablero. Prefiero no dar informacion que no pueda confirmar.',
        tool: parsed.tool,
      })
    )
  }
})
