/**
 * Custom function de Retell: consulta o propone con el copiloto del usuario de la sesión.
 * La identidad sale de guide_sessions, no de un usuario enviado por el modelo.
 */
import { dispatchCopilotTool } from '../assistantOpsRuntime.js'
import { checkAssistantRateLimit, createServiceRoleClient } from '../assistantAuth.js'
import { defineApiHandler, readHeader, readRequestBody, readStringEnv } from '../http.js'
import { verifyRetellSignature } from '../guideInterviewReport.js'
import {
  classifyRetellToolResult,
  consultLogEntry,
  isRetellBoardTool,
  readRetellToolCall,
  type ConsultLogEntry,
} from '../guideRetellTool.js'

function asString(value: unknown, max = 80) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

async function appendConsultLog(
  supabase: ReturnType<typeof createServiceRoleClient>,
  sessionId: string,
  entry: ConsultLogEntry
) {
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

export default defineApiHandler(async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Metodo no permitido.' })
  }

  const apiKey = readStringEnv('RETELL_API_KEY')
  const rawBody = typeof req.rawBody === 'string' ? req.rawBody : ''
  const signature = readHeader(req, 'x-retell-signature')
  if (!apiKey) {
    return res.status(503).json({ status: 'error', result: 'Falta configurar la voz.' })
  }
  if (!rawBody || !verifyRetellSignature(rawBody, apiKey, signature)) {
    return res.status(401).json({ status: 'error', result: 'Firma de Retell invalida.' })
  }

  const body = (await readRequestBody(req)) as {
    name?: unknown
    args?: unknown
    arguments?: unknown
    call?: { metadata?: unknown }
  } | null
  if (!body || typeof body !== 'object') {
    return res.status(400).json({ status: 'error', result: 'Solicitud invalida.' })
  }

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
  try {
    const supabase = createServiceRoleClient()
    const { data: session, error: sessionError } = await supabase
      .from('guide_sessions')
      .select('id,usuario_id,provider,status')
      .eq('id', parsed.sessionId)
      .maybeSingle()
    if (sessionError || !session?.id || session.provider !== 'retell' || !session.usuario_id) {
      return res.status(200).json({
        status: 'error',
        tool: parsed.tool,
        result: 'No pude asociar esta llamada a un usuario. No inventes datos del tablero.',
      })
    }
    if (session.status !== 'active' && session.status !== 'closing') {
      return res.status(200).json({
        status: 'error',
        tool: parsed.tool,
        result: 'La sesion de voz ya no esta abierta. No inventes datos del tablero.',
      })
    }

    const { data: usuario, error: userError } = await supabase
      .from('usuarios')
      .select('id,user_id,rol,activo')
      .eq('id', session.usuario_id)
      .maybeSingle()
    if (userError || !usuario?.id || usuario.activo === false || !usuario.user_id) {
      return res.status(200).json({
        status: 'denied',
        tool: parsed.tool,
        result: 'Este usuario no puede consultar el tablero ahora.',
      })
    }

    const result = await dispatchCopilotTool(
      {
        supabase,
        usuarioId: String(usuario.id),
        authUserId: String(usuario.user_id),
        rol: typeof usuario.rol === 'string' ? usuario.rol : null,
      },
      parsed.tool,
      parsed.args
    )
    const classified = classifyRetellToolResult(result)
    const entry = consultLogEntry(parsed.tool, classified.status, classified.data)
    await appendConsultLog(supabase, session.id, entry)
    console.info(
      'guide-retell-tool',
      JSON.stringify({
        channel: 'retell',
        session: asString(session.id),
        tool: parsed.tool,
        status: classified.status,
        ms: Date.now() - started,
        ignored_model_user: Boolean(parsed.modelUsuarioId && parsed.modelUsuarioId !== usuario.id),
      })
    )
    return res.status(200).json({
      status: classified.status,
      tool: parsed.tool,
      result: classified.spoken,
      data: classified.data,
    })
  } catch (error) {
    console.error('guide-retell-tool', error instanceof Error ? error.message : error)
    return res.status(200).json({
      status: 'error',
      tool: parsed.tool,
      result: 'No pude consultar el tablero. Prefiero no dar informacion que no pueda confirmar.',
    })
  }
})
